// Runs before every protected route. It checks the login token, then
// re-reads the user from the database - so if an admin deactivates
// someone, they are locked out immediately, not when their token expires.
const jwt = require("jsonwebtoken");
const db = require("../db/connection");
const asyncHandler = require("../utils/asyncHandler");
const { publicUser } = require("../utils/users");

const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in." });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }

  const row = await db.get("SELECT * FROM users WHERE id = ?", payload.userId);
  if (!row || !row.active) {
    return res.status(401).json({ error: "Your account is no longer active." });
  }

  req.user = publicUser(row);
  next();
});

module.exports = requireAuth;
