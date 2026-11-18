// First-time setup: only shown when the app has no users at all.
// Whoever fills this in becomes the first admin.
import { api, saveSession } from "../api.js";
import { field } from "../utils.js";
import { go } from "../nav.js";

export async function renderSetup(container) {
  const { needsSetup } = await api("/auth/status");
  if (!needsSetup) return go("#/login");

  container.innerHTML = `
    <div class="auth-wrap">
      <section class="card">
        <h1>Welcome - first-time setup</h1>
        <p class="lead">Create the <strong>admin</strong> account. The admin can then add staff from the Users page.</p>
        <form novalidate>
          ${field("fullName", "Your full name", { attrs: 'autocomplete="name" autofocus' })}
          ${field("username", "Username", { attrs: 'autocomplete="username" autocapitalize="none"' })}
          <p class="hint">3-30 characters: letters, numbers, dot, dash or underscore.</p>
          ${field("password", "Password", { type: "password", attrs: 'autocomplete="new-password"' })}
          ${field("confirm", "Confirm password", { type: "password", attrs: 'autocomplete="new-password"' })}
          <p class="form-error" role="alert"></p>
          <button type="submit" class="btn btn-primary">Create admin account</button>
        </form>
      </section>
    </div>`;

  const form = container.querySelector("form");
  const errorEl = container.querySelector(".form-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    if (form.password.value !== form.confirm.value) {
      errorEl.textContent = "The two passwords don't match.";
      return;
    }
    try {
      const { token, user } = await api("/auth/setup", {
        method: "POST",
        body: { fullName: form.fullName.value, username: form.username.value, password: form.password.value },
      });
      saveSession(token, user);
      go("#/jobs");
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
