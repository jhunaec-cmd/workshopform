// The server: serves the app's web pages and the /api/... data routes.
require("dotenv").config();
const path = require("path");
const express = require("express");

const runMigrations = require("./db/migrate");
const requireAuth = require("./middleware/requireAuth");
const { requireRole, requirePasswordChanged } = require("./middleware/requireRole");
const { JOB_STATUSES, PROCEDURES } = require("./config/workshop");

const authRouter = require("./routes/auth");
const jobsRouter = require("./routes/jobs");
const usersRouter = require("./routes/users");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith("change-this")) {
  console.error("JWT_SECRET is missing in .env - set it to a long random string (start.bat does this for you).");
  process.exit(1);
}

// Render sets RENDER=true. Its disk is wiped on every redeploy, so a local
// database file there would silently lose every job - refuse to start instead.
if (process.env.RENDER && !process.env.DB_URL?.startsWith("libsql:")) {
  console.error("On Render, DB_URL must point to a Turso database (libsql://...). Set it in the service's Environment tab.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", true); // needed when hosted behind Render's HTTPS proxy
app.use(express.json({ limit: "200kb" }));

app.use("/api/auth", authRouter);

// Everything below needs a logged-in user who has set their own password.
const loggedIn = [requireAuth, requirePasswordChanged];
app.get("/api/meta", ...loggedIn, (req, res) => res.json({ statuses: JOB_STATUSES, procedures: PROCEDURES }));
app.use("/api/jobs", ...loggedIn, jobsRouter);
app.use("/api/users", ...loggedIn, requireRole("admin"), usersRouter);

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// The frontend. service-worker.js must never be cached by the browser,
// otherwise app updates would be slow to reach installed phones/PCs.
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("service-worker.js")) res.setHeader("Cache-Control", "no-cache");
    },
  })
);

// Any other address loads the app; the #/... part of the URL picks the screen.
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 3004;

(async () => {
  try {
    await runMigrations();
    // "0.0.0.0" = reachable from other devices on the same Wi-Fi too
    // (phones/tablets), not just this PC.
    app.listen(PORT, "0.0.0.0", () => console.log(`AEC Workshop running on http://localhost:${PORT}`));
  } catch (err) {
    console.error("Could not prepare the database, server not started:", err);
    process.exit(1);
  }
})();
