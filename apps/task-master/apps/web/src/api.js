const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3333';

function authHeaders() {
  const apiKey = localStorage.getItem('task_api_key') || '';
  return apiKey ? { 'X-API-Key': apiKey } : {};
}

let onErrorCallback = null;
export function setApiErrorCallback(cb) {
  onErrorCallback = cb;
}

async function handle(r, label) {
  const j = await r.json().catch(() => null);

  // If API key is missing/invalid, force re-login.
  if (r.status === 401) {
    try {
      localStorage.removeItem('task_api_key');
      localStorage.removeItem('task_username');
    } catch {
      // ignore
    }
    // Reload so the app renders the login screen.
    try { window.location.reload(); } catch { /* ignore */ }
  }

  if (!r.ok) {
    const msg = (j && (j.message || j.error)) ? (j.message || j.error) : `${label} failed`;
    const e = new Error(msg);
    e.status = r.status;
    e.payload = j;

    if (onErrorCallback) {
      onErrorCallback(msg, e);
    }

    throw e;
  }
  return j;
}

export async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { ...authHeaders() }
  });
  return handle(r, `GET ${path}`);
}

export async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  return handle(r, `POST ${path}`);
}

export async function apiPatch(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  return handle(r, `PATCH ${path}`);
}

export async function apiDelete(path) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  });
  return handle(r, `DELETE ${path}`);
}

export async function apiReportClientError(payload) {
  try {
    await fetch(`${API_BASE}/api/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    // ignore
  }
}
