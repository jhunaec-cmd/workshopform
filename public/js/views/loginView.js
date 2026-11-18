// Login screen. On a brand-new install (no users yet) it sends you to setup instead.
import { api, saveSession } from "../api.js";
import { field } from "../utils.js";
import { go } from "../nav.js";

export async function renderLogin(container) {
  const { needsSetup } = await api("/auth/status");
  if (needsSetup) return go("#/setup");

  container.innerHTML = `
    <div class="auth-wrap">
      <section class="card">
        <h1>Log in</h1>
        <p class="lead">Use the username and password given by your admin.</p>
        <form novalidate>
          ${field("username", "Username", { attrs: 'autocomplete="username" autocapitalize="none" autofocus' })}
          ${field("password", "Password", { type: "password", attrs: 'autocomplete="current-password"' })}
          <p class="form-error" role="alert"></p>
          <button type="submit" class="btn btn-primary">Log in</button>
        </form>
      </section>
    </div>`;

  const form = container.querySelector("form");
  const errorEl = container.querySelector(".form-error");
  const button = form.querySelector("button");

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); // stop the browser reloading the page
    errorEl.textContent = "";
    button.disabled = true;
    button.textContent = "Logging in…";
    try {
      const { token, user } = await api("/auth/login", {
        method: "POST",
        body: { username: form.username.value, password: form.password.value },
      });
      saveSession(token, user);
      go(user.mustChangePassword ? "#/change-password" : "#/jobs");
    } catch (err) {
      errorEl.textContent = err.message;
      button.disabled = false;
      button.textContent = "Log in";
      form.password.select();
    }
  });
}
