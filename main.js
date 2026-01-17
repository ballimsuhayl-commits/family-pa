import React,{useEffect,useMemo,useState} from "https://esm.sh/react@18.3.1";
import {createRoot} from "https://esm.sh/react-dom@18.3.1/client";

import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,updateDoc,serverTimestamp,onSnapshot,collection,query,limit} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js";

const LS_CFG="rosie.firebaseConfig";
const STATUS=["Available","School","Working","Out","Busy","Sleeping"];
const DEFAULT_FAMILY = [\"Nasima\",\"Suhayl\",\"Rayhaan\",\"Zaara\",\"Jabu\",\"Lisa\"]; // initial

function loadCfg(){ try{ const r=localStorage.getItem(LS_CFG); return r?JSON.parse(r):null; }catch{ return null; } }
function saveCfg(cfg){ localStorage.setItem(LS_CFG, JSON.stringify(cfg)); }
function clearCfg(){ localStorage.removeItem(LS_CFG); }

function initFirebase(){
  const cfg=loadCfg();
  if(!cfg) return null;
  const app=getApps().length?getApps()[0]:initializeApp(cfg);
  return { app, auth:getAuth(app), db:getFirestore(app), functions:getFunctions(app) };
}

// --- Gentle voice (best-effort female-ish) ---
let cachedVoices=[];
function refreshVoices(){
  if(!("speechSynthesis" in window)) return;
  cachedVoices = window.speechSynthesis.getVoices() || [];
}
if("speechSynthesis" in window){ refreshVoices(); window.speechSynthesis.onvoiceschanged = refreshVoices; }
function pickVoice(){
  const pool=cachedVoices||[];
  const femaleHints=/(female|woman|zira|susan|samantha|victoria|karen|tessa|moira|serena|emily|ava)/i;
  return pool.find(v=>femaleHints.test(v.name)) || pool.find(v=>/en/i.test(v.lang||"")) || pool[0] || null;
}
function speak(text, {rate=0.92,pitch=1.08,volume=1}={}){
  if(!("speechSynthesis" in window) || !text) return;
  const u=new SpeechSynthesisUtterance(text);
  const v=pickVoice(); if(v) u.voice=v;
  u.rate=rate; u.pitch=pitch; u.volume=volume;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
function stopSpeaking(){ if("speechSynthesis" in window) window.speechSynthesis.cancel(); }

async function upsertMember(db, memberId, data){
  const ref=doc(db,"familyMembers",memberId);
  const snap=await getDoc(ref);
  const payload={...data, updatedAt: serverTimestamp()};
  if(!snap.exists()) await setDoc(ref, {...payload, createdAt: serverTimestamp()});
  else await updateDoc(ref, payload);
}

function useDoc(db, pathA, pathB){
  const [val,setVal]=useState(null);
  const [err,setErr]=useState("");
  useEffect(()=>{
    if(!db) return;
    const ref=doc(db, pathA, pathB);
    return onSnapshot(ref, s=>{ setVal(s.exists()?s.data():null); setErr(""); }, e=>setErr(e?.message||""));
  },[db,pathA,pathB]);
  return [val,err];
}

function useAdmins(db){
  const [adminDoc, adminErr] = useDoc(db,"control","admin");
  const admins = Array.isArray(adminDoc?.admins) ? adminDoc.admins : [];
  return { admins, adminErr };
}

function Mascot() {
  return React.createElement("div", {className:"mascot", title:"Rosie"},
    React.createElement("div", {dangerouslySetInnerHTML: {__html: `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="rb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect x="28" y="22" width="72" height="64" rx="18" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
  <rect x="34" y="30" width="60" height="38" rx="14" fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
  <circle cx="52" cy="49" r="6" fill="url(#rb)"/>
  <circle cx="76" cy="49" r="6" fill="url(#rb)"/>
  <path d="M50 60c8 8 20 8 28 0" stroke="rgba(255,255,255,0.65)" stroke-width="4" stroke-linecap="round" fill="none"/>
  <rect x="52" y="86" width="24" height="10" rx="5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.20)" stroke-width="2"/>
  <path d="M64 18v-8" stroke="rgba(255,255,255,0.40)" stroke-width="4" stroke-linecap="round"/>
  <circle cx="64" cy="8" r="5" fill="url(#rb)"/>
</svg>`}})
  );
}

function SettingsModal({open,onClose,fb,me,isAdmin,adminsCount,refreshAdmins}) {
  const [tab,setTab]=useState("firebase");
  const [cfgText,setCfgText]=useState("");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);

  if(!open) return null;
  const role = me ? (isAdmin ? "Master Admin" : "Family") : "Signed out";

  function saveConfigNow(){
    setMsg("");
    try{ saveCfg(JSON.parse(cfgText)); setMsg("Saved. Reloading…"); setTimeout(()=>location.reload(), 350); }
    catch{ setMsg("Config JSON not valid."); }
  }
  function clearConfigNow(){ clearCfg(); setMsg("Cleared. Reloading…"); setTimeout(()=>location.reload(), 350); }

  async function login(){ if(!fb) return; setBusy(true); setMsg("");
    try{ await signInWithEmailAndPassword(fb.auth, email, pass); setMsg("Signed in."); }
    catch(e){ setMsg(e?.message||"Login failed."); }
    finally{ setBusy(false); }
  }
  async function signup(){ if(!fb) return; setBusy(true); setMsg("");
    try{ await createUserWithEmailAndPassword(fb.auth, email, pass); setMsg("Account created."); }
    catch(e){ setMsg(e?.message||"Signup failed."); }
    finally{ setBusy(false); }
  }
  async function logout(){ if(!fb) return; setBusy(true); setMsg("");
    try{ await signOut(fb.auth); setMsg("Signed out."); }
    catch(e){ setMsg(e?.message||"Signout failed."); }
    finally{ setBusy(false); }
  }
  async function claimAdmin(){ if(!fb || !me) return; setBusy(true); setMsg("");
    try{ const call=httpsCallable(fb.functions,"claimAdmin"); const r=await call({});
      setMsg(r?.data?.message || "Done."); await refreshAdmins();
    }catch(e){ setMsg(e?.message||"Claim failed."); }
    finally{ setBusy(false); }
  }

  return React.createElement("div", {className:"modalBackdrop"}, 
    React.createElement("div", {className:"card modal"}, 
      React.createElement("div", {className:"cardTitle"}, 
        React.createElement("div", null,
          React.createElement("h2", null, "Settings"),
          React.createElement("div", {className:"small"}, "Connect Firebase • Login • Admin slots")
        ),
        React.createElement("button", {className:"btn btnGhost", onClick:onClose}, "Close")
      ),
      React.createElement("div", {className:"row"}, 
        React.createElement("button", {className:`tab ${tab==="firebase"?"tabActive":""}`, onClick:()=>setTab("firebase")}, "Firebase"),
        React.createElement("button", {className:`tab ${tab==="auth"?"tabActive":""}`, onClick:()=>setTab("auth")}, "Login"),
        React.createElement("button", {className:`tab ${tab==="admin"?"tabActive":""}`, onClick:()=>setTab("admin")}, "Admin")
      ),
      React.createElement("div", {className:"divider"}),
      React.createElement("div", {className:"small"}, "Role: ", React.createElement("b", null, role), me?` • ${me.email||me.uid}`:""),

      tab==="firebase" ? React.createElement("div", {style:{marginTop:12}},
        React.createElement("div", {className:"small", style:{marginBottom:8}}, "Paste Firebase Web App config JSON (public)."),
        React.createElement("textarea", {rows:7, className:"input", value:cfgText, onChange:e=>setCfgText(e.target.value),
          placeholder:'{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'}),
        React.createElement("div", {className:"row", style:{marginTop:10}},
          React.createElement("button", {className:"btn btnPrimary", onClick:saveConfigNow, disabled:busy}, "Save"),
          React.createElement("button", {className:"btn", onClick:clearConfigNow, disabled:busy}, "Clear")
        )
      ) : null,

      tab==="auth" ? React.createElement("div", {style:{marginTop:12}},
        React.createElement("div", {className:"row"},
          React.createElement("input", {className:"input", placeholder:"Email", value:email, onChange:e=>setEmail(e.target.value)}),
          React.createElement("input", {className:"input", placeholder:"Password", type:"password", value:pass, onChange:e=>setPass(e.target.value)})
        ),
        React.createElement("div", {className:"row", style:{marginTop:10}},
          React.createElement("button", {className:"btn btnPrimary", onClick:login, disabled:busy||!fb}, "Sign in"),
          React.createElement("button", {className:"btn", onClick:signup, disabled:busy||!fb}, "Create"),
          React.createElement("button", {className:"btn", onClick:logout, disabled:busy||!fb||!me}, "Sign out")
        ),
        !fb ? React.createElement("div", {className:"small", style:{marginTop:10}}, "Set Firebase config first.") : null
      ) : null,

      tab==="admin" ? React.createElement("div", {style:{marginTop:12}},
        React.createElement("div", {className:"small"}, "Two admin slots total (Nasima + Suhayl)."),
        React.createElement("div", {className:"row", style:{marginTop:10}},
          React.createElement("span", {className:"pill"}, `Admins: ${adminsCount}/2`),
          React.createElement("button", {className:"btn btnPrimary", onClick:claimAdmin, disabled:busy||!fb||!me}, "Claim Admin Slot"),
          React.createElement("button", {className:"btn", onClick:refreshAdmins, disabled:busy||!fb}, "Refresh")
        )
      ) : null,

      msg ? React.createElement("div", {className:"toast"}, msg) : null
    )
  );
}

function App(){
  const [fb,setFb]=useState(null);
  const [me,setMe]=useState(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [voiceOn,setVoiceOn]=useState(true);
  const [prompt,setPrompt]=useState("");
  const [answer,setAnswer]=useState("");
  const [busy,setBusy]=useState(false);

  const [selectedMember,setSelectedMember]=useState("Me");
const [newPerson,setNewPerson]=useState("");
const [adding,setAdding]=useState(false);
  const [meDoc, meErr] = useDoc(fb?.db, "familyMembers", me?.uid || "_");
  const {admins, adminErr} = useAdmins(fb?.db);
  const isAdmin = me ? admins.includes(me.uid) : false;

  // family tabs (simple list)
  const familyTabs = useMemo(()=> {
    const base = ["Me","Nasima","Suhayl","Rayhaan","Zaara","Jabu","Lisa"];
    return base;
  }, []);

  useEffect(()=>{
    const inst=initFirebase();
    setFb(inst);
    if(!inst) return;
    return onAuthStateChanged(inst.auth, u=>setMe(u||null));
  },[]);

  async function refreshAdmins(){
    // Reading control/admin via snapshot already, but this forces immediate UI refresh patterns
    // no-op; state updates via onSnapshot
  }

  async function setStatus(status){
    if(!fb || !me) return;
    await upsertMember(fb.db, me.uid, {
      displayName: (me.email||"").split("@")[0] || "Family",
      status
    });
  }

  async function ask(){
    setAnswer("");
    if(!fb) return setAnswer("Open Settings and paste Firebase config first.");
    if(!isAdmin) return setAnswer("Master Admin only.");
    const p=prompt.trim(); if(!p) return;
    setBusy(true);
    try{
      const call=httpsCallable(fb.functions,"askGemini");
      const res=await call({prompt:p});
      const text=res?.data?.text || "No reply.";
      setAnswer(text);
      if(voiceOn) speak(text);
    }catch(e){
      setAnswer(e?.message || "AI call failed (deploy Firebase Functions + set secret).");
    }finally{ setBusy(false); }
  }

  return React.createElement("div", {className:"container"},
    React.createElement("div", {className:"header"},
      React.createElement("div", {className:"brand"},
        React.createElement("div", {className:"logo", "aria-hidden":"true"}, 
          React.createElement("svg", {viewBox:"0 0 24 24"}, 
            React.createElement("path", {fill:"rgba(255,255,255,0.9)", d:"M12 2a7 7 0 0 0-7 7v2a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V9a7 7 0 0 0-7-7zm-5 9V9a5 5 0 0 1 10 0v2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM6 18a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v2H6v-2z"})
          )
        ),
        React.createElement("div", null,
          React.createElement("h1", {className:"h1"}, "Rosie"),
          React.createElement("div", {className:"sub"}, me ? `Signed in as ${me.email||me.uid}` : "Not signed in")
        )
      ),
      React.createElement("div", {className:"actions"},
        React.createElement("span", {className:"kbd"}, isAdmin ? "Master Admin" : "Family"),
        React.createElement("button", {className:"btn", onClick:()=>setSettingsOpen(true)}, "Settings")
      )
    ),

    React.createElement("div", {className:"grid"},
      React.createElement("div", {className:"card"},
        React.createElement("div", {className:"cardTitle"},
          React.createElement("h2", null, "Rosie"),
          React.createElement("div", {className:"row"},
            React.createElement("span", {className:"pill"}, "Gentle helper (admin-only AI)"),
            React.createElement("button", {className:"btn", onClick:()=>setVoiceOn(v=>!v)}, voiceOn ? "Voice: On" : "Voice: Off"),
            React.createElement("button", {className:"btn", onClick:stopSpeaking}, "Stop")
          )
        ),
        React.createElement("div", {className:"mascotWrap"},
          React.createElement(Mascot, null),
          React.createElement("div", null,
            React.createElement("div", {style:{fontWeight:800,fontSize:16}}, "Hi — I’m Rosie."),
            React.createElement("div", {className:"small"}, "Admins can ask me for summaries and help. Family can update their own status.")
          )
        ),
        React.createElement("div", {className:"row", style:{marginTop:12}},
          React.createElement("input", {
            className:"input",
            value:prompt,
            onChange:e=>setPrompt(e.target.value),
            placeholder:"Ask Rosie…",
            onKeyDown:e=>{ if(e.key==="Enter") ask(); }
          }),
          React.createElement("button", {className:"btn btnPrimary", onClick:ask, disabled:busy}, busy ? "Thinking…" : "Ask")
        ),
        answer ? React.createElement("div", {className:"card", style:{marginTop:12, background:"rgba(0,0,0,.18)"}},
          React.createElement("div", {className:"small"}, "Reply"),
          React.createElement("div", {style:{whiteSpace:"pre-wrap", marginTop:6}}, answer)
        ) : null,
        (adminErr || meErr || dirErr) ? React.createElement("div", {className:"small", style:{marginTop:10}}, adminErr || meErr || dirErr) : null
      ),

      React.createElement("div", {className:"card"},
        React.createElement("div", {className:"cardTitle"},
          React.createElement("h2", null, "Family"),
          React.createElement("span", {className:"pill"}, "Status board")
        ),
        React.createElement("div", {className:"small"}, "Select a person. Everyone can edit their own status. Admins can edit anyone (after backend deploy)."),
        React.createElement("div", {className:"tabs"},
          ...familyTabs.map(t => React.createElement("button", {
            key:t,
            className: `tab ${selectedMember===t?"tabActive":""}`,
            onClick:()=>setSelectedMember(t)
          }, t))
        ),
        isAdmin ? React.createElement(\"div\", { className: \"row\", style: { marginTop: 10 } },
          React.createElement(\"input\", {
            className: \"input\",
            value: newPerson,
            onChange: e => setNewPerson(e.target.value),
            placeholder: \"Add person (e.g., Grandma Aisha)…\"
          }),
          React.createElement(\"button\", { className: \"btn btnPrimary\", onClick: addPerson, disabled: adding || !newPerson.trim() },
            adding ? \"Adding…\" : \"Add\"
          )
        ) : null,
        React.createElement("div", {className:"divider"}),
        React.createElement("div", {style:{display:"grid", gap:10}},
          React.createElement("div", {className:"small"}, "My Status"),
          React.createElement("div", null, "Current: ", React.createElement("b", null, meDoc?.status || "—")),
          React.createElement("div", {className:"row"},
            ...STATUS.map(s => React.createElement("button", {
              key:s,
              className:"btn",
              disabled: !me,
              onClick:()=>setStatus(s)
            }, s))
          ),
          !me ? React.createElement("div", {className:"small"}, "Sign in to update your status.") : null
        )
      )
    ),

    React.createElement(SettingsModal, {
      open: settingsOpen,
      onClose: ()=>setSettingsOpen(false),
      fb,
      me,
      isAdmin,
      adminsCount: admins.length,
      refreshAdmins
    })
  );
}


  async function addPerson() {
    if (!fb) return;
    if (!me) return;
    if (!isAdmin) { setAnswer("Master Admin only."); return; }
    const name = newPerson.trim();
    if (!name) return;
    setAdding(true);
    try {
      const ref = doc(fb.db, "familyDirectory", "members");
      const snap = await getDoc(ref);
      const members = snap.exists() ? (snap.data().members || []) : [];
      const list = Array.isArray(members) ? members.filter(x => typeof x === "string") : [];
      if (!list.includes(name)) list.push(name);
      await setDoc(ref, { members: list, updatedAt: serverTimestamp() }, { merge: true });
      setNewPerson("");
    } catch (e) {
      setAnswer(e?.message || "Failed to add person.");
    } finally {
      setAdding(false);
    }
  }

createRoot(document.getElementById("root")).render(React.createElement(App));
