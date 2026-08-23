import { getState, save, replaceLocal } from './store.js';

let pushTimer = null;
let syncing = false;
export let lastSyncInfo = { backend: null, direction: null };

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const t = getState().token;
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

export function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushToServer, 2500);
}

async function pushToServer() {
  if (syncing) return;
  syncing = true;
  try {
    await fetch('/api/mbzuai/state', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ state: getState() }),
    });
  } catch {}
  syncing = false;
}

export async function pullAccountState() {
  try {
    const res = await fetch('/api/mbzuai/state', { headers: authHeaders() });
    if (!res.ok) { lastSyncInfo.direction = 'unavailable'; return lastSyncInfo; }
    const data = await res.json();
    lastSyncInfo.backend = data.backend;
    const server = data.state;
    const local = getState();
    const serverTs = server && typeof server.savedAt === 'number' ? server.savedAt : 0;
    const localTs = typeof local.savedAt === 'number' ? local.savedAt : 0;
    const localEmpty = !local.totals.attempted && !local.onboarded && !local.plan;

    if (server && (serverTs > localTs || (localEmpty && serverTs > 0))) {
      replaceLocal(server);
      save();
      lastSyncInfo.direction = 'pulled';
    } else if (!server && !localEmpty) {
      schedulePush();
      lastSyncInfo.direction = 'pushed-initial';
    } else if (localTs > serverTs && !localEmpty) {
      schedulePush();
      lastSyncInfo.direction = 'pushed';
    } else {
      lastSyncInfo.direction = 'in-sync';
    }
  } catch {
    lastSyncInfo.direction = 'offline';
  }
  return { ...lastSyncInfo };
}
