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

async function loginToken(email = 'admin@example.com', password = '123456') {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(login.response.status, 200);
  return login.data.token;
}

function readTestDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeTestDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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

test('newsletter validates and stores subscriber email', async () => {
  const invalid = await request('/api/newsletter', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email' })
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.data.message, /Email/i);

  const created = await request('/api/newsletter', {
    method: 'POST',
    body: JSON.stringify({ email: 'reader-news@example.com', source: 'footer' })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.subscribed, true);

  const duplicate = await request('/api/newsletter', {
    method: 'POST',
    body: JSON.stringify({ email: 'reader-news@example.com', source: 'footer' })
  });
  assert.equal(duplicate.response.status, 200);

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  assert.equal(db.newsletters.filter(item => item.email === 'reader-news@example.com').length, 1);
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

test('admin chapters API rejects non-admin user', async () => {
  const token = await loginToken('user@example.com');
  const { response } = await request('/api/admin/chapters', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 403);
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
