const VALID_ROLES = new Set(['user', 'mod', 'admin']);

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'reader') return 'user';
  if (value === 'author') return 'mod';
  return VALID_ROLES.has(value) ? value : 'user';
}

function isAdmin(role) {
  return normalizeRole(role) === 'admin';
}

function canPostStory(role) {
  const normalized = normalizeRole(role);
  return normalized === 'mod' || normalized === 'admin';
}

module.exports = {
  VALID_ROLES,
  normalizeRole,
  isAdmin,
  canPostStory
};
