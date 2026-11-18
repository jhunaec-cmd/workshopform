// Login, first-time setup, "who am I", and change password.
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../db/connection");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const { publicUser, MIN_PASSWORD_LENGTH, USERNAME_RE } = require("../utils/users");
const { isLockedOut, recordFailure, clearFailures, WINDOW_MINUTES } = require("../utils/loginLockout");

const router = express.Router();

// A login lasts one working day, then the user logs in again.
const makeToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "12h" });

// Tells the login screen whether this is a brand-new install with no users yet.
router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const row = await db.get("SELECT COUNT(*) AS n FROM users");
    res.json({ needsSetup: Number(row.n) === 0 });
  })
);

// First-time setup: creates the very first admin. Only works while the
// users table is completely empty - after that it always refuses.
router.post(
  "/setup",
  asyncHandler(async (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const fullName = String(req.body.fullName || "").trim().slice(0, 80);
    const password = String(req.body.password || "");

    if (!fullName) return res.status(400).json({ error: "Please enter your full name." });
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: "Username must be 3-30 characters: letters, numbers, dot, dash or underscore." });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const hash = await bcrypt.hash(password, 10);
    // "WHERE NOT EXISTS" makes the empty-check and the insert ONE step, so
    // two people pressing "Create" at the same moment can't both succeed.
    const result = await db.run(
      `INSERT INTO users (username, full_name, password_hash, role)
       SELECT ?, ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM users)`,
      username,
      fullName,
      hash
    );
    if (result.changes === 0) {
      return res.status(403).json({ error: "Setup has already been done. Please log in." });
    }

    const row = await db.get("SELECT * FROM users WHERE id = ?", result.lastInsertRowid);
    res.status(201).json({ token: makeToken(row.id), user: publicUser(row) });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!username || !password) {
      return res.status(400).json({ error: "Please enter your username and password." });
    }

    if (await isLockedOut(username)) {
      return res.status(429).json({
        error: `Too many wrong attempts. Please wait ${WINDOW_MINUTES} minutes and try again.`,
      });
    }

    const row = await db.get("SELECT * FROM users WHERE username = ?", username);
    const passwordOk = row ? await bcrypt.compare(password, row.password_hash) : false;

    if (!passwordOk) {
      await recordFailure(username);
      // Same message whether the username or the password was wrong, so
      // nobody can use this screen to discover valid usernames.
      return res.status(401).json({ error: "Wrong username or password." });
    }
    if (!row.active) {
      return res.status(403).json({ error: "This account has been deactivated. Please ask an admin." });
    }

    await clearFailures(username);
    res.json({ token: makeToken(row.id), user: publicUser(row) });
  })
);

router.get("/me", requireAuth, (req, res) => res.json(req.user));

router.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = String(req.body.currentPassword || "");
    const next = String(req.body.newPassword || "");

    const row = await db.get("SELECT * FROM users WHERE id = ?", req.user.id);
    if (!(await bcrypt.compare(current, row.password_hash))) {
      return res.status(400).json({ error: "Your current password is wrong." });
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (next === current) {
      return res.status(400).json({ error: "New password must be different from the current one." });
    }

    await db.run(
      "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
      await bcrypt.hash(next, 10),
      req.user.id
    );
    res.json({ ok: true });
  })
);

module.exports = router;
