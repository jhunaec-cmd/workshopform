// requireRole("admin") lets only admins through. Must run AFTER
// requireAuth, because it reads req.user.
const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: "You don't have permission to do that." });
  }
  next();
};

// Users with a temporary password (set by an admin) must choose their
// own before they can use anything else. Enforced here on the server,
// not just hidden in the browser.
const requirePasswordChanged = (req, res, next) => {
  if (req.user.mustChangePassword) {
    return res.status(403).json({ error: "Please change your password first.", code: "MUST_CHANGE_PASSWORD" });
  }
  next();
};

module.exports = { requireRole, requirePasswordChanged };
