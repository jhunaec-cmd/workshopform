// Creates the database tables the first time the app starts. "IF NOT
// EXISTS" means it is safe to run on every start - existing data is never
// touched.
const db = require("./connection");

async function runMigrations() {
  await db.executeMultiple(`
    -- Everyone who can log in. role is 'admin' or 'staff'.
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One row per workshop job (one paper form).
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_received TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      contact_no TEXT NOT NULL DEFAULT '',
      unit_model TEXT NOT NULL,
      serial_no TEXT NOT NULL DEFAULT '',
      job_ref_no TEXT NOT NULL DEFAULT '',
      br_no TEXT NOT NULL DEFAULT '',
      received_by TEXT NOT NULL DEFAULT '',
      technician TEXT NOT NULL DEFAULT '',
      complaint TEXT NOT NULL DEFAULT '',
      findings TEXT NOT NULL DEFAULT '',
      action_update TEXT NOT NULL DEFAULT '',
      quotation TEXT NOT NULL DEFAULT '',
      job_status TEXT NOT NULL,
      checklist TEXT NOT NULL DEFAULT '[]',   -- JSON array, one entry per procedure step
      prepared_by TEXT NOT NULL DEFAULT '',
      checked_by TEXT,                        -- set when an admin checks + locks the job
      checked_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,     -- stops two people overwriting each other
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (job_status);

    -- Append-only activity log: who did what to each job, and when.
    CREATE TABLE IF NOT EXISTS job_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_history_job ON job_history (job_id);

    -- Photos of the unit. The picture itself is stored in the database (a
    -- BLOB) because Render's disk is wiped on every redeploy.
    CREATE TABLE IF NOT EXISTS job_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      image BLOB NOT NULL,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_photos_job ON job_photos (job_id);

    -- Failed logins, used to block password guessing.
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = runMigrations;
