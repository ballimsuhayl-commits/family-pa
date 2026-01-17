import { icons } from './icons.js';
import { loadState, saveState, uid, nowIso, removeById, memberLabel } from './store.js';
import { ymd, hm, startOfDay, addDays, monthMatrix, twoWeekMatrix, eventsForDay, detectClashes, formatEventLine } from './calendar.js';
import { routeCapture } from './parser.js';

const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function el(tag, attrs={}, children=[]){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==='class') n.className=v;
    else if(k==='html') n.innerHTML=v;
    else if(k==='text') n.textContent=v;
    else if(k.startsWith('on') && typeof v==='function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, String(v));
  }
  (Array.isArray(children)?children:[children]).forEach(c=>{
    if(c==null) return;
    n.appendChild(typeof c==='string'?document.createTextNode(c):c);
  });
  return n;
}

function toast(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}
function setHash(p){ location.hash=p; }
function isActive(p){ return (location.hash||'').startsWith(p); }

function header(){
  return el('div',{class:'topbar'},[
    el('div',{class:'brand'},[
      el('div',{class:'logo', html: icons.rosie(24)}),
      el('div',{},[
        el('h1',{text:'Rosie'}),
        el('div',{class:'sub',text:'Family Assistant'})
      ])
    ]),
    el('button',{class:'pill small', onClick:()=>setHash('#/calendar'), html: icons.calendar(18)+'<span>Calendar</span>'})
  ]);
}

function hero(){
  return el('div',{class:'card hero'},[
    el('div',{class:'rosie', html: icons.rosie(30)}),
    el('div',{class:'grow'},[
      el('p',{class:'title',text:'Tell me what’s going on — I’ll sort it.'}),
      el('p',{class:'hint',text:'Type or speak one message. Rosie files it into calendar, tasks, or groceries.'})
    ])
  ]);
}

function applyRouted(state, routed, meta){
  const receipt={events:[],tasks:[],groceries:[]};
  (routed.groceries||[]).forEach(g=>{ state.groceries.unshift(g); receipt.groceries.push(g.id); });
  (routed.tasks||[]).forEach(t=>{ state.tasks.unshift(t); receipt.tasks.push(t.id); });
  (routed.events||[]).forEach(e=>{ state.events.unshift(e); receipt.events.push(e.id); });
  if(meta?.text){
    state.inbox.unshift({id:uid('in'),ts:nowIso(),from:meta.from||'App',text:meta.text,source:meta.source||'app',receipt});
  }
}

function quick(state, render){
  const input=el('input',{placeholder:'e.g. “Zaara swimming 2pm at school — bring goggles”'});
  return el('div',{class:'quick'},[
    el('div',{class:'input'},[el('span',{html: icons.list(18)}), input]),
    el('button',{class:'pill primary', html: icons.plus(18)+'<span>Add</span>', onClick:()=>{
      const text=input.value.trim(); if(!text) return;
      const res=routeCapture(state,text,'app');
      applyRouted(state,res,{from:'App',text,source:'app'});
      saveState(state); input.value=''; toast('Sorted ✓'); render();
    }}),
    el('button',{class:'pill', html: icons.mic(18)+'<span>Voice</span>', onClick:()=>openVoice(state,render)})
  ]);
}

function kpis(state){
  const openTasks=(state.tasks||[]).filter(t=>!t.done).length;
  const openG=(state.groceries||[]).filter(g=>!g.done).length;
  const next14=[];
  const start=startOfDay(new Date());
  for(let i=0;i<14;i++){ next14.push(...eventsForDay(state, addDays(start,i))); }
  return el('div',{class:'section'},[
    el('h2',{text:'Overview'}),
    el('div',{class:'grid2'},[
      el('div',{class:'card kpi'},[el('div',{class:'label',text:'Open tasks'}),el('div',{class:'value',text:String(openTasks)})]),
      el('div',{class:'card kpi'},[el('div',{class:'label',text:'Groceries'}),el('div',{class:'value',text:String(openG)})]),
      el('div',{class:'card kpi'},[el('div',{class:'label',text:'Next 2 weeks'}),el('div',{class:'value',text:String(next14.length)})]),
      el('div',{class:'card kpi'},[el('div',{class:'label',text:'Inbox'}),el('div',{class:'value',text:String((state.inbox||[]).length)})]),
    ])
  ]);
}

function nav(){
  const mk=(p,label,icon)=>el('button',{class:'navbtn'+(isActive(p)?' active':''),onClick:()=>setHash(p)},[
    el('div',{html: icon(18)}), el('div',{text:label})
  ]);
  return el('div',{class:'bottomnav'},[
    el('div',{class:'bar'},[
      mk('#/home','Home',s=>icons.rosie(s)),
      mk('#/calendar','Calendar',s=>icons.calendar(s)),
      mk('#/inbox','Inbox',s=>icons.list(s)),
      mk('#/settings','Settings',s=>icons.gear(s)),
    ])
  ]);
}

function openVoice(state, render){
  const modal=document.getElementById('voiceModal');
  const ta=document.getElementById('voiceText');
  const status=document.getElementById('voiceStatus');
  modal.classList.add('open');
  ta.value=''; status.textContent='Ready.';
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let rec=null, final='';
  const start=()=>{ 
    if(!SpeechRecognition){ status.textContent='Voice not supported here.'; return; }
    rec=new SpeechRecognition(); rec.continuous=true; rec.interimResults=true; rec.lang='en-GB';
    rec.onresult=(e)=>{ let interim=''; for(let i=e.resultIndex;i<e.results.length;i++){ const txt=e.results[i][0].transcript; if(e.results[i].isFinal) final+=txt+' '; else interim+=txt; } ta.value=(final+interim).trim(); };
    rec.onerror=()=>{ status.textContent='Voice error.'; };
    try{ rec.start(); status.textContent='Listening…'; }catch{ status.textContent='Could not start.'; }
  };
  const stop=()=>{ try{ rec && rec.stop(); }catch{} rec=null; status.textContent='Stopped.'; };
  document.getElementById('vStart').onclick=start;
  document.getElementById('vStop').onclick=stop;
  document.getElementById('vClose').onclick=()=>{ stop(); modal.classList.remove('open'); };
  document.getElementById('vApply').onclick=()=>{
    const text=ta.value.trim(); if(!text){ toast('Say something first'); return; }
    const res=routeCapture(state,text,'voice');
    applyRouted(state,res,{from:'Voice',text,source:'voice'});
    saveState(state); toast('Sorted ✓'); stop(); modal.classList.remove('open'); render();
  };
}

function dayModal(state, day, render){
  const m=document.getElementById('dayModal'); const title=document.getElementById('dayTitle'); const list=document.getElementById('dayList'); const clashes=document.getElementById('dayClashes');
  title.textContent=day.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  list.innerHTML=''; clashes.innerHTML='';
  const evs=eventsForDay(state,day);
  if(!evs.length){
    list.appendChild(el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'No events'}),el('p',{text:'Enjoy the calm.'})])]));
  }else{
    evs.forEach(ev=>{
      list.appendChild(el('div',{class:'item'},[
        el('div',{class:'grow'},[
          el('h3',{text: ev.title}),
          el('p',{text: `${hm(ev.start)}${ev.end?'–'+hm(ev.end):''}${ev.where?' · '+ev.where:''}`}),
          el('div',{class:'smallmuted',text: memberLabel(state, ev.who)||'Unassigned'})
        ]),
        el('button',{class:'pill small', html: icons.x(18), onClick:()=>{ removeById(state.events, ev.id); saveState(state); toast('Deleted'); m.classList.remove('open'); render(); }})
      ]));
    });
  }
  // clashes
  const c=[];
  state.family.forEach(mem=>{ const cl=detectClashes(state,day,mem.id); if(cl.length) c.push(mem.name+': '+cl.length); });
  if(c.length) clashes.textContent='Clashes: '+c.join(' · ');
  m.classList.add('open');
  document.getElementById('dayClose').onclick=()=>m.classList.remove('open');
}

function openAddEvent(state, render){
  const m=document.getElementById('addModal');
  const t=document.getElementById('aeTitle');
  const d=document.getElementById('aeDate');
  const s=document.getElementById('aeStart');
  const e=document.getElementById('aeEnd');
  const w=document.getElementById('aeWhere');
  const who=document.getElementById('aeWho');
  who.innerHTML='';
  state.family.forEach(mem=>{ const o=document.createElement('option'); o.value=mem.id; o.textContent=mem.name; who.appendChild(o); });
  const now=new Date();
  d.value=ymd(now); s.value='14:00'; e.value='15:00'; t.value=''; w.value='';
  m.classList.add('open');
  document.getElementById('aeClose').onclick=()=>m.classList.remove('open');
  document.getElementById('aeSave').onclick=()=>{
    const start=new Date(d.value+'T'+(s.value||'00:00')+':00');
    const end=new Date(d.value+'T'+(e.value||s.value||'00:00')+':00');
    state.events.unshift({id:uid('ev'),title:t.value.trim()||'Event',start:start.toISOString(),end:end.toISOString(),where:w.value.trim(),who:Array.from(who.selectedOptions).map(o=>o.value),createdAt:nowIso(),source:'manual'});
    saveState(state); toast('Added'); m.classList.remove('open'); render();
  };
}

function renderCalendar(state, render){
  state.ui=state.ui||{}; const ui=state.ui;
  ui.mode=ui.mode||'2w'; ui.anchor=ui.anchor||new Date().toISOString();
  const anchor=new Date(ui.anchor);

  const shell=el('div',{class:'shell'},[
    header(),
    el('div',{class:'section'},[
      el('h2',{text:'Calendar overview'}),
      el('div',{class:'card'},[
        el('div',{class:'calHeader'},[
          el('div',{},[
            el('button',{class:'pill small',html:icons.chevronLeft(18),onClick:()=>{ ui.anchor=addDays(anchor, ui.mode==='month'?-30:-14).toISOString(); saveState(state); render(); }}),
            el('button',{class:'pill small',html:icons.chevronRight(18),onClick:()=>{ ui.anchor=addDays(anchor, ui.mode==='month'?30:14).toISOString(); saveState(state); render(); }})
          ]),
          el('div',{class:'seg'},[
            el('button',{class:ui.mode==='2w'?'active':'',text:'2 weeks',onClick:()=>{ ui.mode='2w'; saveState(state); render(); }}),
            el('button',{class:ui.mode==='month'?'active':'',text:'Month',onClick:()=>{ ui.mode='month'; saveState(state); render(); }})
          ]),
          el('button',{class:'pill small',html:icons.plus(18)+'<span>Add</span>',onClick:()=>openAddEvent(state,render)})
        ]),
        el('div',{class:'calGrid'}, DAYS.map(d=>el('div',{class:'dayHead',text:d}))),
        el('div',{id:'calBody',class:'calGrid',style:'grid-template-columns:repeat(7,1fr);'})
      ])
    ]),
    el('div',{class:'section'},[
      el('h2',{text:'Next 2 weeks (details)'}),
      upcomingDetails(state,14)
    ])
  ]);

  setTimeout(()=>{
    const body=shell.querySelector('#calBody'); body.innerHTML='';
    const mkCell=(day,inMonth=true)=>{
      const evs=eventsForDay(state,day);
      const dots=[];
      for(let i=0;i<Math.min(4,evs.length);i++){
        const ev=evs[i];
        const cls=(ev.who||[]).length>1?'warn':(ev.where?'alt':'');
        dots.push(el('span',{class:'dot '+cls}));
      }
      const btn=el('button',{class:'dayCell',onClick:()=>dayModal(state,day,render)},[
        el('div',{class:'d'},[el('span',{text:String(day.getDate())}), el('span',{text: evs.length?String(evs.length):''})]),
        el('div',{class:'dotRow'},dots)
      ]);
      if(!inMonth) btn.style.opacity='0.55';
      return btn;
    };
    if(ui.mode==='month'){
      const mm=monthMatrix(anchor);
      mm.weeks.forEach(week=>week.forEach(day=> body.appendChild(mkCell(day, day.getMonth()===mm.month))));
    }else{
      twoWeekMatrix(anchor).forEach(week=>week.forEach(day=> body.appendChild(mkCell(day,true))));
    }
  },0);

  return shell;
}

function upcomingDetails(state,days){
  const start=startOfDay(new Date());
  const blocks=[];
  for(let i=0;i<days;i++){
    const day=addDays(start,i);
    const evs=eventsForDay(state,day);
    if(!evs.length) continue;
    blocks.push(el('div',{class:'item'},[
      el('div',{class:'grow'},[
        el('h3',{text: day.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}),
        el('p',{text: evs.map(ev=>formatEventLine(state,ev)).join('\n')})
      ])
    ]));
  }
  return el('div',{class:'card list'}, blocks.length?blocks:[
    el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'No events coming up'}),el('p',{text:'Just tell Rosie when school sends dates.'})])])
  ]);
}

function renderInbox(state, render){
  const items=(state.inbox||[]).slice(0,50);
  return el('div',{class:'shell'},[
    header(),
    el('div',{class:'section'},[
      el('h2',{text:'Inbox'}),
      el('div',{class:'card list'}, items.length?items.map(it=>{
        const t=new Date(it.ts);
        return el('div',{class:'item'},[
          el('div',{class:'grow'},[
            el('h3',{text: (it.from||'Unknown')+' · '+t.toLocaleString()}),
            el('p',{text: it.text})
          ])
        ]);
      }):[
        el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'Inbox is empty'}),el('p',{text:'If you connect WhatsApp Bridge, messages appear here.'})])])
      ])
    ])
  ]);
}

function renderSettings(state, render){
  const s=state.settings;
  const u=el('input',{value:s.bridgeUrl||'',placeholder:'https://<bridge-domain>'});
  const tok=el('input',{value:s.bridgeToken||'',placeholder:'token'});
  const gid=el('input',{value:s.householdGroupId||'',placeholder:'(optional) group id'});
  return el('div',{class:'shell'},[
    header(),
    el('div',{class:'section'},[
      el('h2',{text:'Settings'}),
      el('div',{class:'card list'},[
        el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'WhatsApp Bridge (optional)'}),el('p',{text:'Suhayl sets once. Nasima does nothing.'})])]),
        el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'Bridge URL'}),u])]),
        el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'Bridge Token'}),tok])]),
        el('div',{class:'item'},[el('div',{class:'grow'},[el('h3',{text:'Household Group ID'}),gid])]),
        el('div',{class:'item'},[
          el('button',{class:'pill primary',html:icons.check(18)+'<span>Save</span>',onClick:()=>{
            s.bridgeUrl=u.value.trim(); s.bridgeToken=tok.value.trim(); s.householdGroupId=gid.value.trim();
            saveState(state); toast('Saved');
          }})
        ])
      ])
    ])
  ]);
}

function renderHome(state, render){
  return el('div',{class:'shell'},[header(), hero(), quick(state,render), kpis(state)]);
}

function ensureOverlays(state, render){
  if(!document.getElementById('toast')) document.body.appendChild(el('div',{id:'toast',class:'toast'}));

  if(!document.getElementById('voiceModal')){
    document.body.appendChild(el('div',{id:'voiceModal',class:'modal',html:`
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <strong>${icons.mic(18)} Voice</strong>
          <button id="vClose" class="pill small">${icons.x(18)}</button>
        </div>
        <div id="voiceStatus" class="smallmuted" style="margin-top:8px">Ready.</div>
        <hr class="sep"/>
        <textarea id="voiceText" style="width:100%;min-height:120px;border-radius:18px;border:1px solid rgba(17,24,39,.12);padding:12px;outline:none"></textarea>
        <div style="display:flex;gap:10px;margin-top:10px;justify-content:flex-end">
          <button id="vStart" class="pill">${icons.mic(18)} Start</button>
          <button id="vStop" class="pill small">${icons.x(18)} Stop</button>
          <button id="vApply" class="pill primary">${icons.check(18)} Sort it</button>
        </div>
        <div class="smallmuted" style="margin-top:8px">Tip: “Zaara swimming 2pm at school, bring goggles”.</div>
      </div>
    `}));
  }

  if(!document.getElementById('dayModal')){
    document.body.appendChild(el('div',{id:'dayModal',class:'modal',html:`
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <h3 id="dayTitle" style="margin:0 0 6px"></h3>
            <div id="dayClashes" class="smallmuted"></div>
          </div>
          <button id="dayClose" class="pill small">${icons.x(18)}</button>
        </div>
        <hr class="sep"/>
        <div id="dayList"></div>
      </div>
    `}));
  }

  if(!document.getElementById('addModal')){
    document.body.appendChild(el('div',{id:'addModal',class:'modal',html:`
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <strong>Add event</strong>
          <button id="aeClose" class="pill small">${icons.x(18)}</button>
        </div>
        <hr class="sep"/>
        <div class="smallmuted">Title</div>
        <input id="aeTitle" class="pill" style="width:100%" placeholder="Swimming"/>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          <div><div class="smallmuted">Date</div><input id="aeDate" type="date" class="pill" style="width:100%"></div>
          <div><div class="smallmuted">Where</div><input id="aeWhere" class="pill" style="width:100%" placeholder="School"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          <div><div class="smallmuted">Start</div><input id="aeStart" type="time" class="pill" style="width:100%"></div>
          <div><div class="smallmuted">End</div><input id="aeEnd" type="time" class="pill" style="width:100%"></div>
        </div>
        <div style="margin-top:10px">
          <div class="smallmuted">Who (multi-select)</div>
          <select id="aeWho" class="pill" style="width:100%;height:120px" multiple></select>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px">
          <button id="aeSave" class="pill primary">${icons.check(18)} Save</button>
        </div>
      </div>
    `}));
  }

  if(!document.getElementById('fab')){
    const fab=el('button',{id:'fab',class:'fab',html:icons.mic(22),onClick:()=>openVoice(state,render)});
    document.body.appendChild(fab);
  }
}

function renderApp(state, root){
  const hash=location.hash||'#/home';
  const render=()=>renderApp(state,root);
  let page;
  if(hash.startsWith('#/calendar')) page=renderCalendar(state,render);
  else if(hash.startsWith('#/inbox')) page=renderInbox(state,render);
  else if(hash.startsWith('#/settings')) page=renderSettings(state,render);
  else page=renderHome(state,render);

  root.innerHTML=''; root.appendChild(page);
  document.body.appendChild(nav());
  ensureOverlays(state,render);
}

export function startApp(root){
  const state=loadState();
  if((state.events||[]).length===0 && (state.inbox||[]).length===0){
    const sample='Zaara swimming 2pm at school, bring goggles';
    const res=routeCapture(state,sample,'sample');
    applyRouted(state,res,{from:'Zaara (sample)',text:sample,source:'sample'});
    saveState(state);
  }
  const go=()=>renderApp(state,root);
  window.addEventListener('hashchange',go);
  if(!location.hash) location.hash='#/home';
  go();
}
