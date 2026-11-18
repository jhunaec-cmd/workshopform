// Admin-only: add users, rename / change role, reset password, deactivate.
const express = require("express");
const bcrypt = require("bcryptjs");

const db = require("../db/connection");
const asyncHandler = require("../utils/asyncHandler");
const { clearFailures } = require("../utils/loginLockout");
const { MIN_PASSWORD_LENGTH, USERNAME_RE } = require("../utils/users");

const router = express.Router();
const ROLES = ["admin", "staff"];

async function loadUser(req, res) {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? await db.get("SELECT * FROM users WHERE id = ?", id) : null;
  if (!row) res.status(404).json({ error: "User not found." });
  return row;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await db.all(
      `SELECT id, username, full_name, role, active, must_change_password, created_at
       FROM users ORDER BY active DESC, full_name COLLATE NOCASE`
    );
    res.json(rows);
  })
);

// New users get a TEMPORARY password from the admin and must change it
// the first time they log in.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const fullName = String(req.body.fullName || "").trim().slice(0, 80);
    const role = req.body.role;
    const password = String(req.body.password || "");

    if (!fullName) return res.status(400).json({ error: "Please enter the person's full name." });
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: "Username must be 3-30 characters: letters, numbers, dot, dash or underscore." });
    }
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Please choose a role." });
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (await db.get("SELECT id FROM users WHERE username = ?", username)) {
      return res.status(409).json({ error: "That username is already taken." });
    }

    const result = await db.run(
      `INSERT INTO users (username, full_name, password_hash, role, must_change_password)
       VALUES (?, ?, ?, ?, 1)`,
      username,
      fullName,
      await bcrypt.hash(password, 10),
      role
    );
    res.status(201).json({ id: result.lastInsertRowid });
  })
);

// Change name and/or role.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await loadUser(req, res);
    if (!row) return;
    const fullName = String(req.body.fullName ?? row.full_name).trim().slice(0, 80);
    const role = req.body.role ?? row.role;

    if (!fullName) return res.status(400).json({ error: "Name can't be empty." });
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Please choose a valid role." });
    // Stops the app ending up with no admin at all.
    if (row.id === req.user.id && role !== "admin") {
      return res.status(400).json({ error: "You can't remove your own admin role." });
    }

    await db.run("UPDATE users SET full_name = ?, role = ? WHERE id = ?", fullName, role, row.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/reset-password",
  asyncHandler(async (req, res) => {
    const row = await loadUser(req, res);
    if (!row) return;
    const password = String(req.body.password || "");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    await db.run(
      "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
      await bcrypt.hash(password, 10),
      row.id
    );
    await clearFailures(row.username); // also lifts any login lockout
    res.json({ ok: true });
  })
);

router.post(
  "/:id/active",
  asyncHandler(async (req, res) => {
    const row = await loadUser(req, res);
    if (!row) return;
    if (row.id === req.user.id) return res.status(400).json({ error: "You can't deactivate your own account." });

    await db.run("UPDATE users SET active = ? WHERE id = ?", req.body.active ? 1 : 0, row.id);
    res.json({ ok: true });
  })
);

module.exports = router;
