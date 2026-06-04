const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const base = projectId ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents` : null;

export const firestoreSyncConfigured = Boolean(projectId && apiKey);

const str = (value) => ({ stringValue: String(value ?? "") });
const num = (value) => (value == null || Number.isNaN(Number(value)) ? { nullValue: null } : { integerValue: String(Math.round(Number(value))) });
const bool = (value) => ({ booleanValue: Boolean(value) });

function doc(name, fields) {
  return { update: { name, fields }, updateMask: { fieldPaths: Object.keys(fields) } };
}

export async function syncStoreSnapshot(payload) {
  if (!firestoreSyncConfigured) return { skipped: true };

  const { storeId, storeName, layoutWidth, layoutHeight, deviceId, deviceName, isMainDevice, tables } = payload;
  const now = Date.now();
  const writes = [];
  const safeStoreId = String(storeId || "default-store");
  const safeDeviceId = String(deviceId || "unknown-device");
  const storeDoc = `${base}/stores/${safeStoreId}`;

  writes.push(doc(storeDoc, {
    storeId: str(safeStoreId),
    name: str(storeName || safeStoreId),
    layoutWidth: num(layoutWidth),
    layoutHeight: num(layoutHeight),
    mainDeviceId: str(isMainDevice ? safeDeviceId : ""),
    mainDeviceName: str(isMainDevice ? deviceName || safeDeviceId : ""),
    updatedAtMs: num(now),
  }));

  writes.push(doc(`${base}/stores/${safeStoreId}/devices/${safeDeviceId}`, {
    deviceId: str(safeDeviceId),
    name: str(deviceName || safeDeviceId),
    isMainDevice: bool(isMainDevice),
    lastSeenAtMs: num(now),
    updatedAtMs: num(now),
  }));

  (tables || []).forEach((table) => {
    writes.push(doc(`${base}/stores/${safeStoreId}/tables/${table.tableId}`, {
      tableId: str(table.tableId),
      name: str(table.name),
      x: num(table.x),
      y: num(table.y),
      status: str(table.status),
      currentStage: str(table.currentStage || ""),
      nextTaskAt: num(table.nextTaskAt),
      servedAt: num(table.servedAt),
      scheduledServedAt: num(table.scheduledServedAt),
      estimatedEndAt: num(table.estimatedEndAt),
      timerId: str(table.timerId || ""),
      sourceDeviceId: str(safeDeviceId),
      updatedAtMs: num(now),
    }));

    if (table.timerId) {
      writes.push(doc(`${base}/stores/${safeStoreId}/timers/${table.timerId}`, {
        timerId: str(table.timerId),
        tableId: str(table.tableId),
        status: str(table.status),
        currentStage: str(table.currentStage || ""),
        nextTaskAt: num(table.nextTaskAt),
        servedAt: num(table.servedAt),
        estimatedEndAt: num(table.estimatedEndAt),
        sourceDeviceId: str(safeDeviceId),
        updatedAtMs: num(now),
      }));
    }
  });

  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Firestore commit failed: ${response.status} ${message}`);
  }

  return { skipped: false, writes: writes.length };
}
