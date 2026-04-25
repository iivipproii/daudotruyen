const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const JSON_LIMIT = 1024 * 1024;

function now() {
  return new Date().toISOString();
}

function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(createSeedDb(), null, 2));
  }
  return ensureDbShape(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(data) {
  return crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
}

function createToken(user) {
  const payload = base64url(JSON.stringify({ id: user.id, email: user.email, role: user.role, iat: Date.now() }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (sign(payload) !== signature) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return { salt, passwordHash };
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, salt, ...safe } = user;
  return safe;
}

function corsHeaders(req) {
  const origin = req.headers && req.headers.origin;
  if (!FRONTEND_ORIGIN || FRONTEND_ORIGIN === '*') {
    return { 'Access-Control-Allow-Origin': '*' };
  }
  const allowed = FRONTEND_ORIGIN.split(',').map(item => item.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  return { 'Access-Control-Allow-Origin': allowed[0] || FRONTEND_ORIGIN };
}

function send(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(res.req || { headers: {} }),
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders
  });
  res.end(payload);
}

function notFound(res) {
  send(res, 404, { message: 'Không tìm thấy tài nguyên.' });
}

function badRequest(res, message) {
  send(res, 400, { message });
}

function unauthorized(res) {
  send(res, 401, { message: 'Vui lòng đăng nhập để tiếp tục.' });
}

function forbidden(res) {
  send(res, 403, { message: 'Bạn không có quyền thực hiện thao tác này.' });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > JSON_LIMIT) {
        reject(new Error('Body quá lớn.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('JSON không hợp lệ.'));
      }
    });
  });
}

function getAuthUser(req, db) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) return null;
  return db.users.find(user => user.id === payload.id) || null;
}

function requireUser(req, res, db) {
  const user = getAuthUser(req, db);
  if (!user) unauthorized(res);
  return user;
}

function requireAdmin(req, res, db) {
  const user = requireUser(req, res, db);
  if (!user) return null;
  if (user.role !== 'admin') {
    forbidden(res);
    return null;
  }
  return user;
}

function enrichStory(db, story, viewerId) {
  const chapters = db.chapters
    .filter(chapter => chapter.storyId === story.id)
    .sort((a, b) => a.number - b.number);
  const ratings = db.ratings.filter(item => item.storyId === story.id);
  const ratingAvg = ratings.length
    ? Number((ratings.reduce((sum, item) => sum + item.value, 0) / ratings.length).toFixed(1))
    : story.rating;
  return {
    ...story,
    approvalStatus: story.approvalStatus || 'approved',
    rating: ratingAvg,
    ratingCount: ratings.length,
    myRating: viewerId ? ratings.find(item => item.userId === viewerId && item.storyId === story.id)?.value || 0 : 0,
    chapterCount: chapters.length,
    latestChapter: chapters.at(-1) || null,
    bookmarked: viewerId ? db.bookmarks.some(item => item.userId === viewerId && item.storyId === story.id) : false,
    followed: viewerId ? db.follows.some(item => item.userId === viewerId && item.storyId === story.id) : false
  };
}

function match(pathname, pattern) {
  const names = [];
  const regex = new RegExp('^' + pattern.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  }) + '$');
  const hit = pathname.match(regex);
  if (!hit) return null;
  return names.reduce((params, name, index) => {
    params[name] = decodeURIComponent(hit[index + 1]);
    return params;
  }, {});
}

function storySummary(story) {
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    author: story.author,
    cover: story.cover,
    description: story.description,
    status: story.status,
    premium: story.premium,
    price: story.price,
    views: story.views,
    rating: story.rating,
    ratingCount: story.ratingCount,
    approvalStatus: story.approvalStatus || 'approved',
    follows: story.follows,
    categories: story.categories,
    tags: story.tags,
    translator: story.translator,
    language: story.language,
    ageRating: story.ageRating,
    hidden: story.hidden,
    chapterCountEstimate: story.chapterCountEstimate,
    updatedAt: story.updatedAt,
    chapterCount: story.chapterCount,
    latestChapter: story.latestChapter,
    bookmarked: story.bookmarked,
    followed: story.followed
  };
}

function ensureDbShape(db) {
  db.users ||= [];
  db.stories ||= [];
  db.chapters ||= [];
  db.bookmarks ||= [];
  db.follows ||= [];
  db.history ||= [];
  db.purchases ||= [];
  db.transactions ||= [];
  db.comments ||= [];
  db.ratings ||= [];
  db.notifications ||= [];
  db.reports ||= [];
  db.stories.forEach(story => {
    if (!story.approvalStatus) story.approvalStatus = story.hidden ? 'pending' : 'approved';
  });
  return db;
}

function isPublicStory(story) {
  return !story.hidden && (story.approvalStatus || 'approved') === 'approved';
}

function publicComment(db, comment) {
  const user = db.users.find(item => item.id === comment.userId);
  return {
    id: comment.id,
    storyId: comment.storyId,
    userId: comment.userId,
    userName: user?.name || 'Bạn đọc',
    userAvatar: user?.avatar || '/images/logo.png',
    body: comment.body,
    createdAt: comment.createdAt
  };
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const db = readDb();
  const viewer = getAuthUser(req, db);

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return send(res, 200, { ok: true, app: 'Đậu Đỏ Truyện API', time: now() });
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = db.users.find(item => item.email.toLowerCase() === email);
      if (!user) return badRequest(res, 'Email hoặc mật khẩu không đúng.');
      const check = hashPassword(password, user.salt);
      if (check.passwordHash !== user.passwordHash) return badRequest(res, 'Email hoặc mật khẩu không đúng.');
      return send(res, 200, { token: createToken(user), user: safeUser(user) });
    }

    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!name || !email || !password) return badRequest(res, 'Vui lòng nhập đủ họ tên, email và mật khẩu.');
      if (name.length > 80) return badRequest(res, 'Họ tên quá dài.');
      if (!isEmail(email)) return badRequest(res, 'Email không hợp lệ.');
      if (password.length < 6) return badRequest(res, 'Mật khẩu cần ít nhất 6 ký tự.');
      if (db.users.some(user => user.email.toLowerCase() === email)) return badRequest(res, 'Email đã tồn tại.');
      const hashed = hashPassword(password);
      const user = {
        id: uid('user'),
        name,
        email,
        role: 'user',
        seeds: 30,
        avatar: '/images/logo.png',
        createdAt: now(),
        salt: hashed.salt,
        passwordHash: hashed.passwordHash
      };
      db.users.push(user);
      db.transactions.push({ id: uid('txn'), userId: user.id, type: 'bonus', amount: 30, note: 'Thưởng đăng ký tài khoản mới', createdAt: now() });
      writeDb(db);
      return send(res, 201, { token: createToken(user), user: safeUser(user) });
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const user = requireUser(req, res, db);
      if (!user) return;
      return send(res, 200, { user: safeUser(user) });
    }

    if (req.method === 'PATCH' && pathname === '/api/me/profile') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      if (!name) return badRequest(res, 'Tên hiển thị là bắt buộc.');
      if (name.length > 80) return badRequest(res, 'Tên hiển thị quá dài.');
      if (!isEmail(email)) return badRequest(res, 'Email không hợp lệ.');
      if (db.users.some(item => item.id !== user.id && item.email.toLowerCase() === email)) return badRequest(res, 'Email đã tồn tại.');
      user.name = name;
      user.email = email;
      ['phone','birthday','gender','address','website','bio','avatar','cover'].forEach(key => {
        if (body[key] !== undefined) user[key] = String(body[key] || '').trim().slice(0, key === 'bio' ? 500 : 220);
      });
      user.updatedAt = now();
      writeDb(db);
      return send(res, 200, { user: safeUser(user) });
    }

    if (req.method === 'PATCH' && pathname === '/api/me/preferences') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      user.preferences = {
        ...(user.preferences || {}),
        ...Object.fromEntries(Object.entries(body).map(([key, value]) => [key, Boolean(value)]))
      };
      user.updatedAt = now();
      writeDb(db);
      return send(res, 200, { user: safeUser(user) });
    }

    if (req.method === 'POST' && pathname === '/api/me/password') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      const confirmPassword = String(body.confirmPassword || '');
      const check = hashPassword(currentPassword, user.salt);
      if (check.passwordHash !== user.passwordHash) return badRequest(res, 'Mật khẩu hiện tại không đúng.');
      if (newPassword.length < 8) return badRequest(res, 'Mật khẩu mới cần ít nhất 8 ký tự.');
      if (newPassword !== confirmPassword) return badRequest(res, 'Xác nhận mật khẩu không khớp.');
      const next = hashPassword(newPassword);
      user.salt = next.salt;
      user.passwordHash = next.passwordHash;
      user.updatedAt = now();
      db.notifications.push({ id: uid('noti'), userId: user.id, type: 'security', title: 'Đã đổi mật khẩu', body: 'Mật khẩu tài khoản của bạn vừa được cập nhật.', read: false, createdAt: now() });
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/categories') {
      const categories = Array.from(new Set(db.stories.filter(isPublicStory).flatMap(story => story.categories))).sort();
      return send(res, 200, { categories });
    }

    if (req.method === 'GET' && pathname === '/api/stories') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const category = url.searchParams.get('category') || '';
      const status = url.searchParams.get('status') || '';
      const premium = url.searchParams.get('premium') || '';
      const ageRating = url.searchParams.get('ageRating') || '';
      const sort = url.searchParams.get('sort') || 'updated';
      const featured = url.searchParams.get('featured') === 'true';
      let items = db.stories.filter(isPublicStory).map(story => enrichStory(db, story, viewer && viewer.id));
      if (q) items = items.filter(story => [story.title, story.author, story.description, ...story.categories].join(' ').toLowerCase().includes(q));
      if (category) items = items.filter(story => story.categories.includes(category));
      if (status) items = items.filter(story => story.status === status);
      if (premium) items = items.filter(story => String(story.premium) === premium);
      if (ageRating) items = items.filter(story => story.ageRating === ageRating);
      if (featured) items = items.filter(story => story.featured);
      items.sort((a, b) => {
        if (sort === 'views') return b.views - a.views;
        if (sort === 'rating') return b.rating - a.rating;
        if (sort === 'follows') return b.follows - a.follows;
        if (sort === 'chapters') return b.chapterCount - a.chapterCount;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
      return send(res, 200, { stories: items.map(storySummary) });
    }

    const storyParams = match(pathname, '/api/stories/:slug');
    if (req.method === 'GET' && storyParams) {
      const story = db.stories.find(item => item.slug === storyParams.slug || item.id === storyParams.slug);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && (!viewer || viewer.role !== 'admin')) return notFound(res);
      story.views += 1;
      writeDb(db);
      const enriched = enrichStory(db, story, viewer && viewer.id);
      const chapters = db.chapters.filter(chapter => chapter.storyId === story.id).sort((a, b) => a.number - b.number);
      const comments = db.comments
        .filter(comment => comment.storyId === story.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(comment => publicComment(db, comment));
      return send(res, 200, { story: enriched, chapters, comments });
    }

    const chapterParams = match(pathname, '/api/stories/:slug/chapters/:number');
    if (req.method === 'GET' && chapterParams) {
      const story = db.stories.find(item => item.slug === chapterParams.slug || item.id === chapterParams.slug);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && (!viewer || viewer.role !== 'admin')) return notFound(res);
      const chapter = db.chapters.find(item => item.storyId === story.id && item.number === Number(chapterParams.number));
      if (!chapter) return notFound(res);
      const unlocked = !chapter.isPremium || (viewer && db.purchases.some(item => item.userId === viewer.id && (item.chapterId === chapter.id || (item.storyId === story.id && item.combo))));
      const payloadChapter = unlocked ? chapter : { ...chapter, content: chapter.preview || 'Chương trả phí. Vui lòng mở khóa để đọc đầy đủ.' };
      chapter.views += 1;
      story.views += 1;
      if (viewer) {
        const existing = db.history.find(item => item.userId === viewer.id && item.storyId === story.id);
        if (existing) {
          existing.chapterId = chapter.id;
          existing.chapterNumber = chapter.number;
          existing.updatedAt = now();
        } else {
          db.history.push({ id: uid('his'), userId: viewer.id, storyId: story.id, chapterId: chapter.id, chapterNumber: chapter.number, updatedAt: now() });
        }
      }
      writeDb(db);
      return send(res, 200, { story: enrichStory(db, story, viewer && viewer.id), chapter: payloadChapter, unlocked });
    }

    const bookmarkParams = match(pathname, '/api/stories/:id/bookmark');
    if (req.method === 'POST' && bookmarkParams) {
      const user = requireUser(req, res, db);
      if (!user) return;
      const story = db.stories.find(item => item.id === bookmarkParams.id || item.slug === bookmarkParams.id);
      if (!story) return notFound(res);
      const index = db.bookmarks.findIndex(item => item.userId === user.id && item.storyId === story.id);
      const bookmarked = index === -1;
      if (bookmarked) db.bookmarks.push({ id: uid('bm'), userId: user.id, storyId: story.id, createdAt: now() });
      else db.bookmarks.splice(index, 1);
      writeDb(db);
      return send(res, 200, { bookmarked });
    }

    const followParams = match(pathname, '/api/stories/:id/follow');
    if (req.method === 'POST' && followParams) {
      const user = requireUser(req, res, db);
      if (!user) return;
      const story = db.stories.find(item => item.id === followParams.id || item.slug === followParams.id);
      if (!story) return notFound(res);
      const index = db.follows.findIndex(item => item.userId === user.id && item.storyId === story.id);
      const followed = index === -1;
      if (followed) {
        db.follows.push({ id: uid('flw'), userId: user.id, storyId: story.id, createdAt: now() });
        story.follows += 1;
      } else {
        db.follows.splice(index, 1);
        story.follows = Math.max(0, story.follows - 1);
      }
      writeDb(db);
      return send(res, 200, { followed, follows: story.follows });
    }

    const commentsParams = match(pathname, '/api/stories/:id/comments');
    if (commentsParams && req.method === 'GET') {
      const story = db.stories.find(item => item.id === commentsParams.id || item.slug === commentsParams.id);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && (!viewer || viewer.role !== 'admin')) return notFound(res);
      const comments = db.comments
        .filter(comment => comment.storyId === story.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(comment => publicComment(db, comment));
      return send(res, 200, { comments });
    }

    if (commentsParams && req.method === 'POST') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const story = db.stories.find(item => item.id === commentsParams.id || item.slug === commentsParams.id);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && user.role !== 'admin') return notFound(res);
      const body = await parseBody(req);
      const text = String(body.body || '').trim();
      if (text.length < 2) return badRequest(res, 'Bình luận cần ít nhất 2 ký tự.');
      if (text.length > 500) return badRequest(res, 'Bình luận tối đa 500 ký tự.');
      const comment = { id: uid('cmt'), storyId: story.id, userId: user.id, body: text, createdAt: now() };
      db.comments.unshift(comment);
      db.notifications.push({ id: uid('noti'), userId: user.id, type: 'comment', title: 'Đã gửi bình luận', body: `Bình luận của bạn trong ${story.title} đã được lưu.`, read: false, createdAt: now() });
      writeDb(db);
      return send(res, 201, { comment: publicComment(db, comment) });
    }

    const ratingParams = match(pathname, '/api/stories/:id/rating');
    if (ratingParams && req.method === 'POST') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const story = db.stories.find(item => item.id === ratingParams.id || item.slug === ratingParams.id);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && user.role !== 'admin') return notFound(res);
      const body = await parseBody(req);
      const value = Number(body.value);
      if (!Number.isInteger(value) || value < 1 || value > 5) return badRequest(res, 'Đánh giá phải từ 1 đến 5 sao.');
      const existing = db.ratings.find(item => item.storyId === story.id && item.userId === user.id);
      if (existing) {
        existing.value = value;
        existing.updatedAt = now();
      } else {
        db.ratings.push({ id: uid('rate'), storyId: story.id, userId: user.id, value, createdAt: now(), updatedAt: now() });
      }
      const ratings = db.ratings.filter(item => item.storyId === story.id);
      story.rating = Number((ratings.reduce((sum, item) => sum + item.value, 0) / ratings.length).toFixed(1));
      story.updatedAt = now();
      writeDb(db);
      return send(res, 200, { rating: story.rating, ratingCount: ratings.length, myRating: value });
    }

    const reportParams = match(pathname, '/api/stories/:id/report');
    if (reportParams && req.method === 'POST') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const story = db.stories.find(item => item.id === reportParams.id || item.slug === reportParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      const reason = String(body.reason || '').trim();
      if (reason.length < 4) return badRequest(res, 'Vui lòng nhập lý do báo cáo.');
      const report = { id: uid('rep'), storyId: story.id, userId: user.id, reason: reason.slice(0, 500), status: 'open', createdAt: now() };
      db.reports.push(report);
      writeDb(db);
      return send(res, 201, { report });
    }

    const comboParams = match(pathname, '/api/stories/:id/unlock-combo');
    if (comboParams && req.method === 'POST') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const story = db.stories.find(item => item.id === comboParams.id || item.slug === comboParams.id);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && user.role !== 'admin') return notFound(res);
      if (db.purchases.some(item => item.userId === user.id && item.storyId === story.id && item.combo)) {
        return send(res, 200, { unlocked: true, user: safeUser(user), price: 0 });
      }
      const premiumChapters = db.chapters.filter(chapter => chapter.storyId === story.id && chapter.isPremium);
      const price = Math.max(1, Math.max(49, (story.price || 1) * db.chapters.filter(chapter => chapter.storyId === story.id).length));
      if (premiumChapters.length === 0) return send(res, 200, { unlocked: true, user: safeUser(user), price: 0 });
      if (user.seeds < price) return badRequest(res, 'Số dư Đậu không đủ để mua combo.');
      user.seeds -= price;
      db.purchases.push({ id: uid('pur'), userId: user.id, storyId: story.id, chapterId: null, combo: true, price, createdAt: now() });
      db.transactions.push({ id: uid('txn'), userId: user.id, type: 'purchase', amount: -price, note: `Mua combo ${story.title}`, createdAt: now() });
      db.notifications.push({ id: uid('noti'), userId: user.id, type: 'purchase', title: 'Đã mở khóa combo', body: `Bạn đã mở khóa toàn bộ chương VIP hiện tại của ${story.title}.`, read: false, createdAt: now() });
      writeDb(db);
      return send(res, 200, { unlocked: true, user: safeUser(user), price });
    }

    if (req.method === 'GET' && pathname === '/api/me/library') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const bookmarks = db.bookmarks
        .filter(item => item.userId === user.id)
        .map(item => storySummary(enrichStory(db, db.stories.find(story => story.id === item.storyId), user.id)))
        .filter(Boolean);
      const follows = db.follows
        .filter(item => item.userId === user.id)
        .map(item => storySummary(enrichStory(db, db.stories.find(story => story.id === item.storyId), user.id)))
        .filter(Boolean);
      const history = db.history
        .filter(item => item.userId === user.id)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .map(item => {
          const story = db.stories.find(storyItem => storyItem.id === item.storyId);
          const chapter = db.chapters.find(chapterItem => chapterItem.id === item.chapterId);
          return { ...item, story: story && storySummary(enrichStory(db, story, user.id)), chapter };
        })
        .filter(item => item.story && item.chapter);
      return send(res, 200, { bookmarks, follows, history });
    }

    if (req.method === 'GET' && pathname === '/api/wallet/packages') {
      return send(res, 200, { packages: [
        { id: 'seed-10', seeds: 10, bonus: 0, price: 10000, label: 'Khởi đầu' },
        { id: 'seed-20', seeds: 20, bonus: 2, price: 20000, label: 'Cơ bản' },
        { id: 'seed-50', seeds: 50, bonus: 8, price: 50000, label: 'Phổ biến' },
        { id: 'seed-100', seeds: 100, bonus: 20, price: 100000, label: 'Tiết kiệm' },
        { id: 'seed-200', seeds: 200, bonus: 50, price: 200000, label: 'Giá trị nhất' },
        { id: 'seed-500', seeds: 500, bonus: 150, price: 500000, label: 'Cao cấp' }
      ]});
    }

    if (req.method === 'GET' && pathname === '/api/notifications') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const notifications = db.notifications
        .filter(item => item.userId === user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return send(res, 200, { notifications });
    }

    if (req.method === 'POST' && pathname === '/api/notifications/read-all') {
      const user = requireUser(req, res, db);
      if (!user) return;
      db.notifications.forEach(item => {
        if (item.userId === user.id) item.read = true;
      });
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/wallet/transactions') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const transactions = db.transactions.filter(item => item.userId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return send(res, 200, { balance: user.seeds, transactions });
    }

    if (req.method === 'POST' && pathname === '/api/wallet/topup') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const packs = {
        'seed-10': { seeds: 10, bonus: 0, price: 10000 },
        'seed-20': { seeds: 20, bonus: 2, price: 20000 },
        'seed-50': { seeds: 50, bonus: 8, price: 50000 },
        'seed-100': { seeds: 100, bonus: 20, price: 100000 },
        'seed-200': { seeds: 200, bonus: 50, price: 200000 },
        'seed-500': { seeds: 500, bonus: 150, price: 500000 }
      };
      const pack = packs[body.packageId];
      if (!pack) return badRequest(res, 'Gói nạp không hợp lệ.');
      const method = String(body.method || 'Thanh toán').trim().slice(0, 40);
      const amount = pack.seeds + pack.bonus;
      user.seeds += amount;
      db.transactions.push({ id: uid('txn'), userId: user.id, type: 'topup', amount: pack.seeds, note: `Nạp ${pack.seeds} Đậu qua ${method}`, price: pack.price, method, createdAt: now() });
      if (pack.bonus > 0) db.transactions.push({ id: uid('txn'), userId: user.id, type: 'bonus', amount: pack.bonus, note: `Thưởng gói nạp ${body.packageId}`, price: 0, method, createdAt: now() });
      db.notifications.push({ id: uid('noti'), userId: user.id, type: 'wallet', title: 'Nạp Đậu thành công', body: `Bạn đã nhận ${amount} Đậu qua ${method}.`, read: false, createdAt: now() });
      writeDb(db);
      return send(res, 200, { user: safeUser(user), balance: user.seeds, amount });
    }

    const unlockParams = match(pathname, '/api/chapters/:id/unlock');
    if (req.method === 'POST' && unlockParams) {
      const user = requireUser(req, res, db);
      if (!user) return;
      const chapter = db.chapters.find(item => item.id === unlockParams.id);
      if (!chapter) return notFound(res);
      if (!chapter.isPremium) return send(res, 200, { unlocked: true, user: safeUser(user) });
      if (db.purchases.some(item => item.userId === user.id && item.chapterId === chapter.id)) {
        return send(res, 200, { unlocked: true, user: safeUser(user) });
      }
      if (user.seeds < chapter.price) return badRequest(res, 'Số dư Đậu không đủ. Vui lòng nạp thêm.');
      user.seeds -= chapter.price;
      db.purchases.push({ id: uid('pur'), userId: user.id, storyId: chapter.storyId, chapterId: chapter.id, price: chapter.price, createdAt: now() });
      db.transactions.push({ id: uid('txn'), userId: user.id, type: 'purchase', amount: -chapter.price, note: `Mở khóa ${chapter.title}`, createdAt: now() });
      writeDb(db);
      return send(res, 200, { unlocked: true, user: safeUser(user) });
    }

    if (req.method === 'GET' && pathname === '/api/admin/stats') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const revenueSeeds = db.transactions.filter(item => item.type === 'purchase').reduce((sum, item) => sum + Math.abs(item.amount), 0);
      return send(res, 200, {
        stats: {
          users: db.users.length,
          stories: db.stories.length,
          chapters: db.chapters.length,
          transactions: db.transactions.length,
          revenueSeeds,
          views: db.stories.reduce((sum, story) => sum + story.views, 0)
        }
      });
    }

    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      return send(res, 200, { users: db.users.map(safeUser) });
    }

    if (req.method === 'GET' && pathname === '/api/admin/transactions') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      return send(res, 200, { transactions: db.transactions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
    }

    if (req.method === 'GET' && pathname === '/api/admin/reports') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const reports = db.reports.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(report => ({
        ...report,
        story: db.stories.find(story => story.id === report.storyId) ? storySummary(enrichStory(db, db.stories.find(story => story.id === report.storyId), admin.id)) : null,
        user: safeUser(db.users.find(user => user.id === report.userId))
      }));
      return send(res, 200, { reports });
    }

    if (req.method === 'GET' && pathname === '/api/admin/stories') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      return send(res, 200, { stories: db.stories.map(story => enrichStory(db, story, admin.id)) });
    }

    if (req.method === 'POST' && pathname === '/api/admin/stories') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const body = await parseBody(req);
      const inputError = validateStoryInput(body);
      if (inputError) return badRequest(res, inputError);
      const slug = slugify(body.slug || body.title);
      if (db.stories.some(story => story.slug === slug)) return badRequest(res, 'Slug đã tồn tại.');
      const story = {
        id: uid('story'),
        slug,
        title: String(body.title).trim(),
        author: String(body.author).trim(),
        translator: String(body.translator || '').trim(),
        cover: body.cover || '/images/cover-1.jpg',
        description: body.description || '',
        status: body.status || 'ongoing',
        language: String(body.language || 'Tiếng Việt').trim(),
        ageRating: String(body.ageRating || 'all').trim(),
        hidden: Boolean(body.hidden),
        approvalStatus: ['pending', 'approved', 'rejected'].includes(body.approvalStatus) ? body.approvalStatus : 'pending',
        chapterCountEstimate: parsePositiveNumber(body.chapterCountEstimate),
        premium: Boolean(body.premium),
        price: parsePositiveNumber(body.price),
        featured: Boolean(body.featured),
        views: 0,
        rating: parsePositiveNumber(body.rating, 4.5),
        follows: 0,
        categories: normalizeCategories(body.categories),
        tags: normalizeCategories(body.tags),
        updatedAt: now(),
        createdAt: now()
      };
      db.stories.unshift(story);
      writeDb(db);
      return send(res, 201, { story });
    }

    const adminStoryParams = match(pathname, '/api/admin/stories/:id');
    const adminReportParams = match(pathname, '/api/admin/reports/:id');
    if (adminReportParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const report = db.reports.find(item => item.id === adminReportParams.id);
      if (!report) return notFound(res);
      const body = await parseBody(req);
      if (!['open', 'reviewing', 'resolved', 'rejected'].includes(body.status)) return badRequest(res, 'Trạng thái báo cáo không hợp lệ.');
      report.status = body.status;
      report.updatedAt = now();
      writeDb(db);
      return send(res, 200, { report });
    }

    const adminStoryStatusParams = match(pathname, '/api/admin/stories/:id/status');
    if (adminStoryStatusParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const story = db.stories.find(item => item.id === adminStoryStatusParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      if (body.approvalStatus !== undefined) {
        if (!['pending', 'approved', 'rejected'].includes(body.approvalStatus)) return badRequest(res, 'Trạng thái duyệt không hợp lệ.');
        story.approvalStatus = body.approvalStatus;
      }
      if (body.hidden !== undefined) story.hidden = Boolean(body.hidden);
      story.updatedAt = now();
      writeDb(db);
      return send(res, 200, { story });
    }

    if (adminStoryParams && req.method === 'PUT') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const story = db.stories.find(item => item.id === adminStoryParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      ['title','author','translator','cover','description','status','language','ageRating'].forEach(key => {
        if (body[key] !== undefined) story[key] = String(body[key]);
      });
      if (body.hidden !== undefined) story.hidden = Boolean(body.hidden);
      if (body.approvalStatus !== undefined) {
        if (!['pending', 'approved', 'rejected'].includes(body.approvalStatus)) return badRequest(res, 'Trạng thái duyệt không hợp lệ.');
        story.approvalStatus = body.approvalStatus;
      }
      if (body.chapterCountEstimate !== undefined) story.chapterCountEstimate = parsePositiveNumber(body.chapterCountEstimate, story.chapterCountEstimate);
      if (body.slug) story.slug = slugify(body.slug);
      if (body.premium !== undefined) story.premium = Boolean(body.premium);
      if (body.featured !== undefined) story.featured = Boolean(body.featured);
      if (body.price !== undefined) story.price = Number(body.price);
      if (body.rating !== undefined) story.rating = Number(body.rating);
      if (body.categories !== undefined) story.categories = normalizeCategories(body.categories);
      if (body.tags !== undefined) story.tags = normalizeCategories(body.tags);
      story.updatedAt = now();
      writeDb(db);
      return send(res, 200, { story });
    }

    if (adminStoryParams && req.method === 'DELETE') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const index = db.stories.findIndex(item => item.id === adminStoryParams.id);
      if (index === -1) return notFound(res);
      db.stories.splice(index, 1);
      db.chapters = db.chapters.filter(item => item.storyId !== adminStoryParams.id);
      db.bookmarks = db.bookmarks.filter(item => item.storyId !== adminStoryParams.id);
      db.follows = db.follows.filter(item => item.storyId !== adminStoryParams.id);
      db.history = db.history.filter(item => item.storyId !== adminStoryParams.id);
      db.comments = db.comments.filter(item => item.storyId !== adminStoryParams.id);
      db.ratings = db.ratings.filter(item => item.storyId !== adminStoryParams.id);
      db.reports = db.reports.filter(item => item.storyId !== adminStoryParams.id);
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    const adminChapterParams = match(pathname, '/api/admin/stories/:id/chapters');
    if (adminChapterParams && req.method === 'POST') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const story = db.stories.find(item => item.id === adminChapterParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      const nextNumber = Math.max(0, ...db.chapters.filter(item => item.storyId === story.id).map(item => item.number)) + 1;
      const chapter = {
        id: uid('chap'),
        storyId: story.id,
        number: Number(body.number || nextNumber),
        title: body.title || `Chương ${nextNumber}`,
        content: body.content || 'Nội dung chương đang được cập nhật.',
        preview: body.preview || 'Đây là đoạn xem trước của chương.',
        isPremium: Boolean(body.isPremium),
        price: Number(body.price || 0),
        views: 0,
        createdAt: now()
      };
      db.chapters.push(chapter);
      story.updatedAt = now();
      writeDb(db);
      return send(res, 201, { chapter });
    }

    const adminChapterUpdateParams = match(pathname, '/api/admin/chapters/:id');
    if (adminChapterUpdateParams && req.method === 'PUT') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const chapter = db.chapters.find(item => item.id === adminChapterUpdateParams.id);
      if (!chapter) return notFound(res);
      const body = await parseBody(req);
      ['title','content','preview'].forEach(key => {
        if (body[key] !== undefined) chapter[key] = String(body[key]);
      });
      if (body.number !== undefined) chapter.number = Number(body.number);
      if (body.isPremium !== undefined) chapter.isPremium = Boolean(body.isPremium);
      if (body.price !== undefined) chapter.price = Number(body.price);
      const story = db.stories.find(item => item.id === chapter.storyId);
      if (story) story.updatedAt = now();
      writeDb(db);
      return send(res, 200, { chapter });
    }

    if (adminChapterUpdateParams && req.method === 'DELETE') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const index = db.chapters.findIndex(item => item.id === adminChapterUpdateParams.id);
      if (index === -1) return notFound(res);
      const [chapter] = db.chapters.splice(index, 1);
      db.purchases = db.purchases.filter(item => item.chapterId !== chapter.id);
      db.history = db.history.filter(item => item.chapterId !== chapter.id);
      const story = db.stories.find(item => item.id === chapter.storyId);
      if (story) story.updatedAt = now();
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    return notFound(res);
  } catch (error) {
    console.error(error);
    return send(res, 500, { message: error.message || 'Lỗi máy chủ.' });
  }
}

function normalizeCategories(input) {
  if (Array.isArray(input)) return input.map(item => String(item).trim()).filter(Boolean);
  return String(input || '').split(',').map(item => item.trim()).filter(Boolean);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function parsePositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function validateStoryInput(body) {
  const title = String(body.title || '').trim();
  const author = String(body.author || '').trim();
  const description = String(body.description || '').trim();
  if (!title) return 'Tên truyện là bắt buộc.';
  if (!author) return 'Tác giả là bắt buộc.';
  if (title.length > 180) return 'Tên truyện quá dài.';
  if (author.length > 120) return 'Tác giả quá dài.';
  if (description.length > 2000) return 'Mô tả quá dài.';
  return null;
}

function validateChapterInput(body) {
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!title) return 'Tiêu đề chương là bắt buộc.';
  if (!content) return 'Nội dung chương là bắt buộc.';
  return null;
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || uid('story');
}

function lorem(title, tone) {
  return `${title}\n\n${tone} Câu chuyện được biên tập theo phong cách dễ đọc, chia đoạn rõ ràng và tối ưu cho trải nghiệm đọc trên điện thoại.\n\nNhân vật chính từng bước vượt qua biến cố, mở khóa bí mật cũ và tạo nên những lựa chọn làm thay đổi cả hành trình phía trước.\n\nĐậu Đỏ Truyện lưu lịch sử đọc tự động, hỗ trợ chương trả phí bằng Đậu và cho phép người dùng theo dõi truyện yêu thích.`;
}

function extraSeedStoryRows() {
  return [
    ['s9','bac-si-thien-tai-tro-ve','Bac Si Thien Tai Tro Ve','An Ha','/images/cover-9.jpg','Mot bac si tre tro ve thanh pho cu, dung ky nang y hoc va tri tue de giai quyet nhung vu viec kho tin.','ongoing',false,0,true,421090,4.6,10330,['Do thi','Hien Dai','Doi Song']],
    ['s10','nu-phap-y-trong-sinh','Nu Phap Y Trong Sinh','Thanh Moc','/images/cover-10.jpg','Sau mot vu an bi an, nu phap y co co hoi lam lai cuoc doi va lat mo nhung su that bi che giau.','completed',true,6,true,512220,4.8,15840,['Trong sinh','Nu Cuong','Do thi']],
    ['s11','tong-tai-lanh-lung-va-co-gai-nho','Tong Tai Lanh Lung Va Co Gai Nho','Ha Vy','/images/cover-11.jpg','Mot cau chuyen tinh cam hien dai voi hop dong hon nhan, bi mat gia toc va nhung lua chon kho khan.','ongoing',false,0,true,388110,4.5,9450,['Ngon tinh','Tong Tai','Sung']],
    ['s12','kiem-khach-cuoi-cung','Kiem Khach Cuoi Cung','Luc Dao','/images/cover-12.jpg','Kiem khach tre la nguoi cuoi cung giu bi kip co xua, buoc vao giang ho day song gio.','ongoing',true,8,false,672800,4.9,18420,['Kiem hiep','Hanh dong','Ky Ao']],
    ['s13','he-thong-sieu-cap-hoc-duong','He Thong Sieu Cap Hoc Duong','Nam Phong','/images/cover-1.jpg','Hoc sinh binh thuong nhan duoc he thong dac biet, tu do thay doi thanh tich, quan he va tuong lai.','ongoing',false,0,false,234980,4.4,5220,['Hoc Duong','He Thong','Thanh xuan']],
    ['s14','thanh-pho-sau-man-dem','Thanh Pho Sau Man Dem','Bach Vu','/images/cover-2.jpg','Khi dem xuong, thanh pho hien dai lo ra nhung tang lop bi mat ve di nang va to chuc ngam.','ongoing',true,7,false,481330,4.7,11940,['Do thi','Di Nang','Khoa Huyen']],
    ['s15','vu-tru-luu-vong','Vu Tru Luu Vong','Kien Khong','/images/cover-3.jpg','Doan tau cuoi cung roi Trai Dat, mang theo hy vong song sot cua nhan loai giua vu tru rong lon.','completed',false,0,false,359440,4.6,8760,['Khoa Huyen','Sinh Ton','Phieu Luu']],
    ['s16','nang-cong-chua-bi-lang-quen','Nang Cong Chua Bi Lang Quen','Diep Lam','/images/cover-4.jpg','Cong chua bi that lac tro ve vuong quoc, doi mat am muu chinh tri va mot moi tinh cam day thu thach.','ongoing',false,0,false,298760,4.5,6540,['Tinh Cam','Ky Ao','Nu Cuong']],
    ['s17','ma-phap-su-tap-su','Ma Phap Su Tap Su','Lam Khue','/images/cover-5.jpg','Thieu nien moi vao hoc vien ma phap phat hien kha nang dac biet co the lam thay doi can bang the gioi.','ongoing',true,5,true,588900,4.8,14220,['Ma Phap','Ky Ao','Hoc Duong']],
    ['s18','doi-bong-khong-ten','Doi Bong Khong Ten','Ban Ha','/images/cover-6.jpg','Mot doi bong nghiep du quyet tam buoc len giai chuyen nghiep bang tinh ban va ky luat khac nghiet.','completed',false,0,false,189520,4.3,4210,['The Thao','Thanh xuan','Doi Song']],
    ['s19','quan-ca-phe-o-goc-pho','Quan Ca Phe O Goc Pho','Minh Tue','/images/cover-7.jpg','Nhung vi khach ghe quan ca phe nho mang theo cac cau chuyen tinh yeu, nghe nghiep va gia dinh.','ongoing',false,0,false,165880,4.4,3900,['Doi Song','Tinh Cam','Hien Dai']],
    ['s20','sat-thu-ve-huu','Sat Thu Ve Huu','Hac Anh','/images/cover-8.jpg','Mot sat thu da gac kiem bi cuon vao vu tranh dau moi khi qua khu bat ngo tim den cua nha.','ongoing',true,9,true,740120,4.9,22110,['Hanh dong','Do thi','Bi An']],
    ['s21','vuong-quoc-duoi-long-dat','Vuong Quoc Duoi Long Dat','Thach Lam','/images/cover-9.jpg','Nhom tham hiem phat hien vuong quoc bi chon vui va nhung loi nguy co dai trong long dat.','completed',true,7,false,402230,4.7,10120,['Phieu Luu','Ky Ao','Sinh Ton']],
    ['s22','co-gai-ban-hoa-va-thieu-gia','Co Gai Ban Hoa Va Thieu Gia','Tu Nguyet','/images/cover-10.jpg','Mot moi nhan duyen tu cua hang hoa nho mo ra cau chuyen am ap giua hai the gioi khac biet.','completed',false,0,true,276650,4.6,7880,['Ngon tinh','Tinh Cam','Hien Dai']],
    ['s23','chien-than-tro-lai','Chien Than Tro Lai','Quan Mac','/images/cover-11.jpg','Sau nhieu nam ngoai bien cuong, chien than tro ve de bao ve nguoi than va thanh pho cua minh.','ongoing',true,8,true,892340,4.9,26440,['Do thi','Hanh dong','Quan Su']],
    ['s24','zombie-ngay-thu-bay','Zombie Ngay Thu Bay','Kha Minh','/images/cover-12.jpg','Ngay thu bay binh thuong bien thanh tham hoa, mot nhom ban tre phai hoc cach song sot.','ongoing',false,0,false,332010,4.5,7030,['Zombie','Mat the','Sinh Ton']]
  ];
}

function createSeedDb() {
  const adminPass = hashPassword('123456');
  const userPass = hashPassword('123456');
  const stories = [
    ['s1','dau-pha-thuong-khung','Đấu Phá Thương Khung','Thiên Tằm Thổ Đậu','/images/cover-1.jpg','Thiếu niên từng là thiên tài bỗng mất hết đấu khí, từ đó bắt đầu hành trình phục hưng danh dự và truy tìm bí mật gia tộc.','ongoing',true,8,true,985420,4.9,23560,['Tiên hiệp','Huyền huyễn','Hành động']],
    ['s2','ta-la-dai-lao-an-danh','Ta Là Đại Lão Ẩn Danh','Mộc Qua Hoàng','/images/cover-2.jpg','Một cao thủ chọn sống bình thường giữa phố thị, nhưng những rắc rối liên tục kéo anh trở lại thế giới tu luyện.','ongoing',false,0,true,532120,4.7,12610,['Đô thị','Tu tiên','Hài hước']],
    ['s3','vo-luyen-dinh-phong','Võ Luyện Đỉnh Phong','Mạc Mặc','/images/cover-3.jpg','Từ tạp dịch nhỏ bé, nhân vật chính dựa vào ý chí thép để chạm tới đỉnh cao võ đạo.','completed',true,6,false,771004,4.8,19904,['Kiếm hiệp','Huyền huyễn']],
    ['s4','co-vo-ngot-ngao-cua-tong-tai','Cô Vợ Ngọt Ngào Của Tổng Tài','Diệp Phi Dạ','/images/cover-4.jpg','Một bản hợp đồng hôn nhân mở ra chuyện tình vừa ngọt vừa nhiều bí mật trong giới hào môn.','ongoing',false,0,true,343987,4.6,8932,['Ngôn tình','Sủng','Hào môn']],
    ['s5','than-dao-dan-ton','Thần Đạo Đan Tôn','Cô Đơn Địa Phi','/images/cover-5.jpg','Đan đạo tông sư trọng sinh, dùng tri thức kiếp trước để xoay chuyển càn khôn.','ongoing',true,7,false,621345,4.7,14550,['Tiên hiệp','Trọng sinh','Luyện đan']],
    ['s6','vuong-gia-vinh-quang','Vương Giả Vinh Quang','Bán Chích Thanh Oa','/images/cover-6.jpg','Một game thủ bị xem thường bước vào giải đấu chuyên nghiệp và viết lại định nghĩa về đồng đội.','ongoing',false,0,false,287432,4.5,7133,['Võng du','E-sport','Thanh xuân']],
    ['s7','kiem-lai','Kiếm Lai','Phong Hỏa Hí Chư Hầu','/images/cover-7.jpg','Thiếu niên nơi trấn nhỏ mang theo một thanh kiếm và tấm lòng chân thành đi qua giang hồ rộng lớn.','ongoing',true,9,true,689221,4.9,20771,['Kiếm hiệp','Tiên hiệp']],
    ['s8','mat-the-sieu-cap-he-thong','Mạt Thế Siêu Cấp Hệ Thống','Lam Lĩnh Tiếu Tiếu Sinh','/images/cover-8.jpg','Khi tận thế ập tới, một hệ thống bí ẩn giúp người bình thường sống sót và xây dựng căn cứ mới.','ongoing',false,0,false,198112,4.4,4890,['Mạt thế','Hệ thống','Sinh tồn']]
  ].concat(extraSeedStoryRows()).map(([id, slug, title, author, cover, description, status, premium, price, featured, views, rating, follows, categories], index) => ({
    id, slug, title, author, cover, description, status, premium, price, featured, views, rating, follows, categories,
    tags: categories,
    translator: '',
    language: 'Tiếng Việt',
    ageRating: premium ? '16' : 'all',
    hidden: false,
    approvalStatus: 'approved',
    chapterCountEstimate: 0,
    updatedAt: new Date(Date.now() - index * 86400000).toISOString(),
    createdAt: new Date(Date.now() - (index + 12) * 86400000).toISOString()
  }));

  const chapters = [];
  stories.forEach((story, storyIndex) => {
    for (let number = 1; number <= 8; number += 1) {
      const premiumChapter = story.premium && number > 3;
      chapters.push({
        id: `c_${story.id}_${number}`,
        storyId: story.id,
        number,
        title: `Chương ${number}: ${number === 1 ? 'Khởi đầu' : number === 2 ? 'Biến cố' : number === 3 ? 'Gặp gỡ' : 'Bước ngoặt mới'}`,
        content: lorem(`${story.title} - Chương ${number}`, premiumChapter ? 'Đây là chương cao trào có nội dung trả phí trong bản demo.' : 'Đây là chương miễn phí trong bản demo.'),
        preview: `${story.title} - Chương ${number}\n\nĐoạn xem trước: biến cố mới xuất hiện, nhân vật chính buộc phải đưa ra lựa chọn quan trọng...`,
        isPremium: premiumChapter,
        price: premiumChapter ? story.price : 0,
        views: Math.max(50, story.views - number * 1370 - storyIndex * 890),
        createdAt: new Date(Date.now() - (storyIndex * 8 + number) * 3600000).toISOString()
      });
    }
  });

  return {
    users: [
      { id: 'u_admin', name: 'Quản trị viên', email: 'admin@example.com', role: 'admin', seeds: 999, avatar: '/images/logo.png', createdAt: now(), salt: adminPass.salt, passwordHash: adminPass.passwordHash },
      { id: 'u_user', name: 'Bạn đọc Đậu Đỏ', email: 'user@example.com', role: 'user', seeds: 80, avatar: '/images/logo.png', createdAt: now(), salt: userPass.salt, passwordHash: userPass.passwordHash }
    ],
    stories,
    chapters,
    bookmarks: [{ id: 'bm_seed_1', userId: 'u_user', storyId: 's1', createdAt: now() }],
    follows: [{ id: 'flw_seed_1', userId: 'u_user', storyId: 's7', createdAt: now() }],
    history: [{ id: 'his_seed_1', userId: 'u_user', storyId: 's1', chapterId: 'c_s1_2', chapterNumber: 2, updatedAt: now() }],
    purchases: [{ id: 'pur_seed_1', userId: 'u_user', storyId: 's1', chapterId: 'c_s1_4', price: 8, createdAt: now() }],
    transactions: [
      { id: 'txn_seed_1', userId: 'u_user', type: 'bonus', amount: 80, note: 'Đậu dùng thử', createdAt: now() },
      { id: 'txn_seed_2', userId: 'u_user', type: 'purchase', amount: -8, note: 'Mở khóa Đấu Phá Thương Khung chương 4', createdAt: now() }
    ],
    comments: [
      { id: 'cmt_seed_1', storyId: 's1', userId: 'u_user', body: 'Truyện mở đầu rất cuốn, đoạn cao trào đọc rất đã.', createdAt: now() }
    ],
    ratings: [
      { id: 'rate_seed_1', storyId: 's1', userId: 'u_user', value: 5, createdAt: now(), updatedAt: now() }
    ],
    notifications: [
      { id: 'noti_seed_1', userId: 'u_user', type: 'system', title: 'Chào mừng đến Đậu Đỏ Truyện', body: 'Bạn đã nhận Đậu dùng thử để đọc chương trả phí.', read: false, createdAt: now() }
    ],
    reports: []
  };
}

if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(createSeedDb(), null, 2));
}

if (require.main === module) {
  http.createServer(handle).listen(PORT, () => {
    console.log(`Dau Do Truyen API running at http://localhost:${PORT}`);
  });
}

module.exports = { createSeedDb, hashPassword, slugify, handle };
