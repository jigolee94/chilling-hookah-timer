const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const base = projectId ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents` : null;

const str = (v) => ({ stringValue: String(v ?? "") });
const num = (v) => (v == null ? { nullValue: null } : { integerValue: String(Math.round(Number(v))) });

function doc(name, fields) {
  return { update: { name, fields }, updateMask: { fieldPaths: Object.keys(fields) } };
}

export async function syncStoreSnapshot(payload) {
  if (!base || !apiKey) return;
  const { storeId, storeName, layoutWidth, layoutHeight, tables } = payload;
  const writes = [];
  const storeDoc = `${base}/stores/${storeId}`;
  writes.push(doc(storeDoc, { storeId: str(storeId), name: str(storeName), layoutWidth: num(layoutWidth), layoutHeight: num(layoutHeight), updatedAtMs: num(Date.now()) }));

  tables.forEach((t) => {
    writes.push(doc(`${base}/stores/${storeId}/tables/${t.tableId}`, {
      tableId: str(t.tableId), name: str(t.name), x: num(t.x), y: num(t.y), status: str(t.status), currentStage: str(t.currentStage || ""),
      nextTaskAt: num(t.nextTaskAt), servedAt: num(t.servedAt), scheduledServedAt: num(t.scheduledServedAt), estimatedEndAt: num(t.estimatedEndAt), updatedAtMs: num(Date.now())
    }));
    if (t.timerId) writes.push(doc(`${base}/stores/${storeId}/timers/${t.timerId}`, { timerId: str(t.timerId), tableId: str(t.tableId), status: str(t.status), currentStage: str(t.currentStage || ""), nextTaskAt: num(t.nextTaskAt), servedAt: num(t.servedAt), estimatedEndAt: num(t.estimatedEndAt), updatedAtMs: num(Date.now()) }));
  });

  await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writes })
  });
}
