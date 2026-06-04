const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const documentBase = projectId ? `projects/${projectId}/databases/(default)/documents` : null;
const APP_ID = "chilling-hookah-timer";
const AUTH_STORAGE_KEY = "chilling-timer-firebase-auth";
const TOKEN_REFRESH_BUFFER_MS = 60_000;

export const firestoreSyncConfigured = Boolean(projectId && apiKey);

const str = (value) => ({ stringValue: String(value ?? "") });
const num = (value) => (value == null || Number.isNaN(Number(value)) ? { nullValue: null } : { integerValue: String(Math.round(Number(value))) });
const bool = (value) => ({ booleanValue: Boolean(value) });

function doc(name, fields) {
  return { update: { name, fields }, updateMask: { fieldPaths: Object.keys(fields) } };
}

function readCachedAuth() {
  try {
    const cached = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    return cached && typeof cached === "object" ? cached : null;
  } catch {
    return null;
  }
}

function cacheAuth(session) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Auth can still work for this tab even if localStorage is unavailable.
  }
}

async function postAuth(url, body) {
  const response = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Firebase Auth failed");
  return data;
}

async function refreshAuthSession(refreshToken) {
  const data = await postAuth("https://securetoken.googleapis.com/v1/token", {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    localId: data.user_id,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
}

async function createAuthSession() {
  const data = await postAuth("https://identitytoolkit.googleapis.com/v1/accounts:signUp", {
    returnSecureToken: true,
  });

  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    localId: data.localId,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
  };
}

async function getAuthSession() {
  const cached = readCachedAuth();
  if (cached?.idToken && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) return cached;

  const session = cached?.refreshToken
    ? await refreshAuthSession(cached.refreshToken).catch(() => createAuthSession())
    : await createAuthSession();

  cacheAuth(session);
  return session;
}

export async function syncStoreSnapshot(payload) {
  if (!firestoreSyncConfigured) return { skipped: true };

  const authSession = await getAuthSession();
  const { storeId, storeName, layoutWidth, layoutHeight, deviceId, deviceName, isMainDevice, tables } = payload;
  const now = Date.now();
  const writes = [];
  const safeStoreId = String(storeId || "default-store");
  const safeDeviceId = String(deviceId || "unknown-device");
  const storeDoc = `${documentBase}/stores/${safeStoreId}`;

  writes.push(doc(storeDoc, {
    app: str(APP_ID),
    ownerUid: str(authSession.localId),
    storeId: str(safeStoreId),
    name: str(storeName || safeStoreId),
    layoutWidth: num(layoutWidth),
    layoutHeight: num(layoutHeight),
    mainDeviceId: str(isMainDevice ? safeDeviceId : ""),
    mainDeviceName: str(isMainDevice ? deviceName || safeDeviceId : ""),
    updatedAtMs: num(now),
  }));

  writes.push(doc(`${documentBase}/stores/${safeStoreId}/devices/${safeDeviceId}`, {
    app: str(APP_ID),
    ownerUid: str(authSession.localId),
    storeId: str(safeStoreId),
    deviceId: str(safeDeviceId),
    name: str(deviceName || safeDeviceId),
    isMainDevice: bool(isMainDevice),
    lastSeenAtMs: num(now),
    updatedAtMs: num(now),
  }));

  (tables || []).forEach((table) => {
    writes.push(doc(`${documentBase}/stores/${safeStoreId}/tables/${table.tableId}`, {
      app: str(APP_ID),
      ownerUid: str(authSession.localId),
      storeId: str(safeStoreId),
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
      writes.push(doc(`${documentBase}/stores/${safeStoreId}/timers/${table.timerId}`, {
        app: str(APP_ID),
        ownerUid: str(authSession.localId),
        storeId: str(safeStoreId),
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.idToken}` },
    body: JSON.stringify({ writes }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Firestore commit failed: ${response.status} ${message}`);
  }

  return { skipped: false, writes: writes.length };
}
