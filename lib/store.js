const KEY = 'rosie.family-pa.v11';

const DEFAULT = () => ({
  version: 11,
  ui: { installReady: false },
  profile: { currentUserId: 'nasima' },
  integrations: {
    whatsapp: {
      bridgeUrl: '',
      bridgeToken: '',
      lastSync: '',
      configPushedAt: '',
      routing: {
        notifyAdminsOnChildMessages: true,
        notifyAdminsOnStaffUpdates: true,
        autoNudgeAssigneesForTasks: true,
        autoRemindParentsOnChildRequests: true
      },
      reminders: {
        enabled: true,
        // lead times for WhatsApp reminders
        leadTimes: [
          { label: '7d', ms: 7*24*60*60*1000 },
          { label: '3d', ms: 3*24*60*60*1000 },
          { label: '1d', ms: 1*24*60*60*1000 },
          { label: '2h', ms: 2*60*60*1000 }
        ]
      },
      digests: {
        enabled: true,
        // Sent by Brain (Cloudflare cron) — adjust in wrangler.toml if needed
        staffDailyDigest: true
      }
    }
  },
  family: [
    { id:'nasima', name:'Nasima', role:'Mum', admin:true, phone:'', initials:'N', status:'ok' },
    { id:'suhayl', name:'Suhayl', role:'Dad', admin:true, phone:'', initials:'S', status:'ok' },
    { id:'rayhaan', name:'Rayhaan', role:'Son', admin:false, phone:'', initials:'R', status:'ok' },
    { id:'zaara', name:'Zaara', role:'Daughter', admin:false, phone:'', initials:'Z', status:'ok' },
    { id:'jabu', name:'Jabu', role:'House helper', admin:false, phone:'', initials:'J', status:'ok' },
    { id:'lisa', name:'Lisa', role:'Maintenance & garden', admin:false, phone:'', initials:'L', status:'ok' }
  ],
  inbox: [],
  calendar: { events: [] },
  tasks: [],
  groceries: { items: [] }
});

let _cache = null;

export const store = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        // Migrate from previous versions if present
        const legacy = localStorage.getItem('rosie.family-pa.v10') || localStorage.getItem('rosie.family-pa.v9');
        if (legacy) {
          try {
            const legacyData = JSON.parse(legacy);
            const fresh = DEFAULT();
            // keep user content
            if (legacyData.family) fresh.family = legacyData.family;
            if (legacyData.inbox) fresh.inbox = legacyData.inbox;
            if (legacyData.calendar) fresh.calendar = legacyData.calendar;
            if (legacyData.tasks) fresh.tasks = legacyData.tasks;
            if (legacyData.groceries) fresh.groceries = legacyData.groceries;
            if (legacyData.profile) fresh.profile = legacyData.profile;
            if (legacyData.integrations) {
              fresh.integrations.whatsapp.bridgeUrl = legacyData.integrations.whatsapp?.bridgeUrl || '';
              fresh.integrations.whatsapp.bridgeToken = legacyData.integrations.whatsapp?.bridgeToken || '';
              fresh.integrations.whatsapp.lastSync = legacyData.integrations.whatsapp?.lastSync || '';
            }
            _cache = fresh;
            this.save(_cache);
            return _cache;
          } catch {
            // fall through to defaults
          }
        }
        _cache = DEFAULT();
        this.save(_cache);
        return _cache;
      }
      const data = JSON.parse(raw);
      // basic migration guard
      if (!data.family || !data.calendar || !data.tasks || !data.groceries) {
        _cache = DEFAULT();
        this.save(_cache);
        return _cache;
      }
      _cache = data;
      return data;
    } catch {
      _cache = DEFAULT();
      this.save(_cache);
      return _cache;
    }
  },
  save(data) {
    _cache = data;
    localStorage.setItem(KEY, JSON.stringify(data));
  },
  reset() {
    localStorage.removeItem(KEY);
    _cache = null;
  },
  peek() { return _cache || this.load(); }
};
