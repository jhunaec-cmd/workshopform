// Change password. Also forced on first login when an admin gave a temporary password.
import { api, getUser, saveUser } from "../api.js";
import { field, showToast } from "../utils.js";
import { go } from "../nav.js";

export async function renderChangePassword(container) {
  const user = getUser();
  const forced = user.mustChangePassword;

  container.innerHTML = `
    <div class="auth-wrap">
      <section class="card">
        <h1>Change password</h1>
        ${
          forced
            ? '<p class="notice">You are using a temporary password. Please choose your own password to continue.</p>'
            : '<p class="lead">Choose a password only you know.</p>'
        }
        <form novalidate>
          ${field("current", forced ? "Temporary password" : "Current password", { type: "password", attrs: 'autocomplete="current-password" autofocus' })}
          ${field("next", "New password", { type: "password", attrs: 'autocomplete="new-password"' })}
          <p class="hint">At least 6 characters.</p>
          ${field("confirm", "Confirm new password", { type: "password", attrs: 'autocomplete="new-password"' })}
          <p class="form-error" role="alert"></p>
          <button type="submit" class="btn btn-primary">Save new password</button>
          ${forced ? "" : '<a class="btn" href="#/jobs">Cancel</a>'}
        </form>
      </section>
    </div>`;

  const form = container.querySelector("form");
  const errorEl = container.querySelector(".form-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    if (form.next.value !== form.confirm.value) {
      errorEl.textContent = "The two new passwords don't match.";
      return;
    }
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword: form.current.value, newPassword: form.next.value },
      });
      saveUser({ ...user, mustChangePassword: false });
      showToast("Password changed.");
      go("#/jobs");
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
