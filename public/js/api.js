// Small helpers for talking to the server. They attach the login token,
// turn the reply into JSON, and handle "you've been logged out".

const TOKEN_KEY = "aecws_token";
const USER_KEY = "aecws_user";

// localStorage can throw in some private-browsing modes - never let that crash the app.
const store = {
  get: (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  },
  remove: (key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export const getToken = () => store.get(TOKEN_KEY);

export const getUser = () => {
  try {
    return JSON.parse(store.get(USER_KEY)) || null;
  } catch {
    return null;
  }
};

export const saveSession = (token, user) => {
  store.set(TOKEN_KEY, token);
  store.set(USER_KEY, JSON.stringify(user));
};

export const saveUser = (user) => store.set(USER_KEY, JSON.stringify(user));

export const clearSession = () => {
  store.remove(TOKEN_KEY);
  store.remove(USER_KEY);
  metaCache = null;
};

const readJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

// The one function every screen uses to call the server.
// Example: await api("/jobs", { method: "POST", body: { ... } })
export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Check your internet / Wi-Fi connection and try again.");
  }

  const data = await readJson(res);

  // Token expired or account deactivated -> back to the login screen.
  // (Not for the login request itself - it shows its own message.)
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    clearSession();
    location.hash = "#/login";
  }
  if (data?.code === "MUST_CHANGE_PASSWORD") {
    location.hash = "#/change-password";
  }
  if (!res.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
  return data;
}

// Sends a file (a Blob) as the raw request body, e.g. a JPEG photo.
export async function apiUpload(path, blob) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": blob.type, ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: blob,
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  const data = await readJson(res);
  if (res.status === 401) {
    clearSession();
    location.hash = "#/login";
  }
  if (!res.ok) throw new Error(data?.error || "Upload failed. Please try again.");
  return data;
}

// Downloads a picture and returns a temporary URL an <img> can show.
export async function apiBlobUrl(path) {
  const res = await fetch(`/api${path}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) throw new Error("Could not load the photo.");
  return URL.createObjectURL(await res.blob());
}

// Downloads a file from the server and saves it to the device. The file
// name comes from the server's Content-Disposition header.
export async function apiDownload(path) {
  let res;
  try {
    res = await fetch(`/api${path}`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const data = await readJson(res);
    throw new Error(data?.error || "Download failed. Please try again.");
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "download";
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Job statuses + procedure steps come from the server once, then are reused.
let metaCache = null;
export const getMeta = async () => {
  metaCache ??= await api("/meta");
  return metaCache;
};
