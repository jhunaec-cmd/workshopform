// Users page (admins only): add staff, change role, reset password, deactivate.
import { api, getUser, saveUser } from "../api.js";
import { escapeHtml, field, formatDateTime, showToast } from "../utils.js";
import { go } from "../nav.js";

export async function renderUsers(container) {
  const me = getUser();
  const users = await api("/users");

  container.innerHTML = `
    <div class="page-head"><h1 class="page-title">Users</h1></div>

    <section class="card" aria-labelledby="h-add">
      <h2 class="card-title" id="h-add">Add a user</h2>
      <form id="add-user" novalidate>
        <div class="grid grid-4">
          ${field("fullName", "Full name", { required: true, attrs: 'autocomplete="off"' })}
          ${field("username", "Username", { required: true, attrs: 'autocomplete="off" autocapitalize="none"' })}
          <div class="field">
            <label for="f-role">Role</label>
            <select id="f-role" name="role">
              <option value="staff">Staff - create &amp; update jobs</option>
              <option value="admin">Admin - also check/lock jobs &amp; manage users</option>
            </select>
          </div>
          ${field("password", "Temporary password", { required: true, attrs: 'autocomplete="new-password"' })}
        </div>
        <p class="hint">Give the person their username and temporary password. They will be asked to choose their own password at first login.</p>
        <p class="form-error" role="alert"></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Add user</button></div>
      </form>
    </section>

    <section class="card" aria-labelledby="h-list">
      <h2 class="card-title" id="h-list">All users (${users.length})</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th scope="col">Name</th><th scope="col">Username</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr>
          </thead>
          <tbody>${users.map((u) => userRow(u, me)).join("")}</tbody>
        </table>
      </div>
    </section>`;

  // Add user
  const addForm = container.querySelector("#add-user");
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = addForm.querySelector(".form-error");
    errorEl.textContent = "";
    try {
      await api("/users", {
        method: "POST",
        body: {
          fullName: addForm.fullName.value,
          username: addForm.username.value,
          role: addForm.role.value,
          password: addForm.password.value,
        },
      });
      showToast(`User “${addForm.username.value.trim().toLowerCase()}” added.`);
      go("#/users");
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // Row buttons (one listener for the whole table)
  container.querySelector("tbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const user = users.find((u) => u.id === Number(btn.dataset.id));

    try {
      if (btn.dataset.action === "rename") {
        const name = prompt(`New full name for @${user.username}:`, user.full_name);
        if (name === null || !name.trim()) return;
        await api(`/users/${user.id}`, { method: "PUT", body: { fullName: name } });
        if (user.id === me.id) saveUser({ ...me, fullName: name.trim() });
        showToast("Name updated.");
      }

      if (btn.dataset.action === "role") {
        const newRole = user.role === "admin" ? "staff" : "admin";
        if (!confirm(`Change ${user.full_name} to ${newRole}?`)) return;
        await api(`/users/${user.id}`, { method: "PUT", body: { role: newRole } });
        showToast(`${user.full_name} is now ${newRole}.`);
      }

      if (btn.dataset.action === "reset") {
        const pw = prompt(`Type a new TEMPORARY password for ${user.full_name} (at least 6 characters).\nThey must change it when they next log in.`);
        if (pw === null) return;
        await api(`/users/${user.id}/reset-password`, { method: "POST", body: { password: pw } });
        showToast("Password reset. Tell them the temporary password.");
      }

      if (btn.dataset.action === "active") {
        const activate = !user.active;
        if (!activate && !confirm(`Deactivate ${user.full_name}? They will be logged out and can't log in again until reactivated. Their jobs are kept.`)) return;
        await api(`/users/${user.id}/active`, { method: "POST", body: { active: activate } });
        showToast(activate ? "User reactivated." : "User deactivated.");
      }

      go("#/users"); // redraw with fresh data
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

function userRow(u, me) {
  const isMe = u.id === me.id;
  const status = !u.active ? "Deactivated" : u.must_change_password ? "Must set password" : "Active";
  const btn = (action, label, extra = "") =>
    `<button type="button" class="btn btn-small ${extra}" data-action="${action}" data-id="${u.id}">${label}</button>`;

  return `
    <tr class="${u.active ? "" : "inactive"}">
      <td><strong>${escapeHtml(u.full_name)}</strong>${isMe ? " (you)" : ""}<br />
        <span class="hint">Added ${formatDateTime(u.created_at)}</span></td>
      <td>@${escapeHtml(u.username)}</td>
      <td>${u.role === "admin" ? "Admin" : "Staff"}</td>
      <td>${status}</td>
      <td>
        <div class="row-actions">
          ${btn("rename", "Rename")}
          ${isMe ? "" : btn("role", u.role === "admin" ? "Make staff" : "Make admin")}
          ${btn("reset", "Reset password")}
          ${isMe ? "" : btn("active", u.active ? "Deactivate" : "Reactivate", u.active ? "btn-danger" : "")}
        </div>
      </td>
    </tr>`;
}
