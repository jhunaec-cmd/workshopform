// Opens the single shared database connection used by the whole app, via
// Turso's @libsql/client. The exact same code talks to either a local
// file (DB_URL="file:./data/workshop.db", for local dev -
// no account/network needed) or a real remote Turso database
// (DB_URL="libsql://...-your-db.turso.io" + DB_AUTH_TOKEN, for
// production, since Render's local filesystem doesn't survive a
// redeploy) - only the connection string changes.
const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

const DB_URL = process.env.DB_URL || "file:./data/workshop.db";
const IS_LOCAL_FILE = DB_URL.startsWith("file:");

// data/ is gitignored (it holds the local database file, which shouldn't
// be committed), so a fresh checkout has no data/ folder at all -
// @libsql/client fails to even open a connection if the folder the file
// would live in doesn't exist yet. Create it up front so `npm start`
// always works on a brand new checkout, not just one that happened to
// have run here before.
if (IS_LOCAL_FILE) {
  const filePath = DB_URL.replace(/^file:/, "");
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

const client = createClient({
  url: DB_URL,
  authToken: process.env.DB_AUTH_TOKEN || undefined,
});

function toPlainObject(row) {
  return row ? { ...row } : row;
}

async function get(sql, ...args) {
  const rs = await client.execute({ sql, args });
  return toPlainObject(rs.rows[0]);
}

async function all(sql, ...args) {
  const rs = await client.execute({ sql, args });
  return rs.rows.map(toPlainObject);
}

async function run(sql, ...args) {
  const rs = await client.execute({ sql, args });
  // lastInsertRowid comes back as a BigInt - converted to a plain Number
  // here, once, so no route file anywhere else has to know BigInt was
  // ever involved.
  return {
    changes: Number(rs.rowsAffected),
    lastInsertRowid: rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid),
  };
}

async function exec(sql) {
  await client.execute(sql);
}

async function executeMultiple(sql) {
  await client.executeMultiple(sql);
}

module.exports = { get, all, run, exec, executeMultiple, IS_LOCAL_FILE };
