// Turns a raw database user row into the safe shape we send to the
// browser - notably WITHOUT password_hash.
const publicUser = (row) => ({
  id: row.id,
  username: row.username,
  fullName: row.full_name,
  role: row.role,
  mustChangePassword: Boolean(row.must_change_password),
});

const MIN_PASSWORD_LENGTH = 6;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

module.exports = { publicUser, MIN_PASSWORD_LENGTH, USERNAME_RE };
