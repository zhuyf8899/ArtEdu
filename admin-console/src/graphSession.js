// Tab-local browsing state. No credentials are stored; account-specific drafts stay separate.
export function readGraphSession(key, fallback = null) {
  try { const value = JSON.parse(sessionStorage.getItem('artedu:graph:' + key) ?? 'null'); return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback; } catch { return fallback; }
}
export function writeGraphSession(key, value) { try { sessionStorage.setItem('artedu:graph:' + key, JSON.stringify(value)); } catch { /* Browsing remains available when storage is disabled. */ } }
export function clearGraphSessions() { try { for (const key of Object.keys(sessionStorage)) if (key.startsWith('artedu:graph:')) sessionStorage.removeItem(key); } catch {} }
