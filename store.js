const KEY = 'rosie.v14.state';
const OLD_KEYS = ['rosie.v13.state','rosie.v12.state','rosie.v11.state'];

const DEFAULT_STATE = {
  family: [
    { id: 'nasima', name: 'Nasima', role: 'Admin' },
    { id: 'suhayl', name: 'Suhayl', role: 'Admin' },
    { id: 'rayhaan', name: 'Rayhaan', role: 'Kid' },
    { id: 'zaara', name: 'Zaara', role: 'Kid' },
    { id: 'jabu', name: 'Jabu', role: 'Staff' },
    { id: 'lisa', name: 'Lisa', role: 'Staff' }
  ],
  events: [],
  tasks: [],
  groceries: [],
  inbox: [],
  settings: {
    reminderLeads: [
      { label:'7d', minutes: 7*24*60 },
      { label:'3d', minutes: 3*24*60 },
      { label:'1d', minutes: 24*60 },
      { label:'2h', minutes: 120 }
    ],
    bridgeUrl: '',
    bridgeToken: '',
    householdGroupId: '',
    autoAssignRules: [
      { keyword: 'zaara', target: 'zaara' },
      { keyword: 'rayhaan', target: 'rayhaan' },
      { keyword: 'nasima|mum', target: 'nasima' },
      { keyword: 'suhayl|dad', target: 'suhayl' },
      { keyword: 'lisa', target: 'lisa' },
      { keyword: 'jabu', target: 'jabu' }
    ],
    autoTypeRules: [
      { keyword: 'school|parents evening|homework|tuition|exam|sports day|swimming', type: 'School' },
      { keyword: 'garden|maintenance|fix|repair', type: 'Staff' },
      { keyword: 'grocer|shopping|home|birthday|family', type: 'Home' }
    ]
  },
  ui: {
    calMode: '2w',
    calAnchor: new Date().toISOString(),
    calFilter: { memberId:'all', type:'all', location:'' }
  }
};

function deepClone(x){ return JSON.parse(JSON.stringify(x)); }

export function loadState(){
  try{
    let raw = localStorage.getItem(KEY);
    if(!raw){
      for(const k of OLD_KEYS){
        raw = localStorage.getItem(k);
        if(raw) break;
      }
    }
    if(!raw) return deepClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // schema merge
    return {
      ...deepClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...deepClone(DEFAULT_STATE).settings, ...(parsed.settings||{}) },
      ui: { ...deepClone(DEFAULT_STATE).ui, ...(parsed.ui||{}) }
    };
  }catch(e){
    return deepClone(DEFAULT_STATE);
  }
}

export function saveState(state){
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function uid(prefix='id'){
  return prefix + '_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
}

export function nowIso(){ return new Date().toISOString(); }

export function removeById(arr, id){
  const i = (arr||[]).findIndex(x=>x.id===id);
  if(i>=0) arr.splice(i,1);
}

export function getMember(state, id){
  return (state.family||[]).find(m=>m.id===id) || null;
}

export function memberLabel(state, ids){
  const names = (ids||[]).map(id => getMember(state,id)?.name).filter(Boolean);
  return names.join(', ');
}
