// The workshop's fixed lists live here, in ONE place. The frontend
// downloads them from GET /api/meta, so if you add a procedure step or a
// new job status, you only change this file.

const JOB_STATUSES = [
  "In workshop",
  "Waiting for quotation approval",
  "Waiting for parts",
  "Repair in progress",
  "Ready for collection",
  "Collected / closed",
  "Returned without repair",
];

// The "Procedure checklist" rows, in order. Add new steps at the END so
// older saved jobs keep their ticks lined up with the right step.
const PROCEDURES = [
  "Receive and collect the details",
  "Ask if customer has the BR form",
  "Ask what the complaint is",
  "Check the unit",
  "Update",
  "Final report",
  "Submit for quotation",
];

// Form numbers are worked out from the job's database id, so they can
// never clash or skip: id 1 -> "AEC/OPS/WS-0001".
const FORM_PREFIX = "AEC/OPS/WS-";
const formNo = (id) => `${FORM_PREFIX}${String(id).padStart(4, "0")}`;

module.exports = { JOB_STATUSES, PROCEDURES, FORM_PREFIX, formNo };
