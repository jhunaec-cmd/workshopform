// Job records: every saved job, newest first, with live search and a status filter.
import { api, apiDownload, getMeta, getUser } from "../api.js";
import { escapeHtml, formatDate, statusBadge, debounce, showToast } from "../utils.js";

export async function renderJobList(container) {
  const meta = await getMeta();
  // Only admins see the export button. (The server checks this too, so
  // hiding the button is just for tidiness - it is not the real protection.)
  const isAdmin = getUser()?.role === "admin";

  container.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">Job records</h1>
      ${isAdmin ? '<button type="button" class="btn" id="export-btn">Export to Excel</button>' : ""}
      <a class="btn btn-primary" href="#/jobs/new">+ New job</a>
    </div>
    <section class="card">
      <form class="filters" role="search" aria-label="Search job records">
        <div class="field">
          <label for="q">Search</label>
          <input id="q" type="search" placeholder="Customer, model, serial, BR no., form no., phone…" autocomplete="off" />
        </div>
        <div class="field">
          <label for="status">Status</label>
          <select id="status">
            <option value="">All statuses</option>
            ${meta.statuses.map((s) => `<option>${escapeHtml(s)}</option>`).join("")}
          </select>
        </div>
      </form>
      <p class="result-count" aria-live="polite"></p>
      <ul class="job-list"></ul>
    </section>`;

  const q = container.querySelector("#q");
  const status = container.querySelector("#status");
  const countEl = container.querySelector(".result-count");
  const listEl = container.querySelector(".job-list");

  // Keep the last search when coming back to this page (this browser tab only).
  try {
    const saved = JSON.parse(sessionStorage.getItem("aecws_filters") || "{}");
    q.value = saved.q || "";
    status.value = saved.status || "";
  } catch { /* ignore */ }

  let requestNo = 0;
  const load = async () => {
    const thisRequest = ++requestNo;
    try {
      sessionStorage.setItem("aecws_filters", JSON.stringify({ q: q.value, status: status.value }));
    } catch { /* ignore */ }

    const params = new URLSearchParams({ q: q.value.trim(), status: status.value });
    try {
      const jobs = await api(`/jobs?${params}`);
      if (thisRequest !== requestNo) return; // an newer search already started - ignore this old answer
      drawList(jobs);
    } catch (err) {
      countEl.textContent = err.message;
    }
  };

  const drawList = (jobs) => {
    const filtering = q.value.trim() || status.value;
    countEl.textContent = `${jobs.length} job${jobs.length === 1 ? "" : "s"}${filtering ? " found" : ""}`;

    if (!jobs.length) {
      listEl.innerHTML = `<li class="empty">${
        filtering ? "No jobs match your search." : 'No jobs yet. Tap “New job” to add the first one.'
      }</li>`;
      return;
    }

    listEl.innerHTML = jobs
      .map((j) => {
        const pct = Math.round((j.steps_done / j.steps_total) * 100);
        return `
        <li>
          <a class="job-item" href="#/jobs/${j.id}">
            <div>
              <div class="job-top">
                <span class="job-no">${escapeHtml(j.form_no)}</span>
              </div>
              <div class="job-customer">${escapeHtml(j.customer_name)}</div>
              <div class="job-unit">${escapeHtml(j.unit_model)}${j.serial_no ? ` · S/N ${escapeHtml(j.serial_no)}` : ""}</div>
              <div class="job-meta">
                Received ${formatDate(j.date_received)}${j.technician ? ` · Tech: ${escapeHtml(j.technician)}` : ""}
              </div>
            </div>
            <div class="job-top">
              ${statusBadge(j.job_status, meta.statuses)}
              ${j.locked ? '<span class="badge badge-locked">Checked</span>' : ""}
              <span class="progress job-meta" aria-label="${j.steps_done} of ${j.steps_total} steps done">
                <span class="progress-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
                ${j.steps_done}/${j.steps_total}
              </span>
            </div>
          </a>
        </li>`;
      })
      .join("");
  };

  // Exports exactly what the search box + status filter are showing.
  const exportBtn = container.querySelector("#export-btn");
  exportBtn?.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = "Preparing…";
    try {
      await apiDownload(`/jobs/export?${new URLSearchParams({ q: q.value.trim(), status: status.value })}`);
      showToast("Excel file downloaded.");
    } catch (err) {
      showToast(err.message);
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = "Export to Excel";
    }
  });

  container.querySelector("form").addEventListener("submit", (e) => e.preventDefault());
  q.addEventListener("input", debounce(load, 250));
  status.addEventListener("change", load);
  await load();
}
