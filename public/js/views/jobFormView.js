// The job form - New job (#/jobs/new) and view/edit an existing job (#/jobs/12).
// Same sections as the paper form: Job details, Work summary,
// Procedure checklist, Sign-off - plus an Activity log for saved jobs.
import { api, getMeta, getUser } from "../api.js";
import { escapeHtml, field, todayISO, formatDateTime, statusBadge, showToast } from "../utils.js";
import { go, setDirtyCheck } from "../nav.js";
// Every input the server saves (checklist is handled separately).
const FIELDS = [
  "date_received", "customer_name", "contact_no", "unit_model", "serial_no", "job_ref_no",
  "br_no", "received_by", "technician", "complaint", "findings", "action_update", "quotation", "job_status",
];
const REQUIRED = ["date_received", "customer_name", "unit_model"];

export async function renderJobForm(container, { id } = {}) {
  const user = getUser();
  const isAdmin = user.role === "admin";
  const meta = await getMeta();
  const job = id ? await api(`/jobs/${id}`) : null;
  const locked = Boolean(job?.locked);

  // Value for a field: the saved value when editing, otherwise a default.
  const val = (name, fallback = "") => (job ? job[name] ?? "" : fallback);
  const steps = meta.procedures.map((_, i) => job?.checklist?.[i] || { done: false, date: "", remarks: "" });

  container.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">${job ? `Job <span class="mono">${escapeHtml(job.form_no)}</span>` : "New job"}</h1>
      ${job ? statusBadge(job.job_status, meta.statuses) : ""}
      ${locked ? '<span class="badge badge-locked">Checked &amp; locked</span>' : ""}
    </div>

    ${
      locked
        ? `<p class="notice notice-success no-print">
            Checked by <strong>${escapeHtml(job.checked_by)}</strong> on ${formatDateTime(job.checked_at)}.
            This job is locked. ${isAdmin ? "Use “Reopen for editing” to change it." : "Ask an admin if it needs changing."}
          </p>`
        : ""
    }

    <form id="job-form" novalidate>
      <!-- One <fieldset disabled> greys out every input at once when the job is locked -->
      <fieldset class="plain-fieldset" ${locked ? "disabled" : ""}>
        <legend class="visually-hidden">Job form</legend>

        <section class="card" aria-labelledby="h-details">
          <h2 class="card-title" id="h-details">Job details</h2>
          <div class="grid grid-4">
            <div class="field">
              <label for="f-form_no">Form No.</label>
              <input id="f-form_no" type="text" readonly value="${escapeHtml(job ? job.form_no : "Assigned when saved")}" />
            </div>
            ${field("date_received", "Date received", { type: "date", required: true, value: val("date_received", todayISO()) })}
            ${field("customer_name", "Customer name", { required: true, value: val("customer_name"), attrs: 'autocomplete="off"' })}
            ${field("contact_no", "Contact no.", { type: "tel", value: val("contact_no"), attrs: 'inputmode="tel"' })}
            ${field("unit_model", "Unit brand / model", { required: true, value: val("unit_model"), placeholder: "Panasonic CS-S29NKH" })}
            ${field("serial_no", "Serial no.", { value: val("serial_no") })}
            ${field("job_ref_no", "Job / Ref. no.", { value: val("job_ref_no") })}
            ${field("br_no", "BR no.", { value: val("br_no"), placeholder: "28419" })}
            ${field("received_by", "Received by", { value: val("received_by", user.fullName) })}
            ${field("technician", "Technician", { value: val("technician") })}
          </div>
        </section>

        <section class="card" aria-labelledby="h-summary">
          <h2 class="card-title" id="h-summary">Work summary</h2>
          <div class="grid grid-3">
            ${field("complaint", "Customer complaint", { type: "textarea", value: val("complaint") })}
            ${field("findings", "Findings (check the unit)", { type: "textarea", value: val("findings") })}
            ${field("action_update", "Action / update", { type: "textarea", value: val("action_update") })}
            ${field("quotation", "Quotation", { type: "textarea", value: val("quotation"), placeholder: "e.g. Submitted to Nana" })}
            <div class="field span-all">
              <label for="f-job_status">Job status</label>
              <select id="f-job_status" name="job_status">
                ${meta.statuses
                  .map((s) => `<option ${s === val("job_status", meta.statuses[0]) ? "selected" : ""}>${escapeHtml(s)}</option>`)
                  .join("")}
              </select>
            </div>
          </div>
        </section>

        <section class="card" aria-labelledby="h-checklist">
          <h2 class="card-title" id="h-checklist">Procedure checklist</h2>
          <p class="hint no-print">Ticking “Done” fills in today’s date automatically.</p>
          <table class="checklist">
            <thead>
              <tr><th scope="col">No.</th><th scope="col">Procedure</th><th scope="col">Done</th><th scope="col">Date</th><th scope="col">Remarks / initial</th></tr>
            </thead>
            <tbody>
              ${meta.procedures.map((name, i) => checklistRow(name, i, steps[i])).join("")}
            </tbody>
          </table>
        </section>

        <section class="card" aria-labelledby="h-signoff">
          <h2 class="card-title" id="h-signoff">Sign-off</h2>
          <div class="grid grid-2">
            <div class="field">
              <label for="f-prepared">Prepared by (name)</label>
              <input id="f-prepared" type="text" readonly value="${escapeHtml(job ? job.prepared_by : user.fullName)}" />
            </div>
            <div class="field">
              <label for="f-checked">Checked by (name)</label>
              <input id="f-checked" type="text" readonly value="${escapeHtml(job?.checked_by || "")}" placeholder="Filled in when an admin checks the job" />
            </div>
          </div>
        </section>
      </fieldset>

      <p class="form-error" role="alert" id="form-error"></p>

      <div class="form-actions">
        ${locked ? "" : '<button type="submit" class="btn btn-primary" data-action="save">Save job</button>'}
        ${job ? "" : '<button type="button" class="btn" data-action="clear">Clear form</button>'}
        ${job ? '<button type="button" class="btn" data-action="print">Save as PDF / Print</button>' : ""}
        ${job && isAdmin && !locked ? '<button type="button" class="btn btn-dark" data-action="check">Mark as checked &amp; lock</button>' : ""}
        ${job && isAdmin && locked ? '<button type="button" class="btn" data-action="reopen">Reopen for editing</button>' : ""}
        ${job && isAdmin ? '<button type="button" class="btn btn-danger" data-action="delete">Delete job</button>' : ""}
      </div>
    </form>

    ${job ? historySection(job.history) : ""}`;

  wireUp(container, { job, meta });}

// One row of the procedure checklist. On phones CSS turns it into a small card.
function checklistRow(name, i, step) {
  const n = i + 1;
  return `
    <tr class="${step.done ? "is-done" : ""}">
      <td class="c-no">${n}</td>
      <td class="c-name" id="step-${i}-name">${escapeHtml(name)}</td>
      <td class="c-done">
        <input type="checkbox" name="step-${i}-done" ${step.done ? "checked" : ""}
          aria-label="Step ${n} done: ${escapeHtml(name)}" />
      </td>
      <td class="c-date">
        <input type="date" name="step-${i}-date" value="${escapeHtml(step.date)}" aria-label="Step ${n} date" />
      </td>
      <td class="c-rem">
        <input type="text" name="step-${i}-remarks" value="${escapeHtml(step.remarks)}" maxlength="200"
          placeholder="Remarks / initial" aria-label="Step ${n} remarks or initial" />
      </td>
    </tr>`;
}

function historySection(history) {
  if (!history?.length) return "";
  return `
    <section class="card no-print" aria-labelledby="h-history">
      <h2 class="card-title" id="h-history">Activity log</h2>
      <ol class="history">
        ${history
          .map(
            (h) => `
          <li>
            <time datetime="${escapeHtml(h.created_at.replace(" ", "T"))}Z">${formatDateTime(h.created_at)}</time>
            <strong>${escapeHtml(h.user_name)}</strong> - ${escapeHtml(h.action)}
          </li>`
          )
          .join("")}
      </ol>
    </section>`;
}

// Collects everything typed into the form, in the shape the server expects.
function readForm(form, meta) {
  const body = {};
  for (const name of FIELDS) body[name] = form.elements[name].value.trim();
  body.checklist = meta.procedures.map((_, i) => ({
    done: form.elements[`step-${i}-done`].checked,
    date: form.elements[`step-${i}-date`].value,
    remarks: form.elements[`step-${i}-remarks`].value.trim(),
  }));
  return body;
}

// Highlights empty required fields. Returns true if everything is OK.
function validate(form) {
  let firstBad = null;
  for (const name of REQUIRED) {
    const input = form.elements[name];
    const bad = !input.value.trim();
    input.setAttribute("aria-invalid", String(bad));
    input.closest(".field").classList.toggle("has-error", bad);
    if (bad && !firstBad) firstBad = input;
  }
  firstBad?.focus();
  return !firstBad;
}

// All the button clicks and form events.
function wireUp(container, { job, meta }) {
  const form = container.querySelector("#job-form");
  const errorEl = container.querySelector("#form-error");
  let dirty = false;

  // Remember that something changed, so leaving the page asks first.
  form.addEventListener("input", () => {
    dirty = true;
  });
  setDirtyCheck(() => dirty);

  // Ticking "Done" fills today's date if empty, and highlights the row.
  form.addEventListener("change", (e) => {
    const match = e.target.name?.match(/^step-(\d+)-done$/);
    if (!match) return;
    const dateInput = form.elements[`step-${match[1]}-date`];
    if (e.target.checked && !dateInput.value) dateInput.value = todayISO();
    e.target.closest("tr").classList.toggle("is-done", e.target.checked);
    dirty = true;
  });

  // Save
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    if (!validate(form)) {
      errorEl.textContent = "Please fill in the fields marked *.";
      return;
    }
    const saveBtn = form.querySelector('[data-action="save"]');
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const body = readForm(form, meta);
      const saved = job
        ? await api(`/jobs/${job.id}`, { method: "PUT", body: { ...body, version: job.version } })
        : await api("/jobs", { method: "POST", body });
      dirty = false;
      showToast(job ? (saved.unchanged ? "No changes to save." : "Changes saved.") : `Job saved as ${saved.form_no}.`);
      go(`#/jobs/${saved.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      saveBtn.disabled = false;
      saveBtn.textContent = "Save job";
    }
  });

  // Other buttons
  form.querySelector(".form-actions").addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action || action === "save") return;
    errorEl.textContent = "";

    try {
      if (action === "clear") {
        if (dirty && !confirm("Clear everything you've typed?")) return;
        dirty = false;
        go("#/jobs/new");
      }

      if (action === "print") {
        // Browsers use the page title as the default PDF file name,
        // so set it to something useful, then put it back afterwards.
        const oldTitle = document.title;
        const safe = `${job.form_no} - ${job.customer_name}`.replace(/[\\/:*?"<>|]/g, "-");
        document.title = safe;
        window.addEventListener("afterprint", () => (document.title = oldTitle), { once: true });
        window.print();
      }

      if (action === "check") {
        if (dirty) {
          errorEl.textContent = "Save your changes first, then mark the job as checked.";
          return;
        }
        if (!confirm(`Mark ${job.form_no} as checked?\n\nYour name goes in “Checked by” and the job is locked against edits.`)) return;
        await api(`/jobs/${job.id}/check`, { method: "POST" });
        showToast("Job checked and locked.");
        go(`#/jobs/${job.id}`);
      }

      if (action === "reopen") {
        const reason = prompt("Why does this job need to be reopened? (This is saved in the activity log.)");
        if (reason === null) return; // pressed Cancel
        if (!reason.trim()) {
          errorEl.textContent = "A reason is needed to reopen a job.";
          return;
        }
        await api(`/jobs/${job.id}/reopen`, { method: "POST", body: { reason } });
        showToast("Job reopened for editing.");
        go(`#/jobs/${job.id}`);
      }

      if (action === "delete") {
        if (!confirm(`Delete ${job.form_no} (${job.customer_name}) permanently?\n\nThis cannot be undone.`)) return;
        await api(`/jobs/${job.id}`, { method: "DELETE" });
        dirty = false;
        showToast(`${job.form_no} deleted.`);
        go("#/jobs");
      }
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
