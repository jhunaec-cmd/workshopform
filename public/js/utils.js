// Small reusable helpers used by several screens.

// ALWAYS pass user-typed text through this before putting it into HTML.
// It stops text like "<script>" from being run as code (an XSS attack).
export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// Today's date as YYYY-MM-DD in the device's own time zone (what <input type="date"> wants).
export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// "2026-11-18" -> "18 Nov 2026"
export const formatDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// The server stores times in UTC ("2026-11-18 03:15:00"); show them in local time.
export const formatDateTime = (utc) => {
  if (!utc) return "";
  return new Date(`${utc.replace(" ", "T")}Z`).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Coloured badge for a job status - colour is picked by the status's position in the list.
export const statusBadge = (status, statuses) =>
  `<span class="badge badge-s${statuses.indexOf(status)}">${escapeHtml(status)}</span>`;

// Short pop-up message at the bottom of the screen.
let toastTimer;
export const showToast = (message, type = "ok") => {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", type === "error");
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
};

// Waits until the user stops typing before running fn (used for live search).
export const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

// Builds one labelled form field. Keeps every input's <label> correctly
// linked to it (for accessibility) without repeating the same HTML everywhere.
export const field = (name, label, { type = "text", value = "", required = false, placeholder = "", attrs = "", className = "" } = {}) => {
  const id = `f-${name}`;
  const star = required ? ' <span class="req" aria-hidden="true">*</span>' : "";
  const req = required ? 'required aria-required="true"' : "";
  const control =
    type === "textarea"
      ? `<textarea id="${id}" name="${name}" rows="3" placeholder="${escapeHtml(placeholder)}" ${req} ${attrs}>${escapeHtml(value)}</textarea>`
      : `<input id="${id}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${req} ${attrs} />`;
  return `<div class="field ${className}"><label for="${id}">${label}${star}</label>${control}</div>`;
};
