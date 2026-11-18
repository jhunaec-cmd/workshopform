// App start-up + the "router": looks at the #/... part of the address and
// shows the matching screen. Also draws the header on every screen.
import { api, getToken, getUser, saveUser, clearSession } from "./api.js";
import { escapeHtml } from "./utils.js";
import { go, setDirtyCheck, hasUnsavedChanges } from "./nav.js";
import { renderLogin } from "./views/loginView.js";
import { renderSetup } from "./views/setupView.js";
import { renderChangePassword } from "./views/changePasswordView.js";
import { renderJobList } from "./views/jobListView.js";
import { renderJobForm } from "./views/jobFormView.js";
import { renderUsers } from "./views/usersView.js";

// access: "public" = logged-out only, "user" = any logged-in user, "admin" = admins only
const routes = [
  { path: /^#\/login$/, view: renderLogin, access: "public" },
  { path: /^#\/setup$/, view: renderSetup, access: "public" },
  { path: /^#\/change-password$/, view: renderChangePassword, access: "user" },
  { path: /^#\/jobs$/, view: renderJobList, access: "user" },
  { path: /^#\/jobs\/new$/, view: (el) => renderJobForm(el, {}), access: "user" },
  { path: /^#\/jobs\/(\d+)$/, view: (el, match) => renderJobForm(el, { id: match[1] }), access: "user" },
  { path: /^#\/users$/, view: renderUsers, access: "admin" },
];

const main = document.getElementById("main");
const header = document.getElementById("app-header");
let shownHash = null; // the screen currently on display
let renderCount = 0;

// ---------- Header ----------
function renderHeader(user, hash) {
  const showNav = user && !user.mustChangePassword;
  const isActive = (href) => hash === href || (href === "#/jobs" && /^#\/jobs\/\d+$/.test(hash));
  const link = (href, text) =>
    `<li><a class="btn" href="${href}" ${isActive(href) ? 'aria-current="page"' : ""}>${text}</a></li>`;
  const initials = user ? user.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "";

  header.innerHTML = `
    <div class="header-inner">
      <a class="brand" href="${user ? "#/jobs" : "#/login"}">
        <span class="brand-title"><span class="brand-badge">AEC</span> Workshop</span>
        <span class="brand-sub">Procedure of Work Checklist (Internal Record)</span>
      </a>
      ${
        showNav
          ? `<nav class="main-nav" aria-label="Main">
              <ul>
                ${link("#/jobs/new", "New job")}
                ${link("#/jobs", "Job records")}
                ${user.role === "admin" ? link("#/users", "Users") : ""}
              </ul>
            </nav>`
          : ""
      }
      ${
        user
          ? `<details class="user-menu">
              <summary aria-label="Account menu for ${escapeHtml(user.fullName)}">
                <span class="user-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
              </summary>
              <div class="user-menu-panel">
                <p><strong>${escapeHtml(user.fullName)}</strong><br />@${escapeHtml(user.username)} · ${user.role === "admin" ? "Admin" : "Staff"}</p>
                <a href="#/change-password">Change password</a>
                <button type="button" data-action="logout">Log out</button>
              </div>
            </details>`
          : ""
      }
    </div>`;

  header.querySelector('[data-action="logout"]')?.addEventListener("click", logout);
}

// Close the account menu when clicking anywhere else.
document.addEventListener("click", (e) => {
  const menu = header.querySelector(".user-menu[open]");
  if (menu && !menu.contains(e.target)) menu.removeAttribute("open");
});

function logout() {
  if (hasUnsavedChanges() && !confirm("You have unsaved changes. Log out anyway?")) return;
  setDirtyCheck(null);
  clearSession();
  go("#/login");
}

// ---------- Router ----------
async function router() {
  const hash = location.hash;

  // Leaving a form with unsaved edits? Ask first; if they say no, undo the navigation.
  if (hash !== shownHash && hasUnsavedChanges()) {
    if (!confirm("You have unsaved changes. Leave this page without saving?")) {
      history.replaceState(null, "", shownHash);
      return;
    }
  }
  setDirtyCheck(null);

  const user = getUser();
  const route = routes.find((r) => r.path.test(hash));

  // Redirect rules
  if (!route) return go(user ? "#/jobs" : "#/login");
  if (route.access !== "public" && !user) return go("#/login");
  if (route.access === "public" && user) return go("#/jobs");
  if (user?.mustChangePassword && hash !== "#/change-password") return go("#/change-password");
  if (route.access === "admin" && user.role !== "admin") return go("#/jobs");

  shownHash = hash;
  header.querySelector(".user-menu")?.removeAttribute("open");
  renderHeader(user, hash);

  // Each screen draws into a fresh box, swapped in only when ready. If the
  // user clicked somewhere else meanwhile, the older screen is thrown away.
  const ticket = ++renderCount;
  const screen = document.createElement("div");
  main.innerHTML = '<p class="loading">Loading…</p>';
  try {
    await route.view(screen, hash.match(route.path));
  } catch (err) {
    screen.innerHTML = `
      <section class="card">
        <h1 class="page-title">Something went wrong</h1>
        <p>${escapeHtml(err.message)}</p>
        <a class="btn" href="#/jobs">Back to job records</a>
      </section>`;
  }
  if (ticket !== renderCount) return;
  main.replaceChildren(screen);
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true }); // screen readers start reading the new screen
  screen.querySelector("[autofocus]")?.focus();
}

// Warn before closing the tab/app with unsaved edits.
window.addEventListener("beforeunload", (e) => {
  if (hasUnsavedChanges()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---------- Start ----------
async function start() {
  if (getToken()) {
    // Refresh name/role from the server in case an admin changed them.
    try {
      saveUser(await api("/auth/me"));
    } catch {
      /* offline or logged out - api() already handled it */
    }
  }
  window.addEventListener("hashchange", router);
  if (!location.hash) history.replaceState(null, "", "#/jobs");
  router();
}

start();
