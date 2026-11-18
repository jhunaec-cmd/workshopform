// Blocks password guessing: after 5 wrong passwords for the same
// username within 15 minutes, that username is locked for 15 minutes.
// Stored in the database so a server restart doesn't reset it.
const db = require("../db/connection");

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

async function isLockedOut(identifier) {
  const row = await db.get(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE identifier = ? AND attempted_at > datetime('now', ?)",
    identifier,
    `-${WINDOW_MINUTES} minutes`
  );
  return Number(row.n) >= MAX_ATTEMPTS;
}

async function recordFailure(identifier) {
  await db.run("INSERT INTO login_attempts (identifier) VALUES (?)", identifier);
  // Housekeeping: old attempts are useless, so don't let the table grow forever.
  await db.run("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')");
}

async function clearFailures(identifier) {
  await db.run("DELETE FROM login_attempts WHERE identifier = ?", identifier);
}

module.exports = { isLockedOut, recordFailure, clearFailures, WINDOW_MINUTES };
