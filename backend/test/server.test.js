const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const test = require('node:test');
const { createSeedDb, handle } = require('../src/server');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const BACKUP_PATH = path.join(__dirname, '..', 'data', 'db.test.backup.json');

let server;
let baseUrl;

function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  }).then(async response => {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return { response, data };
  });
}

test.before(async () => {
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  fs.writeFileSync(DB_PATH, JSON.stringify(createSeedDb(), null, 2));
  server = http.createServer(handle);
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.copyFileSync(BACKUP_PATH, DB_PATH);
  fs.unlinkSync(BACKUP_PATH);
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
    body: JSON.stringify({ name: 'Test User', email: 'invalid', password: '123456' })
  });
  assert.equal(response.status, 400);
  assert.match(data.message, /Email/i);
});

test('login returns token and user', async () => {
  const { response, data } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.com', password: '123456' })
  });
  assert.equal(response.status, 200);
  assert.ok(data.token);
  assert.equal(data.user.email, 'user@example.com');
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
    body: JSON.stringify({ email: 'user@example.com', password: '123456' })
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
    body: JSON.stringify({ email: 'user@example.com', password: '123456' })
  });
  const { response } = await request('/api/admin/stats', {
    headers: { Authorization: `Bearer ${login.data.token}` }
  });
  assert.equal(response.status, 403);
});

test('admin can create story with publish metadata', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@example.com', password: '123456' })
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

test('admin can update and delete chapters', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@example.com', password: '123456' })
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
    body: JSON.stringify({ email: 'user@example.com', password: '123456' })
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

test('admin can review reports', async () => {
  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.com', password: '123456' })
  });
  const report = await request('/api/stories/s1/report', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userLogin.data.token}` },
    body: JSON.stringify({ reason: 'Noi dung can kiem tra' })
  });
  assert.equal(report.response.status, 201);
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@example.com', password: '123456' })
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

test('pending stories stay out of public listing', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@example.com', password: '123456' })
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

test('hidden stories stay out of public listing', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@example.com', password: '123456' })
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
