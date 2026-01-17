const KEY='rosie.v13.state';
const DEFAULT_STATE={
  family:[
    {id:'nasima',name:'Nasima',role:'Admin'},
    {id:'suhayl',name:'Suhayl',role:'Admin'},
    {id:'rayhaan',name:'Rayhaan',role:'Kid'},
    {id:'zaara',name:'Zaara',role:'Kid'},
    {id:'jabu',name:'Jabu',role:'Staff'},
    {id:'lisa',name:'Lisa',role:'Staff'}
  ],
  events:[],tasks:[],groceries:[],inbox:[],
  settings:{bridgeUrl:'',bridgeToken:'',householdGroupId:'',reminderLeads:[{label:'7d',minutes:10080},{label:'3d',minutes:4320},{label:'1d',minutes:1440},{label:'2h',minutes:120}]}
};
const clone=x=>JSON.parse(JSON.stringify(x));
export function loadState(){
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw) return clone(DEFAULT_STATE);
    const p=JSON.parse(raw);
    return {...clone(DEFAULT_STATE),...p,settings:{...clone(DEFAULT_STATE).settings,...(p.settings||{})}};
  }catch{ return clone(DEFAULT_STATE); }
}
export function saveState(s){ localStorage.setItem(KEY, JSON.stringify(s)); }
export function uid(prefix='id'){ return prefix+'_'+Math.random().toString(16).slice(2)+'_'+Date.now().toString(16); }
export function nowIso(){ return new Date().toISOString(); }
export function removeById(arr,id){ const i=arr.findIndex(x=>x.id===id); if(i>=0) arr.splice(i,1); }
export function getMember(state,id){ return state.family.find(m=>m.id===id); }
export function memberLabel(state,ids){ return (ids||[]).map(id=>getMember(state,id)?.name).filter(Boolean).join(', '); }
