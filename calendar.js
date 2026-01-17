import { memberLabel } from './store.js';
export const pad2=n=>String(n).padStart(2,'0');
export const ymd=d=>{const dt=new Date(d); return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate());};
export const hm=d=>{const dt=new Date(d); return pad2(dt.getHours())+':'+pad2(dt.getMinutes());};
export const startOfDay=d=>{const x=new Date(d); x.setHours(0,0,0,0); return x;};
export const addDays=(d,n)=>{const x=new Date(d); x.setDate(x.getDate()+n); return x;};
export const startOfWeekMonday=(d)=>{const x=startOfDay(d); const day=x.getDay(); const diff=(day===0?-6:1-day); return addDays(x,diff);};
export function monthMatrix(anchor){
  const a=new Date(anchor); const first=new Date(a.getFullYear(),a.getMonth(),1);
  const gridStart=startOfWeekMonday(first);
  const weeks=[]; let cur=gridStart;
  for(let w=0;w<6;w++){ const week=[]; for(let i=0;i<7;i++){ week.push(new Date(cur)); cur=addDays(cur,1);} weeks.push(week); }
  return {weeks,month:a.getMonth(),year:a.getFullYear()};
}
export function twoWeekMatrix(anchor){
  const start=startOfWeekMonday(anchor); const days=[]; for(let i=0;i<14;i++) days.push(addDays(start,i));
  return [days.slice(0,7), days.slice(7,14)];
}
export function eventsForDay(state, day){
  const key=ymd(day);
  return (state.events||[]).filter(ev=> ymd(ev.start)===key).sort((a,b)=>new Date(a.start)-new Date(b.start));
}
export function detectClashes(state, day, memberId){
  const evs=eventsForDay(state, day).filter(ev=>(ev.who||[]).includes(memberId));
  const clashes=[];
  for(let i=0;i<evs.length;i++) for(let j=i+1;j<evs.length;j++){
    const a1=new Date(evs[i].start).getTime(), a2=new Date(evs[i].end||evs[i].start).getTime();
    const b1=new Date(evs[j].start).getTime(), b2=new Date(evs[j].end||evs[j].start).getTime();
    if(Math.max(a1,b1) < Math.min(a2,b2)) clashes.push([evs[i],evs[j]]);
  }
  return clashes;
}
export function formatEventLine(state, ev){
  const who=memberLabel(state, ev.who);
  const where=ev.where?(' · '+ev.where):'';
  const t=hm(ev.start); const t2=ev.end?hm(ev.end):'';
  const tt=(t2 && t2!==t)?`${t}–${t2}`:t;
  return `${tt} · ${ev.title}${where}${who?(' · '+who):''}`;
}
