export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'reader') return 'user';
  if (value === 'author') return 'mod';
  return value === 'admin' || value === 'mod' || value === 'user' ? value : 'user';
}

export function isAdmin(role) {
  return normalizeRole(role) === 'admin';
}

export function canPostStory(role) {
  const normalized = normalizeRole(role);
  return normalized === 'mod' || normalized === 'admin';
}
