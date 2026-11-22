// Workshop jobs: list/search, view, create, edit, check+lock, reopen, delete.
const express = require("express");
const ExcelJS = require("exceljs");

const db = require("../db/connection");
const asyncHandler = require("../utils/asyncHandler");
const { requireRole } = require("../middleware/requireRole");
const { JOB_STATUSES, PROCEDURES, FORM_PREFIX, formNo } = require("../config/workshop");

const router = express.Router();

// Every free-text field on the form, with a friendly label (used in error
// messages and the activity log) and a maximum length.
const TEXT_FIELDS = {
  customer_name: { label: "Customer name", max: 120 },
  contact_no: { label: "Contact no.", max: 40 },
  unit_model: { label: "Unit brand / model", max: 120 },
  serial_no: { label: "Serial no.", max: 80 },
  job_ref_no: { label: "Job / Ref. no.", max: 80 },
  br_no: { label: "BR no.", max: 80 },
  received_by: { label: "Received by", max: 80 },
  technician: { label: "Technician", max: 80 },
  complaint: { label: "Customer complaint", max: 2000 },
  findings: { label: "Findings", max: 2000 },
  action_update: { label: "Action / update", max: 2000 },
  quotation: { label: "Quotation", max: 2000 },
};
const REQUIRED_FIELDS = ["customer_name", "unit_model"];
const SAVED_COLUMNS = ["date_received", ...Object.keys(TEXT_FIELDS), "job_status", "checklist"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);

const parseChecklist = (text) => {
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

// Checks and tidies the form data sent by the browser. Returns either
// { data } ready to save, or { error } to show the user.
function parseJobBody(body) {
  const data = {};
  for (const [field, { max }] of Object.entries(TEXT_FIELDS)) {
    data[field] = cleanText(body[field], max);
  }

  data.date_received = cleanText(body.date_received, 10);
  if (!DATE_RE.test(data.date_received)) return { error: "Date received is required." };

  for (const field of REQUIRED_FIELDS) {
    if (!data[field]) return { error: `${TEXT_FIELDS[field].label} is required.` };
  }

  if (!JOB_STATUSES.includes(body.job_status)) return { error: "Please choose a valid job status." };
  data.job_status = body.job_status;

  // Always exactly one entry per procedure step, whatever the browser sent.
  const raw = Array.isArray(body.checklist) ? body.checklist : [];
  data.checklist = PROCEDURES.map((_, i) => {
    const step = raw[i] || {};
    const date = cleanText(step.date, 10);
    return { done: step.done === true, date: DATE_RE.test(date) ? date : "", remarks: cleanText(step.remarks, 200) };
  });

  return { data };
}

const columnValues = (data) => SAVED_COLUMNS.map((c) => (c === "checklist" ? JSON.stringify(data.checklist) : data[c]));

const toJob = (row) => ({
  ...row,
  form_no: formNo(row.id),
  checklist: parseChecklist(row.checklist),
  locked: Boolean(row.checked_at),
});

// Writes a plain-English summary of what changed, for the activity log.
// Returns "" if nothing changed at all.
function describeChanges(old, data) {
  const parts = [];

  if (old.job_status !== data.job_status) {
    parts.push(`Status: ${old.job_status} → ${data.job_status}`);
  }

  const labels = { date_received: "date received", ...Object.fromEntries(Object.entries(TEXT_FIELDS).map(([k, v]) => [k, v.label.toLowerCase()])) };
  const edited = Object.keys(labels).filter((f) => (old[f] ?? "") !== data[f]);
  if (edited.length) parts.push(`Edited ${edited.map((f) => labels[f]).join(", ")}`);

  let otherChecklistEdits = false;
  PROCEDURES.forEach((name, i) => {
    const before = old.checklist[i] || { done: false, date: "", remarks: "" };
    const after = data.checklist[i];
    if (!before.done && after.done) parts.push(`Ticked step ${i + 1} (${name})`);
    else if (before.done && !after.done) parts.push(`Unticked step ${i + 1} (${name})`);
    else if ((before.date || "") !== after.date || (before.remarks || "") !== after.remarks) otherChecklistEdits = true;
  });
  if (otherChecklistEdits) parts.push("Updated checklist dates/remarks");

  return parts.join("; ");
}

const addHistory = (jobId, user, action) =>
  db.run("INSERT INTO job_history (job_id, user_id, user_name, action) VALUES (?, ?, ?, ?)", jobId, user.id, user.fullName, action);

// Reads :id from the URL and loads that job, or replies 404.
async function loadJob(req, res) {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? await db.get("SELECT * FROM jobs WHERE id = ?", id) : null;
  if (!row) res.status(404).json({ error: "Job not found. It may have been deleted." });
  return row;
}

// ---------- Routes ----------

// Turns ?q=...&status=... into a SQL "WHERE ..." piece. Shared by the job
// list and the Excel export, so both always search the same way.
function buildFilter(query) {
  const q = String(query.q || "").trim();
  const status = String(query.status || "");
  const where = [];
  const args = [];

  if (q) {
    const like = `%${q}%`;
    where.push(`(customer_name LIKE ? OR contact_no LIKE ? OR unit_model LIKE ? OR serial_no LIKE ?
      OR job_ref_no LIKE ? OR br_no LIKE ? OR technician LIKE ? OR ('${FORM_PREFIX}' || printf('%04d', id)) LIKE ?)`);
    args.push(like, like, like, like, like, like, like, like);
  }
  if (status) {
    where.push("job_status = ?");
    args.push(status);
  }
  return { where, args };
}

// GET /api/jobs/export?q=...&status=...   (admin only -> downloads an .xlsx file)
// Must be declared BEFORE "/:id", otherwise "export" would be read as a job id.
router.get(
  "/export",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { where, args } = buildFilter(req.query);
    const rows = await db.all(
      `SELECT j.*, (SELECT COUNT(*) FROM job_photos p WHERE p.job_id = j.id) AS photo_count
       FROM jobs j ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY j.id DESC LIMIT 5000`,
      ...args
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AEC Workshop";
    const sheet = workbook.addWorksheet("Jobs", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });

    // [heading, width, value from a job]
    const columns = [
      ["Form No.", 18, (j) => j.form_no],
      ["Date received", 14, (j) => j.date_received],
      ["Customer", 26, (j) => j.customer_name],
      ["Contact no.", 16, (j) => j.contact_no],
      ["Unit brand / model", 26, (j) => j.unit_model],
      ["Serial no.", 18, (j) => j.serial_no],
      ["Job / Ref. no.", 16, (j) => j.job_ref_no],
      ["BR no.", 12, (j) => j.br_no],
      ["Received by", 18, (j) => j.received_by],
      ["Technician", 18, (j) => j.technician],
      ["Status", 28, (j) => j.job_status],
      ["Steps done", 11, (j) => `${j.checklist.filter((s) => s.done).length}/${PROCEDURES.length}`],
      ["Complaint", 40, (j) => j.complaint],
      ["Findings", 40, (j) => j.findings],
      ["Action / update", 40, (j) => j.action_update],
      ["Quotation", 30, (j) => j.quotation],
      // One column per procedure step: the date it was done ("Done" if no date), else blank.
      ...PROCEDURES.map((name, i) => [
        `${i + 1}. ${name}`,
        22,
        (j) => (j.checklist[i]?.done ? j.checklist[i].date || "Done" : ""),
      ]),
      ["Photos", 8, (j) => Number(j.photo_count)],
      ["Prepared by", 18, (j) => j.prepared_by],
      ["Checked by", 18, (j) => j.checked_by || ""],
      ["Checked at (UTC)", 20, (j) => j.checked_at || ""],
      ["Created (UTC)", 20, (j) => j.created_at],
      ["Last updated (UTC)", 20, (j) => j.updated_at],
    ];

    sheet.columns = columns.map(([header, width]) => ({ header, width }));
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0A500" } };
    header.alignment = { vertical: "middle", wrapText: true };

    for (const row of rows) {
      const job = toJob(row);
      const added = sheet.addRow(columns.map(([, , get]) => get({ ...job, photo_count: row.photo_count })));
      added.alignment = { vertical: "top", wrapText: true };
    }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="AEC-Workshop-Jobs-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    });
    await workbook.xlsx.write(res);
    res.end();
  })
);

// GET /api/jobs?q=search&status=In%20workshop
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { where, args } = buildFilter(req.query);

    const rows = await db.all(
      `SELECT id, date_received, customer_name, contact_no, unit_model, serial_no, technician,
              job_status, checklist, checked_at, updated_at
       FROM jobs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY id DESC LIMIT 500`,
      ...args
    );

    res.json(
      rows.map(({ checklist, ...row }) => ({
        ...row,
        form_no: formNo(row.id),
        steps_done: parseChecklist(checklist).filter((s) => s.done).length,
        steps_total: PROCEDURES.length,
        locked: Boolean(row.checked_at),
      }))
    );
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await loadJob(req, res);
    if (!row) return;
    const history = await db.all(
      "SELECT user_name, action, created_at FROM job_history WHERE job_id = ? ORDER BY id DESC",
      row.id
    );
    // Only the photo ids - the pictures themselves load separately.
    const photos = await db.all(
      "SELECT id, uploaded_by, created_at FROM job_photos WHERE job_id = ? ORDER BY id",
      row.id
    );
    res.json({ ...toJob(row), history, photos });
  })
);

// ---------- Photos ----------
const MAX_PHOTOS = 10;

// The browser shrinks photos to ~200 KB before sending; 2 MB is a safety limit.
// express.raw reads the request body as plain bytes (not JSON).
const rawJpeg = express.raw({ type: "image/jpeg", limit: "2mb" });

// A real JPEG always starts with the bytes FF D8 FF. Checking this stops
// someone uploading a different kind of file pretending to be a photo.
const isJpeg = (buf) => Buffer.isBuffer(buf) && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

router.post(
  "/:id/photos",
  rawJpeg,
  asyncHandler(async (req, res) => {
    const row = await loadJob(req, res);
    if (!row) return;
    if (row.checked_at) return res.status(403).json({ error: "This job is locked. An admin must reopen it first." });
    if (!isJpeg(req.body)) return res.status(400).json({ error: "That file is not a valid photo (JPEG)." });

    const { count } = await db.get("SELECT COUNT(*) AS count FROM job_photos WHERE job_id = ?", row.id);
    if (Number(count) >= MAX_PHOTOS) {
      return res.status(400).json({ error: `A job can have at most ${MAX_PHOTOS} photos.` });
    }

    const result = await db.run(
      "INSERT INTO job_photos (job_id, image, uploaded_by) VALUES (?, ?, ?)",
      row.id,
      req.body,
      req.user.fullName
    );
    await addHistory(row.id, req.user, "Added a photo");
    res.status(201).json({ id: result.lastInsertRowid });
  })
);

router.get(
  "/:id/photos/:photoId",
  asyncHandler(async (req, res) => {
    const photo = await db.get("SELECT image FROM job_photos WHERE id = ? AND job_id = ?", Number(req.params.photoId), Number(req.params.id));
    if (!photo) return res.status(404).json({ error: "Photo not found." });
    res.set({ "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400" });
    res.send(Buffer.from(photo.image));
  })
);

router.delete(
  "/:id/photos/:photoId",
  asyncHandler(async (req, res) => {
    const row = await loadJob(req, res);
    if (!row) return;
    if (row.checked_at) return res.status(403).json({ error: "This job is locked. An admin must reopen it first." });

    const result = await db.run("DELETE FROM job_photos WHERE id = ? AND job_id = ?", Number(req.params.photoId), row.id);
    if (result.changes === 0) return res.status(404).json({ error: "Photo not found." });
    await addHistory(row.id, req.user, "Removed a photo");
    res.json({ ok: true });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = parseJobBody(req.body);
    if (error) return res.status(400).json({ error });

    const result = await db.run(
      `INSERT INTO jobs (${SAVED_COLUMNS.join(", ")}, prepared_by, created_by)
       VALUES (${SAVED_COLUMNS.map(() => "?").join(", ")}, ?, ?)`,
      ...columnValues(data),
      req.user.fullName, // "Prepared by" = whoever is logged in
      req.user.id
    );
    const id = result.lastInsertRowid;
    await addHistory(id, req.user, "Created job");
    res.status(201).json({ id, form_no: formNo(id) });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await loadJob(req, res);
    if (!row) return;
    if (row.checked_at) {
      return res.status(403).json({ error: "This job has been checked and locked. An admin must reopen it first." });
    }

    const { data, error } = parseJobBody(req.body);
    if (error) return res.status(400).json({ error });

    const summary = describeChanges(toJob(row), data);
    if (!summary) return res.json({ id: row.id, form_no: formNo(row.id), unchanged: true });

    // "AND version = ?" only matches if nobody else saved since this user
    // opened the job. If someone did, 0 rows change and we say so,
    // instead of silently throwing away the other person's work.
    const result = await db.run(
      `UPDATE jobs SET ${SAVED_COLUMNS.map((c) => `${c} = ?`).join(", ")},
         version = version + 1, updated_at = datetime('now')
       WHERE id = ? AND version = ? AND checked_at IS NULL`,
      ...columnValues(data),
      row.id,
      Number(req.body.version)
    );
    if (result.changes === 0) {
      return res.status(409).json({
        error: "Someone else saved this job after you opened it. Reload the page to see their changes, then edit again.",
      });
    }

    await addHistory(row.id, req.user, summary);
    res.json({ id: row.id, form_no: formNo(row.id) });
  })
);

// Admin: sign off as "Checked by" and lock the job against edits.
router.post(
  "/:id/check",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const row = await loadJob(req, res);
    if (!row) return;
    if (row.checked_at) return res.status(400).json({ error: "This job is already checked." });

    await db.run(
      `UPDATE jobs SET checked_by = ?, checked_at = datetime('now'), version = version + 1, updated_at = datetime('now')
       WHERE id = ?`,
      req.user.fullName,
      row.id
    );
    await addHistory(row.id, req.user, "Checked and locked the job");
    res.json({ ok: true });
  })
);

// Admin: unlock a checked job so it can be edited again (reason required,
// and it stays in the activity log forever).
router.post(
  "/:id/reopen",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const row = await loadJob(req, res);
    if (!row) return;
    const reason = cleanText(req.body.reason, 300);
    if (!reason) return res.status(400).json({ error: "Please give a reason for reopening." });
    if (!row.checked_at) return res.status(400).json({ error: "This job is not locked." });

    await db.run(
      `UPDATE jobs SET checked_by = NULL, checked_at = NULL, version = version + 1, updated_at = datetime('now')
       WHERE id = ?`,
      row.id
    );
    await addHistory(row.id, req.user, `Reopened for editing. Reason: ${reason}`);
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const row = await loadJob(req, res);
    if (!row) return;
    await db.run("DELETE FROM job_photos WHERE job_id = ?", row.id);
    await db.run("DELETE FROM job_history WHERE job_id = ?", row.id);
    await db.run("DELETE FROM jobs WHERE id = ?", row.id);
    res.json({ ok: true });
  })
);

module.exports = router;
