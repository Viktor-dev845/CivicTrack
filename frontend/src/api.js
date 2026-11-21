// All requests go to Vite's dev-server proxy -> Core API (port 4000)
const BASE = "/api";

// Umuahia, Abia State — pilot city default map center
export const UMUAHIA = [5.532, 7.486];

export const CATEGORY_LABELS = {
  pothole: "Pothole",
  damaged_streetlight: "Damaged streetlight",
  waste_dump: "Waste dump",
  drainage: "Drainage problem",
};

export const STATUS_LABELS = {
  reported: "Reported",
  in_progress: "In progress",
  resolved: "Resolved",
};

export const SEVERITY_COLORS = { low: "#2a8a68", medium: "#e07b1a", high: "#c7372f" };

let _token = localStorage.getItem("ct_token") || "";

export function setToken(t) {
  _token = t || "";
  if (t) localStorage.setItem("ct_token", t);
  else localStorage.removeItem("ct_token");
}

export function getToken() { return _token; }

export async function api(path, { method = "GET", json } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function apiUpload(path, formData) {
  const headers = {};
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}
