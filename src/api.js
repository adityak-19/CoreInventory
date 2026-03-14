const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  return localStorage.getItem("ci_token") || "";
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

export async function health() {
  return apiRequest("/health", { method: "GET" });
}

export async function signup(payload) {
  return apiRequest("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function login(payload) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function requestReset(payload) {
  return apiRequest("/auth/request-reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyReset(payload) {
  return apiRequest("/auth/verify-reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInventoryState() {
  return apiRequest("/inventory/state", { method: "GET" });
}

export async function saveInventoryState(payload) {
  return apiRequest("/inventory/state", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
