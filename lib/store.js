const KEY = 'rosie.family-pa.v10';

const DEFAULT = () => ({
  version: 10,
  ui: { installReady: false },
  profile: { currentUserId: 'nasima' },
  integrations: {
    whatsapp: { bridgeUrl: '', bridgeToken: '' }
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
      if (!raw) { _cache = DEFAULT(); this.save(_cache); return _cache; }
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
