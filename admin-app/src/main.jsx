import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const statusText = { empty: "비어있음", active: "정상 진행 중", critical_1m: "1분 이하 임박", needs_confirm: "확인 필요", recommend_refill: "후카 추가 추천" };

const i = (f) => (f?.integerValue ? Number(f.integerValue) : null);
const s = (f) => (f?.stringValue ? f.stringValue : "");
const fromDoc = (d) => ({
  id: d.name.split("/").pop(),
  ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, s(v) || i(v)])),
});

async function list(path) {
  const r = await fetch(`${base}/${path}?key=${apiKey}`);
  const j = await r.json();
  return (j.documents || []).map(fromDoc);
}

function App() {
  const [stores, setStores] = useState([]); const [selected, setSelected] = useState(null); const [tables, setTables] = useState([]);
  useEffect(() => { let on=true; const poll=async()=>{if(!on) return; setStores(await list("stores")); setTimeout(poll,5000);}; poll(); return ()=>{on=false}; }, []);
  useEffect(() => { if (!selected) return; let on=true; const poll=async()=>{if(!on) return; setTables(await list(`stores/${selected.id}/tables`)); setTimeout(poll,3000);}; poll(); return ()=>{on=false}; }, [selected]);
  const isFull = tables.length > 0 && tables.every((t) => t.status && t.status !== "empty");
  const fastest = useMemo(() => tables.filter((t) => t.estimatedEndAt).sort((a,b)=>a.estimatedEndAt-b.estimatedEndAt)[0], [tables]);
  if (!selected) return <div style={{padding:16}}><h2>지점 목록</h2>{stores.map((st)=><button key={st.id} onClick={()=>setSelected(st)} style={{display:'block',margin:'8px 0'}}>{st.name || st.id}</button>)}</div>;
  return <div style={{padding:16}}><button onClick={()=>setSelected(null)}>뒤로</button><h2>{selected.name}</h2>{isFull && fastest && <div>만석 · 가장 빨리 비는 테이블: {fastest.name} / {new Date(fastest.estimatedEndAt).toLocaleTimeString()}</div>}<div style={{position:'relative',height:700,border:'1px solid #ccc'}}>{tables.map((t)=>{const left=((t.x||0)/(selected.layoutWidth||100))*100; const top=((t.y||0)/(selected.layoutHeight||140))*100; const est=t.estimatedEndAt || ((t.servedAt||t.scheduledServedAt)?(t.servedAt||t.scheduledServedAt)+90*60*1000:null); return <div key={t.id} style={{position:'absolute',left:`${left}%`,top:`${top}%`,padding:8,background:'#fff',border:'1px solid #333'}}><div>{t.name}</div><div>{statusText[t.status]||t.status}</div><div>현재 단계: {t.currentStage || '-'}</div><div>후카 나간 시간: {t.servedAt ? new Date(t.servedAt).toLocaleTimeString() : '-'}</div><div>손님 후카 종료 예상: {est ? new Date(est).toLocaleTimeString() : '-'}</div><div>다음 작업 남은시간: {t.nextTaskAt ? Math.floor((t.nextTaskAt-Date.now())/1000) : '-'}초</div></div>;})}</div></div>;
}
createRoot(document.getElementById("root")).render(<App />);
