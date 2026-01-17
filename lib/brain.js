import { store } from './store.js';
import { parseInstruction, nowISO, makeUid } from './utils.js';

export const brain = {
  async syncIfConfigured(state, { onToast, quiet=false }={}) {
    const w = state.integrations.whatsapp || {};
    if (!w.bridgeUrl || !w.bridgeToken) return;

    try {
      const since = state.integrations.whatsapp.lastSync || '';
      const url = new URL(w.bridgeUrl.replace(/\/$/, '') + '/api/feed');
      if (since) url.searchParams.set('since', since);

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${w.bridgeToken}` }
      });

      if (!res.ok) throw new Error('feed failed');
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const now = new Date();

      let added = 0;
      for (const it of items) {
        if (state.inbox.some(x => x.id === it.id)) continue;
        const inboxItem = {
          id: it.id,
          type: it.type || 'whatsapp',
          from: it.from || 'WhatsApp',
          receivedAt: it.receivedAt || nowISO(),
          text: it.text || '',
          parsed: null,
          status: 'new',
        };
        // Auto-file immediately
        const parsed = parseInstruction(inboxItem.text, { family: state.family, now });
        inboxItem.parsed = parsed;
        inboxItem.status = 'filed';
        applyParsed(state, parsed, inboxItem);
        state.inbox.unshift(inboxItem);
        added++;
      }

      if (data.serverTime) state.integrations.whatsapp.lastSync = data.serverTime;
      else state.integrations.whatsapp.lastSync = new Date().toISOString();

      store.save(state);
      if (!quiet && added) onToast?.(`Synced ${added} WhatsApp msg${added===1?'':'s'} ✅`);
    } catch (e) {
      if (!quiet) onToast?.('WhatsApp sync failed');
      console.warn('[rosie] brain sync failed', e);
    }
  },

  async postFileReceipt(state, inboxItem, { onToast, quiet=false }={}) {
    const w = state.integrations.whatsapp || {};
    if (!w.bridgeUrl || !w.bridgeToken) return;

    // If message was filed locally, optionally let Brain notify others
    try {
      const url = w.bridgeUrl.replace(/\/$/, '') + '/api/file-receipt';
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${w.bridgeToken}`
        },
        body: JSON.stringify({ inboxItem })
      });
    } catch (e) {
      if (!quiet) onToast?.('Could not notify WhatsApp');
      console.warn('[rosie] file receipt failed', e);
    }
  },

  async sendTaskNudge(state, taskId, { onToast }={}) {
    const w = state.integrations.whatsapp || {};
    if (!w.bridgeUrl || !w.bridgeToken) return onToast?.('Connect WhatsApp Bridge first');
    const task = state.tasks.find(t=>t.id===taskId);
    if (!task) return;
    try {
      const url = w.bridgeUrl.replace(/\/$/, '') + '/api/nudge-task';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${w.bridgeToken}` },
        body: JSON.stringify({ task })
      });
      if (!res.ok) throw new Error('nudge failed');
      onToast?.('Nudge sent ✅');
    } catch {
      onToast?.('Nudge failed');
    }
  },

  async tryTranscribeAudio(state, inboxId, { onToast }={}) {
    const w = state.integrations.whatsapp || {};
    if (!w.bridgeUrl || !w.bridgeToken) return;
    const item = state.inbox.find(x=>x.id===inboxId);
    if (!item?.audio?.dataUrl) return;

    try {
      const url = w.bridgeUrl.replace(/\/$/, '') + '/api/transcribe';
      const res = await fetch(url, {
        method:'POST',
        headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${w.bridgeToken}` },
        body: JSON.stringify({ id: inboxId, audio: item.audio })
      });
      if (!res.ok) throw new Error('transcribe failed');
      const data = await res.json();
      if (data.text) {
        item.text = data.text;
        const parsed = parseInstruction(item.text, { family: state.family, now: new Date() });
        item.parsed = parsed;
        item.status = 'filed';
        applyParsed(state, parsed, item);
        store.save(state);
        onToast?.('Transcribed + filed ✅');
      }
    } catch (e) {
      console.warn('[rosie] transcribe failed', e);
    }
  }
};

// shared parse application
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
}
