import React,{useEffect,useMemo,useState} from "https://esm.sh/react@18.3.1";
import {createRoot} from "https://esm.sh/react-dom@18.3.1/client";
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,updateDoc,serverTimestamp,onSnapshot} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js";

const LS_CFG="rosie.firebaseConfig";
const STATUS=["Available","School","Working","Out","Busy","Sleeping"];
const loadCfg=()=>{try{const r=localStorage.getItem(LS_CFG);return r?JSON.parse(r):null}catch{return null}};
const saveCfg=c=>localStorage.setItem(LS_CFG,JSON.stringify(c));
const clearCfg=()=>localStorage.removeItem(LS_CFG);
function initFirebase(){const cfg=loadCfg();if(!cfg)return null;const app=getApps().length?getApps()[0]:initializeApp(cfg);return{app,auth:getAuth(app),db:getFirestore(app),functions:getFunctions(app)};}

// Voice
let voices=[];const refresh=()=>{if(!("speechSynthesis"in window))return;voices=window.speechSynthesis.getVoices()||[]};
if("speechSynthesis"in window){refresh();window.speechSynthesis.onvoiceschanged=refresh;}
const pickVoice=()=>{const re=/(female|woman|zira|susan|samantha|victoria|karen|tessa|moira|serena|emily|ava)/i;
  return voices.find(v=>re.test(v.name))||voices.find(v=>/en/i.test(v.lang||""))||voices[0]||null};
const speak=(t,{rate=0.92,pitch=1.08,volume=1}={})=>{if(!("speechSynthesis"in window)||!t)return;const u=new SpeechSynthesisUtterance(t);const v=pickVoice();if(v)u.voice=v;u.rate=rate;u.pitch=pitch;u.volume=volume;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);};
const stop=()=>{if("speechSynthesis"in window)window.speechSynthesis.cancel()};

async function upsertMyProfile(db,uid,data){const ref=doc(db,"familyMembers",uid);const snap=await getDoc(ref);const payload={...data,updatedAt:serverTimestamp()};
  if(!snap.exists())await setDoc(ref,{...payload,createdAt:serverTimestamp()});else await updateDoc(ref,payload);}
const subMy=(db,uid,cb)=>onSnapshot(doc(db,"familyMembers",uid),s=>cb(s.exists()?s.data():null));

function HappyBot({fb,isAdmin}){const[prompt,setPrompt]=useState("");const[answer,setAnswer]=useState("");const[busy,setBusy]=useState(false);const[voiceOn,setVoiceOn]=useState(true);
  const onAsk=async()=>{setAnswer("");if(!fb)return setAnswer("Set Firebase config in Settings first.");if(!isAdmin)return setAnswer("Master Admin only.");
    const p=prompt.trim();if(!p)return;setBusy(true);try{const res=await httpsCallable(fb.functions,"askGemini")({prompt:p});const text=res?.data?.text||"No reply.";setAnswer(text);if(voiceOn)speak(text);}
    catch(e){setAnswer(e?.message||"AI call failed.");}finally{setBusy(false);} };
  return React.createElement("div",{className:"card"},
    React.createElement("div",{className:"row",style:{justifyContent:"space-between"}},
      React.createElement("div",null,React.createElement("div",{style:{fontSize:22,fontWeight:900}},"Rosie"),React.createElement("div",{className:"small"},"Gentle helper (admin-only AI)")),
      React.createElement("div",{className:"row"},
        React.createElement("button",{className:"btn",onClick:()=>setVoiceOn(v=>!v)},voiceOn?"Voice: On":"Voice: Off"),
        React.createElement("button",{className:"btn",onClick:stop},"Stop"))),
    React.createElement("div",{className:"row",style:{marginTop:10}},
      React.createElement("input",{className:"input",value:prompt,onChange:e=>setPrompt(e.target.value),placeholder:"Ask Rosie…",onKeyDown:e=>{if(e.key==="Enter")onAsk();}}),
      React.createElement("button",{className:"btn",onClick:onAsk,disabled:busy},busy?"Thinking…":"Ask")),
    answer?React.createElement("div",{className:"card",style:{marginTop:12}},React.createElement("div",{className:"small"},"Reply"),React.createElement("div",{style:{whiteSpace:"pre-wrap",marginTop:6}},answer)):null);}

function SettingsModal({open,onClose,fb,me,isAdmin,adminStatus,refreshAdminStatus}){const[tab,setTab]=useState("firebase");const[cfgText,setCfgText]=useState("");const[email,setEmail]=useState("");const[pass,setPass]=useState("");const[msg,setMsg]=useState("");const[busy,setBusy]=useState(false);
  if(!open)return null;const role=me?(isAdmin?"Master Admin":"Family"):"Signed out";
  const save=()=>{setMsg("");try{saveCfg(JSON.parse(cfgText));setMsg("Saved. Reloading…");setTimeout(()=>location.reload(),350);}catch{setMsg("Config JSON not valid.");}};
  const clear=()=>{clearCfg();setMsg("Cleared. Reloading…");setTimeout(()=>location.reload(),350);};
  const login=async()=>{if(!fb)return;setBusy(true);setMsg("");try{await signInWithEmailAndPassword(fb.auth,email,pass);setMsg("Signed in.");}catch(e){setMsg(e?.message||"Login failed.");}finally{setBusy(false);} };
  const signup=async()=>{if(!fb)return;setBusy(true);setMsg("");try{await createUserWithEmailAndPassword(fb.auth,email,pass);setMsg("Account created.");}catch(e){setMsg(e?.message||"Signup failed.");}finally{setBusy(false);} };
  const logout=async()=>{if(!fb)return;setBusy(true);setMsg("");try{await signOut(fb.auth);setMsg("Signed out.");}catch(e){setMsg(e?.message||"Signout failed.");}finally{setBusy(false);} };
  const claim=async()=>{if(!fb)return;setBusy(true);setMsg("");try{const r=await httpsCallable(fb.functions,"claimAdmin")({});setMsg(r?.data?.message||"Done.");await refreshAdminStatus();}catch(e){setMsg(e?.message||"Claim failed.");}finally{setBusy(false);} };
  return React.createElement("div",{className:"modalBackdrop"},React.createElement("div",{className:"card modal"},
    React.createElement("div",{className:"row",style:{justifyContent:"space-between",alignItems:"center"}},
      React.createElement("div",null,React.createElement("div",{style:{fontSize:22,fontWeight:900}},"Settings"),React.createElement("div",{className:"small"},"Rosie setup • Login • Admin")),
      React.createElement("button",{className:"btn",onClick:onClose},"Close")),
    React.createElement("div",{className:"row",style:{marginTop:10}},
      React.createElement("button",{className:"btn",onClick:()=>setTab("firebase")},"Firebase"),
      React.createElement("button",{className:"btn",onClick:()=>setTab("auth")},"Login"),
      React.createElement("button",{className:"btn",onClick:()=>setTab("admin")},"Admin")),
    React.createElement("div",{className:"small",style:{marginTop:10}},"Role: ",React.createElement("b",null,role),me?` • ${me.email||me.uid}`:""),
    tab==="firebase"?React.createElement("div",{style:{marginTop:12}},
      React.createElement("div",{className:"small",style:{marginBottom:6}},"Paste Firebase Web config JSON (public)."),
      React.createElement("textarea",{rows:7,value:cfgText,onChange:e=>setCfgText(e.target.value),placeholder:'{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'}),
      React.createElement("div",{className:"row",style:{marginTop:10}},
        React.createElement("button",{className:"btn",onClick:save,disabled:busy},"Save"),
        React.createElement("button",{className:"btn",onClick:clear,disabled:busy},"Clear"))):null,
    tab==="auth"?React.createElement("div",{style:{marginTop:12}},
      React.createElement("div",{className:"row"},
        React.createElement("input",{className:"input",placeholder:"Email",value:email,onChange:e=>setEmail(e.target.value)}),
        React.createElement("input",{className:"input",placeholder:"Password",type:"password",value:pass,onChange:e=>setPass(e.target.value)})),
      React.createElement("div",{className:"row",style:{marginTop:10}},
        React.createElement("button",{className:"btn",onClick:login,disabled:busy||!fb},"Sign in"),
        React.createElement("button",{className:"btn",onClick:signup,disabled:busy||!fb},"Create"),
        React.createElement("button",{className:"btn",onClick:logout,disabled:busy||!fb||!me},"Sign out"))):null,
    tab==="admin"?React.createElement("div",{style:{marginTop:12}},
      React.createElement("div",{className:"small",style:{marginBottom:6}},"Two admin slots max (Nasima + Suhayl)."),
      React.createElement("div",{className:"small"},`Status: ${adminStatus||"Unknown"}`),
      React.createElement("div",{className:"row",style:{marginTop:10}},
        React.createElement("button",{className:"btn",onClick:claim,disabled:busy||!fb||!me},"Claim Admin Slot"),
        React.createElement("button",{className:"btn",onClick:refreshAdminStatus,disabled:busy||!fb||!me},"Refresh"))):null,
    React.createElement("div",{className:"small",style:{marginTop:12}},msg)));}

function App(){const[fb,setFb]=useState(null);const[me,setMe]=useState(null);const[settingsOpen,setSettingsOpen]=useState(false);
  const[adminUids,setAdminUids]=useState([]);const[adminStatus,setAdminStatus]=useState("");const[profile,setProfile]=useState(null);
  useEffect(()=>{const inst=initFirebase();setFb(inst);if(!inst)return;return onAuthStateChanged(inst.auth,u=>setMe(u||null));},[]);
  useEffect(()=>{if(!fb||!me)return;return subMy(fb.db,me.uid,setProfile);},[fb,me]);
  const refreshAdminStatus=async()=>{if(!fb){setAdminStatus("Firebase not configured.");return;}
    try{const snap=await getDoc(doc(fb.db,"control","admin"));const admins=snap.exists()?(snap.data().admins||[]):[];const list=Array.isArray(admins)?admins:[];setAdminUids(list);setAdminStatus(`Admins: ${list.length}/2`);}
    catch(e){setAdminStatus(e?.message||"Failed to read admin status.");}};
  useEffect(()=>{refreshAdminStatus();},[fb,me]);
  const isAdmin=useMemo(()=>me?adminUids.includes(me.uid):false,[me,adminUids]);
  const setMyStatus=async(s)=>{if(!fb||!me)return;await upsertMyProfile(fb.db,me.uid,{displayName:(me.email||"").split("@")[0]||"Family",status:s});};
  return React.createElement("div",{className:"container"},
    React.createElement("div",{className:"row",style:{justifyContent:"space-between",alignItems:"center"}},
      React.createElement("div",null,React.createElement("div",{style:{fontSize:22,fontWeight:900}},"Rosie"),
        React.createElement("div",{className:"small"},me?`Signed in as ${me.email||me.uid}`:"Not signed in"," • ",me?(isAdmin?"Master Admin":"Family"):"—")),
      React.createElement("button",{className:"btn",onClick:()=>setSettingsOpen(true)},"Settings")),
    React.createElement("div",{style:{display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",marginTop:12}},
      React.createElement(HappyBot,{fb,isAdmin}),
      React.createElement("div",{className:"card"},
        React.createElement("div",{style:{fontSize:18,fontWeight:800}},"My Status"),
        React.createElement("div",{className:"small"},"Everyone can update their own status."),
        React.createElement("div",{style:{marginTop:10,opacity:.9}},"Current: ",React.createElement("b",null,profile?.status||"—")),
        React.createElement("div",{className:"row",style:{marginTop:10}},...STATUS.map(s=>React.createElement("button",{key:s,className:"btn",disabled:!me,onClick:()=>setMyStatus(s)},s))))),
    React.createElement(SettingsModal,{open:settingsOpen,onClose:()=>setSettingsOpen(false),fb,me,isAdmin,adminStatus,refreshAdminStatus}));}

createRoot(document.getElementById("root")).render(React.createElement(App));
