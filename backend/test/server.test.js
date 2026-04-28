const assert = require('assert');
const http = require('http');
const test = require('node:test');

process.env.DATA_STORE = 'memory';
process.env.NODE_ENV = 'test';

const {
  createSeedDb,
  ensureDbShape,
  handle,
  resetDataStore,
  getDataStoreSnapshot
} = require('../src/server');

let server;
let baseUrl;

function request(pathname, options = {}) {
  const headers = options.body instanceof FormData
    ? { ...(options.headers || {}) }
    : { 'Content-Type': 'application/json', ...(options.headers || {}) };
  return fetch(`${baseUrl}${pathname}`, {
    headers,
    ...options
  }).then(async response => {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return { response, data };
  });
}

async function loginToken(identifier = 'quantri', password = '123456') {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password })
  });
  assert.equal(login.response.status, 200);
  return login.data.token;
}

function usernameFromEmail(email) {
  return String(email).split('@')[0].replace(/[^a-z0-9._]/gi, '.').toLowerCase().slice(0, 30);
}

async function registerUser(email, name = 'Author Test User', username = usernameFromEmail(email)) {
  const register = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, username, email, password: '123456' })
  });
  assert.equal(register.response.status, 201);
  return register.data;
}

async function registerMod(email, name = 'Mod Test User', username = usernameFromEmail(email)) {
  const registered = await registerUser(email, name, username);
  const db = readTestDb();
  const user = db.users.find(item => item.id === registered.user.id);
  user.role = 'mod';
  writeTestDb(db);
  registered.user.role = 'mod';
  return registered;
}

function readTestDb() {
  return getDataStoreSnapshot();
}

function writeTestDb(db) {
  resetDataStore(db);
}

function daysAgo(days, extraHours = 0) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - extraHours * 60 * 60 * 1000).toISOString();
}

function addViewEvents(db, storyId, count, createdAt) {
  for (let index = 0; index < count; index += 1) {
    db.viewEvents.push({ id: `view_test_${storyId}_${createdAt}_${index}`, storyId, createdAt });
  }
}

test.before(async () => {
  resetDataStore(createSeedDb());
  server = http.createServer(handle);
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test('CORS preflight allows the production frontend origin', async () => {
  const response = await fetch(`${baseUrl}/api/stories`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://daudotruyen.vercel.app',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type, Authorization'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://daudotruyen.vercel.app');
  assert.match(response.headers.get('access-control-allow-methods') || '', /GET/);
  assert.match(response.headers.get('access-control-allow-methods') || '', /OPTIONS/);
  assert.match(response.headers.get('access-control-allow-headers') || '', /Content-Type/);
  assert.match(response.headers.get('access-control-allow-headers') || '', /Authorization/);
});

test('protected API 401 responses still include CORS headers', async () => {
  const response = await fetch(`${baseUrl}/api/me/library`, {
    headers: {
      Origin: 'https://daudotruyen.vercel.app'
    }
  });
  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://daudotruyen.vercel.app');
  assert.ok(data.message);
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  resetDataStore({});
});

test('health endpoint works', async () => {
  const { response, data } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
});

test('seed database has enough stories for home sections', () => {
  const db = createSeedDb();
  assert.ok(db.stories.length >= 24);
  assert.ok(db.stories.filter(story => story.status === 'completed').length >= 4);
  assert.ok(db.stories.filter(story => story.featured).length >= 6);
});

test('register rejects invalid email', async () => {
  const { response, data } = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test User', username: 'testuser', email: 'invalid', password: '123456' })
  });
  assert.equal(response.status, 400);
  assert.match(data.message, /Gmail/i);
});

test('newsletter validates and stores subscriber email', async () => {
  const invalid = await request('/api/newsletter', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email' })
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.data.message, /Email/i);

  const created = await request('/api/newsletter', {
    method: 'POST',
    body: JSON.stringify({ email: 'reader.news@gmail.com', source: 'footer' })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.subscribed, true);

  const duplicate = await request('/api/newsletter', {
    method: 'POST',
    body: JSON.stringify({ email: 'reader.news@gmail.com', source: 'footer' })
  });
  assert.equal(duplicate.response.status, 200);

  const db = readTestDb();
  assert.equal(db.newsletters.filter(item => item.email === 'reader.news@gmail.com').length, 1);
});

test('login returns token and user by username or Gmail', async () => {
  const byUsername = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'bandoc', password: '123456' })
  });
  assert.equal(byUsername.response.status, 200);
  assert.ok(byUsername.data.token);
  assert.equal(byUsername.data.user.email, 'bandoc.daudotruyen@gmail.com');
  assert.equal(byUsername.data.user.username, 'bandoc');

  const { response, data } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'bandoc.daudotruyen@gmail.com', password: '123456' })
  });
  assert.equal(response.status, 200);
  assert.ok(data.token);
  assert.equal(data.user.email, 'bandoc.daudotruyen@gmail.com');
});

test('register validates username and Gmail uniqueness', async () => {
  const created = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Gmail Reader', username: 'gmail.reader', email: 'gmail.reader@gmail.com', password: '123456' })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.user.username, 'gmail.reader');
  assert.equal(created.data.user.email, 'gmail.reader@gmail.com');

  const duplicateUsername = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Other Reader', username: 'gmail.reader', email: 'other.reader@gmail.com', password: '123456' })
  });
  assert.equal(duplicateUsername.response.status, 400);
  assert.equal(duplicateUsername.data.message, 'Tên đăng nhập đã tồn tại.');

  const duplicateGmail = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Other Reader', username: 'other.reader', email: 'gmail.reader@gmail.com', password: '123456' })
  });
  assert.equal(duplicateGmail.response.status, 400);
  assert.equal(duplicateGmail.data.message, 'Gmail đã tồn tại.');

  const nonGmail = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Other Reader', username: 'other.reader2', email: 'other.reader@yahoo.com', password: '123456' })
  });
  assert.equal(nonGmail.response.status, 400);
  assert.match(nonGmail.data.message, /Gmail/i);

  const invalidUsername = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Other Reader', username: 'bad name', email: 'bad.name@gmail.com', password: '123456' })
  });
  assert.equal(invalidUsername.response.status, 400);
  assert.match(invalidUsername.data.message, /Tên đăng nhập/i);
});

test('ensureDbShape generates unique usernames for legacy users', () => {
  const shaped = ensureDbShape({
    users: [
      { id: 'legacy_1', name: 'Legacy User', email: 'legacy@gmail.com' },
      { id: 'legacy_2', name: 'Legacy User', email: 'legacy@gmail.com' },
      { id: 'legacy_3', name: 'No Email User', email: '' }
    ]
  });
  const usernames = shaped.users.map(user => user.username);
  assert.deepEqual(new Set(usernames).size, usernames.length);
  usernames.forEach(username => assert.match(username, /^[a-z0-9._]{3,30}$/));
  assert.equal(usernames[0], 'legacy');
  assert.equal(usernames[1], 'legacy_2');
});

test('account profile endpoint validates and persists profile fields', async () => {
  const token = await loginToken('bandoc.daudotruyen@gmail.com');
  const headers = { Authorization: `Bearer ${token}` };

  const invalidEmail = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Bạn đọc Đậu Đỏ', email: 'bad-email' })
  });
  assert.equal(invalidEmail.response.status, 400);
  assert.match(invalidEmail.data.message, /Email/i);

  const duplicateEmail = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Bạn đọc Đậu Đỏ', email: 'quantri.daudotruyen@gmail.com' })
  });
  assert.equal(duplicateEmail.response.status, 400);
  assert.match(duplicateEmail.data.message, /tồn tại/i);

  const futureBirthday = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Bạn đọc Đậu Đỏ', email: 'bandoc.daudotruyen@gmail.com', birthday: '2999-01-01' })
  });
  assert.equal(futureBirthday.response.status, 400);
  assert.match(futureBirthday.data.message, /tương lai/i);

  const invalidWebsite = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Bạn đọc Đậu Đỏ', email: 'bandoc.daudotruyen@gmail.com', website: 'ftp://example.com' })
  });
  assert.equal(invalidWebsite.response.status, 400);
  assert.match(invalidWebsite.data.message, /http\/https/i);

  const unknownField = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Bạn đọc Đậu Đỏ', email: 'bandoc.daudotruyen@gmail.com', role: 'admin' })
  });
  assert.equal(unknownField.response.status, 400);

  const saved = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: 'Bạn đọc Production',
      email: 'bandoc.daudotruyen@gmail.com',
      phone: '+84 912 345 678',
      birthday: '2000-05-20',
      gender: 'prefer-not',
      address: 'TP. Hồ Chí Minh',
      website: 'https://daudotruyen.vn',
      cover: 'https://example.com/cover.png',
      bio: 'Hồ sơ test',
      socialLinks: { facebook: 'https://facebook.com/daudo' }
    })
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.profile.name, 'Bạn đọc Production');
  assert.equal(saved.data.profile.socialLinks.facebook, 'https://facebook.com/daudo');

  const reloaded = await request('/api/me/profile', { headers });
  assert.equal(reloaded.response.status, 200);
  assert.equal(reloaded.data.profile.website, 'https://daudotruyen.vn');
  assert.equal(reloaded.data.profile.birthday, '2000-05-20');

  const bioOnly = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ bio: 'Chỉ sửa giới thiệu' })
  });
  assert.equal(bioOnly.response.status, 200);
  assert.equal(bioOnly.data.profile.bio, 'Chỉ sửa giới thiệu');
  assert.equal(bioOnly.data.profile.phone, '+84 912 345 678');
  assert.equal(bioOnly.data.profile.birthday, '2000-05-20');

  const emptyOptional = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ phone: '', address: '', bio: '' })
  });
  assert.equal(emptyOptional.response.status, 200);
  assert.equal(emptyOptional.data.profile.phone, '');
  assert.equal(emptyOptional.data.profile.address, '');
  assert.equal(emptyOptional.data.profile.bio, '');

  const avatarDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const avatarOnly = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ avatar: avatarDataUrl })
  });
  assert.equal(avatarOnly.response.status, 400);
  assert.match(avatarOnly.data.message, /base64/i);

  const untrustedAvatar = await request('/api/me/profile', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ avatar: 'https://example.com/avatar.png' })
  });
  assert.equal(untrustedAvatar.response.status, 400);
  assert.match(untrustedAvatar.data.message, /storage/i);
});

test('avatar upload stores only a storage URL on the user profile', async () => {
  const token = await loginToken('bandoc.daudotruyen@gmail.com');
  const headers = { Authorization: `Bearer ${token}` };

  const invalidType = new FormData();
  invalidType.append('avatar', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'avatar.txt');
  const rejected = await request('/api/me/avatar', { method: 'POST', headers, body: invalidType });
  assert.equal(rejected.response.status, 400);

  const tooLarge = new FormData();
  tooLarge.append('avatar', new Blob([Buffer.alloc(2 * 1024 * 1024 + 1)], { type: 'image/png' }), 'avatar.png');
  const rejectedLarge = await request('/api/me/avatar', { method: 'POST', headers, body: tooLarge });
  assert.equal(rejectedLarge.response.status, 400);

  const body = new FormData();
  body.append('avatar', new Blob([Buffer.from('png')], { type: 'image/png' }), 'avatar.png');
  const uploaded = await request('/api/me/avatar', { method: 'POST', headers, body });
  assert.equal(uploaded.response.status, 201);
  assert.match(uploaded.data.profile.avatar, /^https?:\/\//);
  assert.ok(!uploaded.data.profile.avatar.startsWith('data:image/'));

  const db = readTestDb();
  const user = db.users.find(item => item.id === 'u_user');
  assert.equal(user.avatar, uploaded.data.profile.avatar);
  assert.match(user.avatar, /^https?:\/\//);
  assert.ok(!user.avatar.startsWith('data:image/'));

  const removed = await request('/api/me/avatar', { method: 'DELETE', headers });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.data.profile.avatar, '');
  assert.equal(removed.data.user.avatar, '');
  assert.equal(readTestDb().users.find(item => item.id === 'u_user').avatar, '');
});

test('account preferences endpoint whitelists keys and persists values', async () => {
  const token = await loginToken('bandoc.daudotruyen@gmail.com');
  const headers = { Authorization: `Bearer ${token}` };

  const unknown = await request('/api/me/preferences', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ unknownPreference: true })
  });
  assert.equal(unknown.response.status, 400);

  const saved = await request('/api/me/preferences', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ promoNotifications: false, publicBookmarks: true, readerFontSize: 22, readerLineHeight: 2 })
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.preferences.promoNotifications, false);
  assert.equal(saved.data.preferences.publicBookmarks, true);
  assert.equal(saved.data.preferences.readerFontSize, 22);
  assert.ok(saved.data.preferences.updatedAt);

  const reloaded = await request('/api/me/preferences', { headers });
  assert.equal(reloaded.data.preferences.promoNotifications, false);
  assert.equal(reloaded.data.preferences.publicBookmarks, true);
});

test('password endpoint enforces policy, changes password, and creates security notification', async () => {
  const register = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Password Test', username: 'password.test', email: 'password.test@gmail.com', password: '123456' })
  });
  assert.equal(register.response.status, 201);
  const headers = { Authorization: `Bearer ${register.data.token}` };

  const wrongCurrent = await request('/api/me/password', {
    method: 'POST',
    headers,
    body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'Strong!123', confirmPassword: 'Strong!123' })
  });
  assert.equal(wrongCurrent.response.status, 400);
  assert.match(wrongCurrent.data.message, /hiện tại/i);

  const weak = await request('/api/me/password', {
    method: 'POST',
    headers,
    body: JSON.stringify({ currentPassword: '123456', newPassword: '12345', confirmPassword: '12345' })
  });
  assert.equal(weak.response.status, 400);
  assert.match(weak.data.message, /6 ký tự|6/i);

  const mismatch = await request('/api/me/password', {
    method: 'POST',
    headers,
    body: JSON.stringify({ currentPassword: '123456', newPassword: 'abc123', confirmPassword: 'abc124' })
  });
  assert.equal(mismatch.response.status, 400);
  assert.match(mismatch.data.message, /khớp/i);

  const changed = await request('/api/me/password', {
    method: 'POST',
    headers,
    body: JSON.stringify({ currentPassword: '123456', newPassword: 'abc123', confirmPassword: 'abc123' })
  });
  assert.equal(changed.response.status, 200);

  const loginNew = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'password.test@gmail.com', password: 'abc123' })
  });
  assert.equal(loginNew.response.status, 200);

  const notifications = await request('/api/notifications?type=security', { headers });
  assert.ok(notifications.data.notifications.some(item => item.type === 'security'));
});

test('logout-all invalidates the current token version', async () => {
  const register = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Logout Test', username: 'logout.test', email: 'logout.test@gmail.com', password: '123456' })
  });
  assert.equal(register.response.status, 201);
  const headers = { Authorization: `Bearer ${register.data.token}` };

  const logoutAll = await request('/api/me/logout-all', { method: 'POST', headers });
  assert.equal(logoutAll.response.status, 200);

  const me = await request('/api/auth/me', { headers });
  assert.equal(me.response.status, 401);
});

test('deactivate account requires password and blocks future login', async () => {
  const register = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Deactivate Test', username: 'deactivate.test', email: 'deactivate.test@gmail.com', password: '123456' })
  });
  assert.equal(register.response.status, 201);
  const headers = { Authorization: `Bearer ${register.data.token}` };

  const wrong = await request('/api/me/deactivate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: 'wrong' })
  });
  assert.equal(wrong.response.status, 400);

  const deactivated = await request('/api/me/deactivate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: '123456' })
  });
  assert.equal(deactivated.response.status, 200);

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'deactivate.test@gmail.com', password: '123456' })
  });
  assert.equal(login.response.status, 403);
});

test('story detail includes chapters', async () => {
  const { response, data } = await request('/api/stories/dau-pha-thuong-khung');
  assert.equal(response.status, 200);
  assert.ok(data.story);
  assert.ok(Array.isArray(data.chapters));
  assert.ok(data.chapters.length > 0);
});

test('premium chapter returns preview when not unlocked', async () => {
  const { response, data } = await request('/api/stories/dau-pha-thuong-khung/chapters/5');
  assert.equal(response.status, 200);
  assert.equal(data.unlocked, null);
  assert.match(data.chapter.content, /Đoạn xem trước/);
});

test('cover upload validates image size and stories reject base64 covers', async () => {
  const userToken = await loginToken('bandoc.daudotruyen@gmail.com');
  const userHeaders = { Authorization: `Bearer ${userToken}` };
  const forbiddenBody = new FormData();
  forbiddenBody.append('file', new Blob([Buffer.from('webp')], { type: 'image/webp' }), 'cover.webp');
  const forbiddenUpload = await request('/api/uploads/cover', { method: 'POST', headers: userHeaders, body: forbiddenBody });
  assert.equal(forbiddenUpload.response.status, 403);

  const mod = await registerMod('cover.mod@gmail.com', 'Cover Mod');
  const headers = { Authorization: `Bearer ${mod.token}` };
  const tooLarge = new FormData();
  tooLarge.append('file', new Blob([Buffer.alloc(501 * 1024)], { type: 'image/webp' }), 'cover.webp');
  const rejected = await request('/api/uploads/cover', { method: 'POST', headers, body: tooLarge });
  assert.equal(rejected.response.status, 400);

  const body = new FormData();
  body.append('file', new Blob([Buffer.from('webp')], { type: 'image/webp' }), 'cover.webp');
  const uploaded = await request('/api/uploads/cover', { method: 'POST', headers, body });
  assert.equal(uploaded.response.status, 201);
  assert.ok(uploaded.data.url);
  assert.ok(!uploaded.data.url.startsWith('data:image/'));

  const story = await request('/api/author/stories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Cover URL Story', description: 'Draft story', cover: uploaded.data.url, approvalStatus: 'draft' })
  });
  assert.equal(story.response.status, 201);
  assert.equal(story.data.story.cover, uploaded.data.url);

  const base64 = await request('/api/author/stories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Base64 Cover Story', description: 'Draft story', cover: 'data:image/png;base64,iVBORw0KGgo=', approvalStatus: 'draft' })
  });
  assert.equal(base64.response.status, 400);
});

test('reading progress is upserted per user and story', async () => {
  const token = await loginToken('bandoc.daudotruyen@gmail.com');
  const headers = { Authorization: `Bearer ${token}` };
  await request('/api/stories/dau-pha-thuong-khung/chapters/1', { headers });
  await request('/api/stories/dau-pha-thuong-khung/chapters/2', { headers });
  const rows = readTestDb().history.filter(item => item.userId === 'u_user' && item.storyId === 's1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].chapterId, 'c_s1_2');
});

test('unlocking a VIP chapter is idempotent and writes ledger fields', async () => {
  const user = await registerUser('vip.idempotent@gmail.com', 'VIP Idempotent');
  const headers = { Authorization: `Bearer ${user.token}` };
  const db = readTestDb();
  db.users.find(item => item.id === user.user.id).seeds = 30;
  writeTestDb(db);

  const first = await request('/api/chapters/c_s1_5/unlock', { method: 'POST', headers });
  const second = await request('/api/chapters/c_s1_5/unlock', { method: 'POST', headers });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);

  const after = readTestDb();
  const purchases = after.purchases.filter(item => item.userId === user.user.id && item.chapterId === 'c_s1_5');
  const txns = after.transactions.filter(item => item.userId === user.user.id && item.chapterId === 'c_s1_5' && item.type === 'purchase');
  assert.equal(purchases.length, 1);
  assert.equal(txns.length, 1);
  assert.equal(after.users.find(item => item.id === user.user.id).seeds, 22);
  assert.equal(txns[0].balanceBefore, 30);
  assert.equal(txns[0].balanceAfter, 22);
});

test('mock topup is idempotent and admin adjustment writes audit log', async () => {
  const user = await registerUser('wallet.idempotent@gmail.com', 'Wallet Idempotent');
  const headers = { Authorization: `Bearer ${user.token}` };
  const first = await request('/api/wallet/topup', { method: 'POST', headers, body: JSON.stringify({ packageId: 'seed-20', idempotencyKey: 'idem-1' }) });
  const second = await request('/api/wallet/topup', { method: 'POST', headers, body: JSON.stringify({ packageId: 'seed-20', idempotencyKey: 'idem-1' }) });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(second.data.balance, first.data.balance);

  const adminToken = await loginToken();
  const adjust = await request(`/api/admin/users/${user.user.id}/adjust-balance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ amount: 5, reason: 'ledger test' })
  });
  assert.equal(adjust.response.status, 200);
  assert.ok(readTestDb().adminLogs.some(item => item.action === 'adjust_balance' && item.entityId === user.user.id));
});

test('rankings use view events for periods and story totals for all time', async () => {
  const db = readTestDb();
  db.viewEvents ||= [];
  addViewEvents(db, 's24', 9, new Date().toISOString());
  writeTestDb(db);

  const day = await request('/api/rankings?period=day&metric=views&limit=5');
  const all = await request('/api/rankings?period=all&metric=views&limit=5');
  assert.equal(day.response.status, 200);
  assert.equal(all.response.status, 200);
  assert.equal(day.data.stories[0].id, 's24');
  assert.equal(day.data.stories[0].rankScore, 9);
  assert.notEqual(day.data.stories[0].id, all.data.stories[0].id);
  assert.ok(all.data.stories[0].rankScore > day.data.stories[0].rankScore);
});

test('rankings comments and revenue use persisted records', async () => {
  const db = readTestDb();
  const today = new Date().toISOString();
  db.comments.push(
    { id: 'cmt_rank_1', storyId: 's2', userId: 'u_user', body: 'Hay', createdAt: today },
    { id: 'cmt_rank_2', storyId: 's2', userId: 'u_user', body: 'Tot', createdAt: today },
    { id: 'cmt_rank_3', storyId: 's2', userId: 'u_user', body: 'On', createdAt: today }
  );
  db.purchases.push({ id: 'pur_rank_1', userId: 'u_user', storyId: 's3', chapterId: 'c_s3_4', price: 999, createdAt: today });
  writeTestDb(db);

  const comments = await request('/api/rankings?period=day&metric=comments&limit=3');
  const revenue = await request('/api/rankings?period=day&metric=revenue&limit=3');
  assert.equal(comments.response.status, 200);
  assert.equal(revenue.response.status, 200);
  assert.equal(comments.data.stories[0].id, 's2');
  assert.equal(comments.data.stories[0].commentsCount, 3);
  assert.equal(comments.data.stories[0].rankScore, 3);
  assert.equal(revenue.data.stories[0].id, 's3');
  assert.equal(revenue.data.stories[0].revenueSeeds, 999);
  assert.equal(revenue.data.stories[0].rankScore, 999);
});

test('rankings rankDelta compares against the previous period', async () => {
  const db = readTestDb();
  db.viewEvents ||= [];
  addViewEvents(db, 's20', 40, daysAgo(1));
  addViewEvents(db, 's21', 30, daysAgo(1));
  addViewEvents(db, 's20', 5, daysAgo(8));
  addViewEvents(db, 's21', 50, daysAgo(8));
  writeTestDb(db);

  const ranking = await request('/api/rankings?period=week&metric=views&limit=5');
  assert.equal(ranking.response.status, 200);
  const s20 = ranking.data.stories.find(story => story.id === 's20');
  const s21 = ranking.data.stories.find(story => story.id === 's21');
  assert.equal(ranking.data.stories[0].id, 's20');
  assert.equal(s20.rankDelta, 1);
  assert.equal(s21.rankDelta, -1);
});

test('bookmark requires auth', async () => {
  const { response } = await request('/api/stories/s1/bookmark', { method: 'POST' });
  assert.equal(response.status, 401);
});

test('comment requires auth', async () => {
  const { response } = await request('/api/stories/s1/comments', {
    method: 'POST',
    body: JSON.stringify({ body: 'Truyen hay' })
  });
  assert.equal(response.status, 401);
});

test('rating only accepts one to five stars', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'bandoc.daudotruyen@gmail.com', password: '123456' })
  });
  const { response, data } = await request('/api/stories/s1/rating', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.data.token}` },
    body: JSON.stringify({ value: 6 })
  });
  assert.equal(response.status, 400);
  assert.match(data.message, /1 đến 5/);
});

test('admin stats rejects non-admin user', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'bandoc.daudotruyen@gmail.com', password: '123456' })
  });
  const { response } = await request('/api/admin/stats', {
    headers: { Authorization: `Bearer ${login.data.token}` }
  });
  assert.equal(response.status, 403);
});

test('admin chapters API rejects non-admin user', async () => {
  const token = await loginToken('bandoc.daudotruyen@gmail.com');
  const { response } = await request('/api/admin/chapters', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 403);
});

test('admin endpoints reject non-admin users', async () => {
  const token = await loginToken('bandoc.daudotruyen@gmail.com');
  const headers = { Authorization: `Bearer ${token}` };
  const checks = [
    ['/api/admin/dashboard', { headers }],
    ['/api/admin/users', { headers }],
    ['/api/admin/users/u_admin', { method: 'PATCH', headers, body: JSON.stringify({ note: 'nope' }) }],
    ['/api/admin/users/u_admin/adjust-balance', { method: 'POST', headers, body: JSON.stringify({ amount: 1, reason: 'nope' }) }],
    ['/api/admin/stories', { headers }],
    ['/api/admin/stories', { method: 'POST', headers, body: JSON.stringify({ title: 'Nope', author: 'Nope', description: 'Nope' }) }],
    ['/api/admin/stories/s1/status', { method: 'PATCH', headers, body: JSON.stringify({ approvalStatus: 'approved' }) }],
    ['/api/admin/stories/s1/flags', { method: 'PATCH', headers, body: JSON.stringify({ hot: true }) }],
    ['/api/admin/chapters', { headers }],
    ['/api/admin/chapters/c_s1_1/status', { method: 'PATCH', headers, body: JSON.stringify({ status: 'approved' }) }],
    ['/api/admin/reports', { headers }],
    ['/api/admin/reports/nope', { method: 'PATCH', headers, body: JSON.stringify({ status: 'resolved' }) }],
    ['/api/admin/reports/nope/actions', { method: 'POST', headers, body: JSON.stringify({ status: 'resolved' }) }],
    ['/api/admin/comments', { headers }],
    ['/api/admin/comments/nope', { method: 'PATCH', headers, body: JSON.stringify({ status: 'hidden' }) }],
    ['/api/admin/taxonomy', { headers }],
    ['/api/admin/taxonomy/categories', { method: 'POST', headers, body: JSON.stringify({ name: 'Nope' }) }],
    ['/api/admin/notifications', { headers }],
    ['/api/admin/notifications', { method: 'POST', headers, body: JSON.stringify({ title: 'Nope', body: 'Nope' }) }],
    ['/api/admin/transactions', { headers }],
    ['/api/admin/logs', { headers }]
  ];

  for (const [pathname, options] of checks) {
    const { response } = await request(pathname, options);
    assert.equal(response.status, 403, pathname);
  }
});

test('admin can lock and unlock a user, blocking protected APIs and login while locked', async () => {
  const adminToken = await loginToken();
  const userToken = await loginToken('bandoc.daudotruyen@gmail.com');

  const lock = await request('/api/admin/users/u_user', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'locked', note: 'Policy review' })
  });
  assert.equal(lock.response.status, 200);
  assert.equal(lock.data.user.status, 'locked');

  const protectedCall = await request('/api/me/profile', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(protectedCall.response.status, 401);

  const lockedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'bandoc.daudotruyen@gmail.com', password: '123456' })
  });
  assert.equal(lockedLogin.response.status, 403);

  const unlock = await request('/api/admin/users/u_user', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'active' })
  });
  assert.equal(unlock.response.status, 200);
  assert.equal(unlock.data.user.status, 'active');

  const loginAgain = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'bandoc.daudotruyen@gmail.com', password: '123456' })
  });
  assert.equal(loginAgain.response.status, 200);
});

test('only admin can set and remove mod role', async () => {
  const target = await registerUser('role.target@gmail.com', 'Role Target');
  const regular = await registerUser('role.regular@gmail.com', 'Role Regular');
  const mod = await registerMod('role.mod@gmail.com', 'Role Mod');
  const adminHeaders = { Authorization: `Bearer ${await loginToken()}` };

  const userAttempt = await request(`/api/admin/users/${target.user.id}/role`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${regular.token}` },
    body: JSON.stringify({ role: 'mod' })
  });
  assert.equal(userAttempt.response.status, 403);

  const modAttempt = await request(`/api/admin/users/${target.user.id}/role`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${mod.token}` },
    body: JSON.stringify({ role: 'mod' })
  });
  assert.equal(modAttempt.response.status, 403);

  const invalid = await request(`/api/admin/users/${target.user.id}/role`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ role: 'admin' })
  });
  assert.equal(invalid.response.status, 400);

  const missing = await request('/api/admin/users/missing-user/role', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ role: 'mod' })
  });
  assert.equal(missing.response.status, 404);

  const setMod = await request(`/api/admin/users/${target.user.id}/role`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ role: 'mod' })
  });
  assert.equal(setMod.response.status, 200);
  assert.equal(setMod.data.user.role, 'mod');

  const refreshedModToken = await loginToken('role.target@gmail.com');
  const modHeaders = { Authorization: `Bearer ${refreshedModToken}` };
  const canCreate = await request('/api/author/stories', {
    method: 'POST',
    headers: modHeaders,
    body: JSON.stringify({ title: 'Role Managed Mod Story', description: 'Mod can now create stories.', categories: ['Role'], approvalStatus: 'draft' })
  });
  assert.equal(canCreate.response.status, 201);

  const removeMod = await request(`/api/admin/users/${target.user.id}/role`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ role: 'user' })
  });
  assert.equal(removeMod.response.status, 200);
  assert.equal(removeMod.data.user.role, 'user');

  const oldTokenBlocked = await request('/api/author/stories', {
    method: 'POST',
    headers: modHeaders,
    body: JSON.stringify({ title: 'Removed Mod Story', description: 'Old token should be invalid after role change.', categories: ['Role'], approvalStatus: 'draft' })
  });
  assert.equal(oldTokenBlocked.response.status, 401);
});

test('last admin cannot be demoted', async () => {
  resetDataStore(createSeedDb());
  const adminHeaders = { Authorization: `Bearer ${await loginToken()}` };
  const attempt = await request('/api/admin/users/u_admin/role', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ role: 'user' })
  });
  assert.equal(attempt.response.status, 400);
  assert.equal(readTestDb().users.find(item => item.id === 'u_admin').role, 'admin');
});

test('admin balance adjustment persists user balance, transaction, and audit log', async () => {
  const adminToken = await loginToken();
  const before = readTestDb().users.find(user => user.id === 'u_user').seeds;
  const adjust = await request('/api/admin/users/u_user/adjust-balance', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ amount: 17, reason: 'Test admin adjustment' })
  });
  assert.equal(adjust.response.status, 200);
  assert.equal(adjust.data.user.coins, before + 17);
  assert.equal(adjust.data.transaction.type, 'admin_adjustment');

  const db = readTestDb();
  assert.ok(db.transactions.some(item => item.userId === 'u_user' && item.type === 'admin_adjustment' && item.amount === 17));
  assert.ok(db.adminLogs.some(item => item.action === 'adjust_balance' && item.entityId === 'u_user'));
});

test('admin can list chapters and approve chapter status', async () => {
  const token = await loginToken();
  const list = await request('/api/admin/chapters', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(list.response.status, 200);
  assert.ok(Array.isArray(list.data.chapters));
  assert.ok(list.data.chapters.length > 0);
  assert.ok(list.data.chapters[0].storyTitle);
  assert.ok(list.data.chapters[0].storyId);
  assert.ok(list.data.chapters[0].author);
  assert.equal(typeof list.data.chapters[0].wordCount, 'number');

  const create = await request('/api/admin/stories/s1/chapters', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Chuong can duyet',
      content: 'Noi dung chuong moi dang cho quan tri vien phe duyet.',
      status: 'pending'
    })
  });
  assert.equal(create.response.status, 201);
  assert.equal(create.data.chapter.status, 'pending');

  const approve = await request(`/api/admin/chapters/${create.data.chapter.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'approved' })
  });
  assert.equal(approve.response.status, 200);
  assert.equal(approve.data.chapter.status, 'approved');
  assert.equal(approve.data.chapter.storyTitle, 'Đấu Phá Thương Khung');

  const reloaded = await request('/api/admin/chapters', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const saved = reloaded.data.chapters.find(item => item.id === create.data.chapter.id);
  assert.equal(saved.status, 'approved');
});

test('admin can create story with publish metadata', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'quantri.daudotruyen@gmail.com', password: '123456' })
  });
  const { response, data } = await request('/api/admin/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.data.token}` },
    body: JSON.stringify({
      title: 'Truyen Test Metadata',
      author: 'Tac Gia Test',
      translator: 'Dich Gia Test',
      description: 'Mo ta test',
      categories: ['Tien Hiep'],
      language: 'Tieng Viet',
      ageRating: '16',
      hidden: true,
      chapterCountEstimate: 12,
      tags: 'test,metadata'
    })
  });
  assert.equal(response.status, 201);
  assert.equal(data.story.translator, 'Dich Gia Test');
  assert.equal(data.story.language, 'Tieng Viet');
  assert.equal(data.story.ageRating, '16');
  assert.equal(data.story.hidden, true);
  assert.equal(data.story.chapterCountEstimate, 12);
});

test('hidden and rejected chapters stay out of public story and reader endpoints', async () => {
  const token = await loginToken();
  const story = await request('/api/admin/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Chapter Visibility Story',
      author: 'Chapter Moderator',
      description: 'Story used to verify chapter visibility',
      categories: ['Moderation'],
      approvalStatus: 'approved',
      hidden: false
    })
  });
  assert.equal(story.response.status, 201);

  const rejected = await request(`/api/admin/stories/${story.data.story.id}/chapters`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ number: 1, title: 'Rejected chapter', content: 'Rejected content should not be public.', status: 'rejected' })
  });
  const hidden = await request(`/api/admin/stories/${story.data.story.id}/chapters`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ number: 2, title: 'Hidden chapter', content: 'Hidden content should not be public.', status: 'hidden' })
  });
  const approved = await request(`/api/admin/stories/${story.data.story.id}/chapters`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ number: 3, title: 'Approved chapter', content: 'Approved content is public.', status: 'approved' })
  });
  assert.equal(rejected.response.status, 201);
  assert.equal(hidden.response.status, 201);
  assert.equal(approved.response.status, 201);

  const detail = await request(`/api/stories/${story.data.story.slug}`);
  assert.equal(detail.response.status, 200);
  assert.ok(detail.data.chapters.some(item => item.id === approved.data.chapter.id));
  assert.ok(!detail.data.chapters.some(item => item.id === rejected.data.chapter.id));
  assert.ok(!detail.data.chapters.some(item => item.id === hidden.data.chapter.id));

  const rejectedRead = await request(`/api/stories/${story.data.story.slug}/chapters/1`);
  const hiddenRead = await request(`/api/stories/${story.data.story.slug}/chapters/2`);
  const approvedRead = await request(`/api/stories/${story.data.story.slug}/chapters/3`);
  assert.equal(rejectedRead.response.status, 404);
  assert.equal(hiddenRead.response.status, 404);
  assert.equal(approvedRead.response.status, 200);
});

test('scheduled chapters stay private until scheduled time', async () => {
  const token = await loginToken();
  const story = await request('/api/admin/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Scheduled Chapter Visibility Story',
      author: 'Scheduler',
      description: 'Story used to verify scheduled chapter visibility',
      categories: ['Moderation'],
      approvalStatus: 'approved',
      hidden: false
    })
  });
  assert.equal(story.response.status, 201);

  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const scheduled = await request(`/api/admin/stories/${story.data.story.id}/chapters`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ number: 1, title: 'Future scheduled', content: 'Future content should not be public yet.', status: 'scheduled', scheduledAt: future })
  });
  assert.equal(scheduled.response.status, 201);

  const detail = await request(`/api/stories/${story.data.story.slug}`);
  assert.equal(detail.response.status, 200);
  assert.ok(!detail.data.chapters.some(item => item.id === scheduled.data.chapter.id));

  const reader = await request(`/api/stories/${story.data.story.slug}/chapters/1`);
  assert.equal(reader.response.status, 404);
});

test('admin can update and delete chapters', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'quantri.daudotruyen@gmail.com', password: '123456' })
  });
  const create = await request('/api/admin/stories/s1/chapters', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.data.token}` },
    body: JSON.stringify({ title: 'Chuong test', content: 'Noi dung test' })
  });
  assert.equal(create.response.status, 201);
  const update = await request(`/api/admin/chapters/${create.data.chapter.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${login.data.token}` },
    body: JSON.stringify({ title: 'Chuong test da sua' })
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.data.chapter.title, 'Chuong test da sua');
  const remove = await request(`/api/admin/chapters/${create.data.chapter.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${login.data.token}` }
  });
  assert.equal(remove.response.status, 200);
});

test('combo purchase unlocks premium chapters', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'bandoc.daudotruyen@gmail.com', password: '123456' })
  });
  const combo = await request('/api/stories/s1/unlock-combo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.data.token}` }
  });
  assert.equal(combo.response.status, 200);
  assert.equal(combo.data.unlocked, true);
  const chapter = await request('/api/stories/dau-pha-thuong-khung/chapters/5', {
    headers: { Authorization: `Bearer ${login.data.token}` }
  });
  assert.equal(chapter.response.status, 200);
  assert.equal(chapter.data.unlocked, true);
  assert.doesNotMatch(chapter.data.chapter.content, /Đoạn xem trước/);
});

test('notification APIs require auth, isolate users, and persist read/delete state', async () => {
  const userToken = await loginToken('bandoc.daudotruyen@gmail.com');
  const adminToken = await loginToken('quantri.daudotruyen@gmail.com');
  const db = readTestDb();
  db.notifications.unshift(
    { id: 'noti_private_user', userId: 'u_user', type: 'system', title: 'User private', body: 'Only user can see this', link: '/account', read: false, createdAt: new Date().toISOString() },
    { id: 'noti_private_admin', userId: 'u_admin', type: 'system', title: 'Admin private', body: 'Only admin can see this', link: '/admin', read: false, createdAt: new Date().toISOString() }
  );
  writeTestDb(db);

  const unauthenticated = await request('/api/notifications');
  assert.equal(unauthenticated.response.status, 401);

  const userList = await request('/api/notifications?limit=20', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(userList.response.status, 200);
  assert.ok(userList.data.notifications.some(item => item.id === 'noti_private_user'));
  assert.ok(!userList.data.notifications.some(item => item.id === 'noti_private_admin'));

  const beforeCount = await request('/api/notifications/unread-count', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  const forbiddenRead = await request('/api/notifications/noti_private_admin/read', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(forbiddenRead.response.status, 404);

  const readOne = await request('/api/notifications/noti_private_user/read', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(readOne.response.status, 200);
  assert.equal(readOne.data.notification.read, true);
  assert.equal(readOne.data.unreadCount, beforeCount.data.count - 1);

  const reloaded = await request('/api/notifications?limit=20', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(reloaded.data.notifications.find(item => item.id === 'noti_private_user').read, true);

  const forbiddenDelete = await request('/api/notifications/noti_private_admin', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(forbiddenDelete.response.status, 404);

  const deleteOwn = await request('/api/notifications/noti_private_user', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(deleteOwn.response.status, 200);

  const adminList = await request('/api/notifications?limit=20', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.ok(adminList.data.notifications.some(item => item.id === 'noti_private_admin'));
});

test('read-all clears unread notification count', async () => {
  const userToken = await loginToken('bandoc.daudotruyen@gmail.com');
  const db = readTestDb();
  db.notifications.unshift(
    { id: 'noti_read_all_1', userId: 'u_user', type: 'system', title: 'A', body: 'A', read: false, createdAt: new Date().toISOString() },
    { id: 'noti_read_all_2', userId: 'u_user', type: 'wallet', title: 'B', body: 'B', read: false, createdAt: new Date().toISOString() }
  );
  writeTestDb(db);

  const readAll = await request('/api/notifications/read-all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(readAll.response.status, 200);
  assert.equal(readAll.data.unreadCount, 0);

  const count = await request('/api/notifications/unread-count', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(count.data.count, 0);
});

test('user actions create notifications for the correct recipients', async () => {
  const userToken = await loginToken('bandoc.daudotruyen@gmail.com');
  const adminToken = await loginToken('quantri.daudotruyen@gmail.com');

  const topup = await request('/api/wallet/topup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ packageId: 'seed-10' })
  });
  assert.equal(topup.response.status, 200);

  const unlock = await request('/api/chapters/c_s1_5/unlock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(unlock.response.status, 200);

  const comment = await request('/api/stories/s1/comments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ body: 'Thong bao cho chu truyen' })
  });
  assert.equal(comment.response.status, 201);

  const follow = await request('/api/stories/s2/follow', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.equal(follow.response.status, 200);
  assert.equal(follow.data.followed, true);

  const userNotifications = await request('/api/notifications?limit=50', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.ok(userNotifications.data.notifications.some(item => item.type === 'wallet'));
  assert.ok(userNotifications.data.notifications.some(item => item.type === 'purchase' && item.chapterId === 'c_s1_5'));
  assert.ok(!userNotifications.data.notifications.some(item => item.type === 'comment' && item.actorId === 'u_user'));

  const adminNotifications = await request('/api/notifications?limit=50', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.ok(adminNotifications.data.notifications.some(item => item.type === 'comment' && item.actorId === 'u_user' && item.storyId === 's1'));
  assert.ok(adminNotifications.data.notifications.some(item => item.type === 'follow' && item.actorId === 'u_user' && item.storyId === 's2'));
});

test('chapter publish notifications go only to followers with chapter notifications enabled', async () => {
  const userToken = await loginToken('bandoc.daudotruyen@gmail.com');
  const adminToken = await loginToken('quantri.daudotruyen@gmail.com');

  const first = await request('/api/admin/stories/s7/chapters', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ title: 'Follower notified chapter', content: 'New approved content for followers.', status: 'approved' })
  });
  assert.equal(first.response.status, 201);

  const chapterNotifications = await request('/api/notifications?type=chapter&limit=20', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.ok(chapterNotifications.data.notifications.some(item => item.chapterId === first.data.chapter.id));

  const prefs = await request('/api/me/notification-preferences', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ chapterNotifications: false })
  });
  assert.equal(prefs.response.status, 200);

  const second = await request('/api/admin/stories/s7/chapters', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ title: 'Muted follower chapter', content: 'This should respect chapter preferences.', status: 'approved' })
  });
  assert.equal(second.response.status, 201);

  const mutedNotifications = await request('/api/notifications?type=chapter&limit=50', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.ok(!mutedNotifications.data.notifications.some(item => item.chapterId === second.data.chapter.id));
});

test('admin can review reports', async () => {
  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'bandoc.daudotruyen@gmail.com', password: '123456' })
  });
  const report = await request('/api/stories/s1/report', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userLogin.data.token}` },
    body: JSON.stringify({ reason: 'Noi dung can kiem tra' })
  });
  assert.equal(report.response.status, 201);
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'quantri.daudotruyen@gmail.com', password: '123456' })
  });
  const list = await request('/api/admin/reports', {
    headers: { Authorization: `Bearer ${adminLogin.data.token}` }
  });
  assert.equal(list.response.status, 200);
  assert.ok(list.data.reports.some(item => item.id === report.data.report.id));
  const update = await request(`/api/admin/reports/${report.data.report.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminLogin.data.token}` },
    body: JSON.stringify({ status: 'resolved' })
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.data.report.status, 'resolved');
});

test('admin report action hides content and creates audit log', async () => {
  const adminToken = await loginToken();
  const userToken = await loginToken('bandoc.daudotruyen@gmail.com');
  const create = await request('/api/admin/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      title: 'Report Hide Action Story',
      author: 'Reporter Target',
      description: 'Story used to verify report actions hide content',
      categories: ['Moderation'],
      approvalStatus: 'approved',
      hidden: false
    })
  });
  assert.equal(create.response.status, 201);

  const report = await request(`/api/stories/${create.data.story.id}/report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ reason: 'Hide this story through admin action' })
  });
  assert.equal(report.response.status, 201);

  const action = await request(`/api/admin/reports/${report.data.report.id}/actions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      status: 'resolved',
      adminNote: 'Hidden after moderation',
      hideContent: true,
      targetType: 'story',
      targetId: create.data.story.id
    })
  });
  assert.equal(action.response.status, 200);
  assert.equal(action.data.report.status, 'resolved');

  const publicList = await request(`/api/stories?q=${encodeURIComponent('Report Hide Action Story')}`);
  assert.equal(publicList.response.status, 200);
  assert.equal(publicList.data.stories.length, 0);

  const logs = await request('/api/admin/logs?entityType=report', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(logs.response.status, 200);
  assert.ok(logs.data.logs.some(item => item.action === 'resolve_report' && item.entityId === report.data.report.id));
});

test('pending stories stay out of public listing', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'quantri.daudotruyen@gmail.com', password: '123456' })
  });
  const create = await request('/api/admin/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.data.token}` },
    body: JSON.stringify({
      title: 'Pending Story Test',
      author: 'Pending Author',
      description: 'Pending description',
      categories: ['Pending'],
      approvalStatus: 'pending'
    })
  });
  assert.equal(create.response.status, 201);
  const list = await request('/api/stories?q=Pending%20Story%20Test');
  assert.equal(list.response.status, 200);
  assert.equal(list.data.stories.length, 0);
});

test('story moderation status controls public listing', async () => {
  const token = await loginToken();
  const create = await request('/api/admin/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Story Status Public Toggle',
      author: 'Story Moderator',
      description: 'Story used to verify public status toggle',
      categories: ['Moderation'],
      approvalStatus: 'pending',
      hidden: false
    })
  });
  assert.equal(create.response.status, 201);

  const pendingList = await request('/api/stories?q=Story%20Status%20Public%20Toggle');
  assert.equal(pendingList.data.stories.length, 0);

  const approve = await request(`/api/admin/stories/${create.data.story.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ approvalStatus: 'approved', hidden: false })
  });
  assert.equal(approve.response.status, 200);
  assert.equal(approve.data.story.approvalStatus, 'approved');
  const approvedList = await request('/api/stories?q=Story%20Status%20Public%20Toggle');
  assert.equal(approvedList.data.stories.length, 1);

  const reject = await request(`/api/admin/stories/${create.data.story.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ approvalStatus: 'rejected' })
  });
  assert.equal(reject.response.status, 200);
  const rejectedList = await request('/api/stories?q=Story%20Status%20Public%20Toggle');
  assert.equal(rejectedList.data.stories.length, 0);

  const hide = await request(`/api/admin/stories/${create.data.story.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ approvalStatus: 'approved', hidden: true })
  });
  assert.equal(hide.response.status, 200);
  const hiddenList = await request('/api/stories?q=Story%20Status%20Public%20Toggle');
  assert.equal(hiddenList.data.stories.length, 0);
});

test('hidden stories stay out of public listing', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'quantri.daudotruyen@gmail.com', password: '123456' })
  });
  const create = await request('/api/admin/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.data.token}` },
    body: JSON.stringify({
      title: 'Hidden Story Test',
      author: 'Hidden Author',
      description: 'Hidden description',
      categories: ['Hidden'],
      hidden: true
    })
  });
  assert.equal(create.response.status, 201);
  const list = await request('/api/stories?q=Hidden%20Story%20Test');
  assert.equal(list.response.status, 200);
  assert.equal(list.data.stories.length, 0);
});

test('admin-created story is public and appears first in newest listing without redeploy', async () => {
  const token = await loginToken();
  const title = 'Newest Admin Published Story';
  const create = await request('/api/admin/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title,
      author: 'Admin Author',
      description: 'Story should be public immediately after admin creates it.',
      categories: ['Newest']
    })
  });

  assert.equal(create.response.status, 201);
  assert.equal(create.data.story.approvalStatus, 'approved');
  assert.equal(create.data.story.hidden, false);
  assert.ok(create.data.story.slug);

  const newest = await request('/api/stories?sort=created&limit=1');
  assert.equal(newest.response.status, 200);
  assert.equal(newest.response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(newest.data.stories[0].id, create.data.story.id);
  assert.equal(newest.data.stories[0].title, title);
  assert.ok(newest.data.stories[0].createdAt);

  const detail = await request(`/api/stories/${create.data.story.slug}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.data.story.id, create.data.story.id);
});

test('author APIs require authentication', async () => {
  const { response } = await request('/api/author/stats');
  assert.equal(response.status, 401);
});

test('user and invalid roles cannot use author APIs', async () => {
  const regular = await registerUser('regular.author.block@gmail.com', 'Regular Block');
  const regularHeaders = { Authorization: `Bearer ${regular.token}` };
  const blocked = await request('/api/author/stories', {
    method: 'POST',
    headers: regularHeaders,
    body: JSON.stringify({ title: 'Blocked User Story', description: 'Should be forbidden.', categories: ['Blocked'], approvalStatus: 'draft' })
  });
  assert.equal(blocked.response.status, 403);

  const invalid = await registerUser('invalid.role.block@gmail.com', 'Invalid Role Block');
  const db = readTestDb();
  db.users.find(item => item.id === invalid.user.id).role = 'superuser';
  writeTestDb(db);
  const invalidRole = await request('/api/author/stories', {
    method: 'POST',
    headers: { Authorization: `Bearer ${invalid.token}` },
    body: JSON.stringify({ title: 'Invalid Role Story', description: 'Should also be forbidden.', categories: ['Blocked'], approvalStatus: 'draft' })
  });
  assert.equal(invalidRole.response.status, 403);
});

test('author can create draft and pending stories with ownerId', async () => {
  const author = await registerMod('author.create@gmail.com', 'Author Create');
  const headers = { Authorization: `Bearer ${author.token}` };

  const draft = await request('/api/author/stories', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Author Draft Story',
      description: 'Short draft description',
      categories: ['Test'],
      approvalStatus: 'draft'
    })
  });
  assert.equal(draft.response.status, 201);
  assert.equal(draft.data.story.ownerId, author.user.id);
  assert.equal(draft.data.story.approvalStatus, 'draft');
  assert.equal(draft.data.story.hidden, true);

  const pending = await request('/api/author/stories', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Author Pending Story',
      description: 'Pending story has enough description for moderation flow.',
      categories: ['Test'],
      approvalStatus: 'pending'
    })
  });
  assert.equal(pending.response.status, 201);
  assert.equal(pending.data.story.ownerId, author.user.id);
  assert.equal(pending.data.story.approvalStatus, 'pending');
  assert.equal(pending.data.story.hidden, true);
});

test('author cannot edit another owner story or chapter', async () => {
  const owner = await registerMod('owner.author@gmail.com', 'Owner Author');
  const intruder = await registerMod('intruder.author@gmail.com', 'Intruder Author');
  const ownerHeaders = { Authorization: `Bearer ${owner.token}` };
  const intruderHeaders = { Authorization: `Bearer ${intruder.token}` };

  const story = await request('/api/author/stories', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      title: 'Owned Story Lock',
      description: 'Owned story description for permission checks.',
      categories: ['Permission'],
      approvalStatus: 'pending'
    })
  });
  assert.equal(story.response.status, 201);

  const chapter = await request(`/api/author/stories/${story.data.story.id}/chapters`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      title: 'Owned Chapter',
      content: 'This chapter content is long enough for validation and belongs only to the original story owner.',
      status: 'pending'
    })
  });
  assert.equal(chapter.response.status, 201);

  const editStory = await request(`/api/author/stories/${story.data.story.id}`, {
    method: 'PUT',
    headers: intruderHeaders,
    body: JSON.stringify({ title: 'Stolen Story', approvalStatus: 'draft' })
  });
  assert.equal(editStory.response.status, 403);

  const editChapter = await request(`/api/author/chapters/${chapter.data.chapter.id}`, {
    method: 'PUT',
    headers: intruderHeaders,
    body: JSON.stringify({ title: 'Stolen Chapter', status: 'draft' })
  });
  assert.equal(editChapter.response.status, 403);
});

test('admin approval publishes author story to public listing', async () => {
  const author = await registerMod('approval.author@gmail.com', 'Approval Author');
  const authorHeaders = { Authorization: `Bearer ${author.token}` };
  const adminToken = await loginToken();
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const title = 'Author Approval Public Story';

  const create = await request('/api/author/stories', {
    method: 'POST',
    headers: authorHeaders,
    body: JSON.stringify({
      title,
      description: 'This author story should become public only after admin approval.',
      categories: ['Approval'],
      approvalStatus: 'pending'
    })
  });
  assert.equal(create.response.status, 201);

  const before = await request(`/api/stories?q=${encodeURIComponent(title)}`);
  assert.equal(before.response.status, 200);
  assert.equal(before.data.stories.length, 0);

  const approve = await request(`/api/admin/stories/${create.data.story.id}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ approvalStatus: 'approved' })
  });
  assert.equal(approve.response.status, 200);
  assert.equal(approve.data.story.approvalStatus, 'approved');
  assert.equal(approve.data.story.hidden, false);

  const after = await request(`/api/stories?q=${encodeURIComponent(title)}`);
  assert.equal(after.response.status, 200);
  assert.equal(after.data.stories.length, 1);
});

test('author can add single and bulk chapters before story approval', async () => {
  const author = await registerMod('pending.chapter.author@gmail.com', 'Pending Chapter Author');
  const authorHeaders = { Authorization: `Bearer ${author.token}` };
  const adminHeaders = { Authorization: `Bearer ${await loginToken()}` };
  const title = 'Pending Story With Ready Chapters';

  const create = await request('/api/author/stories', {
    method: 'POST',
    headers: authorHeaders,
    body: JSON.stringify({
      title,
      description: 'Pending story with chapters that can be prepared before admin approval.',
      categories: ['Author Flow'],
      approvalStatus: 'pending'
    })
  });
  assert.equal(create.response.status, 201);
  assert.equal(create.data.story.approvalStatus, 'pending');

  const single = await request(`/api/author/stories/${create.data.story.id}/chapters`, {
    method: 'POST',
    headers: authorHeaders,
    body: JSON.stringify({
      number: 1,
      title: 'Chapter One Ready',
      content: 'This is a prepared chapter added while the story is still pending approval. It should be saved for the author immediately.',
      status: 'published'
    })
  });
  assert.equal(single.response.status, 201);
  assert.equal(single.data.chapter.status, 'approved');

  const duplicate = await request(`/api/author/stories/${create.data.story.id}/chapters`, {
    method: 'POST',
    headers: authorHeaders,
    body: JSON.stringify({
      number: 1,
      title: 'Duplicate Chapter Number',
      content: 'This duplicate chapter number should be rejected by validation.',
      status: 'published'
    })
  });
  assert.equal(duplicate.response.status, 400);

  const bulk = await request(`/api/author/stories/${create.data.story.id}/chapters/bulk`, {
    method: 'POST',
    headers: authorHeaders,
    body: JSON.stringify({
      mode: 'published',
      access: 'free',
      renumber: false,
      chapters: [
        { number: 2, title: 'Bulk Chapter Two', content: 'Second prepared chapter content for bulk creation before approval.' },
        { number: 3, title: 'Bulk Chapter Three', content: 'Third prepared chapter content for bulk creation before approval.' }
      ]
    })
  });
  assert.equal(bulk.response.status, 201);
  assert.equal(bulk.data.created, 2);
  assert.equal(bulk.data.errors.length, 0);

  const uploadBody = new FormData();
  uploadBody.append('file', new Blob([`Chuong 4: Imported Four\nImported chapter four content.\n\nChapter 5 - Imported Five\nImported chapter five content.`], { type: 'text/plain' }), 'chapters.txt');
  const imported = await request(`/api/author/stories/${create.data.story.id}/chapters/import`, {
    method: 'POST',
    headers: authorHeaders,
    body: uploadBody
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.data.chapters.length, 2);
  assert.equal(imported.data.chapters[0].number, 4);

  const authorChapters = await request(`/api/author/chapters?storyId=${create.data.story.id}`, { headers: authorHeaders });
  assert.equal(authorChapters.response.status, 200);
  assert.equal(authorChapters.data.chapters.length, 3);

  const beforePublic = await request(`/api/stories/${create.data.story.slug}`);
  assert.equal(beforePublic.response.status, 404);

  const approve = await request(`/api/admin/stories/${create.data.story.id}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ approvalStatus: 'approved' })
  });
  assert.equal(approve.response.status, 200);

  const detail = await request(`/api/stories/${create.data.story.slug}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.data.chapters.length, 3);

  const reader = await request(`/api/stories/${create.data.story.slug}/chapters/1`);
  assert.equal(reader.response.status, 200);
  assert.equal(reader.data.chapter.title, 'Chapter One Ready');
});

test('draft rejected and hidden author stories are not public', async () => {
  const author = await registerMod('visibility.author@gmail.com', 'Visibility Author');
  const headers = { Authorization: `Bearer ${author.token}` };
  const adminHeaders = { Authorization: `Bearer ${await loginToken()}` };

  const draft = await request('/api/author/stories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Author Draft Not Public', description: 'Draft hidden by default.', categories: ['Visibility'], approvalStatus: 'draft' })
  });
  const rejected = await request('/api/author/stories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Author Rejected Not Public', description: 'Rejected hidden by moderation.', categories: ['Visibility'], approvalStatus: 'pending' })
  });
  const hidden = await request('/api/author/stories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Author Approved Hidden Not Public', description: 'Approved but then hidden.', categories: ['Visibility'], approvalStatus: 'pending' })
  });
  assert.equal(draft.response.status, 201);
  assert.equal(rejected.response.status, 201);
  assert.equal(hidden.response.status, 201);

  await request(`/api/admin/stories/${rejected.data.story.id}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ approvalStatus: 'rejected', rejectionReason: 'Need edits' })
  });
  await request(`/api/admin/stories/${hidden.data.story.id}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ approvalStatus: 'approved', hidden: true })
  });

  for (const title of ['Author Draft Not Public', 'Author Rejected Not Public', 'Author Approved Hidden Not Public']) {
    const list = await request(`/api/stories?q=${encodeURIComponent(title)}`);
    assert.equal(list.response.status, 200);
    assert.equal(list.data.stories.length, 0);
  }
});

test('author revenue only includes owned stories', async () => {
  const first = await registerMod('revenue.author.a@gmail.com', 'Revenue Author A');
  const second = await registerMod('revenue.author.b@gmail.com', 'Revenue Author B');
  const firstHeaders = { Authorization: `Bearer ${first.token}` };
  const secondHeaders = { Authorization: `Bearer ${second.token}` };

  const firstStory = await request('/api/author/stories', {
    method: 'POST',
    headers: firstHeaders,
    body: JSON.stringify({ title: 'Revenue Owned Story', description: 'Owned revenue story.', categories: ['Revenue'], approvalStatus: 'draft' })
  });
  const secondStory = await request('/api/author/stories', {
    method: 'POST',
    headers: secondHeaders,
    body: JSON.stringify({ title: 'Revenue Other Story', description: 'Other revenue story.', categories: ['Revenue'], approvalStatus: 'draft' })
  });
  assert.equal(firstStory.response.status, 201);
  assert.equal(secondStory.response.status, 201);

  const db = readTestDb();
  db.purchases.push(
    { id: 'pur_author_revenue_owned', userId: 'u_user', storyId: firstStory.data.story.id, chapterId: null, price: 75, createdAt: new Date().toISOString() },
    { id: 'pur_author_revenue_other', userId: 'u_user', storyId: secondStory.data.story.id, chapterId: null, price: 125, createdAt: new Date().toISOString() }
  );
  db.transactions.push(
    { id: 'txn_author_revenue_owned', userId: 'u_user', storyId: firstStory.data.story.id, type: 'purchase', amount: -75, createdAt: new Date().toISOString() },
    { id: 'txn_author_revenue_other', userId: 'u_user', storyId: secondStory.data.story.id, type: 'purchase', amount: -125, createdAt: new Date().toISOString() }
  );
  writeTestDb(db);

  const revenue = await request('/api/author/revenue', { headers: firstHeaders });
  assert.equal(revenue.response.status, 200);
  assert.equal(revenue.data.revenue.totalRevenue, 75);
  assert.ok(revenue.data.revenue.byStory.some(item => item.storyId === firstStory.data.story.id && item.revenue === 75));
  assert.ok(!revenue.data.revenue.byStory.some(item => item.storyId === secondStory.data.story.id && item.revenue > 0));
});

test('promotion purchase deducts wallet and creates transaction', async () => {
  const author = await registerMod('promotion.author@gmail.com', 'Promotion Author');
  const headers = { Authorization: `Bearer ${author.token}` };
  const story = await request('/api/author/stories', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Promotion Owned Story',
      description: 'Story used to buy a promotion package.',
      categories: ['Promotion'],
      approvalStatus: 'draft'
    })
  });
  assert.equal(story.response.status, 201);

  const topup = await request('/api/wallet/topup', {
    method: 'POST',
    headers,
    body: JSON.stringify({ packageId: 'seed-100' })
  });
  assert.equal(topup.response.status, 200);
  const beforeBalance = topup.data.balance;

  const buy = await request('/api/author/promotions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ storyId: story.data.story.id, packageId: 'promo-1' })
  });
  assert.equal(buy.response.status, 201);
  assert.equal(buy.data.promotion.storyId, story.data.story.id);
  assert.equal(buy.data.balance, beforeBalance - 120);

  const db = readTestDb();
  assert.ok(db.promotions.some(item => item.id === buy.data.promotion.id && item.ownerId === author.user.id));
  assert.ok(db.transactions.some(item => item.type === 'promotion' && item.promotionId === buy.data.promotion.id && item.amount === -120));
});
