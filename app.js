import { icons } from './icons.js';
import { store } from './lib/store.js';
import { formatTime, formatDay, nowISO, parseInstruction, makeUid } from './lib/utils.js';
import { voice } from './lib/voice.js';
import { brain } from './lib/brain.js';

export function createApp(root) {
  root.classList.add('safe-area');
  root.innerHTML = renderShell();

  const state = store.load();
  const el = {
    main: root.querySelector('[data-main]'),
    toast: root.querySelector('[data-toast]'),
    sheet: root.querySelector('[data-sheet]'),
    sheetTitle: root.querySelector('[data-sheet-title]'),
    sheetBody: root.querySelector('[data-sheet-body]'),
    onlineDot: root.querySelector('[data-online-dot]'),
    nav: Array.from(root.querySelectorAll('[data-nav]')),
    fab: root.querySelector('[data-fab]'),
  };

  // install prompt (Android)
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    state.ui.installReady = true;
    store.save(state);
    rerender();
  });

  // Basic online indicator
  function setOnline() {
    const online = navigator.onLine;
    el.onlineDot.style.background = online ? 'var(--accent2)' : 'var(--danger)';
    el.onlineDot.title = online ? 'Online' : 'Offline';
  }
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  setOnline();

  // Router
  function currentRoute() {
    const h = location.hash || '#/home';
    return h.replace('#', '');
  }
  window.addEventListener('hashchange', rerender);

  // Nav
  el.nav.forEach(btn => {
    btn.addEventListener('click', () => {
      location.hash = btn.getAttribute('data-nav');
    });
  });

  // FAB voice
  el.fab.addEventListener('click', openVoiceSheet);

  // Initial load + periodic sync (WhatsApp Bridge)
  (async () => {
    await brain.syncIfConfigured(state, { onToast });
    setInterval(async () => {
      await brain.syncIfConfigured(state, { onToast, quiet: true });
    }, 20_000);
  })();

  function onToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(onToast._t);
    onToast._t = setTimeout(() => el.toast.classList.remove('show'), 2500);
  }

  function setActiveNav(route) {
    el.nav.forEach(b => b.classList.toggle('active', b.getAttribute('data-nav') === route));
  }

  function rerender() {
    const route = currentRoute();
    setActiveNav(route);
    const view = route.split('/')[1] || 'home';
    el.main.innerHTML = renderView(view, state);

    wireView(view);
  }

  function wireView(view) {
    // Common wires
    const installBtn = el.main.querySelector('[data-action="install"]');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        try { await deferredInstallPrompt.userChoice; } catch {}
        deferredInstallPrompt = null;
        state.ui.installReady = false;
        store.save(state);
        onToast('Rosie added to Home Screen ✨');
        rerender();
      });
    }

    if (view === 'home') {
      const quick = el.main.querySelectorAll('[data-quick]');
      quick.forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-quick');
          if (type === 'inbox') location.hash = '#/inbox';
          if (type === 'calendar') location.hash = '#/calendar';
          if (type === 'tasks') location.hash = '#/tasks';
          if (type === 'groceries') location.hash = '#/groceries';
        });
      });
    }

    if (view === 'inbox') {
      el.main.querySelectorAll('[data-open-msg]').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-open-msg');
          openMessageSheet(id);
        });
      });

      const importAudio = el.main.querySelector('[data-action="import-audio"]');
      if (importAudio) {
        importAudio.addEventListener('click', async () => {
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'audio/*';
          inp.onchange = async () => {
            const file = inp.files?.[0];
            if (!file) return;
            const id = makeUid('aud_');
            const b64 = await fileToBase64(file);
            state.inbox.unshift({
              id,
              type: 'audio',
              from: 'Imported audio',
              receivedAt: nowISO(),
              text: '(voice note)',
              audio: { name: file.name, mime: file.type || 'audio/*', dataUrl: b64 },
              parsed: null,
              status: 'new',
            });
            store.save(state);
            onToast('Voice note saved. Rosie will transcribe when Brain is connected.');
            rerender();

            // Try cloud transcription if configured
            await brain.tryTranscribeAudio(state, id, { onToast });
            rerender();
          };
          inp.click();
        });
      }
    }

    if (view === 'calendar') {
      const add = el.main.querySelector('[data-action="add-event"]');
      if (add) add.addEventListener('click', () => openEventSheet());
    }

    if (view === 'tasks') {
      const add = el.main.querySelector('[data-action="add-task"]');
      if (add) add.addEventListener('click', () => openTaskSheet());
      el.main.querySelectorAll('[data-done-task]').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-done-task');
          const t = state.tasks.find(x => x.id === id);
          if (!t) return;
          t.status = t.status === 'done' ? 'open' : 'done';
          store.save(state);
          rerender();
        });
      });
      el.main.querySelectorAll('[data-send-task]').forEach(b => {
        b.addEventListener('click', async () => {
          const id = b.getAttribute('data-send-task');
          await brain.sendTaskNudge(state, id, { onToast });
        });
      });
    }

    if (view === 'groceries') {
      const add = el.main.querySelector('[data-action="add-grocery"]');
      if (add) add.addEventListener('click', () => openGrocerySheet());
      el.main.querySelectorAll('[data-toggle-grocery]').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-toggle-grocery');
          const it = state.groceries.items.find(x => x.id === id);
          if (!it) return;
          it.done = !it.done;
          store.save(state);
          rerender();
        });
      });
    }

    if (view === 'settings') {
      // Save WhatsApp Bridge settings
      const save = el.main.querySelector('[data-action="save-settings"]');
      if (save) {
        save.addEventListener('click', () => {
          const url = el.main.querySelector('[name="bridgeUrl"]').value.trim();
          const token = el.main.querySelector('[name="bridgeToken"]').value.trim();
          const me = el.main.querySelector('[name="me"]').value;
          state.integrations.whatsapp = state.integrations.whatsapp || {};
          state.integrations.whatsapp.bridgeUrl = url;
          state.integrations.whatsapp.bridgeToken = token;
          state.profile.currentUserId = me;
          store.save(state);
          onToast('Saved ✨');
        });
      }

      // Export/Import
      const exp = el.main.querySelector('[data-action="export"]');
      if (exp) exp.addEventListener('click', async () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rosie-backup.json';
        a.click();
        URL.revokeObjectURL(url);
      });

      const imp = el.main.querySelector('[data-action="import"]');
      if (imp) imp.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'application/json';
        inp.onchange = async () => {
          const file = inp.files?.[0];
          if (!file) return;
          const text = await file.text();
          try {
            const data = JSON.parse(text);
            store.save(data);
            onToast('Imported ✅');
            location.reload();
          } catch {
            onToast('Import failed');
          }
        };
        inp.click();
      });

      const reset = el.main.querySelector('[data-action="reset"]');
      if (reset) reset.addEventListener('click', () => {
        if (!confirm('Reset Rosie data on this phone?')) return;
        store.reset();
        location.reload();
      });
    }
  }

  async function openVoiceSheet() {
    openSheet(
      'Tell Rosie',
      `
      <p>Speak naturally. Rosie will auto-file your message into calendar, chores, groceries, or reminders.</p>
      <div class="kv">
        <div class="card item">
          <div class="avatar">${icons.rosie}</div>
          <div class="meta">
            <div class="row"><div class="name">Listening</div><span class="badge ok" data-vstate>Ready</span></div>
            <div class="sub" data-vtext>Tap “Start” and just talk.</div>
            <div class="row-actions">
              <button class="btn primary" data-action="vstart">${icons.mic} Start</button>
              <button class="btn" data-action="vstop">Stop</button>
            </div>
          </div>
        </div>

        <textarea class="input" rows="4" placeholder="Or type here..." data-vmanual></textarea>
        <div class="row-actions">
          <button class="btn primary" data-action="vfile">${icons.send} File it</button>
          <button class="btn" data-action="close">Close</button>
        </div>
        <div class="small">Tip: On Android, Rosie can be installed to Home Screen for faster access.</div>
      </div>
    `
    );

    const vstate = el.sheetBody.querySelector('[data-vstate]');
    const vtext = el.sheetBody.querySelector('[data-vtext]');
    const manual = el.sheetBody.querySelector('[data-vmanual]');
    const start = el.sheetBody.querySelector('[data-action="vstart"]');
    const stop = el.sheetBody.querySelector('[data-action="vstop"]');
    const file = el.sheetBody.querySelector('[data-action="vfile"]');
    const close = el.sheetBody.querySelector('[data-action="close"]');

    const me = state.profile.currentUserId;
    const meName = (state.family.find(f => f.id === me)?.name) || 'Someone';

    let lastTranscript = '';

    start.addEventListener('click', async () => {
      vstate.textContent = 'Listening…';
      vstate.className = 'badge ok';
      vtext.textContent = '…';
      lastTranscript = '';
      try {
        await voice.start({
          onPartial: (t) => { vtext.textContent = t || '…'; },
          onFinal: (t) => { lastTranscript = t; vtext.textContent = t || '…'; },
          onError: () => { vstate.textContent = 'Mic blocked'; vstate.className='badge warn'; }
        });
      } catch {
        vstate.textContent = 'Mic blocked';
        vstate.className='badge warn';
      }
    });

    stop.addEventListener('click', () => {
      voice.stop();
      vstate.textContent = 'Stopped';
      vstate.className = 'badge';
    });

    file.addEventListener('click', async () => {
      const text = (manual.value || lastTranscript || '').trim();
      if (!text) { onToast('Say something first'); return; }
      const msgId = makeUid('msg_');
      const inboxItem = {
        id: msgId,
        type: 'note',
        from: meName,
        receivedAt: nowISO(),
        text,
        parsed: null,
        status: 'new',
      };
      state.inbox.unshift(inboxItem);

      // Auto parse & file locally
      const parsed = parseInstruction(text, { family: state.family, now: new Date() });
      inboxItem.parsed = parsed;
      inboxItem.status = 'filed';
      applyParsed(state, parsed, inboxItem);

      store.save(state);
      onToast('Filed ✅');
      closeSheet();
      rerender();

      // Optional: push out to WhatsApp if configured (notify other parent / staff)
      await brain.postFileReceipt(state, inboxItem, { onToast, quiet: true });
    });

    close.addEventListener('click', () => closeSheet());
  }

  function applyParsed(state, parsed, inboxItem) {
    if (!parsed || parsed.kind === 'unknown') return;

    if (parsed.kind === 'grocery') {
      for (const item of parsed.items) {
        state.groceries.items.unshift({ id: makeUid('g_'), text: item, done: false, createdAt: nowISO(), source: inboxItem?.id || null });
      }
    }

    if (parsed.kind === 'task') {
      state.tasks.unshift({
        id: makeUid('t_'),
        title: parsed.title,
        assigneeIds: parsed.assigneeIds,
        dueAt: parsed.dueAt || null,
        createdAt: nowISO(),
        status: 'open',
        source: inboxItem?.id || null,
        notes: parsed.notes || '',
      });
    }

    if (parsed.kind === 'event') {
      state.calendar.events.unshift({
        id: makeUid('e_'),
        title: parsed.title,
        startAt: parsed.startAt,
        endAt: parsed.endAt || null,
        whoIds: parsed.whoIds,
        createdAt: nowISO(),
        source: inboxItem?.id || null,
        notes: parsed.notes || '',
      });

      // If there is an attached reminder/task e.g. "bring goggles"
      if (parsed.attachedTask) {
        state.tasks.unshift({
          id: makeUid('t_'),
          title: parsed.attachedTask.title,
          assigneeIds: parsed.attachedTask.assigneeIds,
          dueAt: parsed.attachedTask.dueAt || parsed.startAt,
          createdAt: nowISO(),
          status: 'open',
          source: inboxItem?.id || null,
          notes: parsed.attachedTask.notes || '',
        });
      }
    }

    if (parsed.kind === 'status') {
      const m = state.family.find(x => x.id === parsed.whoId);
      if (m) {
        m.status = parsed.status;
        m.statusNote = parsed.note || '';
        m.statusUpdatedAt = nowISO();
      }
    }
  }

  function openMessageSheet(id) {
    const m = state.inbox.find(x => x.id === id);
    if (!m) return;
    const parsed = m.parsed;
    openSheet(
      'Message',
      `
      <p><strong>${escapeHtml(m.from)}</strong> • ${escapeHtml(formatDay(m.receivedAt))} ${escapeHtml(formatTime(m.receivedAt))}</p>
      <div class="card item">
        <div class="avatar">${icons.inbox}</div>
        <div class="meta">
          <div class="row"><div class="name">${escapeHtml(m.text)}</div></div>
          <div class="sub">${parsed ? renderParsedSummary(parsed, state) : '<span class="small">Not filed yet.</span>'}</div>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn primary" data-action="refile">Re-file</button>
        <button class="btn" data-action="close">Close</button>
      </div>
    `
    );

    el.sheetBody.querySelector('[data-action="close"]').addEventListener('click', closeSheet);
    el.sheetBody.querySelector('[data-action="refile"]').addEventListener('click', async () => {
      const parsed = parseInstruction(m.text, { family: state.family, now: new Date() });
      m.parsed = parsed;
      m.status = 'filed';
      applyParsed(state, parsed, m);
      store.save(state);
      onToast('Filed ✅');
      closeSheet();
      rerender();
      await brain.postFileReceipt(state, m, { onToast, quiet: true });
    });
  }

  function openEventSheet() {
    openSheet('Add event', `
      <p>Quick add. Rosie will also warn about clashes.</p>
      <div class="kv">
        <input class="input" name="title" placeholder="Title (e.g. Swimming)" />
        <input class="input" name="when" placeholder="When (e.g. tomorrow 2pm)" />
        <select class="input" name="who"></select>
        <div class="row-actions">
          <button class="btn primary" data-action="save">Save</button>
          <button class="btn" data-action="close">Close</button>
        </div>
      </div>
    `);

    const whoSel = el.sheetBody.querySelector('[name="who"]');
    whoSel.innerHTML = state.family.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    el.sheetBody.querySelector('[data-action="close"]').addEventListener('click', closeSheet);
    el.sheetBody.querySelector('[data-action="save"]').addEventListener('click', () => {
      const title = el.sheetBody.querySelector('[name="title"]').value.trim();
      const when = el.sheetBody.querySelector('[name="when"]').value.trim();
      const who = el.sheetBody.querySelector('[name="who"]').value;
      if (!title || !when) return onToast('Title + time please');
      const parsed = parseInstruction(`${state.family.find(x=>x.id===who)?.name||'Someone'} ${title} at ${when}`, { family: state.family, now: new Date() });
      if (parsed.kind !== 'event') return onToast('Could not understand time');
      const inboxStub = { id: makeUid('msg_'), text: `[manual] ${title}`, from: 'Manual', receivedAt: nowISO() };
      state.inbox.unshift(inboxStub);
      inboxStub.parsed = parsed;
      inboxStub.status = 'filed';
      applyParsed(state, parsed, inboxStub);
      store.save(state);
      onToast('Saved ✅');
      closeSheet();
      rerender();
    });
  }

  function openTaskSheet() {
    openSheet('Add task', `
      <p>Assign to Lisa/Jabu or anyone.</p>
      <div class="kv">
        <input class="input" name="title" placeholder="Task (e.g. Water plants)" />
        <select class="input" name="assignee"></select>
        <input class="input" name="due" placeholder="Due (optional, e.g. tomorrow 9am)" />
        <div class="row-actions">
          <button class="btn primary" data-action="save">Save</button>
          <button class="btn" data-action="close">Close</button>
        </div>
      </div>
    `);
    const assignee = el.sheetBody.querySelector('[name="assignee"]');
    assignee.innerHTML = state.family.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');

    el.sheetBody.querySelector('[data-action="close"]').addEventListener('click', closeSheet);
    el.sheetBody.querySelector('[data-action="save"]').addEventListener('click', () => {
      const title = el.sheetBody.querySelector('[name="title"]').value.trim();
      const who = assignee.value;
      const due = el.sheetBody.querySelector('[name="due"]').value.trim();
      if (!title) return onToast('Task title please');
      const parsed = parseInstruction(`Tell ${state.family.find(x=>x.id===who)?.name||'someone'} to ${title}${due?` ${due}`:''}`, { family: state.family, now: new Date() });
      const inboxStub = { id: makeUid('msg_'), text: `[manual task] ${title}`, from: 'Manual', receivedAt: nowISO(), status:'new' };
      state.inbox.unshift(inboxStub);
      inboxStub.parsed = parsed.kind==='task' ? parsed : { kind:'task', title, assigneeIds:[who], dueAt: null, notes:'' };
      inboxStub.status='filed';
      applyParsed(state, inboxStub.parsed, inboxStub);
      store.save(state);
      onToast('Saved ✅');
      closeSheet();
      rerender();
    });
  }

  function openGrocerySheet() {
    openSheet('Add groceries', `
      <p>Comma-separated works best (Rosie splits it).</p>
      <div class="kv">
        <input class="input" name="items" placeholder="e.g. milk, eggs, fruit" />
        <div class="row-actions">
          <button class="btn primary" data-action="save">Add</button>
          <button class="btn" data-action="close">Close</button>
        </div>
      </div>
    `);
    el.sheetBody.querySelector('[data-action="close"]').addEventListener('click', closeSheet);
    el.sheetBody.querySelector('[data-action="save"]').addEventListener('click', () => {
      const items = el.sheetBody.querySelector('[name="items"]').value.trim();
      if (!items) return onToast('Type some items');
      const parsed = parseInstruction(`Grocery ${items}`, { family: state.family, now: new Date() });
      const inboxStub = { id: makeUid('msg_'), text: `[manual grocery] ${items}`, from: 'Manual', receivedAt: nowISO(), status:'new' };
      state.inbox.unshift(inboxStub);
      inboxStub.parsed = parsed;
      inboxStub.status='filed';
      applyParsed(state, parsed, inboxStub);
      store.save(state);
      onToast('Added ✅');
      closeSheet();
      rerender();
    });
  }

  function openSheet(title, html) {
    el.sheetTitle.textContent = title;
    el.sheetBody.innerHTML = html;
    el.sheet.classList.add('open');
    el.sheet.addEventListener('click', onSheetBackdrop);
  }
  function onSheetBackdrop(e) {
    if (e.target === el.sheet) closeSheet();
  }
  function closeSheet() {
    el.sheet.classList.remove('open');
    el.sheet.removeEventListener('click', onSheetBackdrop);
  }

  // Initial render
  rerender();
}

function renderShell() {
  return `
    <div class="topbar">
      <div class="topbar-row">
        <div class="brand">
          <div class="logo">${icons.rosie}</div>
          <div class="title">
            <strong>Rosie</strong>
            <span>Family Assistant • keeps life smooth</span>
          </div>
        </div>
        <div class="pill" aria-label="Connectivity">
          <span class="pill-dot" data-online-dot></span>
          <span>Live</span>
        </div>
      </div>
    </div>

    <main class="main" data-main></main>

    <button class="fab" data-fab aria-label="Tell Rosie">
      ${icons.mic}
    </button>

    <nav class="bottom-nav" aria-label="Primary">
      <div class="wrap">
        <button class="navbtn" data-nav="#/home" aria-label="Home">${icons.home}<div class="small">Home</div></button>
        <button class="navbtn" data-nav="#/inbox" aria-label="Inbox">${icons.inbox}<div class="small">Inbox</div></button>
        <button class="navbtn" data-nav="#/calendar" aria-label="Calendar">${icons.cal}<div class="small">Calendar</div></button>
        <button class="navbtn" data-nav="#/tasks" aria-label="Tasks">${icons.list}<div class="small">Chores</div></button>
        <button class="navbtn" data-nav="#/groceries" aria-label="Groceries">${icons.bag}<div class="small">Groceries</div></button>
        <button class="navbtn" data-nav="#/settings" aria-label="Settings">${icons.settings}<div class="small">Settings</div></button>
      </div>
    </nav>

    <div class="sheet" data-sheet role="dialog" aria-modal="true">
      <div class="panel">
        <h3 data-sheet-title></h3>
        <div data-sheet-body></div>
      </div>
    </div>

    <div class="toast" data-toast role="status" aria-live="polite"></div>
  `;
}

function renderView(view, state) {
  switch(view) {
    case 'home': return renderHome(state);
    case 'inbox': return renderInbox(state);
    case 'calendar': return renderCalendar(state);
    case 'tasks': return renderTasks(state);
    case 'groceries': return renderGroceries(state);
    case 'settings': return renderSettings(state);
    default: return renderHome(state);
  }
}

function renderHome(state) {
  const urgent = computeUrgent(state);
  const next = computeNextEvents(state);
  const todayTasks = state.tasks.filter(t => t.status !== 'done').slice(0, 3);
  const groceriesLeft = state.groceries.items.filter(i => !i.done).length;

  const installCard = state.ui.installReady ? `
    <div class="install">
      <strong>Install Rosie on Android</strong>
      <div class="small">One tap adds Rosie to your Home Screen for faster access and voice notes.</div>
      <div class="row-actions">
        <button class="btn primary" data-action="install">Add to Home Screen</button>
      </div>
    </div>
  ` : '';

  return `
    <section class="card hero">
      <div class="rosie">${icons.rosie}</div>
      <div>
        <h1>Hi Nasima 💗 I’ve got you.</h1>
        <p>${urgent.summary}</p>
        ${installCard}
        <div class="row-actions">
          <button class="btn primary" data-quick="inbox">Open Inbox</button>
          <button class="btn" data-quick="calendar">Next 7 days</button>
          <button class="btn" data-quick="tasks">Chores</button>
          <button class="btn" data-quick="groceries">Groceries (${groceriesLeft})</button>
        </div>
      </div>
    </section>

    <div class="section">
      <h2>Next up</h2>
      <div class="list">
        ${next.length ? next.map(e => renderEventRow(e, state)).join('') : emptyRow('Nothing urgent. Breathe.')}
      </div>
    </div>

    <div class="section">
      <h2>Today’s chores</h2>
      <div class="list">
        ${todayTasks.length ? todayTasks.map(t => renderTaskRow(t, state, { compact:true })).join('') : emptyRow('No urgent chores right now.')}
      </div>
    </div>
  `;
}

function renderInbox(state) {
  const items = state.inbox.slice(0, 40);
  return `
    <div class="section">
      <h2>Inbox (WhatsApp + voice notes)</h2>
      <div class="card item">
        <div class="avatar">${icons.inbox}</div>
        <div class="meta">
          <div class="row"><div class="name">Zero effort inbox</div><span class="badge">Auto-filed</span></div>
          <div class="sub">Zaara can message Rosie “Swimming 2pm, forgot goggles”. Rosie will: add the event, create a task, and remind both parents.</div>
          <div class="row-actions">
            <button class="btn" data-action="import-audio">Import voice note</button>
          </div>
        </div>
      </div>

      <div class="list" style="margin-top:10px">
        ${items.length ? items.map(m => renderInboxRow(m)).join('') : emptyRow('No messages yet.')}
      </div>
    </div>
  `;
}

function renderCalendar(state) {
  const events = state.calendar.events
    .slice()
    .sort((a,b) => (a.startAt||'').localeCompare(b.startAt||''))
    .slice(0, 30);

  const clashes = computeClashes(events);

  return `
    <div class="section">
      <h2>Calendar</h2>
      ${clashes.length ? `
        <div class="card item">
          <div class="avatar">⚠️</div>
          <div class="meta">
            <div class="row"><div class="name">Possible clashes</div><span class="badge warn">${clashes.length}</span></div>
            <div class="sub">${clashes.map(c => escapeHtml(c)).join('<br/>')}</div>
          </div>
        </div>` : ''}

      <div class="row-actions">
        <button class="btn primary" data-action="add-event">Add event</button>
      </div>

      <div class="list" style="margin-top:10px">
        ${events.length ? events.map(e => renderEventRow(e, state)).join('') : emptyRow('No events yet.')}
      </div>
    </div>
  `;
}

function renderTasks(state) {
  const open = state.tasks.filter(t => t.status !== 'done');
  const done = state.tasks.filter(t => t.status === 'done').slice(0, 10);
  return `
    <div class="section">
      <h2>Chores / To-do</h2>
      <div class="row-actions">
        <button class="btn primary" data-action="add-task">Add task</button>
      </div>
      <div class="list" style="margin-top:10px">
        ${open.length ? open.map(t => renderTaskRow(t, state)).join('') : emptyRow('No open tasks.')}
      </div>
      <h2>Done</h2>
      <div class="list">
        ${done.length ? done.map(t => renderTaskRow(t, state)).join('') : emptyRow('Nothing completed yet.')}
      </div>
    </div>
  `;
}

function renderGroceries(state) {
  const items = state.groceries.items;
  const left = items.filter(i => !i.done);
  const done = items.filter(i => i.done);
  return `
    <div class="section">
      <h2>Groceries</h2>
      <div class="row-actions">
        <button class="btn primary" data-action="add-grocery">Add</button>
        <button class="btn" data-action="copy" onclick="navigator.clipboard?.writeText('${escapeAttr(left.map(i=>i.text).join(', '))}')">Copy list</button>
      </div>
      <div class="list" style="margin-top:10px">
        ${left.length ? left.map(i => renderGroceryRow(i)).join('') : emptyRow('Nothing to buy right now.')}
      </div>
      <h2>Bought</h2>
      <div class="list">
        ${done.length ? done.map(i => renderGroceryRow(i)).join('') : emptyRow('No items bought yet.')}
      </div>
    </div>
  `;
}

function renderSettings(state) {
  const w = state.integrations.whatsapp || {};
  const me = state.profile.currentUserId;

  return `
    <div class="section">
      <h2>Profile</h2>
      <div class="card item">
        <div class="avatar">👤</div>
        <div class="meta">
          <div class="row"><div class="name">This phone is</div></div>
          <div class="sub">
            <select class="input" name="me">
              ${state.family.map(m => `<option value="${m.id}" ${m.id===me?'selected':''}>${escapeHtml(m.name)} (${m.role})</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <h2>WhatsApp Bridge (Dad setup once)</h2>
      <div class="card item">
        <div class="avatar">💬</div>
        <div class="meta">
          <div class="row"><div class="name">Connect Rosie to WhatsApp</div><span class="badge">${w.bridgeUrl ? 'Connected' : 'Not connected'}</span></div>
          <div class="sub">This keeps Mum’s steps near zero: family can message Rosie on WhatsApp and Rosie auto-files + reminds both parents.</div>
          <div class="chips">
            <span class="chip primary">Inbound: Zaara → Rosie → Dashboard</span>
            <span class="chip">Outbound: Rosie → Nasima/Suhayl reminders</span>
          </div>
          <div class="hr"></div>
          <input class="input" name="bridgeUrl" placeholder="Bridge URL (https://...)" value="${escapeAttr(w.bridgeUrl||'')}" />
          <div style="height:8px"></div>
          <input class="input" name="bridgeToken" placeholder="Bridge Token" value="${escapeAttr(w.bridgeToken||'')}" />
          <div class="row-actions">
            <button class="btn primary" data-action="save-settings">Save</button>
          </div>
          <div class="small">See docs/WHATSAPP_HOME_SETUP.md</div>
        </div>
      </div>

      <h2>Family</h2>
      <div class="list">
        ${state.family.map(m => `
          <div class="card item">
            <div class="avatar">${escapeHtml(m.initials||m.name.slice(0,1))}</div>
            <div class="meta">
              <div class="row">
                <div class="name">${escapeHtml(m.name)}</div>
                <span class="badge">${escapeHtml(m.role)}</span>
                ${m.admin?`<span class="badge ok">Admin</span>`:''}
              </div>
              <div class="sub">Phone: ${escapeHtml(m.phone||'—')} • Status: ${escapeHtml(m.status||'ok')}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <h2>Backup</h2>
      <div class="card item">
        <div class="avatar">🧰</div>
        <div class="meta">
          <div class="row"><div class="name">Export / Import</div></div>
          <div class="sub">Useful if you ever change phone or want a safe copy.</div>
          <div class="row-actions">
            <button class="btn" data-action="export">Export</button>
            <button class="btn" data-action="import">Import</button>
            <button class="btn danger" data-action="reset">Reset this phone</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Render helpers
function emptyRow(text) {
  return `<div class="card item"><div class="avatar">🌿</div><div class="meta"><div class="row"><div class="name">${escapeHtml(text)}</div></div><div class="sub">Rosie will keep watch in the background.</div></div></div>`;
}

function renderInboxRow(m) {
  const badge = m.status === 'filed' ? '<span class="badge ok">Filed</span>' : '<span class="badge">New</span>';
  const preview = m.parsed ? renderParsedSummary(m.parsed) : '<span class="small">Tap to file</span>';
  return `
    <button class="card item" data-open-msg="${escapeAttr(m.id)}" style="text-align:left;width:100%;background:var(--card)">
      <div class="avatar">${icons.inbox}</div>
      <div class="meta">
        <div class="row"><div class="name">${escapeHtml(m.from)}</div>${badge}</div>
        <div class="sub">${escapeHtml(m.text)}</div>
        <div class="sub">${preview}</div>
      </div>
    </button>
  `;
}

function renderEventRow(e, state) {
  const who = (e.whoIds||[]).map(id => state.family.find(m=>m.id===id)?.name).filter(Boolean).join(', ') || '—';
  const when = `${formatDay(e.startAt)} ${formatTime(e.startAt)}`;
  return `
    <div class="card item">
      <div class="avatar">${icons.cal}</div>
      <div class="meta">
        <div class="row"><div class="name">${escapeHtml(e.title)}</div><span class="badge">${escapeHtml(who)}</span></div>
        <div class="sub">${escapeHtml(when)}${e.notes?` • ${escapeHtml(e.notes)}`:''}</div>
      </div>
    </div>
  `;
}

function renderTaskRow(t, state, opts={}) {
  const assignees = (t.assigneeIds||[]).map(id => state.family.find(m=>m.id===id)?.name).filter(Boolean).join(', ') || '—';
  const due = t.dueAt ? `${formatDay(t.dueAt)} ${formatTime(t.dueAt)}` : 'No due time';
  const badge = t.status === 'done' ? '<span class="badge ok">Done</span>' : '<span class="badge">Open</span>';
  const compact = opts.compact;

  return `
    <div class="card item">
      <div class="avatar">${icons.list}</div>
      <div class="meta">
        <div class="row"><div class="name">${escapeHtml(t.title)}</div>${badge}</div>
        <div class="sub">${escapeHtml(assignees)} • ${escapeHtml(due)}</div>
        ${compact ? '' : `
          <div class="row-actions">
            <button class="btn" data-done-task="${escapeAttr(t.id)}">${t.status==='done'?'Undo':'Done'}</button>
            <button class="btn primary" data-send-task="${escapeAttr(t.id)}">${icons.send} WhatsApp nudge</button>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderGroceryRow(i) {
  return `
    <button class="card item" data-toggle-grocery="${escapeAttr(i.id)}" style="text-align:left;width:100%;background:var(--card)">
      <div class="avatar">${icons.bag}</div>
      <div class="meta">
        <div class="row"><div class="name">${escapeHtml(i.text)}</div>${i.done?'<span class="badge ok">Bought</span>':'<span class="badge">To buy</span>'}</div>
        <div class="sub">Tap to toggle</div>
      </div>
    </button>
  `;
}

function computeUrgent(state) {
  const now = new Date();
  const upcoming = state.calendar.events
    .filter(e => e.startAt)
    .map(e => ({ e, t: new Date(e.startAt) }))
    .filter(x => x.t > now)
    .sort((a,b) => a.t - b.t)
    .slice(0, 1);

  const openTasks = state.tasks.filter(t => t.status !== 'done');
  if (upcoming.length) {
    const u = upcoming[0].e;
    const who = (u.whoIds||[]).map(id => state.family.find(m=>m.id===id)?.name).filter(Boolean).join(', ');
    return { summary: `Next: ${u.title} (${who}) at ${formatTime(u.startAt)}. I’ll warn you well in advance.` };
  }
  if (openTasks.length) return { summary: `You have ${openTasks.length} open chores. I can WhatsApp nudges for Lisa/Jabu.` };
  return { summary: `No fires right now. If anyone messages me on WhatsApp, I’ll sort everything for you.` };
}

function computeNextEvents(state) {
  const now = new Date();
  return state.calendar.events
    .filter(e => e.startAt)
    .map(e => ({...e, _t: new Date(e.startAt)}))
    .filter(e => e._t > now)
    .sort((a,b)=>a._t - b._t)
    .slice(0, 4);
}

function computeClashes(events) {
  const clashes = [];
  // naive overlap by same person within same day
  for (let i=0;i<events.length;i++){
    const a = events[i];
    if (!a.endAt || !a.startAt) continue;
    const aStart = new Date(a.startAt).getTime();
    const aEnd = new Date(a.endAt).getTime();
    for (let j=i+1;j<events.length;j++){
      const b = events[j];
      if (!b.endAt || !b.startAt) continue;
      const shared = (a.whoIds||[]).filter(x => (b.whoIds||[]).includes(x));
      if (!shared.length) continue;
      const bStart = new Date(b.startAt).getTime();
      const bEnd = new Date(b.endAt).getTime();
      const overlap = Math.max(aStart,bStart) < Math.min(aEnd,bEnd);
      if (overlap) {
        clashes.push(`${shared.map(id=>store.peek().family.find(m=>m.id===id)?.name).filter(Boolean).join(', ')}: “${a.title}” overlaps “${b.title}”`);
      }
    }
  }
  return clashes.slice(0, 5);
}

function renderParsedSummary(parsed, state) {
  if (!parsed) return '';
  if (parsed.kind === 'grocery') return `🛒 Groceries: ${parsed.items.map(escapeHtml).join(', ')}`;
  if (parsed.kind === 'task') return `✅ Task → ${parsed.assigneeIds?.length?parsed.assigneeIds.map(id=>store.peek().family.find(m=>m.id===id)?.name).filter(Boolean).join(', '):'someone'}: ${escapeHtml(parsed.title)}${parsed.dueAt?` • due ${escapeHtml(formatDay(parsed.dueAt))} ${escapeHtml(formatTime(parsed.dueAt))}`:''}`;
  if (parsed.kind === 'event') return `📅 Event: ${escapeHtml(parsed.title)} at ${escapeHtml(formatDay(parsed.startAt))} ${escapeHtml(formatTime(parsed.startAt))}`;
  if (parsed.kind === 'status') return `🟣 Status updated`;
  return `🧠 Rosie: I filed it.`;
}

function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s='') { return escapeHtml(s).replace(/"/g,'&quot;'); }

async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return `data:${file.type||'application/octet-stream'};base64,${b64}`;
}
