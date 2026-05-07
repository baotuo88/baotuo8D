function isLoopbackHost(hostname) {
  const normalized = String(hostname ?? "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function normalizeExplicitApiBase(explicit) {
  if (!explicit || typeof window === "undefined") {
    return explicit;
  }

  try {
    const url = new URL(explicit, window.location.origin);
    const pageHost = window.location.hostname || "localhost";

    if (isLoopbackHost(url.hostname) && !isLoopbackHost(pageHost)) {
      url.hostname = pageHost;
      return url.toString().replace(/\/$/, "");
    }

    return url.toString().replace(/\/$/, "");
  } catch (_error) {
    return explicit;
  }
}

function resolveApiBase() {
  const explicit = String(import.meta.env.VITE_API_BASE ?? "").trim();

  if (explicit) {
    return normalizeExplicitApiBase(explicit);
  }

  if (typeof window === "undefined") {
    return "/api";
  }

  const { protocol, hostname, port } = window.location;
  const host = hostname || "localhost";

  if (import.meta.env.DEV) {
    return `${protocol}//${host}:8080/api`;
  }

  return "/api";
}

const API_BASE = resolveApiBase();
const SESSION_KEY = "eightd-session";

function parseResponseBody(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { message: text };
  }
}

export function getStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export function setStoredSession(session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function apiRequest(path, { method = "GET", token = "", body, headers = {} } = {}) {
  const url = `${API_BASE}${path}`;
  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw new Error(`Unable to reach API: ${url}`);
  }

  const text = await response.text();
  const json = parseResponseBody(text);

  if (!response.ok) {
    throw new Error(json.message || `Request failed (${response.status} ${response.statusText})`);
  }

  return json;
}
