// Everything the app remembers lives on the device only (localStorage).
// Nothing is ever sent anywhere.

const KEY = "531-calculator:v1";
const BACKUP_KEY = "531-calculator:lastBackup";
export const APP_ID = "531-calculator";
export const REMIND_AFTER_DAYS = 14;

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable — app still works, just won't remember */
  }
}

export function getLastBackup() {
  try {
    const v = localStorage.getItem(BACKUP_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function setLastBackup(ts) {
  try {
    localStorage.setItem(BACKUP_KEY, String(ts));
  } catch { /* ignore */ }
}

// Ask the browser not to evict our data under storage pressure.
// Best effort: iOS may or may not honour it.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch { /* ignore */ }
}

// Export: on iPhone this opens the share sheet ("Save to Files", AirDrop, …).
// Elsewhere it falls back to a normal download.
export async function exportBackup(state) {
  const now = Date.now();
  const payload = { app: APP_ID, version: 1, exportedAt: new Date(now).toISOString(), data: state };
  const json = JSON.stringify(payload, null, 2);
  const date = new Date(now).toISOString().slice(0, 10);
  const filename = `531-backup-${date}.json`;
  const file = new File([json], filename, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "5/3/1 backup" });
      setLastBackup(now);
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setLastBackup(now);
  return "downloaded";
}

// Import: validates the file before touching anything.
export async function readBackupFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!parsed || parsed.app !== APP_ID || typeof parsed.data !== "object" || !parsed.data) {
    throw new Error("That doesn't look like a 5/3/1 backup file.");
  }
  setLastBackup(Date.now()); // the imported data now has a backup by definition
  return parsed.data;
}
