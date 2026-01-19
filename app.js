async function resetAppCache(){
  try{
    if ('serviceWorker' in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) { try { await r.unregister(); } catch(e){} }
    }
    if (window.caches){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  }catch(e){}
  location.reload();
}

import { icons } from './icons.js';
import { loadState, saveState, uid, nowIso, removeById, getMember, memberLabel } from './store.js';
import { ymd, hm, startOfDay, addDays, monthMatrix, twoWeekMatrix, eventsForDay, detectClashes, formatEventLine } from './calendar.js';
import { routeCapture } from './parser.js';
import { parseIcs, enrichImportedEvents } from './ics.js';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function el(tag, attrs={}, children=[]){
  const node = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==='class') node.className = v;
    else if(k==='html') node.innerHTML = v;
    else if(k==='text') node.textContent = v;
    else if(k==='style') node.setAttribute('style', v);
    else if(k.startsWith('on') && typeof v==='function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, String(v));
  }
  for(const c of (Array.isArray(children)?children:[children])){
    if(c==null) continue;
    if(typeof c==='string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

function memberChips(state, ids, size=16){
  const wrap = el('span',{class:'memberChips'});
  const list = (ids||[]).filter(Boolean);
  for(const id of list){
    const m = getMember(state, id);
    if(!m) continue;
    wrap.appendChild(el('span',{class:'memberChip'},[
      el('span',{class:'avatar', html: icons.avatar(id, size)}),
      el('span',{class:'name', text: m.name})
    ]));
  }
  return wrap;
}

function toast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 2600);
}

function setHash(path){ location.hash = path; }
function isActive(path){ return (location.hash||'').startsWith(path); }

function eventMatchesFilter(state, ev){
  const f = state.ui?.calFilter;
  if(!f) return true;
  const member = f.memberId || 'all';
  const type = f.type || 'all';
  const loc = (f.location||'').trim().toLowerCase();
  if(member !== 'all' && !(ev.who||[]).includes(member)) return false;
  if(type !== 'all' && (ev.type||'Other') !== type) return false;
  if(loc){
    const blob = ((ev.where||'') + ' ' + (ev.title||'')).toLowerCase();
    if(!blob.includes(loc)) return false;
  }
  return true;
}

function upcomingClashes(state, days=14){
  const start = startOfDay(new Date());
  const out = [];
  for(let i=0;i<days;i++){
    const day = addDays(start, i);
    for(const m of state.family){
      const c = detectClashes(state, day, m.id);
      if(c.length) out.push({ day, member: m, count: c.length });
    }
  }
  return out;
}

function tasksDueSoon(state, hours=72){
  const now = Date.now();
  const cutoff = now + hours*60*60*1000;
  return (state.tasks||[])
    .filter(t=>!t.done)
    .map(t=>({ ...t, _dueTs: t.due ? new Date(t.due).getTime() : null }))
    .filter(t=> t.priority==='high' || (t._dueTs && t._dueTs <= cutoff))
    .sort((a,b)=> (a._dueTs||Infinity) - (b._dueTs||Infinity));
}

function prepFromEvents(state, hours=72){
  const now = Date.now();
  const cutoff = now + hours*60*60*1000;
  const upcoming = (state.events||[]).filter(ev => {
    const ts = new Date(ev.start).getTime();
    return ts>=now && ts<=cutoff;
  });
  const tasks = (state.tasks||[]).filter(t=>!t.done && (t.title||'').toLowerCase().startsWith('bring '));
  const out = [];
  for(const ev of upcoming){
    const related = tasks.filter(t => t.relatedEventId === ev.id || (t.relatedGroupId && t.relatedGroupId === ev.relatedGroupId));
    for(const t of related) out.push({ ev, task: t });
  }
  const seen = new Set();
  return out.filter(x => (seen.has(x.task.id) ? false : (seen.add(x.task.id), true)));
}

function header(){
  const path = location.hash || '#/home';
  const notHome = path !== '#/home';

  const backBtn = notHome ? el('button',{
    class:'iconbtn',
    title:'Back',
    onClick: ()=>{ try{ if(history.length>1){ history.back(); } else { setHash('#/home'); } }catch{ setHash('#/home'); } },
    html: icons.chevronLeft ? icons.chevronLeft(18) : '‹'
  }) : el('div',{class:'iconspacer'});

  const homeBtn = el('button',{
    class:'iconbtn',
    title:'Home',
    onClick: ()=> setHash('#/home'),
    html: icons.rosie(36)
  });

  return el('div',{class:'topbar'},[
    el('div',{class:'topbarLeft'},[ backBtn, homeBtn ]),
    el('div',{class:'brand'},[
      el('div',{class:'logo', html: icons.rosie(44)}),
      el('div',{},[
        el('h1',{text:'Rosie'}),
        el('div',{class:'sub', text:'Family Assistant'})
      ])
    ]),
    el('div',{class:'topbarRight'},[
      el('div',{class:'rev', text: (window.__ROSIE_REV__||'__REV__') }),
      el('button',{class:'pill small', onClick: ()=> setHash('#/calendar'), html: icons.calendar(20) + '<span>Calendar</span>'})
    ])
  ]);
}


function heroCard(){
  return el('div',{class:'card hero'},[
    el('div',{class:'rosie', html: icons.rosie(30)}),
    el('div',{class:'msg'},[
      el('p',{class:'title', text:'Tell me what’s going on — I’ll sort it.'}),
      el('p',{class:'hint', text:'Speak or type one message. Rosie files it into calendar, tasks, or groceries.'})
    ])
  ]);
}

function quickCapture(state, render){
  const input = el('input',{placeholder:'e.g. “Zaara swimming 2pm at school — bring goggles”'});
  const addBtn = el('button',{class:'pill primary', html: icons.plus(18) + '<span>Add</span>', onClick: ()=>{
    const text = input.value.trim();
    if(!text) return;
    const res = routeCapture(state, text, 'app');
    applyRouted(state, res, { from: 'App', text });
    saveState(state);
    input.value = '';
    toast('Sorted ✓');
    render();
  }});
  const micBtn = el('button',{class:'pill', html: icons.mic(18) + '<span>Voice</span>', onClick: ()=> openVoiceSheet(state, render) });

  return el('div',{class:'quick'},[
    el('div',{class:'input'},[
      el('span',{html: icons.list(18)}),
      input
    ]),
    addBtn,
    micBtn
  ]);
}

function applyRouted(state, routed, inboxMeta){
  const receipt = { events:[], tasks:[], groceries:[] };
  for(const g of routed.groceries||[]){
    state.groceries.unshift(g);
    receipt.groceries.push(g.id);
  }
  for(const t of routed.tasks||[]){
    state.tasks.unshift(t);
    receipt.tasks.push(t.id);
  }
  for(const e of routed.events||[]){
    state.events.unshift(e);
    receipt.events.push(e.id);
  }
  if(inboxMeta && inboxMeta.text){
    state.inbox.unshift({
      id: uid('in'),
      ts: nowIso(),
      from: inboxMeta.from || 'Unknown',
      text: inboxMeta.text,
      source: inboxMeta.source || 'app',
      receipt
    });
  }
}

function kpis(state, render){
  const openTasks = (state.tasks||[]).filter(t=>!t.done).length;
  const openG = (state.groceries||[]).filter(g=>!g.done).length;
  const next14 = [];
  const start = startOfDay(new Date());
  for(let i=0;i<14;i++){ next14.push(...eventsForDay(state, addDays(start,i))); }

  return el('div',{class:'section'},[
    el('div',{style:'display:flex; align-items:center; justify-content:space-between; gap:10px;'},[
      el('h2',{text:'Overview'}),
      el('button',{class:'pill small primary', html: icons.list(18) + '<span>What\'s urgent?</span>', onClick: ()=> setHash('#/urgent')})
    ]),
    el('div',{class:'grid2'},[
      el('div',{class:'card kpi'},[
        el('div',{class:'label', text:'Open tasks'}),
        el('div',{class:'value', text:String(openTasks)}),
        el('div',{class:'mini', text:'Lisa/Jabu + parents'})
      ]),
      el('div',{class:'card kpi'},[
        el('div',{class:'label', text:'Groceries'}),
        el('div',{class:'value', text:String(openG)}),
        el('div',{class:'mini', text:'Items to buy'})
      ]),
      el('div',{class:'card kpi'},[
        el('div',{class:'label', text:'Next 14 days'}),
        el('div',{class:'value', text:String(next14.length)}),
        el('div',{class:'mini', text:'Total events'})
      ]),
      el('div',{class:'card kpi'},[
        el('div',{class:'label', text:'Clashes (14d)'}),
        el('div',{class:'value', text:String(upcomingClashes(state,14).length)}),
        el('div',{class:'mini', text:'Overlaps to fix'})
      ])
    ])
  ]);
}

function next14DaysList(state){
  const start = startOfDay(new Date());
  const items = [];
  const daysToShow = 14;

  for(let i=0;i<daysToShow;i++){
    const day = addDays(start, i);
    const evs = eventsForDay(state, day);
    if(evs.length===0) continue;

    const head = (i===0) ? 'Today' : (i===1 ? 'Tomorrow' : day.toLocaleDateString(undefined,{weekday:'short'}));
    items.push(el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text: `${head} · ${day.toLocaleDateString(undefined,{month:'short', day:'numeric'})}`}),
        el('p',{text: evs.slice(0,4).map(ev=>formatEventLine(state, ev)).join('\n')}),
        evs.length>4 ? el('div',{class:'tag', text:`+${evs.length-4} more`}) : null
      ]),
      el('div',{class:'actions'},[
        el('button',{class:'pill small', html: icons.calendar(20), onClick: ()=> { state.ui.calAnchor = day.toISOString(); setHash('#/calendar'); }})
      ])
    ]));
  }

  if(items.length===0){
    items.push(el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text:'No events in the next 14 days'}),
        el('p',{text:'If school sends dates, import the calendar — or just tell Rosie.'})
      ])
    ]));
  }

  return el('div',{class:'section'},[
    el('h2',{text:'Next 14 days'}),
    el('div',{class:'card list'}, items)
  ]);
}

function inboxPeek(state){
  const last = (state.inbox||[])[0];
  const box = el('div',{class:'card hero'},[
    el('div',{class:'rosie', html: icons.list(28)}),
    el('div',{class:'msg'},[
      el('p',{class:'title', text:'Inbox'}),
      el('p',{class:'hint', text: last ? (last.from + ': ' + last.text) : 'When WhatsApp bridge is connected, messages appear here.'})
    ]),
    el('div',{class:'actions'},[
      el('button',{class:'pill small', onClick: ()=> setHash('#/inbox'), text:'Open'})
    ])
  ]);
  return el('div',{class:'section'},[ box ]);
}

function listsPeek(state){
  const openTasks = (state.tasks||[]).filter(t=>!t.done).length;
  const openG = (state.groceries||[]).filter(g=>!g.done).length;
  return el('div',{class:'section'},[
    el('div',{class:'card hero'},[
      el('div',{class:'rosie', html: icons.check(28)}),
      el('div',{class:'msg'},[
        el('p',{class:'title', text:'Lists'}),
        el('p',{class:'hint', text:`Tasks: ${openTasks} · Groceries: ${openG}`})
      ]),
      el('div',{class:'actions'},[
        el('button',{class:'pill small', onClick: ()=> setHash('#/lists'), text:'Open'})
      ])
    ])
  ]);
}

function renderLists(state, render){
  const tasks = (state.tasks||[]).filter(t=>!t.done);
  const groceries = (state.groceries||[]).filter(g=>!g.done);

  const taskInput = el('input',{placeholder:'e.g. “Tell Jabu clean kitchen tomorrow”'});
  const addTask = el('button',{class:'pill primary', html: icons.plus(18)+'<span>Add</span>', onClick: ()=>{
    const txt = taskInput.value.trim();
    if(!txt) return;
    const res = routeCapture(state, txt, 'app');
    applyRouted(state, res, { from:'App', text: txt, source:'app' });
    saveState(state);
    taskInput.value='';
    toast('Sorted ✓');
    render();
  }});

  const grocInput = el('input',{placeholder:'e.g. “Milk, eggs, fruit”'});
  const addG = el('button',{class:'pill primary', html: icons.plus(18)+'<span>Add</span>', onClick: ()=>{
    const txt = grocInput.value.trim();
    if(!txt) return;
    const res = routeCapture(state, 'groceries ' + txt, 'app');
    applyRouted(state, res, { from:'App', text: 'groceries ' + txt, source:'app' });
    saveState(state);
    grocInput.value='';
    toast('Added ✓');
    render();
  }});

  const taskList = tasks.length ? tasks.slice(0,50).map(t=>{
    const who = memberLabel(state, t.assignees);
    const dueTxt = t.due ? (' · ' + new Date(t.due).toLocaleString(undefined,{weekday:'short', hour:'2-digit', minute:'2-digit'})) : '';
    return el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text: t.title}),
        el('p',{},[
          (t.assignees||[]).length ? memberChips(state, t.assignees, 16) : el('span',{class:'smallmuted', text:'Unassigned'}),
          dueTxt ? el('span',{class:'smallmuted', text: dueTxt.replace(/^\s*·\s*/,' · ')}) : null
        ]),
        el('div',{class:'row', style:'gap:8px; flex-wrap:wrap;'},[
          el('span',{class:'tag', text:'From: ' + (t.source||'app')})
        ]),
        t.priority==='high' ? el('div',{class:'badge danger', html: icons.list(16)+'<span>High</span>'}) : null
      ]),
      el('div',{class:'actions'},[
        el('button',{class:'pill small primary', html: icons.check(18), onClick: ()=>{
          const tt = state.tasks.find(x=>x.id===t.id);
          if(tt){ tt.done=true; saveState(state); toast('Done'); render(); }
        }})
      ])
    ]);
  }) : [el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'No open tasks'}), el('p',{text:'Rosie will create tasks from messages.'})])])];

  const grocList = groceries.length ? groceries.slice(0,80).map(g=>{
    return el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text: g.text}),
        el('div',{class:'row', style:'gap:8px; flex-wrap:wrap;'},[ el('span',{class:'tag', text:'From: ' + (g.source||'app')}) ])
      ]),
      el('div',{class:'actions'},[
        el('button',{class:'pill small primary', html: icons.check(18), onClick: ()=>{
          const gg = state.groceries.find(x=>x.id===g.id);
          if(gg){ gg.done=true; saveState(state); toast('Done'); render(); }
        }})
      ])
    ]);
  }) : [el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'Grocery list is empty'}), el('p',{text:'Add items as you think of them.'})])])];

  return el('div',{class:'shell'},[
    header(),
    el('div',{class:'section'},[
      el('h2',{text:'Tasks'}),
      el('div',{class:'quick'},[
        el('div',{class:'input'},[ el('span',{html: icons.list(18)}), taskInput ]),
        addTask
      ]),
      el('div',{class:'card list'}, taskList)
    ]),
    el('div',{class:'section'},[
      el('h2',{text:'Groceries'}),
      el('div',{class:'quick'},[
        el('div',{class:'input'},[ el('span',{html: icons.plus(18)}), grocInput ]),
        addG
      ]),
      el('div',{class:'card list'}, grocList)
    ])
  ]);
}


function renderHome(state, render){
  return el('div',{class:'shell'},[
    header(),
    heroCard(),
    quickCapture(state, render),
    kpis(state, render),
    next14DaysList(state),
    inboxPeek(state),
    listsPeek(state)
  ]);
}

function renderUrgent(state, render){
  const clashes = upcomingClashes(state, 14);
  const due = tasksDueSoon(state, 72);
  const prep = prepFromEvents(state, 72);

  const clashList = (clashes.length ? clashes.slice(0,8) : []).map(x => el('div',{class:'item'},[
    el('div',{class:'grow'},[
      el('h3',{text:`Clash · ${x.member.name}`}),
      el('p',{text:`${x.day.toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'})} · ${x.count} overlap(s)`})
    ]),
    el('div',{class:'actions'},[
      el('button',{class:'pill small', html: icons.calendar(20), onClick: ()=> { state.ui.calAnchor = x.day.toISOString(); setHash('#/calendar'); }})
    ])
  ]));
  if(clashList.length===0){
    clashList.push(el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text:'No clashes detected'}),
        el('p',{text:'Rosie will warn you if schedules overlap.'})
      ])
    ]));
  }

  const dueList = (due.length ? due.slice(0,10) : []).map(t => {
    const who = memberLabel(state, t.assignees);
    const dueTxt = t.due ? new Date(t.due).toLocaleString(undefined,{weekday:'short', hour:'2-digit', minute:'2-digit'}) : (t.priority==='high' ? 'High priority' : '');
    return el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text: t.title}),
        el('p',{text: `${who || 'Unassigned'}${dueTxt ? ' · '+dueTxt : ''}`})
      ]),
      el('div',{class:'actions'},[
        el('button',{class:'pill small primary', html: icons.check(18), onClick: ()=>{
          const tt = state.tasks.find(x=>x.id===t.id);
          if(tt){ tt.done = true; saveState(state); toast('Done'); render(); }
        }})
      ])
    ]);
  });
  if(dueList.length===0){
    dueList.push(el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text:'No urgent tasks'}),
        el('p',{text:'You’re on top of things.'})
      ])
    ]));
  }

  const prepList = (prep.length ? prep.slice(0,10) : []).map(x => {
    const when = new Date(x.ev.start).toLocaleString(undefined,{weekday:'short', hour:'2-digit', minute:'2-digit'});
    const who = memberLabel(state, x.ev.who);
    return el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text: x.task.title}),
        el('p',{},[
          el('span',{text: `${when} · ${x.ev.title}${x.ev.where ? ' · '+x.ev.where : ''}`}),
          (x.ev.who||[]).length ? el('span',{text:' · '}) : null,
          (x.ev.who||[]).length ? memberChips(state, x.ev.who, 16) : null
        ])
      ])
    ]);
  });
  if(prepList.length===0){
    prepList.push(el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text:'No prep items soon'}),
        el('p',{text:'If someone needs something, just tell Rosie.'})
      ])
    ]));
  }

  return el('div',{class:'shell'},[
    header(),
    el('div',{class:'section'},[
      el('h2',{text:'Urgent'}),
      el('div',{class:'card list'},[
        el('div',{class:'item'},[
          el('div',{class:'grow'},[
            el('h3',{text:'Rosie’s focus for the next 72 hours'}),
            el('p',{text:'Clashes, urgent tasks, and “bring this” reminders — without noise.'})
          ])
        ])
      ])
    ]),
    el('div',{class:'section'},[
      el('h2',{text:'Clashes'}),
      el('div',{class:'card list'}, clashList)
    ]),
    el('div',{class:'section'},[
      el('h2',{text:'Urgent tasks'}),
      el('div',{class:'card list'}, dueList)
    ]),
    el('div',{class:'section'},[
      el('h2',{text:'Prep reminders'}),
      el('div',{class:'card list'}, prepList)
    ])
  ]);
}

function dayModal(state, day, render){
  const modal = document.getElementById('dayModal');
  const title = document.getElementById('dayTitle');
  const list = document.getElementById('dayList');
  const clashBox = document.getElementById('dayClashes');
  if(!modal || !title || !list || !clashBox) return;

  const evs = eventsForDay(state, day).filter(ev => eventMatchesFilter(state, ev));
  title.textContent = day.toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'});
  list.innerHTML = '';
  clashBox.innerHTML = '';

  if(evs.length===0){
    list.appendChild(el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text:'No events'}),
        el('p',{text:'Enjoy the calm. If something comes up, just tell Rosie.'})
      ])
    ]));
  }else{
    for(const ev of evs){
      list.appendChild(el('div',{class:'item'},[
        el('div',{class:'grow'},[
          el('h3',{text: ev.title}),
          el('p',{text: `${ev.allDay ? 'All day' : hm(ev.start)}${ev.end && !ev.allDay ? '–'+hm(ev.end) : ''}${ev.where ? ' · '+ev.where : ''}`}),
          el('div',{class:'tag'},[
            (ev.who||[]).length ? memberChips(state, ev.who, 16) : el('span',{text: (ev.type||'Other')})
          ])
        ]),
        el('div',{class:'actions'},[
          el('button',{class:'pill small danger', html: icons.x(18), onClick: ()=>{
            removeById(state.events, ev.id);
            saveState(state);
            toast('Deleted');
            modal.classList.remove('open');
            render();
          }})
        ])
      ]));
    }
  }

  // clashes per person
  const clashes = [];
  for(const m of state.family){
    const c = detectClashes(state, day, m.id);
    if(c.length) clashes.push({ m, c });
  }
  if(clashes.length){
    clashBox.appendChild(el('div',{class:'badge danger', html:`${icons.list(16)}<span>Clashes detected</span>`}));
    for(const {m,c} of clashes){
      clashBox.appendChild(el('div',{class:'smallmuted'},[
        el('span',{html: icons.avatar(m.id, 16)}),
        el('span',{text:` ${m.name}: ${c.length} overlap(s)`})
      ]));
    }
  }

  modal.classList.add('open');
  document.getElementById('dayClose').onclick = ()=> modal.classList.remove('open');
}

function renderCalendarFilters(state, render){
  const ui = state.ui || (state.ui = {});
  ui.calFilter = ui.calFilter || { memberId:'all', type:'all', location:'' };
  const f = ui.calFilter;

  const memberSel = el('select',{class:'pill', style:'height:48px; padding:0 12px;'},[]);
  memberSel.appendChild(el('option',{value:'all', text:'All people'}));
  for(const m of state.family){
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    memberSel.appendChild(opt);
  }
  memberSel.value = f.memberId;

  const typeSel = el('select',{class:'pill', style:'height:48px; padding:0 12px;'},[]);
  ['all','School','Home','Staff','Other'].forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t==='all' ? 'All types' : t;
    typeSel.appendChild(opt);
  });
  typeSel.value = f.type;

  const loc = el('input',{class:'pill', placeholder:'Filter: location', value: f.location || ''});
  loc.style.flex = '1';
  loc.style.minWidth = '170px';

  const clear = el('button',{class:'pill small', html: icons.x(18) + '<span>Clear</span>', onClick: ()=>{
    ui.calFilter = { memberId:'all', type:'all', location:'' };
    saveState(state);
    render();
  }});

  memberSel.onchange = ()=> { ui.calFilter.memberId = memberSel.value; saveState(state); render(); };
  typeSel.onchange = ()=> { ui.calFilter.type = typeSel.value; saveState(state); render(); };
  loc.oninput = ()=> { ui.calFilter.location = loc.value; saveState(state); };

  const apply = el('button',{class:'pill small', html: icons.check(18) + '<span>Apply</span>', onClick: ()=> { saveState(state); render(); }});

  return el('div',{style:'display:flex; gap:10px; width:100%; flex-wrap:wrap;'},[
    memberSel, typeSel, loc, apply, clear
  ]);
}

function renderUpcomingDetails(state, days){
  const start = startOfDay(new Date());
  const blocks = [];
  for(let i=0;i<days;i++){
    const day = addDays(start, i);
    const evs = eventsForDay(state, day).filter(ev => eventMatchesFilter(state, ev));
    if(!evs.length) continue;

    blocks.push(el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text: day.toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'})}),
        el('p',{text: evs.map(ev => formatEventLine(state, ev)).join('\n')})
      ])
    ]));
  }
  return el('div',{class:'card list'}, blocks.length?blocks:[
    el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text:'No events coming up'}),
        el('p',{text:'Import the school calendar or tell Rosie as things come in.'})
      ])
    ])
  ]);
}

function openAddEvent(state, render){
  const modal = document.getElementById('addEventModal');
  const title = document.getElementById('ae_title');
  const date = document.getElementById('ae_date');
  const start = document.getElementById('ae_start');
  const end = document.getElementById('ae_end');
  const where = document.getElementById('ae_where');
  const who = document.getElementById('ae_who');

  who.innerHTML = '';
  for(const m of state.family){
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    who.appendChild(opt);
  }

  const d = new Date();
  date.value = ymd(d);
  start.value = '14:00';
  end.value = '15:00';
  title.value = '';
  where.value = '';

  modal.classList.add('open');

  document.getElementById('ae_close').onclick = ()=> modal.classList.remove('open');
  document.getElementById('ae_save').onclick = ()=> {
    const dt = new Date(date.value + 'T' + (start.value||'00:00') + ':00');
    const dt2 = new Date(date.value + 'T' + (end.value||start.value||'00:00') + ':00');
    const ev = {
      id: uid('ev'),
      title: title.value.trim() || 'Event',
      start: dt.toISOString(),
      end: dt2.toISOString(),
      where: where.value.trim(),
      who: Array.from(who.selectedOptions).map(o=>o.value),
      type: 'Other',
      createdAt: nowIso(),
      source: 'manual'
    };
    state.events.unshift(ev);
    saveState(state);
    toast('Added');
    modal.classList.remove('open');
    render();
  };
}

function openIcsImport(state, render){
  const modal = document.getElementById('icsModal');
  const file = document.getElementById('icsFile');
  const status = document.getElementById('icsStatus');
  const preview = document.getElementById('icsPreview');
  const apply = document.getElementById('icsApply');

  status.textContent = 'Choose a .ics file. Rosie will auto-fill the calendar.';
  preview.innerHTML = '';
  file.value = '';

  let imported = [];

  file.onchange = async ()=>{
    const f = file.files?.[0];
    if(!f) return;
    const txt = await f.text();
    const parsed = parseIcs(txt);
    imported = enrichImportedEvents(state, parsed);

    preview.innerHTML = '';
    const show = imported.slice(0,8);
    for(const ev of show){
      preview.appendChild(el('div',{class:'item'},[
        el('div',{class:'grow'},[
          el('h3',{text: ev.title}),
          el('p',{text: `${new Date(ev.start).toLocaleString()}${ev.where ? ' · '+ev.where : ''}`}),
          el('div',{class:'tag'},[
            el('span',{text: (ev.type||'Other')}),
            (ev.who||[]).length ? el('span',{text:' · '}) : null,
            (ev.who||[]).length ? memberChips(state, ev.who, 16) : null
          ])
        ])
      ]));
    }
    status.textContent = imported.length ? `Ready: ${imported.length} event(s). Tap Import.` : 'No events found.';
  };

  apply.onclick = ()=>{
    if(!imported.length){ toast('No events'); return; }
    const existing = new Set((state.events||[]).map(ev => `${ev.start}|${ev.title}|${ev.where||''}`));
    let added = 0;
    for(const ev of imported){
      const key = `${ev.start}|${ev.title}|${ev.where||''}`;
      if(existing.has(key)) continue;
      state.events.unshift(ev);
      added++;
    }
    saveState(state);
    toast(`Imported ${added}`);
    modal.classList.remove('open');
    render();
  };

  document.getElementById('icsClose').onclick = ()=> modal.classList.remove('open');
  modal.classList.add('open');
}

function renderCalendar(state, render){
  const ui = state.ui || (state.ui = {});
  ui.calMode = ui.calMode || '2w';
  ui.calAnchor = ui.calAnchor || new Date().toISOString();

  const anchor = new Date(ui.calAnchor);

  const page = el('div',{class:'shell'},[
    header(),
    el('div',{class:'section'},[
      el('h2',{text:'Calendar overview'}),
      el('div',{class:'card'},[
        el('div',{class:'calHeader'},[
          el('div',{class:'row'},[
            el('button',{class:'pill small', html: icons.chevronLeft(18), onClick: ()=>{
              const step = ui.calMode==='month' ? -30 : -14;
              ui.calAnchor = addDays(anchor, step).toISOString();
              saveState(state);
              render();
            }}),
            el('button',{class:'pill small', html: icons.chevronRight(18), onClick: ()=>{
              const step = ui.calMode==='month' ? 30 : 14;
              ui.calAnchor = addDays(anchor, step).toISOString();
              saveState(state);
              render();
            }})
          ]),
          el('div',{class:'seg'},[
            el('button',{class: ui.calMode==='2w' ? 'active':'' , text:'2 weeks', onClick: ()=> { ui.calMode='2w'; saveState(state); render(); }}),
            el('button',{class: ui.calMode==='month' ? 'active':'' , text:'Month', onClick: ()=> { ui.calMode='month'; saveState(state); render(); }})
          ]),
          el('button',{class:'pill small', html: icons.plus(18) + '<span>Add</span>', onClick: ()=> openAddEvent(state, render) }),
          el('button',{class:'pill small', html: icons.list(18) + '<span>Import .ics</span>', onClick: ()=> openIcsImport(state, render) })
        ]),
        el('div',{style:'padding: 0 10px 10px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;'},[
          renderCalendarFilters(state, render)
        ]),
        el('div',{class:'calGrid'},[
          ...DAYS.map(d=> el('div',{class:'dayHead', text:d}))
        ]),
        el('div',{id:'calBody'})
      ])
    ]),
    el('div',{class:'section'},[
      el('h2',{text:'Next 2 weeks (details)'}),
      renderUpcomingDetails(state, 14)
    ])
  ]);

  // Fill grid after mount
  setTimeout(()=> {
    const body = page.querySelector('#calBody');
    if(!body) return;
    body.innerHTML = '';

    const mkCell = (day, inMonth=true) => {
      const evs = eventsForDay(state, day).filter(ev => eventMatchesFilter(state, ev));
      const dots = [];
      for(let i=0;i<Math.min(4, evs.length);i++){
        const ev = evs[i];
        const cls = (ev.who||[]).length>1 ? 'warn' : (ev.type==='School' ? 'alt' : (ev.type==='Staff' ? 'danger' : ''));
        dots.push(el('span',{class:'dot '+cls}));
      }
      const more = evs.length>4 ? el('div',{class:'more', text:`+${evs.length-4} more`}) : null;
      const cell = el('button',{class:'dayCell', onClick: ()=> dayModal(state, day, render)},[
        el('div',{class:'d'},[
          el('span',{text:String(day.getDate())}),
          el('span',{text: evs.length? String(evs.length): ''})
        ]),
        el('div',{class:'dotRow'}, dots),
        more
      ]);
      if(!inMonth) cell.style.opacity = '0.55';
      return cell;
    };

    if(ui.calMode==='month'){
      const mm = monthMatrix(anchor);
      for(const week of mm.weeks){
        for(const day of week){
          body.appendChild(mkCell(day, day.getMonth()===mm.month));
        }
      }
    }else{
      const weeks = twoWeekMatrix(anchor);
      for(const week of weeks){
        for(const day of week){
          body.appendChild(mkCell(day, true));
        }
      }
    }
  }, 0);

  return page;
}

function renderInbox(state, render){
  state.ui = state.ui || {};
  if(typeof state.ui.inboxQuery !== 'string') state.ui.inboxQuery = '';
  if(!state.ui.inboxFilter) state.ui.inboxFilter = 'all';

  const q = (state.ui.inboxQuery||'').trim().toLowerCase();
  const filter = state.ui.inboxFilter || 'all';

  let items = (state.inbox||[]).slice(0,200);

  items = items.filter(msg=>{
    const filed = !!(msg.receipt && (msg.receipt.events?.length || msg.receipt.tasks?.length || msg.receipt.groceries?.length));
    if(filter === 'filed' && !filed) return false;
    if(filter === 'unfiled' && filed) return false;
    if(!q) return true;
    const hay = `${msg.from||''} ${msg.text||''} ${msg.source||''}`.toLowerCase();
    return hay.includes(q);
  });

  const search = el('input',{
    value: state.ui.inboxQuery||'',
    placeholder:'Search inbox (Zaara, goggles, swimming)…',
    onInput: (e)=>{ state.ui.inboxQuery = e.target.value; saveState(state); render(); }
  });

  const chip = (key,label)=> el('button',{
    class:'chip' + (state.ui.inboxFilter===key?' active':''),
    onClick: ()=>{ state.ui.inboxFilter = key; saveState(state); render(); }
  },[ el('span',{text:label}) ]);

  const controls = el('div',{class:'card'},[
    el('div',{class:'row', style:'gap:10px;'},[
      el('div',{class:'input', style:'flex:1;'},[ el('span',{html: icons.search(18)}), search ]),
      el('button',{class:'pill', html: icons.list(18) + '<span>Sync</span>', onClick: ()=> syncInbox(state, render)})
    ]),
    el('div',{class:'chips', style:'margin-top:10px;'},[
      chip('all','All'),
      chip('unfiled','Unfiled'),
      chip('filed','Filed')
    ])
  ]);

  const list = el('div',{class:'card list'}, items.length ? items.map(msg => {
    const t = new Date(msg.ts);
    const receiptParts = [];
    if(msg.receipt?.events?.length) receiptParts.push(`📅 ${msg.receipt.events.length}`);
    if(msg.receipt?.tasks?.length) receiptParts.push(`✅ ${msg.receipt.tasks.length}`);
    if(msg.receipt?.groceries?.length) receiptParts.push(`🛒 ${msg.receipt.groceries.length}`);

    const source = (msg.source || 'app');
    const sourceLabel = source === 'whatsapp' ? 'WhatsApp' :
      source === 'import' ? 'Import' :
      source === 'voice' ? 'Voice' :
      source === 'paste' ? 'Paste' : 'App';

    const filed = receiptParts.length > 0;

    const status = msg.waStatus?.status;
    const statusText = status ? `• ${status}` : '';
    const statusTag = status ? el('span',{class:'tag', text:`Delivery: ${status}`}) : null;

    return el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('div',{class:'row', style:'justify-content:space-between; align-items:flex-start; gap:10px;'},[
          el('div',{class:'col', style:'gap:4px;'},[
            el('h3',{text: `${msg.from} · ${t.toLocaleString()}`}),
            el('div',{class:'row', style:'gap:8px; flex-wrap:wrap;'},[
              el('span',{class:'tag', text:`From: ${sourceLabel}`}),
              filed ? el('span',{class:'tag', text:`Filed: ${receiptParts.join('  ')}`}) : el('span',{class:'tag', text:'Unfiled'}),
              status ? el('span',{class:'tag', text:`${status}`}) : el('span',{class:'tag', text:' '})
            ])
          ]),
        ]),
        el('p',{text: msg.text})
      ]),
      el('div',{class:'actions'},[
        el('button',{class:'pill small primary', html: icons.check(16) + '<span>Sort ✓</span>', onClick: ()=>{
          const routed = routeCapture(state, msg.text, msg.source||'inbox');
          // Apply without creating a duplicate inbox item: update existing message receipt instead.
          const receipt = applyRoutedToStateOnly(state, routed);
          msg.receipt = receipt;
          saveState(state);
          toast('Sorted ✓');
          render();
        }}),
        el('button',{class:'pill small', text:'Delete', onClick: ()=>{
          state.inbox = (state.inbox||[]).filter(x=> x!==msg);
          saveState(state); render();
        }})
      ])
    ]);
  }) : [
    el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text:'Inbox is calm'}),
        el('p',{text:'When kids/staff message Rosie, you’ll see it here. For now, use Quick Capture or import the school calendar.'})
      ])
    ])
  ]);

  return el('div',{class:'shell'},[
    header(),
    el('div',{class:'section'},[
      el('div',{class:'row', style:'justify-content:space-between; align-items:center;'},[
        el('h2',{text:'Inbox'}),
        el('div',{class:'tag', text:`${items.length} shown`})
      ]),
      controls,
      list
    ]),
    nav()
  ]);
}

async function syncInbox(state, render){
  const url = (state.settings.bridgeUrl||'').trim();
  const token = (state.settings.bridgeToken||'').trim();
  const gid = (state.settings.householdId||'family').trim() || 'family';
  if(!url || !token){
    toast('Bridge not configured');
    setHash('#/settings');
    return;
  }
  try{
    const endpoint = url.replace(/\/$/,'') + '/api/inbox?gid=' + encodeURIComponent(gid);
    const res = await fetch(endpoint, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if(!res.ok) throw new Error('bad');
    const data = await res.json();
    if(Array.isArray(data.items)){
      const existing = new Set((state.inbox||[]).map(i=>i.id));
      for(const it of data.items){
        if(!it.id) it.id = uid('in');
        if(existing.has(it.id)) continue;
        state.inbox.unshift(it);
      }
      saveState(state);
      toast('Synced ✓');
      render();
    }else{
      toast('No items');
    }
  }catch(e){
    toast('Sync failed');
  }
}

function renderSettings(state, render){
  const s = state.settings;

  const bridgeUrl = el('input',{value: s.bridgeUrl||'', placeholder:'https://<worker-domain>'});
  const householdId = el('input',{value: s.householdId||'family', placeholder:'household id (e.g. family)'});
  const pairingCode = el('input',{value: s.pairingCode||'', placeholder:'pairing code (Suhayl only)'});
  const bridgeTok = el('input',{value: s.bridgeToken||'', placeholder:'token (auto after Pair)'});
  const groupId = el('input',{value: s.householdGroupId||'', placeholder:'(optional) WhatsApp group/conversation id'});
  const testTo = el('input',{value: s.testWhatsAppTo||'', placeholder:'test WhatsApp number (E.164, e.g. 4477...)'});

  const rulesPeople = el('textarea',{style:'width:100%; min-height:120px; border-radius:18px; border:1px solid rgba(17,24,39,.12); padding:12px;'},[]);
  const rulesType = el('textarea',{style:'width:100%; min-height:120px; border-radius:18px; border:1px solid rgba(17,24,39,.12); padding:12px;'},[]);

  rulesPeople.value = JSON.stringify(s.autoAssignRules || [], null, 2);
  rulesType.value = JSON.stringify(s.autoTypeRules || [], null, 2);

  const saveBtn = el('button',{class:'pill primary', html: icons.check(18) + '<span>Save</span>', onClick: ()=>{
    s.bridgeUrl = bridgeUrl.value.trim();
    s.householdId = householdId.value.trim() || 'family';
    s.pairingCode = pairingCode.value.trim();
    s.bridgeToken = bridgeTok.value.trim();
    s.householdGroupId = groupId.value.trim();
    s.testWhatsAppTo = testTo.value.trim();
    try{
      s.autoAssignRules = JSON.parse(rulesPeople.value || '[]');
      s.autoTypeRules = JSON.parse(rulesType.value || '[]');
    }catch(e){
      toast('Rules JSON invalid');
      return;
    }
    saveState(state);
    toast('Saved');
  }});

  const exportBtn = el('button',{class:'pill', text:'Export backup', onClick: ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rosie-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }});

  const importInput = el('input',{type:'file', accept:'application/json'});
  importInput.onchange = async ()=>{
  const f = importInput.files?.[0];
  if(!f) return;
  // If a bridge token is configured, treat this as a bridge backup import.
  if((state.settings.bridgeUrl||'').trim() && (state.settings.bridgeToken||'').trim()){
    await importBridgeBackup(state, f);
    importInput.value = '';
    return;
  }
  try{
    const txt = await f.text();
    const parsed = JSON.parse(txt);
    const merged = loadState();
    Object.assign(merged, parsed);
    merged.settings = { ...loadState().settings, ...(parsed.settings||{}) };
    merged.ui = { ...loadState().ui, ...(parsed.ui||{}) };
    saveState(merged);
    toast('Imported ✓');
    location.reload();
  }catch(e){
    toast('Import failed');
  }finally{
    importInput.value = '';
  }
};

  return el('div',{class:'shell'},[
    header(),
    el('div',{class:'section'},[
      el('h2',{text:'Settings'}),
      el('div',{class:'card list'},[
        el('div',{class:'item'},[
          el('div',{class:'grow'},[
            el('h3',{text:'WhatsApp Bridge (optional)'}),
            el('p',{text:'Connect a private “Rosie Brain” so WhatsApp messages appear in Inbox and Rosie can send reminders.'}),
            el('div',{class:'tag', text:'Suhayl sets this once. Nasima does nothing.'})
          ])
        ]),
        el('div',{class:'item'},[ el('div',{class:'grow'},[ el('h3',{text:'Bridge URL'}), bridgeUrl ]) ]),
        el('div',{class:'item'},[ el('div',{class:'grow'},[ el('h3',{text:'Household ID'}), householdId, el('div',{class:'tag', text:'Used for multi-household routing (ITER21). Default: family.'}) ]) ]),
        el('div',{class:'item'},[ el('div',{class:'grow'},[ el('h3',{text:'Pairing code'}), pairingCode, el('div',{class:'tag', text:'Suhayl enters this once to pair.'}) ]) ]),
        el('div',{class:'item'},[ el('div',{class:'grow'},[ el('h3',{text:'Bridge Token'}), bridgeTok, el('div',{class:'tag', text:'Auto-filled after Pair. Keep private.'}) ]) ]),
        el('div',{class:'item'},[ el('div',{class:'grow'},[ el('h3',{text:'Test WhatsApp number'}), testTo, el('div',{class:'tag', text:'For “Send test ping” only. E.164 format.'}) ]) ]),
        el('div',{class:'item'},[
          el('div',{class:'grow'},[
            el('h3',{text:'Bridge actions'}),
            el('div',{class:'actions'},[
              el('button',{class:'pill primary', html: icons.check(18) + '<span>Pair</span>', onClick: ()=> pairBridge(state, render)}),
              el('button',{class:'pill', html: icons.list(18) + '<span>Sync Inbox</span>', onClick: ()=> syncInbox(state, render)}),
              el('button',{class:'pill', text:'Export bridge backup', onClick: ()=> exportBridgeBackup(state)}),
              el('button',{class:'pill', text:'Import bridge backup', onClick: ()=> importInput.click() }),
              el('button',{class:'pill', text:'View delivery status', onClick: async ()=>{ const items = await fetchRecentStatuses(state); if(!items) return; alert(items.slice(0,10).map(x=>`${x.status} · ${x.recipient_id||''} · ${new Date(x.timestamp||0).toLocaleString()}`).join('\n') || 'No recent statuses'); }}),
              el('button',{class:'pill', text:'Send test ping', onClick: ()=> sendWhatsAppTest(state)})
            ])
          ])
        ]),

        el('div',{class:'item'},[ el('div',{class:'grow'},[ el('h3',{text:'Household Group ID'}), groupId, el('div',{class:'tag', text:'Only if your WhatsApp API account supports group IDs.'}) ]) ]),
        el('div',{class:'item'},[
          el('div',{class:'grow'},[
            el('h3',{text:'Auto-assign rules (ICS)'}),
            el('p',{text:'Keyword rules to tag imported events to people. Example: “Zaara”.'}),
            rulesPeople
          ])
        ]),
        el('div',{class:'item'},[
          el('div',{class:'grow'},[
            el('h3',{text:'Auto-type rules (ICS)'}),
            el('p',{text:'Keyword rules to label events as School/Home/Staff.'}),
            rulesType
          ])
        ]),
        el('div',{class:'item'},[ el('div',{class:'actions'},[saveBtn]) ])
      ])
    ]),
    el('div',{class:'section'},[
      el('h2',{text:'Backup'}),
      el('div',{class:'muted', text:'If icons ever disappear after an update, use Reset Cache.'}),
      el('button',{class:'btn', onClick: resetAppCache, text:'Reset cache & reload'}),
      el('div',{class:'card list'},[
        el('div',{class:'item'},[ el('div',{class:'actions'},[exportBtn]) ]),
        el('div',{class:'item'},[
          el('div',{class:'grow'},[
            el('h3',{text:'Import backup'}),
            importInput,
            el('div',{class:'tag', text:'Use if you change phone or reset.'})
          ])
        ])
      ])
    ])
  ]);
}

function nav(){
  const mk = (path,label,iconFn)=> el('button',{class:'navbtn'+(isActive(path)?' active':''), onClick:()=> setHash(path)},[
    el('div',{html: iconFn(18)}),
    el('div',{text:label})
  ]);
  return el('div',{class:'bottomnav'},[
    el('div',{class:'bar'},[
      mk('#/home','Home', (s)=>icons.rosie(s)),
      mk('#/calendar','Calendar', (s)=>icons.calendar(s)),
      mk('#/inbox','Inbox', (s)=>icons.list(s)),
      mk('#/settings','Settings', (s)=>icons.gear(s))
    ])
  ]);
}

function ensureOverlays(state, render){
  if(!document.getElementById('toast')){
    document.body.appendChild(el('div',{id:'toast', class:'toast'}));
  }

  if(!document.getElementById('sheet')){
    document.body.appendChild(el('div',{id:'sheet', class:'sheet', html: `
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <div class="row" style="gap:8px">
            ${icons.mic(18)} <strong>Voice</strong>
          </div>
          <button id="voiceClose" class="pill small">${icons.x(18)}</button>
        </div>
        <div id="voiceStatus" class="hint" style="margin-top:8px"></div>
        <div style="margin-top:10px">
          <textarea id="voiceText" placeholder="Your words appear here…"></textarea>
        </div>
        <div class="row" style="margin-top:10px; justify-content:space-between">
          <button id="voiceStart" class="pill">${icons.mic(18)} Start</button>
          <button id="voiceStop" class="pill danger">${icons.x(18)} Stop</button>
          <button id="voiceApply" class="pill primary">${icons.check(18)} Sort it</button>
        </div>
        <div class="hint">Tip: Say “Zaara swimming 2pm at school, bring goggles”.</div>
      </div>
    `}));
  }

  if(!document.getElementById('dayModal')){
    document.body.appendChild(el('div',{id:'dayModal', class:'modal', html: `
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <div>
            <h3 id="dayTitle"></h3>
            <div id="dayClashes" class="smallmuted"></div>
          </div>
          <button id="dayClose" class="pill small">${icons.x(18)}</button>
        </div>
        <hr class="sep"/>
        <div id="dayList"></div>
      </div>
    `}));
  }

  if(!document.getElementById('addEventModal')){
    document.body.appendChild(el('div',{id:'addEventModal', class:'modal', html: `
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <h3>Add event</h3>
          <button id="ae_close" class="pill small">${icons.x(18)}</button>
        </div>
        <div class="smallmuted">Keep it simple — Rosie will help keep it aligned.</div>
        <hr class="sep"/>
        <div class="section" style="margin-top:0">
          <h2>Title</h2>
          <input id="ae_title" class="pill" style="width:100%" placeholder="Swimming" />
        </div>
        <div class="grid2" style="margin-top:10px">
          <div>
            <div class="smallmuted">Date</div>
            <input id="ae_date" type="date" class="pill" style="width:100%"/>
          </div>
          <div>
            <div class="smallmuted">Where</div>
            <input id="ae_where" class="pill" style="width:100%" placeholder="School"/>
          </div>
        </div>
        <div class="grid2" style="margin-top:10px">
          <div>
            <div class="smallmuted">Start</div>
            <input id="ae_start" type="time" class="pill" style="width:100%"/>
          </div>
          <div>
            <div class="smallmuted">End</div>
            <input id="ae_end" type="time" class="pill" style="width:100%"/>
          </div>
        </div>
        <div style="margin-top:10px">
          <div class="smallmuted">Who (multi-select)</div>
          <select id="ae_who" class="pill" style="width:100%; height: 120px" multiple></select>
        </div>
        <div class="row" style="margin-top:12px; justify-content:flex-end">
          <button id="ae_save" class="pill primary">${icons.check(18)} Save</button>
        </div>
      </div>
    `}));
  }

  if(!document.getElementById('icsModal')){
    document.body.appendChild(el('div',{id:'icsModal', class:'modal', html: `
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <h3>Import school calendar (.ics)</h3>
          <button id="icsClose" class="pill small">${icons.x(18)}</button>
        </div>
        <div id="icsStatus" class="smallmuted"></div>
        <hr class="sep"/>
        <input id="icsFile" type="file" accept=".ics,text/calendar" class="pill" style="width:100%"/>
        <div class="hint" style="margin-top:10px">Rosie auto-tags people and type. Adjust rules in Settings anytime.</div>
        <hr class="sep"/>
        <div id="icsPreview"></div>
        <div class="row" style="margin-top:12px; justify-content:flex-end">
          <button id="icsApply" class="pill primary">${icons.check(18)} Import</button>
        </div>
      </div>
    `}));
  }

  if(!document.getElementById('fab')){
    const fab = el('button',{id:'fab', class:'fab', html: icons.mic(22), onClick: ()=> openVoiceSheet(state, render) });
    document.body.appendChild(fab);
  }
}

function openVoiceSheet(state, render){
  const sheet = document.getElementById('sheet');
  const ta = document.getElementById('voiceText');
  const status = document.getElementById('voiceStatus');
  const startBtn = document.getElementById('voiceStart');
  const stopBtn = document.getElementById('voiceStop');
  const applyBtn = document.getElementById('voiceApply');
  if(!sheet || !ta || !status || !startBtn || !stopBtn || !applyBtn) return;

  sheet.classList.add('open');
  ta.value = '';
  status.textContent = 'Ready. Tap Start and speak naturally.';

  let recog = null;
  let finalText = '';
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function cleanup(){
    try{ if(recog){ recog.onresult=null; recog.onerror=null; recog.onend=null; recog.stop(); } }catch(e){}
    recog = null;
  }

  startBtn.onclick = () => {
    finalText = '';
    ta.value = '';
    if(!SpeechRecognition){
      status.textContent = 'Voice dictation not supported on this browser.';
      return;
    }
    recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-GB';
    recog.onresult = (e) => {
      let interim = '';
      for(let i=e.resultIndex; i<e.results.length; i++){
        const txt = e.results[i][0].transcript;
        if(e.results[i].isFinal) finalText += txt + ' ';
        else interim += txt;
      }
      ta.value = (finalText + interim).trim();
    };
    recog.onerror = () => { status.textContent = 'Voice error. Try again.'; };
    recog.onend = () => {};
    try{
      recog.start();
      status.textContent = 'Listening…';
    }catch(e){
      status.textContent = 'Could not start voice.';
    }
  };

  stopBtn.onclick = () => {
    cleanup();
    status.textContent = 'Stopped. Tap “Sort it” to file.';
  };

  applyBtn.onclick = () => {
    const text = ta.value.trim();
    if(!text){ toast('Say something first'); return; }
    const res = routeCapture(state, text, 'voice');
    applyRouted(state, res, { from: 'Voice', text, source:'voice' });
    saveState(state);
    toast('Sorted ✓');
    sheet.classList.remove('open');
    cleanup();
    render();
  };

  document.getElementById('voiceClose').onclick = ()=> { sheet.classList.remove('open'); cleanup(); };
}

function renderApp(state, root){
  const hash = location.hash || '#/home';
  const render = ()=> renderApp(state, root);

  let page;
  if(hash.startsWith('#/calendar')) page = renderCalendar(state, render);
  else if(hash.startsWith('#/urgent')) page = renderUrgent(state, render);
  else if(hash.startsWith('#/lists')) page = renderLists(state, render);
  else if(hash.startsWith('#/inbox')) page = renderInbox(state, render);
  else if(hash.startsWith('#/settings')) page = renderSettings(state, render);
  else page = renderHome(state, render);

  root.innerHTML = '';
  root.appendChild(page);

  // Keep nav + overlays alive
  const existingNav = document.getElementById('bottomnav');
  if(existingNav) existingNav.remove();
  const navNode = nav();
  navNode.id = 'bottomnav';
  document.body.appendChild(navNode);

  ensureOverlays(state, render);
}

export function startApp(root){
  const state = loadState();

  // Seed a gentle sample message only if completely empty
  if((state.events||[]).length===0 && (state.inbox||[]).length===0 && (state.tasks||[]).length===0){
    const sampleText = 'Zaara swimming 2pm at school, bring goggles';
    const routed = routeCapture(state, sampleText, 'sample');
    applyRouted(state, routed, { from:'Zaara (sample)', text: sampleText, source:'sample' });
    saveState(state);
  }else{
    // Ensure we migrate any loaded state into v14 key
    saveState(state);
  }

  const go = ()=> renderApp(state, root);
  window.addEventListener('hashchange', go);
  if(!location.hash) location.hash = '#/home';
  go();
}
