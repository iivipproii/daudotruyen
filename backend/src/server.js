require('dotenv').config();
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const mammoth = require('mammoth');
const dataStore = require('./db');
const storage = require('./services/storage');
const { normalizeRole, isAdmin, canPostStory } = require('./permissions');
const { hasTestPlaceholder, validateTextFields, validateCleanText } = require('./text-quality');

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JSON_LIMIT = 4 * 1024 * 1024;
const UPLOAD_LIMIT = 10 * 1024 * 1024;
const COMPRESSED_IMAGE_LIMIT = 500 * 1024;
const AVATAR_UPLOAD_LIMIT = 2 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const rateBuckets = new Map();
const DEFAULT_LOCAL_CORS_ORIGINS = [
  'https://daudotruyen.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];
const DEFAULT_PRODUCTION_CORS_ORIGINS = ['https://daudotruyen.vercel.app'];
const VERCEL_PREVIEW_ORIGIN_PATTERN = /^https:\/\/daudotruyen(?:-git-[a-z0-9-]+|-[-a-z0-9]+-iivipproiis-projects)\.vercel\.app$/i;
const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';
const NO_STORE_CACHE_CONTROL = 'no-store, max-age=0';
const CORS_ORIGINS = resolveCorsOrigins();

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me')) {
  throw new Error('JWT_SECRET must be set to a strong non-default value in production.');
}

function now() {
  return new Date().toISOString();
}

function createPerf(label) {
  const start = process.hrtime.bigint();
  const marks = [];
  let last = start;
  return {
    mark(name) {
      const current = process.hrtime.bigint();
      marks.push([name, Number(current - last) / 1e6]);
      last = current;
    },
    log(extra = '') {
      const total = Number(process.hrtime.bigint() - start) / 1e6;
      const parts = marks.map(([name, ms]) => `${name}=${Math.round(ms)}ms`);
      parts.push(`total=${Math.round(total)}ms`);
      console.info(`[${label}] ${parts.join(' ')}${extra ? ` ${extra}` : ''}`);
    }
  };
}

function perfLabel(method, pathname) {
  if (method === 'POST' && pathname === '/api/author/stories') return 'story:create';
  if (method === 'POST' && pathname === '/api/admin/stories') return 'story:admin-create';
  if (method === 'PATCH' && /^\/api\/admin\/stories\/[^/]+\/status$/.test(pathname)) return 'story:moderate';
  if (method === 'PATCH' && /^\/api\/admin\/stories\/[^/]+\/flags$/.test(pathname)) return 'story:flags';
  if (method === 'PUT' && /^\/api\/author\/stories\/[^/]+$/.test(pathname)) return 'story:author-update';
  if (method === 'PUT' && /^\/api\/admin\/stories\/[^/]+$/.test(pathname)) return 'story:admin-update';
  if (method === 'POST' && /^\/api\/author\/stories\/[^/]+\/chapters$/.test(pathname)) return 'chapter:create';
  if (method === 'POST' && /^\/api\/author\/stories\/[^/]+\/chapters\/bulk$/.test(pathname)) return 'chapter:bulk-create';
  if (method === 'PUT' && /^\/api\/author\/chapters\/[^/]+$/.test(pathname)) return 'chapter:author-update';
  if (method === 'POST' && /^\/api\/admin\/stories\/[^/]+\/chapters$/.test(pathname)) return 'chapter:admin-create';
  if (method === 'PATCH' && /^\/api\/admin\/chapters\/[^/]+\/status$/.test(pathname)) return 'chapter:moderate';
  if (method === 'PUT' && /^\/api\/admin\/chapters\/[^/]+$/.test(pathname)) return 'chapter:admin-update';
  if (method === 'POST' && pathname === '/api/uploads/cover') return 'cover:upload';
  return `${method} ${pathname}`;
}

function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

async function persistDb(db, options = {}) {
  await dataStore.saveDb(ensureDbShape(db), options);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(data) {
  return crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
}

function createToken(user) {
  const payload = base64url(JSON.stringify({
    id: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: Number(user.tokenVersion || 0),
    iat: Date.now()
  }));
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
  safe.role = normalizeRole(safe.role);
  safe.username = normalizeUsername(safe.username || safe.email || safe.name || safe.id);
  return safe;
}

function resolveCorsOrigins() {
  const configured = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
    process.env.ALLOWED_ORIGINS,
    process.env.CORS_ORIGINS
  ].filter(Boolean).join(',')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return Array.from(new Set([
    ...(process.env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_CORS_ORIGINS : DEFAULT_LOCAL_CORS_ORIGINS),
    ...configured
  ]));
}

function corsHeaders(req) {
  const origin = req.headers && req.headers.origin;
  const requestHeaders = req.headers && req.headers['access-control-request-headers'];
  const allowOrigin = origin && (CORS_ORIGINS.includes(origin) || VERCEL_PREVIEW_ORIGIN_PATTERN.test(origin));
  const headers = {
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': origin } : {}),
    ...(!origin ? { 'Access-Control-Allow-Origin': CORS_ORIGINS[0] || DEFAULT_PRODUCTION_CORS_ORIGINS[0] } : {}),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': requestHeaders || 'Content-Type, Authorization',
    Vary: 'Origin, Access-Control-Request-Headers'
  };
  return headers;
}

function isPublicCacheablePath(pathname) {
  return pathname === '/api/home'
    || pathname === '/api/categories'
    || pathname === '/api/stories'
    || pathname === '/api/rankings'
    || Boolean(match(pathname, '/api/stories/:slug'))
    || Boolean(match(pathname, '/api/stories/:slug/chapters/:number'));
}

function defaultCacheHeaders(req) {
  const pathname = req?.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname : '';
  if (!pathname.startsWith('/api')) return {};
  if (req.method === 'GET' && isPublicCacheablePath(pathname)) return {};
  return { 'Cache-Control': NO_STORE_CACHE_CONTROL };
}

function privateCacheHeaders() {
  return { 'Cache-Control': NO_STORE_CACHE_CONTROL };
}

function publicCacheHeaders() {
  return { 'Cache-Control': PUBLIC_CACHE_CONTROL };
}

function send(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(res.req || { headers: {} }),
    ...defaultCacheHeaders(res.req || {}),
    ...extraHeaders
  });
  res.end(payload);
}

function isDatabaseAvailabilityError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return /\b(supabase|database|schema cache|upstream request timeout|fetch failed|bad gateway|service unavailable|gateway timeout|econnreset|etimedout)\b/.test(message);
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
}

function rateLimitKey(pathname, req) {
  if (pathname === '/api/auth/login') return { key: `login:${clientIp(req)}`, limit: 100, windowMs: 60 * 1000 };
  if (pathname === '/api/uploads/cover') return { key: `upload:${clientIp(req)}`, limit: 20, windowMs: 60 * 1000 };
  if (pathname === '/api/me/avatar') return { key: `avatar:${clientIp(req)}`, limit: 20, windowMs: 60 * 1000 };
  if (pathname === '/api/wallet/topup') return { key: `topup:${clientIp(req)}`, limit: 20, windowMs: 60 * 1000 };
  if (/^\/api\/chapters\/[^/]+\/unlock$/.test(pathname)) return { key: `unlock:${clientIp(req)}`, limit: 40, windowMs: 60 * 1000 };
  return null;
}

function checkRateLimit(req, pathname) {
  const rule = rateLimitKey(pathname, req);
  if (!rule) return true;
  const timestamp = Date.now();
  const bucket = rateBuckets.get(rule.key) || { count: 0, resetAt: timestamp + rule.windowMs };
  if (bucket.resetAt <= timestamp) {
    bucket.count = 0;
    bucket.resetAt = timestamp + rule.windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(rule.key, bucket);
  return bucket.count <= rule.limit;
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

function normalizeIncomingTextFields(target, fields, context) {
  return validateTextFields(target, fields, context);
}

function readRawBody(req, limit = UPLOAD_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('File qua lon.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    parts.push(buffer.slice(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  parts.push(buffer.slice(start));
  return parts;
}

async function parseMultipartRequest(req) {
  const contentType = String(req.headers['content-type'] || '');
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error('Thieu multipart boundary.');
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const raw = await readRawBody(req, UPLOAD_LIMIT);
  const files = [];
  const fields = {};

  splitBuffer(raw, boundary).forEach(part => {
    let chunk = part;
    if (chunk.length < 4) return;
    if (chunk.slice(0, 2).toString() === '\r\n') chunk = chunk.slice(2);
    if (chunk.slice(-2).toString() === '\r\n') chunk = chunk.slice(0, -2);
    if (chunk.equals(Buffer.from('--'))) return;
    const headerEnd = chunk.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) return;
    const headers = chunk.slice(0, headerEnd).toString('utf8');
    let data = chunk.slice(headerEnd + 4);
    if (data.slice(-2).toString() === '\r\n') data = data.slice(0, -2);
    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || '';
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || '';
    const mimeType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || '';
    if (!name) return;
    if (filename) files.push({ fieldname: name, filename: path.basename(filename), mimeType, data });
    else fields[name] = data.toString('utf8');
  });

  return { fields, files };
}

function getAuthUser(req, db) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = db.users.find(user => user.id === payload.id);
  if (!user || user.status === 'deactivated' || user.status === 'locked') return null;
  if (Number(payload.tokenVersion || 0) !== Number(user.tokenVersion || 0)) return null;
  user.role = normalizeRole(user.role);
  return user;
}

function requireUser(req, res, db) {
  const user = getAuthUser(req, db);
  if (!user) unauthorized(res);
  return user;
}

function requireAdmin(req, res, db) {
  const user = requireUser(req, res, db);
  if (!user) return null;
  if (!isAdmin(user.role)) {
    forbidden(res);
    return null;
  }
  return user;
}

function requireStoryPublisher(req, res, db) {
  const user = requireUser(req, res, db);
  if (!user) return null;
  if (!canPostStory(user.role)) {
    forbidden(res);
    return null;
  }
  return user;
}

function enrichStory(db, story, viewerId, includeAllChapters = false) {
  const chapters = db.chapters
    .filter(chapter => chapter.storyId === story.id)
    .filter(chapter => includeAllChapters || isPublicChapter(chapter))
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
    ownerId: story.ownerId,
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
    featured: Boolean(story.featured),
    hot: Boolean(story.hot),
    recommended: Boolean(story.recommended),
    banner: Boolean(story.banner),
    isFeatured: Boolean(story.featured),
    isHot: Boolean(story.hot),
    isRecommended: Boolean(story.recommended),
    isBanner: Boolean(story.banner),
    follows: story.follows,
    categories: story.categories,
    tags: story.tags,
    translator: story.translator,
    language: story.language,
    ageRating: story.ageRating,
    hidden: story.hidden,
    rejectionReason: story.rejectionReason || '',
    chapterCountEstimate: story.chapterCountEstimate,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    chapterCount: story.chapterCount,
    latestChapter: story.latestChapter,
    bookmarked: story.bookmarked,
    followed: story.followed
  };
}

function sortStories(items, sort = 'updated') {
  items.sort((a, b) => {
    if (sort === 'views') return b.views - a.views;
    if (sort === 'rating') return b.rating - a.rating;
    if (sort === 'follows') return b.follows - a.follows;
    if (sort === 'chapters') return b.chapterCount - a.chapterCount;
    if (sort === 'created' || sort === 'new') {
      return new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0);
    }
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
  return items;
}

function queryPublicStories(db, viewerId, query = {}) {
  const {
    q = '',
    category = '',
    status = '',
    premium = '',
    ageRating = '',
    sort = 'updated',
    featured = false,
    hot = false,
    recommended = false,
    banner = false,
    limit = 100
  } = query;

  let items = db.stories.filter(isPublicStory).map(story => enrichStory(db, story, viewerId));
  if (q) items = items.filter(story => [story.title, story.author, story.description, ...story.categories].join(' ').toLowerCase().includes(String(q).trim().toLowerCase()));
  if (category) items = items.filter(story => story.categories.includes(category));
  if (status) items = items.filter(story => story.status === status);
  if (premium !== '') items = items.filter(story => String(story.premium) === String(premium));
  if (ageRating) items = items.filter(story => story.ageRating === ageRating);
  if (featured) items = items.filter(story => story.featured);
  if (hot) items = items.filter(story => story.hot);
  if (recommended) items = items.filter(story => story.recommended);
  if (banner) items = items.filter(story => story.banner);
  sortStories(items, sort);
  return items.slice(0, limit);
}

function normalizeUsername(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9._]+/g, '.')
    .replace(/[._]{2,}/g, '.')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 30);
  return USERNAME_PATTERN.test(text) ? text : '';
}

function baseUsernameForUser(user) {
  const emailLocal = String(user.email || '').split('@')[0];
  return normalizeUsername(emailLocal) || normalizeUsername(user.name) || 'user';
}

function assignMissingUsernames(users = []) {
  const used = new Set();
  users.forEach(user => {
    const current = normalizeUsername(user.username);
    if (current && !used.has(current)) {
      user.username = current;
      used.add(current);
    } else {
      user.username = '';
    }
  });
  users.forEach(user => {
    if (user.username) return;
    const base = baseUsernameForUser(user);
    let candidate = base;
    let suffix = 2;
    while (!USERNAME_PATTERN.test(candidate) || used.has(candidate)) {
      const ending = `_${suffix}`;
      candidate = `${base.slice(0, 30 - ending.length)}${ending}`;
      suffix += 1;
    }
    user.username = candidate;
    used.add(candidate);
  });
}

const RANKING_PERIODS = ['day', 'week', 'month', 'year', 'all'];
const RANKING_METRICS = ['views', 'follows', 'rating', 'comments', 'revenue'];
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_STORY_APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected'];
const VALID_CHAPTER_STATUSES = ['draft', 'pending', 'reviewing', 'approved', 'published', 'rejected', 'hidden', 'scheduled'];
const VALID_ADMIN_USER_STATUSES = ['active', 'locked'];
const VALID_ADMIN_USER_ROLES = ['user', 'mod', 'admin'];
const VALID_MOD_MANAGEMENT_ROLES = ['user', 'mod'];
const VALID_REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'rejected'];
const VALID_COMMENT_STATUSES = ['visible', 'hidden', 'deleted'];
const VALID_TRANSACTION_TYPES = ['topup', 'purchase', 'bonus', 'admin_adjustment', 'refund', 'promotion', 'withdrawal', 'author_payout'];
const AUTHOR_CHAPTER_STATUSES = ['draft', 'approved', 'published', 'hidden', 'scheduled'];
const MIN_PUBLISHED_CHAPTER_LENGTH = 500;
const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;
const PROMOTION_PACKAGES = [
  { id: 'promo-1', title: 'Day top trang chu', days: 3, price: 120, reach: '25.000 luot hien thi', features: ['Gan nhan de xuat', 'Uu tien trong muc hot'] },
  { id: 'promo-2', title: 'Goi tang truong', days: 7, price: 260, reach: '80.000 luot hien thi', features: ['Banner the loai', 'Day top tim kiem', 'Bao cao hieu qua'], featured: true },
  { id: 'promo-3', title: 'Ra mat truyen moi', days: 5, price: 180, reach: '45.000 luot hien thi', features: ['Thong bao doc gia phu hop', 'Chip new launch'] }
];
const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailNotifications: true,
  webNotifications: true,
  chapterNotifications: true,
  commentNotifications: true,
  followNotifications: true,
  promoNotifications: true,
  systemNotifications: true
};
const ALWAYS_CREATE_NOTIFICATION_TYPES = new Set(['wallet', 'purchase', 'system']);
const NOTIFICATION_PREFERENCE_BY_TYPE = {
  chapter: 'chapterNotifications',
  comment: 'commentNotifications',
  reply: 'commentNotifications',
  follow: 'followNotifications',
  promo: 'promoNotifications'
};
const PROFILE_FIELDS = new Set(['name', 'email', 'phone', 'birthday', 'gender', 'address', 'website', 'bio', 'avatar', 'cover', 'socialLinks']);
const NOTIFICATION_PREFERENCE_KEYS = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);
const PRIVACY_PREFERENCE_DEFAULTS = {
  publicReading: false,
  publicProfile: true,
  publicBookmarks: false,
  publicFollows: true,
  publicComments: true
};
const APPEARANCE_PREFERENCE_DEFAULTS = {
  theme: 'light',
  language: 'vi',
  readerFontSize: 18,
  readerLineHeight: 1.8,
  readerBackground: 'default'
};
const ACCOUNT_PREFERENCE_DEFAULTS = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  ...PRIVACY_PREFERENCE_DEFAULTS,
  ...APPEARANCE_PREFERENCE_DEFAULTS
};
const ACCOUNT_PREFERENCE_KEYS = new Set(Object.keys(ACCOUNT_PREFERENCE_DEFAULTS));
const SOCIAL_LINK_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function chapterStatus(chapter) {
  return chapter.status === 'published' ? 'approved' : chapter.status || 'approved';
}

function isPublicChapter(chapter) {
  if (!chapter) return false;
  if (chapterStatus(chapter) === 'approved') return true;
  if (chapter.status === 'scheduled' && chapter.scheduledAt) {
    return new Date(chapter.scheduledAt).getTime() <= Date.now();
  }
  return false;
}

function isPublishChapterStatus(status) {
  return ['approved', 'published', 'scheduled'].includes(String(status || '').trim());
}

function publicChapterContentError(content) {
  const text = String(content || '').trim();
  if (hasTestPlaceholder(text)) return 'Noi dung chuong dang la placeholder test.';
  if (text.length < MIN_PUBLISHED_CHAPTER_LENGTH) return `Noi dung chuong can toi thieu ${MIN_PUBLISHED_CHAPTER_LENGTH} ky tu truoc khi publish. Hay luu draft neu chua co noi dung that.`;
  return '';
}

function publicChapterError(chapterOrBody, status = chapterStatus(chapterOrBody)) {
  if (!isPublishChapterStatus(status)) return '';
  return publicChapterContentError(chapterOrBody?.content);
}

function publicReaderChapter(chapter) {
  if (!chapter || !hasTestPlaceholder(chapter.content)) return chapter;
  return {
    ...chapter,
    content: '',
    preview: '',
    contentUnavailable: true,
    unavailableMessage: 'Chương này đang được cập nhật.'
  };
}

function defaultNotificationPreferences() {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

function normalizeNotificationPreferences(input = {}) {
  return Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).reduce((prefs, [key, fallback]) => {
    prefs[key] = input[key] === undefined ? fallback : Boolean(input[key]);
    return prefs;
  }, {});
}

function defaultAccountPreferences() {
  return { ...ACCOUNT_PREFERENCE_DEFAULTS, updatedAt: now() };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeAccountPreferences(input = {}, notificationInput = {}) {
  const source = { ...notificationInput, ...input };
  const prefs = { ...ACCOUNT_PREFERENCE_DEFAULTS };
  [...NOTIFICATION_PREFERENCE_KEYS, ...Object.keys(PRIVACY_PREFERENCE_DEFAULTS)].forEach(key => {
    if (source[key] !== undefined) prefs[key] = Boolean(source[key]);
  });
  if (['light', 'dark'].includes(source.theme)) prefs.theme = source.theme;
  if (['vi', 'en'].includes(source.language)) prefs.language = source.language;
  if (['default', 'paper', 'sepia', 'night'].includes(source.readerBackground)) prefs.readerBackground = source.readerBackground;
  prefs.readerFontSize = clampNumber(source.readerFontSize, 14, 28, ACCOUNT_PREFERENCE_DEFAULTS.readerFontSize);
  prefs.readerLineHeight = clampNumber(source.readerLineHeight, 1.4, 2.4, ACCOUNT_PREFERENCE_DEFAULTS.readerLineHeight);
  prefs.updatedAt = input.updatedAt || now();
  return prefs;
}

function isHttpUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalAssetPath(value) {
  const text = String(value || '');
  return text.startsWith('/images/') || text.startsWith('/storage/');
}

function isStorageObjectPath(value) {
  return /^covers\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/i.test(String(value || ''));
}

function isProfileImageDataUrl(value) {
  const text = String(value || '');
  return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(text) && text.length <= 3 * 1024 * 1024;
}

function isProfileImageValue(value) {
  if (!value) return true;
  return isHttpUrl(value);
}

function isDataImageValue(value) {
  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(String(value || ''));
}

function isTrustedAvatarUrl(value) {
  if (!isHttpUrl(value)) return false;
  try {
    const parsed = new URL(String(value));
    const configuredBase = String(process.env.PUBLIC_STORAGE_BASE_URL || '').trim();
    if (configuredBase && parsed.href.startsWith(configuredBase.replace(/\/+$/, '') + '/')) return true;
    if (/\.public\.blob\.vercel-storage\.com$/i.test(parsed.hostname)) return true;
    if (/\.supabase\.co$/i.test(parsed.hostname) && parsed.pathname.includes('/storage/v1/object/public/')) return true;
    if (process.env.NODE_ENV !== 'production' && parsed.hostname === 'localhost' && parsed.pathname.startsWith('/storage/')) return true;
    return false;
  } catch {
    return false;
  }
}

function isCoverImageValue(value) {
  if (!value) return true;
  return isHttpUrl(value) || isLocalAssetPath(value) || isStorageObjectPath(value);
}

function validateUploadedImage(file) {
  if (!file) return 'Vui long chon file anh.';
  if (!IMAGE_MIME_TYPES.has(file.mimeType)) return 'Chi chap nhan anh JPG, PNG hoac WEBP.';
  if (file.data.length > UPLOAD_LIMIT) return 'File goc toi da 10MB.';
  if (file.data.length > COMPRESSED_IMAGE_LIMIT) return 'Anh sau nen toi da 500KB. Vui long nen anh truoc khi upload.';
  return '';
}

function validateAvatarImage(file) {
  if (!file) return 'Vui long chon file avatar.';
  if (!IMAGE_MIME_TYPES.has(file.mimeType)) return 'Chi chap nhan avatar PNG, JPG hoac WEBP.';
  if (file.data.length > AVATAR_UPLOAD_LIMIT) return 'Avatar toi da 2MB.';
  return '';
}

function normalizeSocialLinks(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.entries(input).reduce((links, [key, value]) => {
    if (!SOCIAL_LINK_KEY_PATTERN.test(key)) return links;
    const url = String(value || '').trim();
    if (url) links[key] = url;
    return links;
  }, {});
}

function profileResponse(user) {
  return {
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    birthday: user.birthday || '',
    gender: user.gender || '',
    address: user.address || '',
    website: user.website || '',
    bio: user.bio || '',
    avatar: isProfileImageValue(user.avatar) ? user.avatar || '' : '',
    cover: isHttpUrl(user.cover) ? user.cover || '' : '',
    socialLinks: normalizeSocialLinks(user.socialLinks),
    updatedAt: user.updatedAt || user.createdAt || null
  };
}

function validateProfilePayload(body, user, db) {
  const unknown = Object.keys(body).filter(key => !PROFILE_FIELDS.has(key));
  if (unknown.length) return { error: `Trường hồ sơ không hợp lệ: ${unknown.join(', ')}.` };

  const value = {};
  const has = field => Object.prototype.hasOwnProperty.call(body, field);

  if (has('name')) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'Tên hiển thị là bắt buộc.' };
    if (name.length > 80) return { error: 'Tên hiển thị tối đa 80 ký tự.' };
    value.name = name;
  }

  if (has('email')) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!isEmail(email)) return { error: 'Email không hợp lệ.' };
    if (db.users.some(item => item.id !== user.id && item.email.toLowerCase() === email)) return { error: 'Email đã tồn tại.' };
    value.email = email;
  }

  if (has('phone')) {
    const phone = String(body.phone || '').trim();
    if (phone && !/^[0-9+\-\s().]{7,20}$/.test(phone)) return { error: 'Số điện thoại không hợp lệ.' };
    value.phone = phone;
  }

  if (has('birthday')) {
    const birthday = String(body.birthday || '').trim();
    if (birthday) {
      const date = new Date(`${birthday}T00:00:00`);
      if (Number.isNaN(date.getTime())) return { error: 'Ngày sinh không hợp lệ.' };
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (date > today) return { error: 'Ngày sinh không được ở tương lai.' };
    }
    value.birthday = birthday;
  }

  if (has('gender')) {
    const gender = String(body.gender || '').trim();
    if (gender && !['male', 'female', 'other', 'prefer-not'].includes(gender)) return { error: 'Giới tính không hợp lệ.' };
    value.gender = gender;
  }

  if (has('address')) {
    const address = String(body.address || '').trim();
    if (address.length > 200) return { error: 'Địa chỉ tối đa 200 ký tự.' };
    value.address = address;
  }

  if (has('bio')) {
    const bio = String(body.bio || '').trim();
    if (bio.length > 500) return { error: 'Giới thiệu tối đa 500 ký tự.' };
    value.bio = bio;
  }

  if (has('avatar')) {
    const avatar = String(body.avatar || '').trim();
    if (isDataImageValue(avatar)) return { error: 'Avatar phai duoc upload len storage, khong luu base64 trong database.' };
    if (!isProfileImageValue(avatar)) return { error: 'Avatar phải là ảnh PNG, JPG hoặc WEBP hợp lệ.' };
    if (avatar && !isTrustedAvatarUrl(avatar)) return { error: 'Avatar phai la URL storage hop le.' };
    value.avatar = avatar;
  }

  if (has('website')) {
    const website = String(body.website || '').trim();
    if (website && !isHttpUrl(website)) return { error: 'website phải là URL http/https hợp lệ.' };
    value.website = website;
  }

  if (has('cover')) {
    const cover = String(body.cover || '').trim();
    if (isDataImageValue(cover)) return { error: 'cover phai duoc upload len storage, khong luu base64 trong database.' };
    if (cover && !isHttpUrl(cover)) return { error: 'cover phải là URL http/https hợp lệ.' };
    value.cover = cover;
  }

  if (body.socialLinks !== undefined) {
    if (!body.socialLinks || typeof body.socialLinks !== 'object' || Array.isArray(body.socialLinks)) {
      return { error: 'Liên kết mạng xã hội không hợp lệ.' };
    }
    const entries = Object.entries(body.socialLinks);
    if (entries.length > 12) return { error: 'Tối đa 12 liên kết mạng xã hội.' };
    const socialLinks = {};
    for (const [key, rawValue] of entries) {
      if (!SOCIAL_LINK_KEY_PATTERN.test(key)) return { error: `Tên social link không hợp lệ: ${key}.` };
      const link = String(rawValue || '').trim();
      if (link && !isHttpUrl(link)) return { error: `Liên kết ${key} phải là URL http/https hợp lệ.` };
      if (link) socialLinks[key] = link;
    }
    value.socialLinks = socialLinks;
  }

  return { value };
}

function passwordMatches(user, password) {
  if (!user?.salt || !user?.passwordHash) return false;
  return hashPassword(password, user.salt).passwordHash === user.passwordHash;
}

function passwordPolicyError(password) {
  if (password.length < 6) return 'Mật khẩu mới cần tối thiểu 6 ký tự.';
  return '';
}

function applyPreferencePatch(user, patch) {
  const unknown = Object.keys(patch).filter(key => !ACCOUNT_PREFERENCE_KEYS.has(key));
  if (unknown.length) return { error: `Cài đặt không hợp lệ: ${unknown.join(', ')}.` };
  user.preferences = normalizeAccountPreferences(user.preferences, user.notificationPreferences);
  Object.entries(patch).forEach(([key, value]) => {
    if ([...NOTIFICATION_PREFERENCE_KEYS, ...Object.keys(PRIVACY_PREFERENCE_DEFAULTS)].includes(key)) {
      user.preferences[key] = Boolean(value);
      if (NOTIFICATION_PREFERENCE_KEYS.includes(key)) {
        user.notificationPreferences[key] = Boolean(value);
      }
      return;
    }
    if (key === 'theme' && ['light', 'dark'].includes(value)) user.preferences.theme = value;
    else if (key === 'language' && ['vi', 'en'].includes(value)) user.preferences.language = value;
    else if (key === 'readerBackground' && ['default', 'paper', 'sepia', 'night'].includes(value)) user.preferences.readerBackground = value;
    else if (key === 'readerFontSize') user.preferences.readerFontSize = clampNumber(value, 14, 28, user.preferences.readerFontSize);
    else if (key === 'readerLineHeight') user.preferences.readerLineHeight = clampNumber(value, 1.4, 2.4, user.preferences.readerLineHeight);
    else return;
  });
  user.preferences.updatedAt = now();
  return { preferences: user.preferences };
}

function wordCount(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function decodeTextBuffer(buffer) {
  if (!buffer || !buffer.length) return '';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.slice(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let index = 2; index < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1] || 0;
      swapped[index - 1] = buffer[index];
    }
    return swapped.toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.slice(3).toString('utf8');
  return buffer.toString('utf8');
}

function romanToNumber(value) {
  const input = String(value || '').toUpperCase();
  if (!/^[IVXLCDM]+$/.test(input)) return Number(value) || 0;
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return input.split('').reduce((sum, char, index, chars) => {
    const current = map[char] || 0;
    const next = map[chars[index + 1]] || 0;
    return sum + (current < next ? -current : current);
  }, 0);
}

function parseChapterHeading(line) {
  const pattern = /^\s*(?:(?:quy\u1ec3n|quyen)\s+([0-9ivxlcdm]+)\s*[-:–—]\s*)?(ch\u01b0\u01a1ng|chuong|chapter|h\u1ed3i|hoi|quy\u1ec3n|quyen|ph\u00f3\s*b\u1ea3n|pho\s*ban)\s+([0-9ivxlcdm]+)(?:\s*[:\-–—]\s*(.+))?\s*$/i;
  const match = String(line || '').match(pattern);
  if (!match) return null;
  const number = romanToNumber(match[3]);
  const suffix = String(match[4] || '').trim();
  const heading = String(line || '').trim();
  return {
    number,
    title: suffix || heading,
    heading
  };
}

function parseChaptersFromText(text, { startNumber = 1 } = {}) {
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!source) return { chapters: [], warnings: ['Noi dung rong.'] };
  const lines = source.split('\n');
  const sections = [];
  let current = null;

  lines.forEach(line => {
    const heading = parseChapterHeading(line);
    if (heading) {
      if (current) sections.push(current);
      current = { ...heading, body: [] };
      return;
    }
    if (current) current.body.push(line);
  });
  if (current) sections.push(current);

  if (!sections.length) {
    return {
      chapters: [{
        number: startNumber,
        title: `Chuong ${startNumber}`,
        content: source,
        wordCount: wordCount(source),
        warnings: ['Khong phat hien heading chuong, da tao mot chuong duy nhat.']
      }],
      warnings: ['Khong phat hien heading chuong, vui long kiem tra dinh dang neu muon tach nhieu chuong.']
    };
  }

  const chapters = sections.map((section, index) => {
    const number = section.number || startNumber + index;
    const content = section.body.join('\n').trim();
    const warnings = [];
    if (!content) warnings.push('Noi dung chuong rong.');
    if (!section.title) warnings.push('Ten chuong rong.');
    if (wordCount(content) > 0 && wordCount(content) < 80) warnings.push('Chuong hoi ngan.');
    return {
      number,
      title: section.title || `Chuong ${number}`,
      content,
      wordCount: wordCount(content),
      warnings
    };
  });

  return { chapters, warnings: [] };
}

function nextChapterNumber(db, storyId) {
  return Math.max(0, ...db.chapters.filter(item => item.storyId === storyId).map(item => Number(item.number || 0))) + 1;
}

function chapterNumberExists(db, storyId, number, currentChapterId) {
  return db.chapters.some(item => item.storyId === storyId && item.id !== currentChapterId && Number(item.number) === Number(number));
}

function chapterAdminSummary(db, chapter) {
  const story = db.stories.find(item => item.id === chapter.storyId);
  return {
    ...chapter,
    storyId: chapter.storyId,
    storyTitle: story?.title || 'Truyện đã xóa',
    author: story?.author || 'Không rõ tác giả',
    number: chapter.number,
    title: chapter.title,
    status: chapterStatus(chapter),
    wordCount: chapter.wordCount ?? wordCount(chapter.content),
    createdAt: chapter.createdAt || story?.createdAt || now(),
    updatedAt: chapter.updatedAt || chapter.createdAt || story?.updatedAt || story?.createdAt || now(),
    vip: Boolean(chapter.isPremium),
    reads: chapter.views || 0,
    comments: db.comments.filter(item => item.chapterId === chapter.id).length
  };
}

function periodWindow(period, reference = new Date()) {
  if (period === 'all') return { start: null, end: reference, previousStart: null, previousEnd: null };
  const end = reference;
  let start;
  if (period === 'day') {
    start = new Date(reference);
    start.setHours(0, 0, 0, 0);
  } else {
    const days = { week: 7, month: 30, year: 365 }[period] || 7;
    start = new Date(reference.getTime() - days * DAY_MS);
  }
  const duration = Math.max(1, end.getTime() - start.getTime());
  return {
    start,
    end,
    previousStart: new Date(start.getTime() - duration),
    previousEnd: start
  };
}

function inRange(value, start, end) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  if (start && time < start.getTime()) return false;
  if (end && time >= end.getTime()) return false;
  return true;
}

function countByStory(items, start, end, getStoryId = item => item.storyId) {
  return items.reduce((map, item) => {
    if (start || end) {
      if (!inRange(item.createdAt, start, end)) return map;
    }
    const storyId = getStoryId(item);
    if (!storyId) return map;
    map.set(storyId, (map.get(storyId) || 0) + 1);
    return map;
  }, new Map());
}

function revenueByStory(db, start, end) {
  return db.purchases.reduce((map, purchase) => {
    if (start || end) {
      if (!inRange(purchase.createdAt, start, end)) return map;
    }
    const chapter = purchase.chapterId ? db.chapters.find(item => item.id === purchase.chapterId) : null;
    const storyId = purchase.storyId || chapter?.storyId;
    if (!storyId) return map;
    const amount = Number(purchase.price ?? Math.abs(purchase.amount || 0));
    map.set(storyId, (map.get(storyId) || 0) + (Number.isFinite(amount) ? amount : 0));
    return map;
  }, new Map());
}

function buildRankingRows(db, metric, period, start, end) {
  const publicStories = db.stories.filter(isPublicStory).map(story => enrichStory(db, story, null));
  const allTime = period === 'all';
  const viewCounts = allTime ? new Map() : countByStory(db.viewEvents, start, end);
  const followCounts = allTime ? new Map() : countByStory(db.follows, start, end);
  const commentCounts = countByStory(db.comments, allTime ? null : start, allTime ? null : end);
  const revenueCounts = revenueByStory(db, allTime ? null : start, allTime ? null : end);

  return publicStories.map(story => {
    const periodViews = allTime ? Number(story.views || 0) : Number(viewCounts.get(story.id) || 0);
    const periodFollows = allTime ? Number(story.follows || 0) : Number(followCounts.get(story.id) || 0);
    const commentsCount = Number(commentCounts.get(story.id) || 0);
    const revenueSeeds = Number(revenueCounts.get(story.id) || 0);
    const ratingScore = Number(story.rating || 0);
    const ratingCount = Number(story.ratingCount || 0);
    const rankScore = {
      views: periodViews,
      follows: periodFollows,
      rating: ratingScore,
      comments: commentsCount,
      revenue: revenueSeeds
    }[metric];

    return {
      ...storySummary(story),
      rankScore,
      rankDelta: 0,
      commentsCount,
      revenueSeeds,
      periodViews,
      periodFollows,
      ratingCount
    };
  });
}

function sortRankingRows(rows, metric) {
  return rows.sort((a, b) => {
    if (Number(b.rankScore || 0) !== Number(a.rankScore || 0)) return Number(b.rankScore || 0) - Number(a.rankScore || 0);
    if (metric === 'rating' && Number(b.ratingCount || 0) !== Number(a.ratingCount || 0)) return Number(b.ratingCount || 0) - Number(a.ratingCount || 0);
    if (Number(b.views || 0) !== Number(a.views || 0)) return Number(b.views || 0) - Number(a.views || 0);
    return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
  });
}

function applyRankDelta(currentRows, previousRows) {
  const previousRank = new Map();
  previousRows.forEach((story, index) => {
    if (Number(story.rankScore || 0) > 0) previousRank.set(story.id, index + 1);
  });
  if (!previousRank.size) return currentRows.map(story => ({ ...story, rankDelta: 0 }));
  return currentRows.map((story, index) => ({
    ...story,
    rankDelta: previousRank.has(story.id) ? previousRank.get(story.id) - (index + 1) : 0
  }));
}

function buildRankings(db, { period = 'week', metric = 'views', limit = 100 } = {}) {
  const safePeriod = RANKING_PERIODS.includes(period) ? period : 'week';
  const safeMetric = RANKING_METRICS.includes(metric) ? metric : 'views';
  const safeLimit = Math.min(100, Math.max(1, parsePositiveNumber(limit, 100)));
  const range = periodWindow(safePeriod);
  const currentRows = sortRankingRows(buildRankingRows(db, safeMetric, safePeriod, range.start, range.end), safeMetric);
  const previousRows = safePeriod === 'all'
    ? []
    : sortRankingRows(buildRankingRows(db, safeMetric, safePeriod, range.previousStart, range.previousEnd), safeMetric);
  return applyRankDelta(currentRows, previousRows).slice(0, safeLimit);
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
  db.paymentOrders ||= [];
  db.comments ||= [];
  db.ratings ||= [];
  db.notifications ||= [];
  db.reports ||= [];
  db.adminLogs ||= [];
  db.adminNotifications ||= [];
  db.taxonomy ||= {};
  db.newsletters ||= [];
  db.viewEvents ||= [];
  db.promotions ||= [];
  assignMissingUsernames(db.users);
  db.users.forEach(user => {
    if (!user.status) user.status = 'active';
    user.role = normalizeRole(user.role);
    user.tokenVersion = Number(user.tokenVersion || 0);
    user.notificationPreferences = normalizeNotificationPreferences(user.notificationPreferences || user.preferences);
    user.preferences = normalizeAccountPreferences(user.preferences, user.notificationPreferences);
    user.socialLinks = normalizeSocialLinks(user.socialLinks);
  });
  db.stories.forEach(story => {
    if (!story.approvalStatus) story.approvalStatus = story.hidden ? 'pending' : 'approved';
    if (!VALID_STORY_APPROVAL_STATUSES.includes(story.approvalStatus)) story.approvalStatus = story.hidden ? 'pending' : 'approved';
    story.status ||= 'ongoing';
    story.rejectionReason ||= '';
    story.categories ||= [];
    story.tags ||= [];
    story.featured = Boolean(story.featured);
    story.hot = Boolean(story.hot);
    story.recommended = Boolean(story.recommended);
    story.banner = Boolean(story.banner);
    story.hidden = Boolean(story.hidden);
    story.views = Number(story.views || 0);
    story.chapterCountEstimate = Number(story.chapterCountEstimate || 0);
    if (!story.ownerId) {
      const admin = db.users.find(user => user.role === 'admin');
      if (admin) story.ownerId = admin.id;
    }
    if (story.approvalStatus !== 'approved') story.hidden = true;
  });
  db.follows.forEach(follow => {
    if (!follow.createdAt) follow.createdAt = now();
  });
  db.purchases.forEach(purchase => {
    if (!purchase.createdAt) purchase.createdAt = now();
    if (!purchase.storyId && purchase.chapterId) {
      const chapter = db.chapters.find(item => item.id === purchase.chapterId);
      if (chapter) purchase.storyId = chapter.storyId;
    }
  });
  db.viewEvents.forEach(event => {
    if (!event.createdAt) event.createdAt = now();
  });
  db.chapters.forEach(chapter => {
    if (chapter.status === 'published') chapter.status = 'approved';
    if (chapter.status && !VALID_CHAPTER_STATUSES.includes(chapter.status)) chapter.status = 'approved';
    if (!chapter.createdAt) chapter.createdAt = now();
    if (!chapter.updatedAt) chapter.updatedAt = chapter.createdAt;
    chapter.wordCount = Number(chapter.wordCount ?? wordCount(chapter.content));
  });
  db.comments.forEach(comment => {
    if (!comment.status) comment.status = 'visible';
    if (!VALID_COMMENT_STATUSES.includes(comment.status)) comment.status = 'visible';
  });
  db.transactions.forEach(transaction => {
    transaction.status ||= 'success';
    if (!VALID_TRANSACTION_TYPES.includes(transaction.type)) transaction.type = 'bonus';
  });
  ensureTaxonomy(db);
  db.promotions.forEach(promotion => {
    if (!promotion.id) promotion.id = uid('promo');
    if (!promotion.createdAt) promotion.createdAt = now();
    if (!promotion.status) promotion.status = 'active';
  });
  db.notifications.forEach(notification => {
    if (!notification.id) notification.id = uid('noti');
    notification.type ||= 'system';
    notification.title ||= 'Thông báo';
    notification.body ||= '';
    notification.link ||= '';
    notification.read = Boolean(notification.read);
    notification.createdAt ||= now();
  });
  return db;
}

function isPublicStory(story) {
  return !story.hidden && (story.approvalStatus || 'approved') === 'approved';
}

function cloneForLog(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function pageParams(url) {
  const page = Math.max(1, parsePositiveNumber(url.searchParams.get('page'), 1));
  const limit = Math.min(100, Math.max(1, parsePositiveNumber(url.searchParams.get('limit'), 50)));
  return { page, limit };
}

function paginate(items, url) {
  const { page, limit } = pageParams(url);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages }
  };
}

function matchesSearch(values, query) {
  const text = String(query || '').trim().toLowerCase();
  if (!text) return true;
  return values.filter(Boolean).join(' ').toLowerCase().includes(text);
}

function normalizeStoredRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'reader') return 'user';
  if (value === 'author') return 'mod';
  return VALID_ADMIN_USER_ROLES.includes(value) ? value : null;
}

function adminUserSummary(db, user) {
  const safe = safeUser(user);
  const storyCount = db.stories.filter(story => getStoryOwnerId(story) === user.id).length;
  const reportCount = db.reports.filter(report => {
    const target = reportTarget(db, report);
    return report.userId === user.id || target.reportedUserId === user.id;
  }).length;
  return {
    ...safe,
    role: normalizeRole(safe.role),
    status: safe.status || 'active',
    coins: Number(safe.seeds || 0),
    stories: storyCount,
    storyCount,
    reports: reportCount,
    reportCount,
    joinedAt: safe.createdAt || null,
    lastActiveAt: safe.lastActiveAt || safe.updatedAt || safe.createdAt || null,
    note: safe.note || ''
  };
}

function adminCount(db) {
  return db.users.filter(user => normalizeRole(user.role) === 'admin' && user.status !== 'deactivated').length;
}

function canChangeUserRole(db, admin, target, nextRole) {
  const currentRole = normalizeRole(target.role);
  const normalizedNextRole = normalizeRole(nextRole);
  if (currentRole === 'admin' && normalizedNextRole !== 'admin' && adminCount(db) <= 1) {
    return { ok: false, message: 'Khong the ha quyen admin cuoi cung cua he thong.' };
  }
  if (target.id === admin.id && currentRole === 'admin' && normalizedNextRole !== 'admin' && adminCount(db) <= 1) {
    return { ok: false, message: 'Khong the tu ha quyen admin cuoi cung.' };
  }
  return { ok: true };
}

function adminStorySummary(db, story, viewerId) {
  const owner = db.users.find(user => user.id === getStoryOwnerId(story));
  const allChapters = db.chapters.filter(chapter => chapter.storyId === story.id);
  const enriched = enrichStory(db, story, viewerId, true);
  const chapterCount = allChapters.length || Number(story.chapterCountEstimate || 0);
  return {
    ...enriched,
    id: story.id,
    title: story.title,
    slug: story.slug,
    author: story.author || '',
    description: story.description || '',
    coverUrl: story.cover || story.coverUrl || '',
    genres: story.categories || [],
    tags: story.tags || [],
    status: story.approvalStatus || 'pending',
    storyStatus: story.status || 'ongoing',
    rejectReason: story.rejectionReason || '',
    isPublic: !story.hidden && (story.approvalStatus || 'approved') === 'approved',
    isFeatured: Boolean(story.featured),
    isHot: Boolean(story.hot),
    isRecommended: Boolean(story.recommended),
    isBanner: Boolean(story.banner),
    views: Number(story.views || 0),
    chaptersCount: chapterCount,
    createdAt: story.createdAt || '',
    updatedAt: story.updatedAt || story.createdAt || '',
    deletedAt: story.deletedAt || null,
    cover: story.cover || story.coverUrl || '',
    approvalStatus: story.approvalStatus || 'pending',
    hidden: Boolean(story.hidden),
    featured: Boolean(story.featured),
    hot: Boolean(story.hot),
    recommended: Boolean(story.recommended),
    banner: Boolean(story.banner),
    categories: story.categories || [],
    chapterCount,
    owner: safeUser(owner),
    ownerName: owner?.name || '',
    publishStatus: story.hidden ? 'hidden' : isPublicStory(story) ? 'published' : story.approvalStatus || 'pending',
    hot: Boolean(story.hot),
    recommended: Boolean(story.recommended),
    banner: Boolean(story.banner),
    comments: db.comments.filter(comment => comment.storyId === story.id).length,
    totalChapters: allChapters.length,
    pendingChapters: allChapters.filter(chapter => ['pending', 'reviewing'].includes(chapter.status)).length
  };
}

function adminTransactionSummary(db, transaction) {
  const user = db.users.find(item => item.id === transaction.userId);
  const amount = Number(transaction.amount || 0);
  const seedAmount = Number(transaction.seeds ?? transaction.coins ?? Math.abs(amount));
  return {
    ...transaction,
    type: transaction.type || 'bonus',
    status: transaction.status || 'success',
    method: transaction.method || (transaction.type === 'topup' ? 'manual_topup' : transaction.type === 'purchase' ? 'wallet' : 'internal'),
    amount,
    seeds: seedAmount,
    coins: seedAmount,
    amountVnd: Number(transaction.amountVnd ?? transaction.vndAmount ?? transaction.money ?? transaction.priceVnd ?? 0),
    userName: transaction.userName || user?.name || transaction.userId || '',
    userEmail: user?.email || ''
  };
}

function reportTarget(db, report) {
  const targetType = report.targetType || report.type || (report.commentId ? 'comment' : report.chapterId ? 'chapter' : 'story');
  const targetId = report.targetId || report.commentId || report.chapterId || report.storyId;
  let story = report.storyId ? db.stories.find(item => item.id === report.storyId) : null;
  let chapter = null;
  let comment = null;
  let title = report.targetTitle || '';
  let reportedUserId = report.targetUserId || null;

  if (targetType === 'comment') {
    comment = db.comments.find(item => item.id === targetId);
    if (comment) {
      story ||= db.stories.find(item => item.id === comment.storyId);
      chapter = comment.chapterId ? db.chapters.find(item => item.id === comment.chapterId) : null;
      title ||= comment.body?.slice(0, 80) || 'Comment';
      reportedUserId ||= comment.userId;
    }
  } else if (targetType === 'chapter') {
    chapter = db.chapters.find(item => item.id === targetId);
    if (chapter) {
      story ||= db.stories.find(item => item.id === chapter.storyId);
      title ||= `${story?.title || ''} - Chapter ${chapter.number}`;
      reportedUserId ||= story ? getStoryOwnerId(story) : null;
    }
  } else {
    story ||= db.stories.find(item => item.id === targetId);
    if (story) {
      title ||= story.title;
      reportedUserId ||= getStoryOwnerId(story);
    }
  }

  return {
    type: targetType,
    id: targetId,
    story,
    chapter,
    comment,
    title: title || 'Reported content',
    storyTitle: story?.title || report.storyTitle || '',
    reportedUserId
  };
}

function adminReportSummary(db, report) {
  const target = reportTarget(db, report);
  const reporter = db.users.find(user => user.id === report.userId);
  const reportedUser = db.users.find(user => user.id === target.reportedUserId);
  return {
    ...report,
    type: target.type,
    targetType: target.type,
    targetId: target.id,
    targetTitle: target.title,
    storyTitle: target.storyTitle,
    status: report.status || 'open',
    severity: report.severity || 'medium',
    detail: report.detail || report.reason || '',
    reporter: safeUser(reporter),
    user: safeUser(reporter),
    userName: reporter?.name || '',
    reportedUser: safeUser(reportedUser),
    story: target.story ? storySummary(enrichStory(db, target.story, null, true)) : null,
    chapter: target.chapter ? chapterAdminSummary(db, target.chapter) : null,
    comment: target.comment ? adminCommentSummary(db, target.comment) : null
  };
}

function adminCommentSummary(db, comment) {
  const story = db.stories.find(item => item.id === comment.storyId);
  const chapter = db.chapters.find(item => item.id === comment.chapterId);
  const user = db.users.find(item => item.id === comment.userId);
  return {
    ...comment,
    status: comment.status || 'visible',
    userName: user?.name || '',
    userEmail: user?.email || '',
    user: safeUser(user),
    storyTitle: story?.title || '',
    chapterTitle: chapter?.title || '',
    chapterNumber: chapter?.number || null,
    reports: db.reports.filter(report => report.commentId === comment.id || (report.targetType === 'comment' && report.targetId === comment.id)).length
  };
}

function taxonomyItem(value, type = 'category') {
  if (value && typeof value === 'object') {
    const name = String(value.name || value.label || '').trim();
    return name ? {
      id: String(value.id || `${type}_${slugify(name)}`),
      name,
      slug: String(value.slug || slugify(name)),
      description: String(value.description || ''),
      color: String(value.color || ''),
      createdAt: value.createdAt || now(),
      updatedAt: value.updatedAt || value.createdAt || now()
    } : null;
  }
  const name = String(value || '').trim();
  return name ? {
    id: `${type}_${slugify(name)}`,
    name,
    slug: slugify(name),
    description: '',
    color: '',
    createdAt: now(),
    updatedAt: now()
  } : null;
}

function normalizeTaxonomyList(input, fallbackNames, type) {
  const byName = new Map();
  [...(Array.isArray(input) ? input : []), ...fallbackNames].forEach(value => {
    const item = taxonomyItem(value, type);
    if (item && !byName.has(item.name.toLowerCase())) byName.set(item.name.toLowerCase(), item);
  });
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function ensureTaxonomy(db) {
  db.taxonomy ||= {};
  const categoryNames = Array.from(new Set(db.stories.flatMap(story => story.categories || []))).filter(Boolean);
  const tagNames = Array.from(new Set(db.stories.flatMap(story => story.tags || []))).filter(Boolean);
  db.taxonomy.categories = normalizeTaxonomyList(db.taxonomy.categories, categoryNames, 'cat');
  db.taxonomy.tags = normalizeTaxonomyList(db.taxonomy.tags, tagNames, 'tag');
  return db.taxonomy;
}

function taxonomyResponse(db) {
  const taxonomy = ensureTaxonomy(db);
  const categoryUsage = new Map();
  const tagUsage = new Map();
  db.stories.forEach(story => {
    (story.categories || []).forEach(name => categoryUsage.set(name.toLowerCase(), Number(categoryUsage.get(name.toLowerCase()) || 0) + 1));
    (story.tags || []).forEach(name => tagUsage.set(name.toLowerCase(), Number(tagUsage.get(name.toLowerCase()) || 0) + 1));
  });
  return {
    categories: taxonomy.categories.map(item => ({ ...item, usage: Number(categoryUsage.get(item.name.toLowerCase()) || 0) })),
    tags: taxonomy.tags.map(item => ({ ...item, usage: Number(tagUsage.get(item.name.toLowerCase()) || 0) }))
  };
}

function logAdminAction(db, admin, action, entityType, entityId, before, after, note = '') {
  db.adminLogs ||= [];
  const entry = {
    id: uid('log'),
    adminId: admin.id,
    adminName: admin.name || admin.email,
    action,
    entityType,
    entityId,
    before: cloneForLog(before),
    after: cloneForLog(after),
    note: String(note || '').slice(0, 500),
    createdAt: now()
  };
  db.adminLogs.unshift(entry);
  return entry;
}

function adminDashboard(db) {
  const pendingReports = db.reports.filter(item => ['open', 'reviewing'].includes(item.status || 'open')).length;
  const pendingStories = db.stories.filter(item => (item.approvalStatus || 'approved') === 'pending').length;
  const pendingChapters = db.chapters.filter(item => ['pending', 'reviewing'].includes(item.status || 'approved')).length;
  const revenueSeeds = db.transactions
    .filter(item => ['topup', 'purchase'].includes(item.type) && (item.status || 'success') === 'success')
    .reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
  const revenueVnd = db.transactions
    .filter(item => (item.status || 'success') === 'success')
    .reduce((sum, item) => sum + Number(item.amountVnd ?? item.vndAmount ?? item.money ?? 0), 0);
  const latestActivities = db.adminLogs.slice(0, 12).map(item => ({
    id: item.id,
    action: item.action,
    entityType: item.entityType,
    entityId: item.entityId,
    adminName: item.adminName,
    note: item.note,
    createdAt: item.createdAt
  }));
  return {
    users: db.users.length,
    stories: db.stories.length,
    chapters: db.chapters.length,
    transactions: db.transactions.length,
    revenueSeeds,
    revenueVnd,
    views: db.stories.reduce((sum, story) => sum + Number(story.views || 0), 0),
    pendingReports,
    pendingStories,
    pendingChapters,
    latestActivities
  };
}

function publicComment(db, comment) {
  const user = db.users.find(item => item.id === comment.userId);
  return {
    id: comment.id,
    storyId: comment.storyId,
    chapterId: comment.chapterId || null,
    parentId: comment.parentId || null,
    userId: comment.userId,
    userName: user?.name || 'Bạn đọc',
    userAvatar: user?.avatar || '/images/logo.png',
    body: comment.body,
    createdAt: comment.createdAt
  };
}

function publicCommentsForStory(db, storyId) {
  const comments = db.comments
    .filter(comment => comment.storyId === storyId)
    .filter(comment => (comment.status || 'visible') === 'visible')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const byId = new Map(comments.map(comment => [comment.id, { ...publicComment(db, comment), replies: [] }]));
  const roots = [];
  comments.forEach(comment => {
    const payload = byId.get(comment.id);
    if (comment.parentId && byId.has(comment.parentId)) {
      byId.get(comment.parentId).replies.push(payload);
    } else {
      roots.push(payload);
    }
  });
  return roots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function notificationResponse(notification) {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link || '',
    read: Boolean(notification.read),
    createdAt: notification.createdAt,
    actorId: notification.actorId || null,
    storyId: notification.storyId || null,
    chapterId: notification.chapterId || null
  };
}

function notificationPreferenceAllows(db, userId, type) {
  if (!userId) return false;
  if (ALWAYS_CREATE_NOTIFICATION_TYPES.has(type)) return true;
  const user = db.users.find(item => item.id === userId);
  if (!user) return false;
  const preferenceKey = NOTIFICATION_PREFERENCE_BY_TYPE[type];
  if (!preferenceKey) return true;
  user.notificationPreferences = normalizeNotificationPreferences(user.notificationPreferences);
  return user.notificationPreferences[preferenceKey] !== false;
}

function createNotification(db, userId, { type = 'system', title, body, link = '', actorId, storyId, chapterId } = {}) {
  if (!notificationPreferenceAllows(db, userId, type)) return null;
  const notification = {
    id: uid('noti'),
    userId,
    type,
    title: String(title || 'Thông báo').trim(),
    body: String(body || '').trim(),
    link: String(link || '').trim(),
    read: false,
    createdAt: now()
  };
  if (actorId) notification.actorId = actorId;
  if (storyId) notification.storyId = storyId;
  if (chapterId) notification.chapterId = chapterId;
  db.notifications.unshift(notification);
  return notification;
}

function upsertReadingProgress(db, { userId, storyId, chapterId, chapterNumber, progressPercent = null, lastPosition = null }) {
  db.history ||= [];
  const timestamp = now();
  const existing = db.history.find(item => item.userId === userId && item.storyId === storyId);
  const patch = {
    userId,
    storyId,
    chapterId,
    chapterNumber,
    progressPercent,
    progress: progressPercent ?? undefined,
    lastPosition,
    lastReadAt: timestamp,
    updatedAt: timestamp
  };
  if (existing) {
    Object.assign(existing, patch);
    return existing;
  }
  const progress = { id: uid('read'), createdAt: timestamp, ...patch };
  db.history.push(progress);
  return progress;
}

function countUnreadNotifications(db, userId) {
  return db.notifications.filter(item => item.userId === userId && !item.read).length;
}

function getStoryOwnerId(story) {
  return story?.ownerId || story?.authorId || story?.createdBy || story?.userId || null;
}

function canEditStory(user, story) {
  if (!user || !story) return false;
  const role = normalizeRole(user.role);
  if (role === 'admin') return true;
  return canPostStory(role) && getStoryOwnerId(story) === user.id;
}

function canEditChapter(db, user, chapter) {
  if (!user || !chapter) return false;
  const story = db.stories.find(item => item.id === chapter.storyId);
  return canEditStory(user, story);
}

function makeUniqueSlug(db, title, currentStoryId) {
  const base = slugify(title || 'truyen-moi');
  let slug = base;
  let index = 2;
  while (db.stories.some(story => story.slug === slug && story.id !== currentStoryId)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

function normalizeAuthorStoryInput(body, user, existingStory) {
  const categories = normalizeCategories(body.categories ?? body.genres ?? existingStory?.categories ?? existingStory?.genres ?? []);
  const tags = normalizeCategories(body.tags ?? existingStory?.tags ?? []);
  const type = String(body.type ?? existingStory?.type ?? (body.premium ? 'vip' : 'free')).trim();
  const premium = body.premium !== undefined ? Boolean(body.premium) : ['vip', 'mixed'].includes(type);
  const price = parsePositiveNumber(body.price ?? body.chapterPrice ?? existingStory?.price, premium ? 1 : 0);
  const title = String(body.title ?? existingStory?.title ?? '').trim();
  const description = String(body.description ?? body.shortDescription ?? existingStory?.description ?? '').trim();
  const shortDescription = String(body.shortDescription ?? existingStory?.shortDescription ?? description.slice(0, 180)).trim();
  return {
    title,
    author: String(body.author || existingStory?.author || user.name || 'Tac gia').trim(),
    translator: String(body.translator ?? existingStory?.translator ?? '').trim(),
    cover: String(body.cover ?? existingStory?.cover ?? '/images/cover-1.jpg').trim() || '/images/cover-1.jpg',
    coverPath: String(body.coverPath ?? body.cover_path ?? existingStory?.coverPath ?? '').trim(),
    coverPosition: String(body.coverPosition ?? existingStory?.coverPosition ?? '50% 50%').trim(),
    shortDescription,
    description,
    status: String(body.status ?? existingStory?.status ?? 'ongoing').trim(),
    language: String(body.language ?? existingStory?.language ?? 'Tieng Viet').trim(),
    ageRating: String(body.ageRating ?? body.age ?? existingStory?.ageRating ?? 'all').trim(),
    categories,
    tags,
    type,
    premium,
    price,
    vipFromChapter: parsePositiveNumber(body.vipFromChapter ?? existingStory?.vipFromChapter, premium ? 1 : 0),
    chapterPrice: parsePositiveNumber(body.chapterPrice ?? existingStory?.chapterPrice ?? price, price),
    comboPrice: parsePositiveNumber(body.comboPrice ?? existingStory?.comboPrice, 0),
    chapterCountEstimate: parsePositiveNumber(body.chapterCountEstimate ?? body.chapterCount ?? existingStory?.chapterCountEstimate, 0)
  };
}

function validateAuthorStoryPayload(payload, approvalStatus) {
  if (!payload.title) return 'Ten truyen la bat buoc.';
  if (payload.title.length > 180) return 'Ten truyen qua dai.';
  if (payload.author.length > 120) return 'Tac gia qua dai.';
  if (isDataImageValue(payload.cover)) return 'Anh bia phai duoc upload len storage, khong luu base64 trong database.';
  if (payload.cover && !isCoverImageValue(payload.cover)) return 'Anh bia phai la URL/path hop le.';
  if (approvalStatus === 'pending') {
    if (payload.description.length < 20) return 'Mo ta can it nhat 20 ky tu truoc khi gui duyet.';
    if (!payload.categories.length) return 'Vui long chon it nhat mot the loai.';
    if (payload.premium && payload.chapterPrice <= 0) return 'Gia chuong VIP phai lon hon 0.';
  }
  return null;
}

function authorStoryApprovalStatus(body, fallback = 'draft') {
  const requested = String(body.approvalStatus || body.statusApproval || body.mode || '').trim();
  if (requested === 'submit') return 'pending';
  if (requested === 'pending') return 'pending';
  if (requested === 'draft') return 'draft';
  return fallback === 'approved' ? 'pending' : fallback;
}

function normalizeAuthorChapterStatus(value, fallback = 'draft') {
  const requested = String(value || fallback || 'draft').trim();
  if (requested === 'submit' || requested === 'publish' || requested === 'published') return 'approved';
  if (requested === 'approved') return 'approved';
  if (AUTHOR_CHAPTER_STATUSES.includes(requested)) return requested;
  return fallback === 'approved' || fallback === 'published' ? 'approved' : fallback;
}

function refreshStoryChapterMetadata(db, story, { touch = true } = {}) {
  if (!story) return;
  const publicChapters = db.chapters
    .filter(chapter => chapter.storyId === story.id && isPublicChapter(chapter))
    .sort((a, b) => a.number - b.number);
  story.chapterCount = publicChapters.length;
  story.latestChapter = publicChapters.at(-1)
    ? {
        id: publicChapters.at(-1).id,
        number: publicChapters.at(-1).number,
        title: publicChapters.at(-1).title,
        updatedAt: publicChapters.at(-1).updatedAt || publicChapters.at(-1).createdAt
      }
    : null;
  if (touch) story.updatedAt = now();
}

function revenueAmountFromPurchase(purchase) {
  return Number(purchase.price ?? Math.abs(Number(purchase.amount || 0)) ?? 0);
}

function authorRevenueData(db, ownerId) {
  const ownedStories = db.stories.filter(story => getStoryOwnerId(story) === ownerId);
  const ownedStoryIds = new Set(ownedStories.map(story => story.id));
  const ownedChapterIds = new Set(db.chapters.filter(chapter => ownedStoryIds.has(chapter.storyId)).map(chapter => chapter.id));
  const purchases = db.purchases
    .filter(purchase => ownedStoryIds.has(purchase.storyId) || ownedChapterIds.has(purchase.chapterId))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const transactions = db.transactions
    .filter(transaction => {
      if (transaction.type !== 'purchase') return false;
      return ownedStoryIds.has(transaction.storyId) || ownedChapterIds.has(transaction.chapterId);
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const storyMap = new Map(ownedStories.map(story => [story.id, story]));
  const chapterMap = new Map(db.chapters.filter(chapter => ownedStoryIds.has(chapter.storyId)).map(chapter => [chapter.id, chapter]));
  const storyRevenueMap = new Map();
  const chapterRevenueMap = new Map();
  const rowsByDay = new Map();

  purchases.forEach(purchase => {
    const chapter = purchase.chapterId ? chapterMap.get(purchase.chapterId) : null;
    const storyId = purchase.storyId || chapter?.storyId;
    if (!storyId || !ownedStoryIds.has(storyId)) return;
    const amount = revenueAmountFromPurchase(purchase);
    storyRevenueMap.set(storyId, Number(storyRevenueMap.get(storyId) || 0) + amount);
    if (chapter) chapterRevenueMap.set(chapter.id, Number(chapterRevenueMap.get(chapter.id) || 0) + amount);
    const key = new Date(purchase.createdAt || now()).toISOString().slice(0, 10);
    const row = rowsByDay.get(key) || { label: key.slice(5), revenue: 0, reads: 0 };
    row.revenue += amount;
    row.reads += 1;
    rowsByDay.set(key, row);
  });

  const totalRevenue = purchases.reduce((sum, purchase) => sum + revenueAmountFromPurchase(purchase), 0);
  const paidOut = db.transactions
    .filter(transaction => transaction.userId === ownerId && ['withdrawal', 'author_payout'].includes(transaction.type))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return {
    totalRevenue,
    pendingWithdrawal: Math.max(0, totalRevenue - paidOut),
    byStory: ownedStories.map(story => ({
      storyId: story.id,
      storyTitle: story.title,
      revenue: Number(storyRevenueMap.get(story.id) || 0),
      purchases: purchases.filter(purchase => (purchase.storyId || chapterMap.get(purchase.chapterId)?.storyId) === story.id).length
    })).sort((a, b) => b.revenue - a.revenue),
    bestChapters: Array.from(chapterRevenueMap.entries())
      .map(([chapterId, revenue]) => {
        const chapter = chapterMap.get(chapterId);
        const story = storyMap.get(chapter?.storyId);
        return {
          chapterId,
          storyId: story?.id,
          storyTitle: story?.title || '',
          title: chapter?.title || '',
          number: chapter?.number || 0,
          revenue,
          views: Number(chapter?.views || 0)
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    transactions: purchases.map(purchase => {
      const chapter = purchase.chapterId ? chapterMap.get(purchase.chapterId) : null;
      const story = storyMap.get(purchase.storyId || chapter?.storyId);
      const transaction = transactions.find(item => item.chapterId === purchase.chapterId && item.storyId === (purchase.storyId || story?.id) && Math.abs(Number(item.amount || 0)) === revenueAmountFromPurchase(purchase));
      return {
        id: purchase.id,
        transactionId: transaction?.id || null,
        buyerId: purchase.userId,
        storyId: story?.id,
        storyTitle: story?.title || '',
        chapterId: chapter?.id || null,
        chapterTitle: chapter?.title || (purchase.combo ? 'Combo tron bo' : ''),
        amount: revenueAmountFromPurchase(purchase),
        status: transaction?.status || 'success',
        createdAt: purchase.createdAt
      };
    }),
    chart: Array.from(rowsByDay.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-7)
  };
}

function authorStorySummary(db, story, viewerId) {
  const allChapters = db.chapters.filter(chapter => chapter.storyId === story.id);
  const publicChapters = allChapters.filter(isPublicChapter);
  const revenue = authorRevenueData(db, getStoryOwnerId(story)).byStory.find(item => item.storyId === story.id)?.revenue || 0;
  return {
    ...storySummary(enrichStory(db, story, viewerId, true)),
    genres: story.categories || [],
    shortDescription: story.shortDescription || String(story.description || '').slice(0, 180),
    publishStatus: story.hidden ? 'hidden' : isPublicStory(story) ? 'published' : story.approvalStatus || 'draft',
    type: story.type || (story.premium ? 'vip' : 'free'),
    chapterPrice: story.chapterPrice ?? story.price ?? 0,
    vipFromChapter: story.vipFromChapter ?? (story.premium ? 1 : 0),
    comboPrice: story.comboPrice ?? 0,
    chapters: allChapters.length,
    approvedChapters: publicChapters.length,
    revenue,
    comments: db.comments.filter(comment => comment.storyId === story.id).length,
    rejectionReason: story.rejectionReason || ''
  };
}

function authorChapterSummary(db, chapter) {
  const story = db.stories.find(item => item.id === chapter.storyId);
  const purchases = db.purchases.filter(purchase => purchase.chapterId === chapter.id);
  const revenue = purchases.reduce((sum, purchase) => sum + revenueAmountFromPurchase(purchase), 0);
  return {
    ...chapter,
    status: chapterStatus(chapter),
    access: chapter.isPremium ? 'vip' : 'free',
    words: wordCount(chapter.content),
    comments: db.comments.filter(comment => comment.chapterId === chapter.id).length,
    revenue,
    storyTitle: story?.title || '',
    rejectionReason: chapter.rejectionReason || ''
  };
}

function promotionResponse(db, promotion) {
  const story = db.stories.find(item => item.id === promotion.storyId);
  const pkg = PROMOTION_PACKAGES.find(item => item.id === promotion.packageId);
  return {
    ...promotion,
    packageName: promotion.packageName || pkg?.title || promotion.packageId,
    storyTitle: story?.title || '',
    cost: Number(promotion.cost || pkg?.price || 0)
  };
}

function storyLink(story, chapter) {
  if (!story?.slug) return '';
  if (chapter?.number) return `/truyen/${story.slug}/chuong/${chapter.number}`;
  return `/truyen/${story.slug}`;
}

function notifyChapterPublished(db, story, chapter, actorId) {
  if (!story || !chapter || !isPublicStory(story) || !isPublicChapter(chapter) || chapter.notifiedAt) return;
  const followers = db.follows
    .filter(follow => follow.storyId === story.id)
    .map(follow => follow.userId)
    .filter((userId, index, list) => userId && userId !== actorId && list.indexOf(userId) === index);
  followers.forEach(userId => {
    createNotification(db, userId, {
      type: 'chapter',
      title: 'Có chương mới',
      body: `${story.title} vừa đăng chương ${chapter.number}: ${chapter.title}.`,
      link: storyLink(story, chapter),
      actorId,
      storyId: story.id,
      chapterId: chapter.id
    });
  });
  chapter.notifiedAt = now();
}

async function handle(req, res) {
  res.req = req;
  if (req.method === 'OPTIONS') return send(res, 204);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (!checkRateLimit(req, pathname)) {
      return send(res, 429, { message: 'Qua nhieu request. Vui long thu lai sau.' });
    }

    if (req.method === 'GET' && pathname === '/') {
      return send(res, 200, {
        name: 'Äáº­u Äá» Truyá»‡n API',
        status: 'ok',
        message: 'Backend Ä‘ang hoáº¡t Ä‘á»™ng',
      });
    }

    if (req.method === 'GET' && pathname === '/healthz') {
      return send(res, 200, {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      try {
        await dataStore.health();
        return send(res, 200, {
          ok: true,
          service: 'daudotruyen-api',
          database: 'connected'
        });
      } catch (error) {
        console.error('[DB_HEALTH_ERROR]', error);
        return send(res, 503, {
          ok: false,
          service: 'daudotruyen-api',
          database: 'disconnected',
          error: error.message
        });
      }
    }

    if (req.method === 'GET' && pathname === '/api/health-db') {
      try {
        return send(res, 200, await dataStore.health());
      } catch (error) {
        return send(res, 503, {
          ok: false,
          message: error.message
        });
      }
    }

    const runDbRequest = async () => {
    const requestPerf = createPerf(perfLabel(req.method, pathname));
    const db = ensureDbShape(await dataStore.loadDb());
    requestPerf.mark('loadDb');
    const viewer = getAuthUser(req, db);

    if (req.method === 'POST' && pathname === '/api/uploads/cover') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      requestPerf.mark('auth');
      const upload = await parseMultipartRequest(req);
      const file = upload.files.find(item => item.fieldname === 'file') || upload.files[0];
      const validationError = validateUploadedImage(file);
      if (validationError) return badRequest(res, validationError);
      requestPerf.mark('validate');
      const storyId = String(upload.fields.storyId || upload.fields.story_id || 'draft').trim();
      const uploaded = await storage.uploadCoverImage(file, { storyId, userId: user.id });
      requestPerf.mark('upload');
      requestPerf.log();
      return send(res, 201, {
        path: uploaded.path,
        url: uploaded.url,
        cover: uploaded.url,
        size: file.data.length,
        mimeType: file.mimeType
      });
    }

    if (req.method === 'GET' && pathname === '/api/supabase/stories') {
      return send(res, 200, db.stories.slice().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)));
    }
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseBody(req);
      const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = db.users.find(item => item.email.toLowerCase() === identifier || String(item.username || '').toLowerCase() === identifier);
      if (!user) return badRequest(res, 'Tên đăng nhập/Gmail hoặc mật khẩu không đúng.');
      if (user.status === 'deactivated' || user.status === 'locked') return forbidden(res);
      const check = hashPassword(password, user.salt);
      if (check.passwordHash !== user.passwordHash) return badRequest(res, 'Tên đăng nhập/Gmail hoặc mật khẩu không đúng.');
      return send(res, 200, { token: createToken(user), user: safeUser(user) });
    }

    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const username = String(body.username || '').trim().toLowerCase();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!name || !username || !email || !password) return badRequest(res, 'Vui lòng nhập đủ họ tên, tên đăng nhập, Gmail và mật khẩu.');
      if (name.length < 2) return badRequest(res, 'Tên hiển thị cần ít nhất 2 ký tự.');
      if (name.length > 80) return badRequest(res, 'Họ tên quá dài.');
      if (!USERNAME_PATTERN.test(username)) return badRequest(res, 'Tên đăng nhập không hợp lệ.');
      if (!isGmail(email)) return badRequest(res, 'Gmail không hợp lệ.');
      if (password.length < 6) return badRequest(res, 'Mật khẩu cần ít nhất 6 ký tự.');
      if (db.users.some(user => String(user.username || '').toLowerCase() === username)) return badRequest(res, 'Tên đăng nhập đã tồn tại.');
      if (db.users.some(user => user.email.toLowerCase() === email)) return badRequest(res, 'Gmail đã tồn tại.');
      const hashed = hashPassword(password);
      const user = {
        id: uid('user'),
        name,
        username,
        email,
        role: 'user',
        seeds: 30,
        avatar: '',
        cover: '',
        socialLinks: {},
        preferences: defaultAccountPreferences(),
        notificationPreferences: defaultNotificationPreferences(),
        tokenVersion: 0,
        createdAt: now(),
        salt: hashed.salt,
        passwordHash: hashed.passwordHash
      };
      db.users.push(user);
      db.transactions.push({ id: uid('txn'), userId: user.id, type: 'bonus', amount: 30, note: 'Thưởng đăng ký tài khoản mới', createdAt: now() });
      createNotification(db, user.id, {
        type: 'system',
        title: 'Chào mừng đến Đậu Đỏ Truyện',
        body: 'Bạn đã nhận 30 Đậu thưởng đăng ký để bắt đầu đọc truyện trả phí.',
        link: '/wallet'
      });
      await persistDb(db);
      return send(res, 201, { token: createToken(user), user: safeUser(user) });
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const user = requireUser(req, res, db);
      if (!user) return;
      return send(res, 200, { user: safeUser(user) }, privateCacheHeaders());
    }

    if (req.method === 'GET' && pathname === '/api/me/profile') {
      const user = requireUser(req, res, db);
      if (!user) return;
      return send(res, 200, { profile: profileResponse(user), user: safeUser(user) });
    }

    if (req.method === 'POST' && pathname === '/api/me/avatar') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const upload = await parseMultipartRequest(req);
      const file = upload.files.find(item => item.fieldname === 'avatar');
      const validationError = validateAvatarImage(file);
      if (validationError) return badRequest(res, validationError);
      const uploaded = await storage.uploadAvatarImage(file, { userId: user.id });
      const previousAvatar = user.avatar;
      user.avatar = uploaded.url;
      user.updatedAt = now();
      await persistDb(db);
      if (previousAvatar && previousAvatar !== uploaded.url) {
        storage.deleteImageByUrl(previousAvatar).catch(error => console.warn(`Could not delete old avatar: ${error.message}`));
      }
      return send(res, 201, {
        avatar: uploaded.url,
        profile: profileResponse(user),
        user: safeUser(user),
        size: file.data.length,
        mimeType: file.mimeType
      });
    }

    if (req.method === 'DELETE' && pathname === '/api/me/avatar') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const previousAvatar = user.avatar;
      user.avatar = '';
      user.updatedAt = now();
      await persistDb(db);
      if (previousAvatar) {
        storage.deleteImageByUrl(previousAvatar).catch(error => console.warn(`Could not delete avatar: ${error.message}`));
      }
      return send(res, 200, { avatar: '', profile: profileResponse(user), user: safeUser(user) });
    }

    if (req.method === 'PATCH' && pathname === '/api/me/profile') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const result = validateProfilePayload(body, user, db);
      if (result.error) return badRequest(res, result.error);
      Object.assign(user, result.value, { updatedAt: now() });
      await persistDb(db);
      return send(res, 200, { profile: profileResponse(user), user: safeUser(user) });
    }

    if (req.method === 'GET' && pathname === '/api/me/preferences') {
      const user = requireUser(req, res, db);
      if (!user) return;
      user.notificationPreferences = normalizeNotificationPreferences(user.notificationPreferences || user.preferences);
      user.preferences = normalizeAccountPreferences(user.preferences, user.notificationPreferences);
      await persistDb(db);
      return send(res, 200, { preferences: user.preferences, user: safeUser(user) });
    }

    if (req.method === 'PATCH' && pathname === '/api/me/preferences') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      user.notificationPreferences = normalizeNotificationPreferences(user.notificationPreferences || user.preferences);
      const result = applyPreferencePatch(user, body);
      if (result.error) return badRequest(res, result.error);
      await persistDb(db);
      return send(res, 200, { preferences: result.preferences, user: safeUser(user) });
    }

    if (req.method === 'POST' && pathname === '/api/me/password') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const currentPassword = String(body.currentPassword ?? body.current ?? '');
      const newPassword = String(body.newPassword ?? body.next ?? '');
      const confirmPassword = String(body.confirmPassword ?? body.confirm ?? '');
      if (!currentPassword || !newPassword || !confirmPassword) return badRequest(res, 'Vui lòng nhập đủ mật khẩu hiện tại, mật khẩu mới và xác nhận.');
      if (!passwordMatches(user, currentPassword)) return badRequest(res, 'Mật khẩu hiện tại không đúng.');
      const policyError = passwordPolicyError(newPassword);
      if (policyError) return badRequest(res, policyError);
      if (newPassword !== confirmPassword) return badRequest(res, 'Xác nhận mật khẩu chưa khớp.');
      if (passwordMatches(user, newPassword)) return badRequest(res, 'Mật khẩu mới không được trùng mật khẩu cũ.');
      const hashed = hashPassword(newPassword);
      user.salt = hashed.salt;
      user.passwordHash = hashed.passwordHash;
      user.updatedAt = now();
      createNotification(db, user.id, {
        type: 'security',
        title: 'Mật khẩu đã được thay đổi',
        body: 'Mật khẩu tài khoản của bạn vừa được cập nhật.',
        link: '/settings#security'
      });
      await persistDb(db);
      return send(res, 200, { ok: true, message: 'Đã đổi mật khẩu.' });
    }

    if (req.method === 'POST' && pathname === '/api/me/logout-all') {
      const user = requireUser(req, res, db);
      if (!user) return;
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      user.sessionsRevokedAt = now();
      user.updatedAt = now();
      await persistDb(db);
      return send(res, 200, { ok: true, message: 'Đã đăng xuất khỏi các thiết bị khác.' });
    }

    if (req.method === 'POST' && pathname === '/api/me/deactivate') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const password = String(body.password || '');
      if (!password) return badRequest(res, 'Vui lòng nhập mật khẩu để xác nhận.');
      if (!passwordMatches(user, password)) return badRequest(res, 'Mật khẩu xác nhận không đúng.');
      user.status = 'deactivated';
      user.deactivatedAt = now();
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      user.updatedAt = now();
      await persistDb(db);
      return send(res, 200, { ok: true, message: 'Tài khoản đã được vô hiệu hóa.' });
    }

    if (req.method === 'GET' && pathname === '/api/me/notification-preferences') {
      const user = requireUser(req, res, db);
      if (!user) return;
      user.notificationPreferences = normalizeNotificationPreferences(user.notificationPreferences);
      user.preferences = normalizeAccountPreferences(user.preferences, user.notificationPreferences);
      await persistDb(db);
      return send(res, 200, { preferences: user.notificationPreferences });
    }

    if (req.method === 'PATCH' && pathname === '/api/me/notification-preferences') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const unknown = Object.keys(body).filter(key => !NOTIFICATION_PREFERENCE_KEYS.includes(key));
      if (unknown.length) return badRequest(res, `Cài đặt thông báo không hợp lệ: ${unknown.join(', ')}.`);
      user.notificationPreferences = normalizeNotificationPreferences({ ...user.notificationPreferences });
      Object.entries(body).forEach(([key, value]) => {
        user.notificationPreferences[key] = Boolean(value);
      });
      user.preferences = normalizeAccountPreferences({ ...user.preferences, ...user.notificationPreferences, updatedAt: now() }, user.notificationPreferences);
      await persistDb(db);
      return send(res, 200, { preferences: user.notificationPreferences, user: safeUser(user) });
    }

    if (req.method === 'GET' && pathname === '/api/categories') {
      const limit = clampNumber(url.searchParams.get('limit'), 1, 100, 100);
      const categories = Array.from(new Set(db.stories.filter(isPublicStory).flatMap(story => story.categories))).sort().slice(0, limit);
      return send(res, 200, { categories }, publicCacheHeaders());
    }

    if (req.method === 'GET' && pathname === '/api/home') {
      const updatedStories = queryPublicStories(db, null, { sort: 'updated', limit: 20 });
      const popularStories = queryPublicStories(db, null, { sort: 'views', limit: 20 });
      const completedStories = queryPublicStories(db, null, { status: 'completed', sort: 'updated', limit: 20 });
      const featuredStories = queryPublicStories(db, null, { featured: true, sort: 'rating', limit: 20 });
      const recommendedStories = queryPublicStories(db, null, { recommended: true, sort: 'updated', limit: 20 });
      const banners = queryPublicStories(db, null, { banner: true, sort: 'updated', limit: 10 });
      const categories = Array.from(new Set(db.stories.filter(isPublicStory).flatMap(story => story.categories))).sort().slice(0, 30);
      return send(res, 200, {
        banners: banners.map(storySummary),
        updatedStories: updatedStories.map(storySummary),
        popularStories: popularStories.map(storySummary),
        completedStories: completedStories.map(storySummary),
        featuredStories: featuredStories.map(storySummary),
        recommendedStories: recommendedStories.map(storySummary),
        categories
      }, publicCacheHeaders());
    }

    if (req.method === 'POST' && pathname === '/api/newsletter') {
      const body = await parseBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      if (!isEmail(email)) return badRequest(res, 'Email không hợp lệ.');

      const existing = db.newsletters.find(item => item.email.toLowerCase() === email);
      if (existing) {
        existing.active = true;
        existing.updatedAt = now();
        existing.source = String(body.source || existing.source || 'footer').slice(0, 80);
        await persistDb(db);
        return send(res, 200, { ok: true, subscribed: true, message: 'Email này đã có trong danh sách nhận thông báo.' });
      }

      const subscription = {
        id: uid('nl'),
        email,
        source: String(body.source || 'footer').slice(0, 80),
        active: true,
        createdAt: now(),
        updatedAt: now()
      };
      db.newsletters.unshift(subscription);
      await persistDb(db);
      return send(res, 201, { ok: true, subscribed: true, message: 'Đăng ký nhận thông báo thành công.' });
    }

    if (req.method === 'GET' && pathname === '/api/stories') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const category = url.searchParams.get('category') || '';
      const status = url.searchParams.get('status') || '';
      const premium = url.searchParams.get('premium') || '';
      const ageRating = url.searchParams.get('ageRating') || '';
      const sort = url.searchParams.get('sort') || 'updated';
      const featured = url.searchParams.get('featured') === 'true';
      const hot = url.searchParams.get('hot') === 'true' || url.searchParams.get('isHot') === 'true';
      const recommended = url.searchParams.get('recommended') === 'true' || url.searchParams.get('isRecommended') === 'true';
      const banner = url.searchParams.get('banner') === 'true' || url.searchParams.get('isBanner') === 'true';
      const limit = clampNumber(url.searchParams.get('limit'), 1, 100, 100);
      const items = queryPublicStories(db, viewer && viewer.id, { q, category, status, premium, ageRating, sort, featured, hot, recommended, banner, limit });
      const storyListCacheHeaders = viewer || sort === 'created' || sort === 'new' ? privateCacheHeaders() : publicCacheHeaders();
      return send(res, 200, { stories: items.map(storySummary) }, storyListCacheHeaders);
    }

    if (req.method === 'GET' && pathname === '/api/rankings') {
      const period = url.searchParams.get('period') || 'week';
      const metric = url.searchParams.get('metric') || 'views';
      const limit = url.searchParams.get('limit') || 100;
      const stories = buildRankings(db, { period, metric, limit });
      return send(res, 200, { stories });
    }

    const storyParams = match(pathname, '/api/stories/:slug');
    if (req.method === 'GET' && storyParams) {
      const story = db.stories.find(item => item.slug === storyParams.slug || item.id === storyParams.slug);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && (!viewer || viewer.role !== 'admin')) return notFound(res);
      story.views += 1;
      db.viewEvents.push({ id: uid('view'), storyId: story.id, userId: viewer?.id || null, createdAt: now() });
      await persistDb(db);
      const enriched = enrichStory(db, story, viewer && viewer.id, viewer?.role === 'admin');
      const chapters = db.chapters
        .filter(chapter => chapter.storyId === story.id)
        .filter(chapter => viewer?.role === 'admin' || isPublicChapter(chapter))
        .sort((a, b) => a.number - b.number);
      const comments = publicCommentsForStory(db, story.id);
      return send(res, 200, { story: enriched, chapters, comments }, viewer?.role === 'admin' || viewer ? privateCacheHeaders() : publicCacheHeaders());
    }

    const chapterParams = match(pathname, '/api/stories/:slug/chapters/:number');
    if (req.method === 'GET' && chapterParams) {
      const story = db.stories.find(item => item.slug === chapterParams.slug || item.id === chapterParams.slug);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && (!viewer || viewer.role !== 'admin')) return notFound(res);
      const chapter = db.chapters.find(item => item.storyId === story.id && item.number === Number(chapterParams.number));
      if (!chapter) return notFound(res);
      if (!isPublicChapter(chapter) && viewer?.role !== 'admin') return notFound(res);
      const unlocked = !chapter.isPremium || (viewer && db.purchases.some(item => item.userId === viewer.id && (item.chapterId === chapter.id || (item.storyId === story.id && item.combo))));
      const payloadChapter = unlocked ? publicReaderChapter(chapter) : { ...chapter, content: chapter.preview || 'Chương trả phí. Vui lòng mở khóa để đọc đầy đủ.' };
      chapter.views += 1;
      story.views += 1;
      db.viewEvents.push({ id: uid('view'), storyId: story.id, chapterId: chapter.id, userId: viewer?.id || null, createdAt: now() });
      if (viewer) {
        upsertReadingProgress(db, { userId: viewer.id, storyId: story.id, chapterId: chapter.id, chapterNumber: chapter.number });
      }
      await persistDb(db);
      return send(
        res,
        200,
        { story: enrichStory(db, story, viewer && viewer.id, viewer?.role === 'admin'), chapter: payloadChapter, unlocked },
        viewer?.role === 'admin' || viewer ? privateCacheHeaders() : publicCacheHeaders()
      );
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
      await persistDb(db);
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
        const ownerId = getStoryOwnerId(story);
        if (ownerId && ownerId !== user.id) {
          createNotification(db, ownerId, {
            type: 'follow',
            title: 'Có người theo dõi truyện',
            body: `${user.name} vừa theo dõi ${story.title}.`,
            link: storyLink(story),
            actorId: user.id,
            storyId: story.id
          });
        }
      } else {
        db.follows.splice(index, 1);
        story.follows = Math.max(0, story.follows - 1);
      }
      await persistDb(db);
      return send(res, 200, { followed, follows: story.follows });
    }

    const commentsParams = match(pathname, '/api/stories/:id/comments');
    if (commentsParams && req.method === 'GET') {
      const story = db.stories.find(item => item.id === commentsParams.id || item.slug === commentsParams.id);
      if (!story) return notFound(res);
      if (!isPublicStory(story) && (!viewer || viewer.role !== 'admin')) return notFound(res);
      const comments = publicCommentsForStory(db, story.id);
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
      const parent = body.parentId ? db.comments.find(item => item.id === body.parentId && item.storyId === story.id) : null;
      const comment = {
        id: uid('cmt'),
        storyId: story.id,
        chapterId: body.chapterId ? String(body.chapterId) : null,
        parentId: parent?.id || null,
        userId: user.id,
        body: text,
        createdAt: now()
      };
      db.comments.unshift(comment);
      const ownerId = getStoryOwnerId(story);
      const recipients = new Set();
      if (parent?.userId && parent.userId !== user.id) recipients.add(parent.userId);
      if (ownerId && ownerId !== user.id) recipients.add(ownerId);
      recipients.forEach(recipientId => {
        const isReplyRecipient = parent?.userId === recipientId;
        createNotification(db, recipientId, {
          type: isReplyRecipient ? 'reply' : 'comment',
          title: isReplyRecipient ? 'Có phản hồi bình luận' : 'Có bình luận mới',
          body: `${user.name} vừa ${isReplyRecipient ? 'trả lời bình luận' : 'bình luận'} trong ${story.title}.`,
          link: storyLink(story),
          actorId: user.id,
          storyId: story.id,
          chapterId: comment.chapterId
        });
      });
      await persistDb(db);
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
      await persistDb(db);
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
      await persistDb(db);
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
      const publicChapters = db.chapters.filter(chapter => chapter.storyId === story.id && isPublicChapter(chapter));
      const premiumChapters = publicChapters.filter(chapter => chapter.isPremium);
      const price = Math.max(1, Math.max(49, (story.price || 1) * publicChapters.length));
      if (premiumChapters.length === 0) return send(res, 200, { unlocked: true, user: safeUser(user), price: 0 });
      if (user.seeds < price) return badRequest(res, 'Số dư Đậu không đủ để mua combo.');
      if (dataStore.storeName() === 'supabase') {
        try {
          const unlocked = await dataStore.unlockCombo({
            userId: user.id,
            storyId: story.id,
            purchaseId: uid('pur'),
            transactionId: uid('txn'),
            notificationId: uid('noti')
          });
          const comboPrice = Number(unlocked.result?.price || price);
          return send(res, 200, { unlocked: true, user: safeUser(unlocked.user), price: comboPrice });
        } catch (error) {
          return badRequest(res, error.message);
        }
      }
      const balanceBefore = Number(user.seeds || 0);
      user.seeds = balanceBefore - price;
      db.purchases.push({ id: uid('pur'), userId: user.id, storyId: story.id, chapterId: null, combo: true, price, createdAt: now() });
      db.transactions.push({ id: uid('txn'), userId: user.id, storyId: story.id, chapterId: null, price, type: 'purchase', amount: -price, balanceBefore, balanceAfter: user.seeds, refType: 'combo', refId: story.id, note: `Mua combo ${story.title}`, createdAt: now() });
      createNotification(db, user.id, {
        type: 'purchase',
        title: 'Đã mở khóa combo',
        body: `Bạn đã mở khóa toàn bộ chương VIP hiện tại của ${story.title}.`,
        link: storyLink(story),
        storyId: story.id
      });
      await persistDb(db);
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

    if (req.method === 'POST' && pathname === '/api/reading-progress') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const story = db.stories.find(item => item.id === body.storyId || item.slug === body.storyId);
      if (!story) return notFound(res);
      const chapter = db.chapters.find(item => item.id === body.chapterId || (item.storyId === story.id && item.number === Number(body.chapterNumber)));
      if (!chapter) return notFound(res);
      const progressPercent = body.progressPercent === undefined ? null : clampNumber(body.progressPercent, 0, 100, null);
      const lastPosition = body.lastPosition === undefined ? null : Math.max(0, Number(body.lastPosition) || 0);
      const progress = upsertReadingProgress(db, {
        userId: user.id,
        storyId: story.id,
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        progressPercent,
        lastPosition
      });
      await persistDb(db);
      return send(res, 200, { progress });
    }

    if (req.method === 'GET' && pathname === '/api/wallet/packages') {
      return send(res, 200, { packages: [
        { id: 'seed-10', seeds: 10, bonus: 0, price: 10000, label: 'Khởi đầu' },
        { id: 'seed-20', seeds: 20, bonus: 2, price: 20000, label: 'Cơ bản' },
        { id: 'seed-50', seeds: 50, bonus: 8, price: 50000, label: 'Phổ biến' },
        { id: 'seed-100', seeds: 100, bonus: 20, price: 100000, label: 'Tiết kiệm' },
        { id: 'seed-200', seeds: 200, bonus: 50, price: 200000, label: 'Giá trị nhất' },
        { id: 'seed-500', seeds: 500, bonus: 150, price: 500000, label: 'Cao cấp' }
      ]}, privateCacheHeaders());
    }

    if (req.method === 'GET' && pathname === '/api/notifications/unread-count') {
      const user = requireUser(req, res, db);
      if (!user) return;
      return send(res, 200, { count: countUnreadNotifications(db, user.id) }, privateCacheHeaders());
    }

    if (req.method === 'GET' && pathname === '/api/notifications') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const limit = Math.min(50, Math.max(1, parsePositiveNumber(url.searchParams.get('limit'), 20)));
      const cursor = url.searchParams.get('cursor') || '';
      const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
      const type = String(url.searchParams.get('type') || '').trim();
      let notifications = db.notifications
        .filter(item => item.userId === user.id)
        .filter(item => !unreadOnly || !item.read)
        .filter(item => !type || item.type === type)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (cursor) {
        const cursorIndex = notifications.findIndex(item => item.id === cursor);
        if (cursorIndex >= 0) notifications = notifications.slice(cursorIndex + 1);
        else notifications = notifications.filter(item => new Date(item.createdAt) < new Date(cursor));
      }
      const page = notifications.slice(0, limit);
      return send(res, 200, {
        notifications: page.map(notificationResponse),
        nextCursor: notifications.length > limit ? page.at(-1)?.id || null : null,
        unreadCount: countUnreadNotifications(db, user.id)
      }, privateCacheHeaders());
    }

    const notificationReadParams = match(pathname, '/api/notifications/:id/read');
    if (notificationReadParams && req.method === 'POST') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const notification = db.notifications.find(item => item.id === notificationReadParams.id && item.userId === user.id);
      if (!notification) return notFound(res);
      notification.read = true;
      await persistDb(db);
      return send(res, 200, { notification: notificationResponse(notification), unreadCount: countUnreadNotifications(db, user.id) });
    }

    if (req.method === 'POST' && pathname === '/api/notifications/read-all') {
      const user = requireUser(req, res, db);
      if (!user) return;
      db.notifications.forEach(item => {
        if (item.userId === user.id) item.read = true;
      });
      await persistDb(db);
      return send(res, 200, { ok: true, unreadCount: 0 });
    }

    const notificationParams = match(pathname, '/api/notifications/:id');
    if (notificationParams && req.method === 'DELETE') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const index = db.notifications.findIndex(item => item.id === notificationParams.id && item.userId === user.id);
      if (index === -1) return notFound(res);
      db.notifications.splice(index, 1);
      await persistDb(db);
      return send(res, 200, { ok: true, unreadCount: countUnreadNotifications(db, user.id) });
    }

    if (req.method === 'GET' && pathname === '/api/wallet/transactions') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const transactions = db.transactions.filter(item => item.userId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return send(res, 200, { balance: user.seeds, transactions }, privateCacheHeaders());
    }

    if (req.method === 'POST' && pathname === '/api/wallet/topup') {
      const user = requireUser(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const packs = {
        'seed-10': 10,
        'seed-20': 22,
        'seed-50': 58,
        'seed-100': 120,
        'seed-200': 250,
        'seed-500': 650
      };
      const seeds = packs[body.packageId];
      if (!seeds) return badRequest(res, 'Gói nạp không hợp lệ.');
      if (dataStore.storeName() === 'supabase') {
        const note = `Nap ${seeds} Dau`;
        try {
          const updatedUser = await dataStore.topupWallet({
            userId: user.id,
            amount: seeds,
            transactionId: uid('txn'),
            note,
            notificationId: uid('noti'),
            notificationTitle: 'Nap Dau thanh cong',
            notificationMessage: `Tai khoan cua ban vua duoc cong ${seeds} Dau.`
          });
          return send(res, 200, { user: safeUser(updatedUser), balance: updatedUser.seeds });
        } catch (error) {
          return badRequest(res, error.message);
        }
      }
      const idempotencyKey = String(body.idempotencyKey || body.providerOrderId || `${user.id}:${body.packageId}:mock`).slice(0, 160);
      let order = db.paymentOrders.find(item => item.idempotencyKey === idempotencyKey);
      if (order?.status === 'paid') return send(res, 200, { user: safeUser(user), balance: user.seeds, order });
      order ||= { id: uid('pay'), userId: user.id, provider: 'mock', providerOrderId: idempotencyKey, amountVnd: 0, coins: seeds, status: 'pending', idempotencyKey, createdAt: now(), metadata: { packageId: body.packageId } };
      order.status = 'paid';
      order.paidAt = order.paidAt || now();
      if (!db.paymentOrders.includes(order)) db.paymentOrders.push(order);
      const balanceBefore = Number(user.seeds || 0);
      user.seeds = balanceBefore + seeds;
      db.transactions.push({ id: uid('txn'), userId: user.id, type: 'topup', amount: seeds, balanceBefore, balanceAfter: user.seeds, refType: 'payment_order', refId: order.id, note: `Nạp ${seeds} Đậu`, createdAt: now() });
      createNotification(db, user.id, {
        type: 'wallet',
        title: 'Nạp Đậu thành công',
        body: `Tài khoản của bạn vừa được cộng ${seeds} Đậu.`,
        link: '/wallet'
      });
      await persistDb(db);
      return send(res, 200, { user: safeUser(user), balance: user.seeds, order });
    }

    if (req.method === 'POST' && pathname === '/api/payments/webhook') {
      const body = await parseBody(req);
      const provider = String(body.provider || 'mock').slice(0, 40);
      const providerOrderId = String(body.providerOrderId || body.provider_order_id || '').trim();
      if (!providerOrderId) return badRequest(res, 'providerOrderId is required.');
      const order = db.paymentOrders.find(item => item.provider === provider && item.providerOrderId === providerOrderId);
      if (!order) return notFound(res);
      if (order.status === 'paid') return send(res, 200, { ok: true, order });
      if (String(body.status || '') !== 'paid') {
        order.status = ['failed', 'expired', 'refunded'].includes(body.status) ? body.status : 'failed';
        await persistDb(db);
        return send(res, 200, { ok: true, order });
      }
      const user = db.users.find(item => item.id === order.userId);
      if (!user) return notFound(res);
      const balanceBefore = Number(user.seeds || 0);
      user.seeds = balanceBefore + Number(order.coins || 0);
      user.updatedAt = now();
      order.status = 'paid';
      order.paidAt = now();
      db.transactions.push({ id: uid('txn'), userId: user.id, type: 'topup', amount: Number(order.coins || 0), balanceBefore, balanceAfter: user.seeds, refType: 'payment_order', refId: order.id, note: `Payment ${providerOrderId}`, createdAt: now() });
      await persistDb(db);
      return send(res, 200, { ok: true, order });
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
      if (dataStore.storeName() === 'supabase') {
        try {
          const unlocked = await dataStore.unlockChapter({
            userId: user.id,
            chapterId: chapter.id,
            purchaseId: uid('pur'),
            transactionId: uid('txn'),
            notificationId: uid('noti')
          });
          return send(res, 200, { unlocked: true, user: safeUser(unlocked.user) });
        } catch (error) {
          return badRequest(res, error.message);
        }
      }
      const balanceBefore = Number(user.seeds || 0);
      user.seeds = balanceBefore - chapter.price;
      db.purchases.push({ id: uid('pur'), userId: user.id, storyId: chapter.storyId, chapterId: chapter.id, price: chapter.price, createdAt: now() });
      db.transactions.push({ id: uid('txn'), userId: user.id, storyId: chapter.storyId, chapterId: chapter.id, price: chapter.price, type: 'purchase', amount: -chapter.price, balanceBefore, balanceAfter: user.seeds, refType: 'chapter_purchase', refId: chapter.id, note: `Mở khóa ${chapter.title}`, createdAt: now() });
      const story = db.stories.find(item => item.id === chapter.storyId);
      createNotification(db, user.id, {
        type: 'purchase',
        title: 'Đã mở khóa chương',
        body: `Bạn đã mở khóa ${chapter.title}.`,
        link: storyLink(story, chapter),
        storyId: chapter.storyId,
        chapterId: chapter.id
      });
      await persistDb(db);
      return send(res, 200, { unlocked: true, user: safeUser(user) });
    }

    if (req.method === 'GET' && pathname === '/api/author/stats') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const stories = db.stories.filter(story => getStoryOwnerId(story) === user.id);
      const storyIds = new Set(stories.map(story => story.id));
      const chapters = db.chapters.filter(chapter => storyIds.has(chapter.storyId));
      const revenue = authorRevenueData(db, user.id);
      return send(res, 200, {
        stats: {
          stories: stories.length,
          chapters: chapters.length,
          approvedChapters: chapters.filter(isPublicChapter).length,
          pendingStories: stories.filter(story => story.approvalStatus === 'pending').length,
          pendingChapters: chapters.filter(chapter => chapterStatus(chapter) === 'pending').length,
          views: stories.reduce((sum, story) => sum + Number(story.views || 0), 0),
          follows: stories.reduce((sum, story) => sum + Number(story.follows || 0), 0),
          comments: db.comments.filter(comment => storyIds.has(comment.storyId)).length,
          revenue: revenue.totalRevenue,
          pendingWithdrawal: revenue.pendingWithdrawal,
          balance: user.seeds || 0
        }
      });
    }

    if (req.method === 'GET' && pathname === '/api/author/stories') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const stories = db.stories
        .filter(story => getStoryOwnerId(story) === user.id)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
        .map(story => authorStorySummary(db, story, user.id));
      return send(res, 200, { stories });
    }

    if (req.method === 'POST' && pathname === '/api/author/stories') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      requestPerf.mark('auth');
      const body = await parseBody(req);
      const approvalStatus = authorStoryApprovalStatus(body, 'draft');
      const payload = normalizeAuthorStoryInput(body, user);
      const inputError = validateAuthorStoryPayload(payload, approvalStatus);
      if (inputError) return badRequest(res, inputError);
      requestPerf.mark('validate');
      const timestamp = now();
      const story = {
        id: uid('story'),
        ownerId: user.id,
        slug: makeUniqueSlug(db, body.slug || payload.title),
        title: payload.title,
        author: payload.author,
        translator: payload.translator,
        cover: payload.cover,
        coverPath: payload.coverPath,
        coverPosition: payload.coverPosition,
        shortDescription: payload.shortDescription,
        description: payload.description,
        status: payload.status,
        language: payload.language,
        ageRating: payload.ageRating,
        hidden: true,
        approvalStatus,
        chapterCountEstimate: payload.chapterCountEstimate,
        premium: payload.premium,
        type: payload.type,
        price: payload.price,
        chapterPrice: payload.chapterPrice,
        vipFromChapter: payload.vipFromChapter,
        comboPrice: payload.comboPrice,
        featured: false,
        views: 0,
        rating: 4.5,
        follows: 0,
        categories: payload.categories,
        tags: payload.tags,
        chapterCount: 0,
        latestChapter: null,
        updatedAt: timestamp,
        createdAt: timestamp
      };
      db.stories.unshift(story);
      await persistDb(db, { prune: false, only: ['stories'], relationStoryIds: [story.id] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 201, { story: authorStorySummary(db, story, user.id), user: safeUser(user) });
    }

    const authorStoryParams = match(pathname, '/api/author/stories/:id');
    if (authorStoryParams && req.method === 'GET') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const story = db.stories.find(item => item.id === authorStoryParams.id);
      if (!story) return notFound(res);
      if (!canEditStory(user, story)) return forbidden(res);
      const chapters = db.chapters
        .filter(chapter => chapter.storyId === story.id)
        .sort((a, b) => a.number - b.number)
        .map(chapter => authorChapterSummary(db, chapter));
      return send(res, 200, { story: authorStorySummary(db, story, user.id), chapters });
    }

    if (authorStoryParams && req.method === 'PUT') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      requestPerf.mark('auth');
      const story = db.stories.find(item => item.id === authorStoryParams.id);
      if (!story) return notFound(res);
      if (!canEditStory(user, story)) return forbidden(res);
      const body = await parseBody(req);
      const hasApprovalInput = body.approvalStatus !== undefined || body.statusApproval !== undefined || body.mode !== undefined;
      const approvalStatus = hasApprovalInput ? authorStoryApprovalStatus(body, story.approvalStatus || 'draft') : (story.approvalStatus || 'draft');
      const payload = normalizeAuthorStoryInput(body, user, story);
      const inputError = validateAuthorStoryPayload(payload, approvalStatus);
      if (inputError) return badRequest(res, inputError);
      requestPerf.mark('validate');
      if (story.coverPath && payload.coverPath && story.coverPath !== payload.coverPath) {
        await storage.deleteImage(story.coverPath).catch(error => console.warn(`Could not delete old cover ${story.coverPath}: ${error.message}`));
      }
      Object.assign(story, {
        title: payload.title,
        author: payload.author,
        translator: payload.translator,
        cover: payload.cover,
        coverPath: payload.coverPath,
        coverPosition: payload.coverPosition,
        shortDescription: payload.shortDescription,
        description: payload.description,
        status: payload.status,
        language: payload.language,
        ageRating: payload.ageRating,
        approvalStatus,
        chapterCountEstimate: payload.chapterCountEstimate,
        premium: payload.premium,
        type: payload.type,
        price: payload.price,
        chapterPrice: payload.chapterPrice,
        vipFromChapter: payload.vipFromChapter,
        comboPrice: payload.comboPrice,
        categories: payload.categories,
        tags: payload.tags,
        updatedAt: now()
      });
      if (body.slug || body.title) story.slug = makeUniqueSlug(db, body.slug || payload.title, story.id);
      if (approvalStatus === 'approved') {
        if (body.hidden !== undefined) story.hidden = Boolean(body.hidden);
      } else {
        story.hidden = true;
      }
      if (approvalStatus === 'pending') story.rejectionReason = '';
      await persistDb(db, { prune: false, only: ['stories'], relationStoryIds: [story.id] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 200, { story: authorStorySummary(db, story, user.id), user: safeUser(user) });
    }

    if (authorStoryParams && req.method === 'DELETE') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const index = db.stories.findIndex(item => item.id === authorStoryParams.id);
      if (index === -1) return notFound(res);
      const story = db.stories[index];
      if (!canEditStory(user, story)) return forbidden(res);
      db.stories.splice(index, 1);
      db.chapters = db.chapters.filter(item => item.storyId !== story.id);
      db.bookmarks = db.bookmarks.filter(item => item.storyId !== story.id);
      db.follows = db.follows.filter(item => item.storyId !== story.id);
      db.history = db.history.filter(item => item.storyId !== story.id);
      db.comments = db.comments.filter(item => item.storyId !== story.id);
      db.ratings = db.ratings.filter(item => item.storyId !== story.id);
      db.reports = db.reports.filter(item => item.storyId !== story.id);
      db.purchases = db.purchases.filter(item => item.storyId !== story.id);
      db.promotions = db.promotions.filter(item => item.storyId !== story.id);
      await persistDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/author/chapters') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const storyId = String(url.searchParams.get('storyId') || '').trim();
      let storyIds;
      if (storyId) {
        const story = db.stories.find(item => item.id === storyId);
        if (!story) return notFound(res);
        if (!canEditStory(user, story)) return forbidden(res);
        storyIds = new Set([story.id]);
      } else {
        storyIds = new Set(db.stories.filter(story => getStoryOwnerId(story) === user.id).map(story => story.id));
      }
      const chapters = db.chapters
        .filter(chapter => storyIds.has(chapter.storyId))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
        .map(chapter => authorChapterSummary(db, chapter));
      return send(res, 200, { chapters });
    }

    const authorStoryImportParams = match(pathname, '/api/author/stories/:id/chapters/import');
    if (authorStoryImportParams && req.method === 'POST') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const story = db.stories.find(item => item.id === authorStoryImportParams.id);
      if (!story) return notFound(res);
      if (!canEditStory(user, story)) return forbidden(res);
      const upload = await parseMultipartRequest(req);
      const file = upload.files.find(item => item.fieldname === 'file') || upload.files[0];
      if (!file) return badRequest(res, 'Vui long chon file can import.');
      const ext = path.extname(file.filename).toLowerCase();
      let text = '';
      if (ext === '.txt') {
        text = decodeTextBuffer(file.data);
      } else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer: file.data });
        text = result.value || '';
      } else if (ext === '.pdf') {
        return badRequest(res, 'Import PDF chua duoc ho tro on dinh. Vui long dung TXT hoac DOCX.');
      } else {
        return badRequest(res, 'Chi ho tro file .txt va .docx.');
      }
      const parsed = parseChaptersFromText(text, { startNumber: nextChapterNumber(db, story.id) });
      return send(res, 200, {
        file: {
          name: file.filename,
          size: file.data.length,
          type: ext.replace('.', '')
        },
        chapters: parsed.chapters,
        warnings: parsed.warnings
      });
    }

    const authorStoryBulkParams = match(pathname, '/api/author/stories/:id/chapters/bulk');
    if (authorStoryBulkParams && req.method === 'POST') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      requestPerf.mark('auth');
      const story = db.stories.find(item => item.id === authorStoryBulkParams.id);
      if (!story) return notFound(res);
      if (!canEditStory(user, story)) return forbidden(res);
      const body = await parseBody(req);
      const incoming = Array.isArray(body.chapters) ? body.chapters : [];
      if (!incoming.length) return badRequest(res, 'Danh sach chuong rong.');
      const status = normalizeAuthorChapterStatus(body.mode || body.status, 'draft');
      if (status === 'scheduled' && !body.scheduledAt) return badRequest(res, 'Vui long chon thoi gian len lich.');
      const access = String(body.access || 'free').trim();
      const inheritedPremium = Boolean(story.premium || ['vip', 'mixed'].includes(story.type));
      const isPremium = access === 'inherit' ? inheritedPremium : access === 'vip' || access === 'paid';
      const price = isPremium ? parsePositiveNumber(body.price ?? story.chapterPrice ?? story.price, 0) : 0;
      if (isPremium && price <= 0) return badRequest(res, 'Gia chuong VIP phai lon hon 0.');
      requestPerf.mark('validate');
      const renumber = body.renumber !== false;
      let cursor = parsePositiveNumber(body.startNumber, nextChapterNumber(db, story.id));
      const batchId = uid('batch');
      const createdChapters = [];
      const errors = [];
      let skipped = 0;

      incoming.forEach((item, index) => {
        let content = String(item.content || '').trim();
        const number = renumber ? cursor : Number(item.number || cursor);
        if (renumber) cursor += 1;
        if (!Number.isFinite(number) || number <= 0) {
          skipped += 1;
          errors.push({ index, number: item.number || null, reason: 'So chuong khong hop le' });
          return;
        }
        let title = String(item.title || `Chuong ${number}`).trim();
        if (!title) {
          skipped += 1;
          errors.push({ index, number, reason: 'Ten chuong rong' });
          return;
        }
        if (!content) {
          skipped += 1;
          errors.push({ index, number, reason: 'Noi dung chuong rong' });
          return;
        }
        try {
          title = validateCleanText(title, `chapters[${index}].title`);
          content = validateCleanText(content, `chapters[${index}].content`);
        } catch (error) {
          skipped += 1;
          errors.push({ index, number, reason: error.message });
          return;
        }
        const publishError = isPublishChapterStatus(status) ? publicChapterContentError(content) : '';
        if (publishError) {
          skipped += 1;
          errors.push({ index, number, reason: publishError });
          return;
        }
        if (chapterNumberExists(db, story.id, number) || createdChapters.some(chapter => Number(chapter.number) === Number(number))) {
          skipped += 1;
          errors.push({ index, number, reason: 'Trung so chuong' });
          return;
        }
        const timestamp = now();
        const chapter = {
          id: uid('chap'),
          storyId: story.id,
          number,
          title,
          content,
          preview: String(item.preview || content.slice(0, 320)).trim(),
          isPremium,
          price,
          status,
          scheduledAt: status === 'scheduled' ? String(body.scheduledAt) : '',
          password: body.password ? String(body.password) : '',
          wordCount: wordCount(content),
          sourceBatchId: batchId,
          views: 0,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        createdChapters.push(chapter);
      });

      db.chapters.push(...createdChapters);
      refreshStoryChapterMetadata(db, story);
      createdChapters.forEach(chapter => notifyChapterPublished(db, story, chapter, user.id));
      await persistDb(db, { prune: false, only: ['stories', 'chapters', 'notifications'] });
      requestPerf.mark('db');
      requestPerf.log(`created=${createdChapters.length} skipped=${skipped}`);
      return send(res, 201, {
        created: createdChapters.length,
        skipped,
        errors,
        chapters: createdChapters.map(chapter => authorChapterSummary(db, chapter)),
        story: authorStorySummary(db, story, user.id)
      });
    }

    const authorStoryChaptersParams = match(pathname, '/api/author/stories/:id/chapters');
    if (authorStoryChaptersParams && req.method === 'POST') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      requestPerf.mark('auth');
      const story = db.stories.find(item => item.id === authorStoryChaptersParams.id);
      if (!story) return notFound(res);
      if (!canEditStory(user, story)) return forbidden(res);
      const body = await parseBody(req);
      const inputError = validateChapterInput(body);
      if (inputError) return badRequest(res, inputError);
      const nextNumber = nextChapterNumber(db, story.id);
      const chapterNumber = Number(body.number || nextNumber);
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return badRequest(res, 'So chuong khong hop le.');
      if (chapterNumberExists(db, story.id, chapterNumber)) return badRequest(res, 'So chuong da ton tai trong truyen nay.');
      const status = normalizeAuthorChapterStatus(body.status || body.mode, 'draft');
      if (status === 'scheduled' && !body.scheduledAt) return badRequest(res, 'Vui long chon thoi gian len lich.');
      const isPremium = Boolean(body.isPremium ?? body.access === 'vip');
      const price = parsePositiveNumber(body.price ?? body.chapterPrice, 0);
      if (isPremium && price <= 0) return badRequest(res, 'Gia chuong VIP phai lon hon 0.');
      requestPerf.mark('validate');
      const timestamp = now();
      const chapter = {
        id: uid('chap'),
        storyId: story.id,
        number: chapterNumber,
        title: String(body.title || `Chuong ${nextNumber}`).trim(),
        content: String(body.content || '').trim(),
        preview: String(body.preview || String(body.content || '').slice(0, 320)).trim(),
        isPremium,
        price,
        status,
        scheduledAt: status === 'scheduled' ? String(body.scheduledAt) : '',
        password: body.password ? String(body.password) : '',
        wordCount: wordCount(body.content),
        views: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      db.chapters.push(chapter);
      refreshStoryChapterMetadata(db, story);
      notifyChapterPublished(db, story, chapter, user.id);
      await persistDb(db, { prune: false, only: ['stories', 'chapters', 'notifications'] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 201, { chapter: authorChapterSummary(db, chapter), story: authorStorySummary(db, story, user.id) });
    }

    const authorChapterParams = match(pathname, '/api/author/chapters/:id');
    if (authorChapterParams && req.method === 'PUT') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      requestPerf.mark('auth');
      const chapter = db.chapters.find(item => item.id === authorChapterParams.id);
      if (!chapter) return notFound(res);
      if (!canEditChapter(db, user, chapter)) return forbidden(res);
      const body = await parseBody(req);
      const oldStoryId = chapter.storyId;
      const targetStory = body.storyId && body.storyId !== chapter.storyId
        ? db.stories.find(item => item.id === body.storyId)
        : db.stories.find(item => item.id === chapter.storyId);
      if (!targetStory) return notFound(res);
      if (!canEditStory(user, targetStory)) return forbidden(res);
      const hasStatusInput = body.status !== undefined || body.mode !== undefined;
      const wasPublic = isPublicChapter(chapter);
      const status = hasStatusInput ? normalizeAuthorChapterStatus(body.status || body.mode, chapterStatus(chapter)) : chapterStatus(chapter);
      if (status === 'scheduled' && !(body.scheduledAt || chapter.scheduledAt)) return badRequest(res, 'Vui long chon thoi gian len lich.');
      if (body.number !== undefined) {
        const nextNumber = Number(body.number);
        if (!Number.isFinite(nextNumber) || nextNumber <= 0) return badRequest(res, 'So chuong khong hop le.');
        if (chapterNumberExists(db, targetStory.id, nextNumber, chapter.id)) return badRequest(res, 'So chuong da ton tai trong truyen nay.');
      }
      const nextIsPremium = body.isPremium !== undefined ? Boolean(body.isPremium) : body.access !== undefined ? body.access === 'vip' : Boolean(chapter.isPremium);
      if ((body.isPremium !== undefined || body.access !== undefined || body.price !== undefined) && nextIsPremium && parsePositiveNumber(body.price ?? chapter.price, 0) <= 0) {
        return badRequest(res, 'Gia chuong VIP phai lon hon 0.');
      }
      requestPerf.mark('validate');
      try {
        ['title', 'content', 'preview'].forEach(key => {
          if (body[key] !== undefined) chapter[key] = validateCleanText(String(body[key]).trim(), `chapter.${key}`);
        });
      } catch (error) {
        return badRequest(res, error.message);
      }
      if (body.storyId) chapter.storyId = targetStory.id;
      if (body.number !== undefined) chapter.number = Number(body.number);
      if (body.isPremium !== undefined || body.access !== undefined) chapter.isPremium = Boolean(body.isPremium ?? body.access === 'vip');
      if (body.price !== undefined) chapter.price = parsePositiveNumber(body.price, chapter.price);
      if (body.password !== undefined) chapter.password = String(body.password || '');
      if (hasStatusInput) chapter.status = status;
      if (body.scheduledAt !== undefined) chapter.scheduledAt = String(body.scheduledAt || '');
      if (status === 'pending') chapter.rejectionReason = '';
      if (body.content !== undefined) chapter.wordCount = wordCount(chapter.content);
      const publishError = publicChapterError(chapter, status);
      if (publishError) return badRequest(res, publishError);
      chapter.updatedAt = now();
      refreshStoryChapterMetadata(db, targetStory);
      if (oldStoryId !== chapter.storyId) {
        const oldStory = db.stories.find(item => item.id === oldStoryId);
        refreshStoryChapterMetadata(db, oldStory);
      }
      if (!wasPublic) notifyChapterPublished(db, targetStory, chapter, user.id);
      await persistDb(db, { prune: false, only: ['stories', 'chapters', 'notifications'] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 200, { chapter: authorChapterSummary(db, chapter), story: authorStorySummary(db, targetStory, user.id) });
    }

    if (authorChapterParams && req.method === 'DELETE') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const index = db.chapters.findIndex(item => item.id === authorChapterParams.id);
      if (index === -1) return notFound(res);
      const chapter = db.chapters[index];
      if (!canEditChapter(db, user, chapter)) return forbidden(res);
      db.chapters.splice(index, 1);
      db.purchases = db.purchases.filter(item => item.chapterId !== chapter.id);
      db.history = db.history.filter(item => item.chapterId !== chapter.id);
      db.comments = db.comments.filter(item => item.chapterId !== chapter.id);
      const story = db.stories.find(item => item.id === chapter.storyId);
      refreshStoryChapterMetadata(db, story);
      await persistDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/author/revenue') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      return send(res, 200, { revenue: authorRevenueData(db, user.id) });
    }

    if (req.method === 'GET' && pathname === '/api/author/promotions') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const promotions = db.promotions
        .filter(promotion => promotion.ownerId === user.id)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .map(promotion => promotionResponse(db, promotion));
      return send(res, 200, { promotions, packages: PROMOTION_PACKAGES, balance: user.seeds || 0 });
    }

    if (req.method === 'POST' && pathname === '/api/author/promotions') {
      const user = requireStoryPublisher(req, res, db);
      if (!user) return;
      const body = await parseBody(req);
      const story = db.stories.find(item => item.id === body.storyId);
      if (!story) return notFound(res);
      if (!canEditStory(user, story)) return forbidden(res);
      const pkg = PROMOTION_PACKAGES.find(item => item.id === body.packageId);
      if (!pkg) return badRequest(res, 'Goi quang ba khong hop le.');
      if (Number(user.seeds || 0) < pkg.price) return badRequest(res, 'So du Dau khong du de mua goi quang ba.');
      const timestamp = now();
      const startsAt = body.startsAt ? new Date(body.startsAt).toISOString() : timestamp;
      const endsAt = new Date(new Date(startsAt).getTime() + pkg.days * DAY_MS).toISOString();
      user.seeds = Number(user.seeds || 0) - pkg.price;
      const promotion = {
        id: uid('promo'),
        storyId: story.id,
        ownerId: user.id,
        packageId: pkg.id,
        packageName: pkg.title,
        cost: pkg.price,
        status: 'active',
        startsAt,
        endsAt,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      db.promotions.unshift(promotion);
      db.transactions.push({
        id: uid('txn'),
        userId: user.id,
        storyId: story.id,
        promotionId: promotion.id,
        packageId: pkg.id,
        type: 'promotion',
        amount: -pkg.price,
        note: `Mua goi quang ba ${pkg.title} cho ${story.title}`,
        createdAt: timestamp
      });
      createNotification(db, user.id, {
        type: 'promo',
        title: 'Da kich hoat goi quang ba',
        body: `${story.title} da duoc kich hoat goi ${pkg.title}.`,
        link: '/author/promotions',
        storyId: story.id
      });
      await persistDb(db);
      return send(res, 201, { promotion: promotionResponse(db, promotion), balance: user.seeds, user: safeUser(user) });
    }

    if (req.method === 'GET' && (pathname === '/api/admin/dashboard' || pathname === '/api/admin/stats')) {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      return send(res, 200, { stats: adminDashboard(db) });
    }

    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const query = url.searchParams.get('query') || '';
      const role = url.searchParams.get('role') || '';
      const status = url.searchParams.get('status') || '';
      let users = db.users.map(user => adminUserSummary(db, user));
      users = users.filter(user => matchesSearch([user.name, user.email, user.note], query));
      if (role && role !== 'all') users = users.filter(user => user.role === role || normalizeStoredRole(role) === user.role);
      if (status && status !== 'all') users = users.filter(user => user.status === status);
      users.sort((a, b) => new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0));
      const page = paginate(users, url);
      return send(res, 200, { users: page.items, pagination: page.pagination });
    }

    const adminUserParams = match(pathname, '/api/admin/users/:id');
    if (adminUserParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const target = db.users.find(item => item.id === adminUserParams.id);
      if (!target) return notFound(res);
      const body = await parseBody(req);
      const before = adminUserSummary(db, target);
      if (body.status !== undefined) {
        if (!VALID_ADMIN_USER_STATUSES.includes(body.status)) return badRequest(res, 'Trang thai user khong hop le.');
        if (target.id === admin.id && body.status === 'locked') return badRequest(res, 'Admin khong the tu khoa tai khoan cua minh.');
        if (target.status !== body.status) target.tokenVersion = Number(target.tokenVersion || 0) + 1;
        target.status = body.status;
      }
      if (body.role !== undefined) {
        if (!VALID_MOD_MANAGEMENT_ROLES.includes(body.role)) return badRequest(res, 'Vai tro user khong hop le.');
        const nextRole = normalizeStoredRole(body.role);
        if (!VALID_MOD_MANAGEMENT_ROLES.includes(nextRole)) return badRequest(res, 'Vai tro user khong hop le.');
        const roleCheck = canChangeUserRole(db, admin, target, nextRole);
        if (!roleCheck.ok) return badRequest(res, roleCheck.message);
        if (normalizeRole(target.role) !== nextRole) target.tokenVersion = Number(target.tokenVersion || 0) + 1;
        target.role = nextRole;
      }
      if (body.note !== undefined) target.note = String(body.note || '').slice(0, 500);
      target.updatedAt = now();
      const after = adminUserSummary(db, target);
      const action = before.status !== after.status
        ? (after.status === 'locked' ? 'lock_user' : 'unlock_user')
        : before.role !== after.role ? 'change_role' : 'update_user';
      logAdminAction(db, admin, action, 'user', target.id, before, after, body.note || '');
      await persistDb(db);
      return send(res, 200, { user: after });
    }

    const adminUserRoleParams = match(pathname, '/api/admin/users/:id/role');
    if (adminUserRoleParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const target = db.users.find(item => item.id === adminUserRoleParams.id);
      if (!target) return notFound(res);
      const body = await parseBody(req);
      const nextRole = normalizeStoredRole(body.role);
      if (!VALID_MOD_MANAGEMENT_ROLES.includes(nextRole)) return badRequest(res, 'Vai tro moi chi duoc la user hoac mod.');
      const roleCheck = canChangeUserRole(db, admin, target, nextRole);
      if (!roleCheck.ok) return badRequest(res, roleCheck.message);
      const before = adminUserSummary(db, target);
      if (normalizeRole(target.role) !== nextRole) {
        target.role = nextRole;
        target.tokenVersion = Number(target.tokenVersion || 0) + 1;
        target.updatedAt = now();
      }
      const after = adminUserSummary(db, target);
      logAdminAction(db, admin, 'change_role', 'user', target.id, before, after, '');
      await persistDb(db);
      return send(res, 200, { user: after });
    }

    const adminAdjustBalanceParams = match(pathname, '/api/admin/users/:id/adjust-balance');
    if (adminAdjustBalanceParams && req.method === 'POST') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const target = db.users.find(item => item.id === adminAdjustBalanceParams.id);
      if (!target) return notFound(res);
      const body = await parseBody(req);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount === 0) return badRequest(res, 'So Dau dieu chinh khong hop le.');
      const before = adminUserSummary(db, target);
      const balanceBefore = Number(target.seeds || 0);
      target.seeds = Math.max(0, balanceBefore + amount);
      target.updatedAt = now();
      const transaction = {
        id: uid('txn'),
        userId: target.id,
        type: 'admin_adjustment',
        amount,
        balanceBefore,
        balanceAfter: target.seeds,
        refType: 'admin_user',
        refId: target.id,
        seeds: Math.abs(amount),
        status: 'success',
        method: 'admin',
        note: String(body.reason || 'Admin dieu chinh so du').slice(0, 500),
        createdBy: admin.id,
        createdAt: now()
      };
      db.transactions.unshift(transaction);
      createNotification(db, target.id, {
        type: 'wallet',
        title: 'So du Dau duoc dieu chinh',
        body: `${amount > 0 ? 'Cong' : 'Tru'} ${Math.abs(amount)} Dau. Ly do: ${transaction.note}`,
        link: '/wallet'
      });
      const after = adminUserSummary(db, target);
      logAdminAction(db, admin, 'adjust_balance', 'user', target.id, before, after, transaction.note);
      await persistDb(db);
      return send(res, 200, { user: after, transaction: adminTransactionSummary(db, transaction) });
    }

    if (req.method === 'GET' && pathname === '/api/admin/transactions') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const query = url.searchParams.get('query') || '';
      const type = url.searchParams.get('type') || '';
      const status = url.searchParams.get('status') || '';
      const method = url.searchParams.get('method') || '';
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      let transactions = db.transactions.map(item => adminTransactionSummary(db, item));
      transactions = transactions.filter(item => matchesSearch([item.id, item.userName, item.userEmail, item.note, item.method], query));
      if (type && type !== 'all') transactions = transactions.filter(item => item.type === type);
      if (status && status !== 'all') transactions = transactions.filter(item => item.status === status);
      if (method && method !== 'all') transactions = transactions.filter(item => item.method === method);
      if (from) transactions = transactions.filter(item => new Date(item.createdAt) >= new Date(`${from}T00:00:00`));
      if (to) transactions = transactions.filter(item => new Date(item.createdAt) <= new Date(`${to}T23:59:59`));
      transactions.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const page = paginate(transactions, url);
      return send(res, 200, { transactions: page.items, pagination: page.pagination });
    }

    if (req.method === 'GET' && pathname === '/api/admin/reports') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const status = url.searchParams.get('status') || '';
      const type = url.searchParams.get('type') || '';
      const severity = url.searchParams.get('severity') || '';
      let reports = db.reports.map(report => adminReportSummary(db, report));
      if (status && status !== 'all') reports = reports.filter(report => report.status === status);
      if (type && type !== 'all') reports = reports.filter(report => report.type === type);
      if (severity && severity !== 'all') reports = reports.filter(report => report.severity === severity);
      reports.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const page = paginate(reports, url);
      return send(res, 200, { reports: page.items, pagination: page.pagination });
    }

    const adminReportActionParams = match(pathname, '/api/admin/reports/:id/actions');
    if (adminReportActionParams && req.method === 'POST') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const report = db.reports.find(item => item.id === adminReportActionParams.id);
      if (!report) return notFound(res);
      const body = await parseBody(req);
      if (body.status !== undefined && !VALID_REPORT_STATUSES.includes(body.status)) return badRequest(res, 'Trang thai bao cao khong hop le.');
      const before = adminReportSummary(db, report);
      const target = reportTarget(db, {
        ...report,
        targetType: body.targetType || report.targetType,
        targetId: body.targetId || report.targetId
      });
      const note = String(body.adminNote ?? body.note ?? '').slice(0, 500);

      if (body.hideContent) {
        if (target.type === 'story' && target.story) {
          const storyBefore = cloneForLog(target.story);
          target.story.hidden = true;
          target.story.updatedAt = now();
          logAdminAction(db, admin, 'hide_story', 'story', target.story.id, storyBefore, target.story, note);
        }
        if (target.type === 'chapter' && target.chapter) {
          const chapterBefore = cloneForLog(target.chapter);
          target.chapter.status = 'hidden';
          target.chapter.updatedAt = now();
          const story = db.stories.find(item => item.id === target.chapter.storyId);
          if (story) refreshStoryChapterMetadata(db, story);
          logAdminAction(db, admin, 'hide_chapter', 'chapter', target.chapter.id, chapterBefore, target.chapter, note);
        }
        if (target.type === 'comment' && target.comment) {
          const commentBefore = cloneForLog(target.comment);
          target.comment.status = 'hidden';
          target.comment.adminNote = note;
          target.comment.updatedAt = now();
          logAdminAction(db, admin, 'hide_comment', 'comment', target.comment.id, commentBefore, target.comment, note);
        }
      }

      if (body.lockUser && target.reportedUserId) {
        const lockedUser = db.users.find(item => item.id === target.reportedUserId);
        if (lockedUser && lockedUser.id !== admin.id) {
          const userBefore = adminUserSummary(db, lockedUser);
          lockedUser.status = 'locked';
          lockedUser.tokenVersion = Number(lockedUser.tokenVersion || 0) + 1;
          lockedUser.updatedAt = now();
          logAdminAction(db, admin, 'lock_user', 'user', lockedUser.id, userBefore, adminUserSummary(db, lockedUser), note);
        }
      }

      report.status = body.status || report.status || 'reviewing';
      report.adminNote = note;
      report.resolvedBy = ['resolved', 'rejected'].includes(report.status) ? admin.id : report.resolvedBy;
      report.resolvedAt = ['resolved', 'rejected'].includes(report.status) ? now() : report.resolvedAt;
      report.updatedAt = now();
      const after = adminReportSummary(db, report);
      logAdminAction(db, admin, 'resolve_report', 'report', report.id, before, after, note);
      await persistDb(db);
      return send(res, 200, { report: after });
    }

    const adminReportParams = match(pathname, '/api/admin/reports/:id');
    if (adminReportParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const report = db.reports.find(item => item.id === adminReportParams.id);
      if (!report) return notFound(res);
      const body = await parseBody(req);
      if (!VALID_REPORT_STATUSES.includes(body.status)) return badRequest(res, 'Trang thai bao cao khong hop le.');
      const before = adminReportSummary(db, report);
      report.status = body.status;
      if (body.adminNote !== undefined || body.note !== undefined) report.adminNote = String(body.adminNote ?? body.note ?? '').slice(0, 500);
      if (['resolved', 'rejected'].includes(body.status)) {
        report.resolvedBy = admin.id;
        report.resolvedAt = now();
      }
      report.updatedAt = now();
      const after = adminReportSummary(db, report);
      logAdminAction(db, admin, 'update_report', 'report', report.id, before, after, report.adminNote || '');
      await persistDb(db);
      return send(res, 200, { report: after });
    }

    if (req.method === 'GET' && pathname === '/api/admin/comments') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const query = url.searchParams.get('query') || '';
      const status = url.searchParams.get('status') || '';
      const storyId = url.searchParams.get('storyId') || '';
      let comments = db.comments.map(comment => adminCommentSummary(db, comment));
      comments = comments.filter(comment => matchesSearch([comment.body, comment.userName, comment.userEmail, comment.storyTitle], query));
      if (status && status !== 'all') comments = comments.filter(comment => comment.status === status);
      if (storyId && storyId !== 'all') comments = comments.filter(comment => comment.storyId === storyId);
      comments.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const page = paginate(comments, url);
      return send(res, 200, { comments: page.items, pagination: page.pagination });
    }

    const adminCommentParams = match(pathname, '/api/admin/comments/:id');
    if (adminCommentParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const comment = db.comments.find(item => item.id === adminCommentParams.id);
      if (!comment) return notFound(res);
      const body = await parseBody(req);
      if (!VALID_COMMENT_STATUSES.includes(body.status)) return badRequest(res, 'Trang thai binh luan khong hop le.');
      const before = adminCommentSummary(db, comment);
      comment.status = body.status;
      if (body.adminNote !== undefined) comment.adminNote = String(body.adminNote || '').slice(0, 500);
      comment.updatedAt = now();
      const after = adminCommentSummary(db, comment);
      logAdminAction(db, admin, 'update_comment', 'comment', comment.id, before, after, comment.adminNote || '');
      await persistDb(db);
      return send(res, 200, { comment: after });
    }

    if (adminCommentParams && req.method === 'DELETE') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const index = db.comments.findIndex(item => item.id === adminCommentParams.id);
      if (index === -1) return notFound(res);
      const [comment] = db.comments.splice(index, 1);
      logAdminAction(db, admin, 'delete_comment', 'comment', comment.id, adminCommentSummary(db, comment), null, '');
      await persistDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/admin/taxonomy') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      return send(res, 200, { taxonomy: taxonomyResponse(db) });
    }

    const adminTaxonomyPostParams = match(pathname, '/api/admin/taxonomy/:kind');
    if (adminTaxonomyPostParams && req.method === 'POST' && ['categories', 'tags'].includes(adminTaxonomyPostParams.kind)) {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const body = await parseBody(req);
      const taxonomy = ensureTaxonomy(db);
      const name = String(body.name || body.label || '').trim();
      if (!name) return badRequest(res, 'Ten taxonomy la bat buoc.');
      const list = taxonomy[adminTaxonomyPostParams.kind];
      if (list.some(item => item.name.toLowerCase() === name.toLowerCase())) return badRequest(res, 'Ten taxonomy da ton tai.');
      const item = taxonomyItem({ ...body, name }, adminTaxonomyPostParams.kind === 'categories' ? 'cat' : 'tag');
      list.push(item);
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      logAdminAction(db, admin, 'update_taxonomy', adminTaxonomyPostParams.kind.slice(0, -1), item.id, null, item, 'create');
      await persistDb(db);
      return send(res, 201, { item, taxonomy: taxonomyResponse(db) });
    }

    const adminTaxonomyItemParams = match(pathname, '/api/admin/taxonomy/:kind/:id');
    if (adminTaxonomyItemParams && ['categories', 'tags'].includes(adminTaxonomyItemParams.kind) && ['PATCH', 'DELETE'].includes(req.method)) {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const taxonomy = ensureTaxonomy(db);
      const list = taxonomy[adminTaxonomyItemParams.kind];
      const item = list.find(row => row.id === adminTaxonomyItemParams.id || row.slug === adminTaxonomyItemParams.id);
      if (!item) return notFound(res);
      const type = adminTaxonomyItemParams.kind === 'categories' ? 'category' : 'tag';
      const storyField = adminTaxonomyItemParams.kind === 'categories' ? 'categories' : 'tags';
      const usage = db.stories.filter(story => (story[storyField] || []).some(name => name.toLowerCase() === item.name.toLowerCase())).length;

      if (req.method === 'DELETE') {
        if (usage > 0) return badRequest(res, 'Taxonomy dang duoc su dung, hay chuyen noi dung sang taxonomy khac truoc khi xoa.');
        const before = cloneForLog(item);
        taxonomy[adminTaxonomyItemParams.kind] = list.filter(row => row.id !== item.id);
        logAdminAction(db, admin, 'update_taxonomy', type, item.id, before, null, 'delete');
        await persistDb(db);
        return send(res, 200, { ok: true, taxonomy: taxonomyResponse(db) });
      }

      const body = await parseBody(req);
      const before = cloneForLog(item);
      if (body.name !== undefined) {
        const nextName = String(body.name || '').trim();
        if (!nextName) return badRequest(res, 'Ten taxonomy la bat buoc.');
        if (list.some(row => row.id !== item.id && row.name.toLowerCase() === nextName.toLowerCase())) return badRequest(res, 'Ten taxonomy da ton tai.');
        db.stories.forEach(story => {
          story[storyField] = (story[storyField] || []).map(name => name.toLowerCase() === item.name.toLowerCase() ? nextName : name);
        });
        item.name = nextName;
        item.slug = slugify(nextName);
      }
      if (body.description !== undefined) item.description = String(body.description || '').slice(0, 500);
      if (body.color !== undefined) item.color = String(body.color || '').slice(0, 40);
      item.updatedAt = now();
      logAdminAction(db, admin, 'update_taxonomy', type, item.id, before, item, 'update');
      await persistDb(db);
      return send(res, 200, { item, taxonomy: taxonomyResponse(db) });
    }

    if (req.method === 'GET' && pathname === '/api/admin/notifications') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const query = url.searchParams.get('query') || '';
      let notifications = db.adminNotifications.slice();
      notifications = notifications.filter(item => matchesSearch([item.title, item.body, item.targetRole, item.targetUserId], query));
      notifications.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const page = paginate(notifications, url);
      return send(res, 200, { notifications: page.items, pagination: page.pagination });
    }

    if (req.method === 'POST' && pathname === '/api/admin/notifications') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const body = await parseBody(req);
      const title = String(body.title || '').trim();
      const message = String(body.body || body.message || '').trim();
      if (!title || !message) return badRequest(res, 'Tieu de va noi dung thong bao la bat buoc.');
      const targetRole = String(body.targetRole || 'all').trim();
      const targetUserId = String(body.targetUserId || '').trim();
      let recipients = [];
      if (targetUserId) {
        const targetUser = db.users.find(user => user.id === targetUserId || user.email === targetUserId);
        if (!targetUser) return badRequest(res, 'Khong tim thay user nhan thong bao.');
        recipients = [targetUser];
      } else if (targetRole && targetRole !== 'all') {
        const storedRole = normalizeStoredRole(targetRole);
        if (!storedRole) return badRequest(res, 'Vai tro nhan thong bao khong hop le.');
        recipients = db.users.filter(user => user.role === storedRole);
      } else {
        recipients = db.users.slice();
      }
      const campaign = {
        id: uid('admin_noti'),
        title,
        body: message,
        type: String(body.type || 'system').trim() || 'system',
        targetRole: targetUserId ? 'user' : targetRole || 'all',
        targetUserId: targetUserId || '',
        recipientCount: recipients.length,
        status: 'sent',
        createdBy: admin.id,
        createdAt: now(),
        updatedAt: now()
      };
      db.adminNotifications.unshift(campaign);
      recipients.forEach(user => createNotification(db, user.id, {
        type: campaign.type,
        title,
        body: message,
        link: body.link || '/notifications',
        actorId: admin.id
      }));
      logAdminAction(db, admin, 'send_notification', 'notification', campaign.id, null, campaign, title);
      await persistDb(db);
      return send(res, 201, { notification: campaign });
    }

    const adminNotificationParams = match(pathname, '/api/admin/notifications/:id');
    if (adminNotificationParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const campaign = db.adminNotifications.find(item => item.id === adminNotificationParams.id);
      if (!campaign) return notFound(res);
      const body = await parseBody(req);
      const before = cloneForLog(campaign);
      ['title', 'body', 'status'].forEach(key => {
        if (body[key] !== undefined) campaign[key] = String(body[key] || '').trim();
      });
      campaign.updatedAt = now();
      logAdminAction(db, admin, 'update_notification', 'notification', campaign.id, before, campaign, campaign.title);
      await persistDb(db);
      return send(res, 200, { notification: campaign });
    }

    if (req.method === 'GET' && pathname === '/api/admin/logs') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const entityType = url.searchParams.get('entityType') || '';
      const entityId = url.searchParams.get('entityId') || '';
      const adminId = url.searchParams.get('adminId') || '';
      const action = url.searchParams.get('action') || '';
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      let logs = db.adminLogs.slice();
      if (entityType && entityType !== 'all') logs = logs.filter(log => log.entityType === entityType);
      if (entityId) logs = logs.filter(log => log.entityId === entityId);
      if (adminId && adminId !== 'all') logs = logs.filter(log => log.adminId === adminId);
      if (action && action !== 'all') logs = logs.filter(log => log.action === action);
      if (from) logs = logs.filter(log => new Date(log.createdAt) >= new Date(`${from}T00:00:00`));
      if (to) logs = logs.filter(log => new Date(log.createdAt) <= new Date(`${to}T23:59:59`));
      logs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const page = paginate(logs, url);
      return send(res, 200, { logs: page.items, pagination: page.pagination });
    }

    if (req.method === 'GET' && pathname === '/api/admin/stories') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const query = url.searchParams.get('query') || '';
      const approvalStatus = url.searchParams.get('approvalStatus') || '';
      const hidden = url.searchParams.get('hidden') || '';
      const status = url.searchParams.get('status') || '';
      const category = url.searchParams.get('category') || '';
      let stories = db.stories.map(story => adminStorySummary(db, story, admin.id));
      stories = stories.filter(story => matchesSearch([story.title, story.author, story.description, ...(story.categories || []), ...(story.tags || [])], query));
      if (approvalStatus && approvalStatus !== 'all') stories = stories.filter(story => story.approvalStatus === approvalStatus);
      if (hidden === 'true' || hidden === 'false') stories = stories.filter(story => String(Boolean(story.hidden)) === hidden);
      if (status && status !== 'all') stories = stories.filter(story => story.status === status || story.publishStatus === status);
      if (category && category !== 'all') stories = stories.filter(story => (story.categories || []).includes(category));
      stories.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      const page = paginate(stories, url);
      return send(res, 200, { stories: page.items, pagination: page.pagination });
    }

    if (req.method === 'POST' && pathname === '/api/admin/stories') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      requestPerf.mark('auth');
      const body = await parseBody(req);
      const inputError = validateStoryInput(body);
      if (inputError) return badRequest(res, inputError);
      const slug = slugify(body.slug || body.title);
      if (db.stories.some(story => story.slug === slug)) return badRequest(res, 'Slug da ton tai.');
      requestPerf.mark('validate');
      const approvalStatus = VALID_STORY_APPROVAL_STATUSES.includes(body.approvalStatus) ? body.approvalStatus : 'approved';
      const timestamp = now();
      const story = {
        id: uid('story'),
        ownerId: body.ownerId || admin.id,
        slug,
        title: String(body.title).trim(),
        author: String(body.author).trim(),
        translator: String(body.translator || '').trim(),
        cover: body.cover || '/images/cover-1.jpg',
        description: body.description || '',
        status: body.status || 'ongoing',
        language: String(body.language || 'Tieng Viet').trim(),
        ageRating: String(body.ageRating || 'all').trim(),
        hidden: approvalStatus === 'approved' ? Boolean(body.hidden) : true,
        approvalStatus,
        rejectionReason: approvalStatus === 'rejected' ? String(body.rejectionReason || '').slice(0, 500) : '',
        chapterCountEstimate: parsePositiveNumber(body.chapterCountEstimate),
        premium: Boolean(body.premium),
        type: body.type || (body.premium ? 'vip' : 'free'),
        price: parsePositiveNumber(body.price),
        chapterPrice: parsePositiveNumber(body.chapterPrice ?? body.price),
        featured: Boolean(body.featured),
        hot: Boolean(body.hot),
        recommended: Boolean(body.recommended),
        banner: Boolean(body.banner),
        views: 0,
        rating: parsePositiveNumber(body.rating, 4.5),
        follows: 0,
        categories: normalizeCategories(body.categories),
        tags: normalizeCategories(body.tags),
        updatedAt: timestamp,
        createdAt: timestamp
      };
      db.stories.unshift(story);
      ensureTaxonomy(db);
      logAdminAction(db, admin, 'create_story', 'story', story.id, null, story, '');
      await persistDb(db, { prune: false, only: ['stories', 'adminLogs'], relationStoryIds: [story.id] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 201, { story: adminStorySummary(db, story, admin.id) });
    }

    const adminStoryApproveParams = match(pathname, '/api/admin/stories/:id/approve');
    if (adminStoryApproveParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const story = db.stories.find(item => item.id === adminStoryApproveParams.id);
      if (!story) return notFound(res);
      const before = adminStorySummary(db, story, admin.id);
      story.approvalStatus = 'approved';
      story.hidden = false;
      story.rejectionReason = '';
      story.updatedAt = now();
      const after = adminStorySummary(db, story, admin.id);
      logAdminAction(db, admin, 'approve_story', 'story', story.id, before, after, '');
      await persistDb(db, { prune: false, only: ['stories', 'adminLogs'], relationStoryIds: [story.id] });
      return send(res, 200, { story: after });
    }

    const adminStoryRejectParams = match(pathname, '/api/admin/stories/:id/reject');
    if (adminStoryRejectParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const story = db.stories.find(item => item.id === adminStoryRejectParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      const rejectReason = String(body.rejectReason || body.rejectionReason || '').trim();
      if (!rejectReason) return badRequest(res, 'Ly do tu choi la bat buoc.');
      const before = adminStorySummary(db, story, admin.id);
      story.approvalStatus = 'rejected';
      story.hidden = true;
      story.rejectionReason = rejectReason.slice(0, 500);
      story.updatedAt = now();
      const after = adminStorySummary(db, story, admin.id);
      logAdminAction(db, admin, 'reject_story', 'story', story.id, before, after, story.rejectionReason);
      await persistDb(db, { prune: false, only: ['stories', 'adminLogs'], relationStoryIds: [story.id] });
      return send(res, 200, { story: after });
    }

    const adminStoryVisibilityParams = match(pathname, '/api/admin/stories/:id/visibility');
    if (adminStoryVisibilityParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const story = db.stories.find(item => item.id === adminStoryVisibilityParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      if (body.isPublic === undefined && body.hidden === undefined) return badRequest(res, 'Thieu isPublic.');
      const before = adminStorySummary(db, story, admin.id);
      story.hidden = body.isPublic !== undefined ? !Boolean(body.isPublic) : Boolean(body.hidden);
      if (!story.hidden && story.approvalStatus !== 'approved') story.approvalStatus = 'approved';
      story.updatedAt = now();
      const after = adminStorySummary(db, story, admin.id);
      logAdminAction(db, admin, story.hidden ? 'hide_story' : 'show_story', 'story', story.id, before, after, '');
      await persistDb(db, { prune: false, only: ['stories', 'adminLogs'], relationStoryIds: [story.id] });
      return send(res, 200, { story: after });
    }

    const adminStoryStatusParams = match(pathname, '/api/admin/stories/:id/status');
    if (adminStoryStatusParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      requestPerf.mark('auth');
      const story = db.stories.find(item => item.id === adminStoryStatusParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      requestPerf.mark('validate');
      const before = adminStorySummary(db, story, admin.id);
      if (body.approvalStatus !== undefined) {
        if (!VALID_STORY_APPROVAL_STATUSES.includes(body.approvalStatus)) return badRequest(res, 'Trang thai duyet khong hop le.');
        story.approvalStatus = body.approvalStatus;
        if (body.approvalStatus === 'approved') {
          if (body.hidden === undefined) story.hidden = false;
          story.rejectionReason = '';
        }
        if (body.approvalStatus === 'rejected') {
          story.hidden = true;
          story.rejectionReason = String(body.rejectionReason || 'Can chinh sua truoc khi duyet.').slice(0, 500);
        }
        if (body.approvalStatus === 'pending' || body.approvalStatus === 'draft') story.hidden = true;
      }
      if (body.hidden !== undefined) story.hidden = Boolean(body.hidden);
      if (body.rejectionReason !== undefined && story.approvalStatus === 'rejected') story.rejectionReason = String(body.rejectionReason || '').slice(0, 500);
      story.updatedAt = now();
      const after = adminStorySummary(db, story, admin.id);
      const action = story.approvalStatus === 'rejected' ? 'reject_story' : story.hidden ? 'hide_story' : story.approvalStatus === 'approved' ? 'approve_story' : 'update_story_status';
      logAdminAction(db, admin, action, 'story', story.id, before, after, story.rejectionReason || '');
      await persistDb(db, { prune: false, only: ['stories', 'adminLogs'], relationStoryIds: [story.id] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 200, { story: after });
    }

    const adminStoryFlagsParams = match(pathname, '/api/admin/stories/:id/flags');
    if (adminStoryFlagsParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      requestPerf.mark('auth');
      const story = db.stories.find(item => item.id === adminStoryFlagsParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      requestPerf.mark('validate');
      const before = adminStorySummary(db, story, admin.id);
      if (body.isFeatured !== undefined) story.featured = Boolean(body.isFeatured);
      if (body.isHot !== undefined) story.hot = Boolean(body.isHot);
      if (body.isRecommended !== undefined) story.recommended = Boolean(body.isRecommended);
      if (body.isBanner !== undefined) story.banner = Boolean(body.isBanner);
      ['featured', 'hot', 'recommended', 'banner'].forEach(key => {
        if (body[key] !== undefined) story[key] = Boolean(body[key]);
      });
      story.updatedAt = now();
      const after = adminStorySummary(db, story, admin.id);
      logAdminAction(db, admin, 'update_story_flags', 'story', story.id, before, after, '');
      await persistDb(db, { prune: false, only: ['stories', 'adminLogs'], relationStoryIds: [story.id] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 200, { story: after });
    }

    const adminStoryParams = match(pathname, '/api/admin/stories/:id');
    if (adminStoryParams && req.method === 'PUT') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      requestPerf.mark('auth');
      const story = db.stories.find(item => item.id === adminStoryParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      const before = adminStorySummary(db, story, admin.id);
      if (body.slug) {
        const nextSlug = slugify(body.slug);
        if (db.stories.some(item => item.id !== story.id && item.slug === nextSlug)) return badRequest(res, 'Slug da ton tai.');
        story.slug = nextSlug;
      }
      try {
        ['title','author','translator','cover','description','status','language','ageRating','type'].forEach(key => {
          if (body[key] !== undefined) {
            const value = String(body[key]);
            story[key] = ['cover', 'status', 'ageRating', 'type'].includes(key) ? value : validateCleanText(value, `story.${key}`);
          }
        });
      } catch (error) {
        return badRequest(res, error.message);
      }
      if (body.hidden !== undefined) story.hidden = Boolean(body.hidden);
      if (body.approvalStatus !== undefined) {
        if (!VALID_STORY_APPROVAL_STATUSES.includes(body.approvalStatus)) return badRequest(res, 'Trang thai duyet khong hop le.');
        story.approvalStatus = body.approvalStatus;
        if (body.approvalStatus === 'approved') {
          if (body.hidden === undefined) story.hidden = false;
          story.rejectionReason = '';
        }
        if (body.approvalStatus === 'rejected') {
          story.hidden = true;
          story.rejectionReason = String(body.rejectionReason || 'Can chinh sua truoc khi duyet.').slice(0, 500);
        }
        if (body.approvalStatus === 'pending' || body.approvalStatus === 'draft') story.hidden = true;
      }
      if (body.rejectionReason !== undefined) story.rejectionReason = String(body.rejectionReason || '').slice(0, 500);
      if (body.chapterCountEstimate !== undefined) story.chapterCountEstimate = parsePositiveNumber(body.chapterCountEstimate, story.chapterCountEstimate);
      if (body.premium !== undefined) story.premium = Boolean(body.premium);
      if (body.featured !== undefined) story.featured = Boolean(body.featured);
      if (body.hot !== undefined) story.hot = Boolean(body.hot);
      if (body.recommended !== undefined) story.recommended = Boolean(body.recommended);
      if (body.banner !== undefined) story.banner = Boolean(body.banner);
      if (body.price !== undefined) story.price = Number(body.price);
      if (body.chapterPrice !== undefined) story.chapterPrice = Number(body.chapterPrice);
      if (body.rating !== undefined) story.rating = Number(body.rating);
      if (body.categories !== undefined) story.categories = normalizeCategories(body.categories);
      if (body.tags !== undefined) story.tags = normalizeCategories(body.tags);
      requestPerf.mark('validate');
      story.updatedAt = now();
      ensureTaxonomy(db);
      const after = adminStorySummary(db, story, admin.id);
      logAdminAction(db, admin, 'update_story', 'story', story.id, before, after, '');
      await persistDb(db, { prune: false, only: ['stories', 'adminLogs'], relationStoryIds: [story.id] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 200, { story: after });
    }

    if (adminStoryParams && req.method === 'DELETE') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const index = db.stories.findIndex(item => item.id === adminStoryParams.id);
      if (index === -1) return notFound(res);
      const [story] = db.stories.splice(index, 1);
      db.chapters = db.chapters.filter(item => item.storyId !== adminStoryParams.id);
      db.bookmarks = db.bookmarks.filter(item => item.storyId !== adminStoryParams.id);
      db.follows = db.follows.filter(item => item.storyId !== adminStoryParams.id);
      db.history = db.history.filter(item => item.storyId !== adminStoryParams.id);
      db.comments = db.comments.filter(item => item.storyId !== adminStoryParams.id);
      db.ratings = db.ratings.filter(item => item.storyId !== adminStoryParams.id);
      db.reports = db.reports.filter(item => item.storyId !== adminStoryParams.id);
      db.purchases = db.purchases.filter(item => item.storyId !== adminStoryParams.id);
      db.promotions = db.promotions.filter(item => item.storyId !== adminStoryParams.id);
      logAdminAction(db, admin, 'delete_story', 'story', story.id, story, null, '');
      await persistDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/admin/chapters') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      const storyId = url.searchParams.get('storyId') || '';
      const query = url.searchParams.get('query') || '';
      const status = url.searchParams.get('status') || '';
      const vip = url.searchParams.get('vip') || '';
      let chapters = db.chapters.map(chapter => chapterAdminSummary(db, chapter));
      chapters = chapters.filter(chapter => matchesSearch([chapter.title, chapter.storyTitle, chapter.author, chapter.content], query));
      if (storyId && storyId !== 'all') chapters = chapters.filter(chapter => chapter.storyId === storyId);
      if (status && status !== 'all') chapters = chapters.filter(chapter => chapter.status === status);
      if (vip === 'true' || vip === 'false') chapters = chapters.filter(chapter => String(Boolean(chapter.vip)) === vip);
      chapters.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      const page = paginate(chapters, url);
      return send(res, 200, { chapters: page.items, pagination: page.pagination });
    }

    const adminChapterParams = match(pathname, '/api/admin/stories/:id/chapters');
    if (adminChapterParams && req.method === 'POST') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      requestPerf.mark('auth');
      const story = db.stories.find(item => item.id === adminChapterParams.id);
      if (!story) return notFound(res);
      const body = await parseBody(req);
      const nextNumber = nextChapterNumber(db, story.id);
      const chapterNumber = Number(body.number || nextNumber);
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return badRequest(res, 'So chuong khong hop le.');
      if (chapterNumberExists(db, story.id, chapterNumber)) return badRequest(res, 'So chuong da ton tai trong truyen nay.');
      const status = VALID_CHAPTER_STATUSES.includes(body.status) ? body.status : 'approved';
      requestPerf.mark('validate');
      const chapter = {
        id: uid('chap'),
        storyId: story.id,
        number: chapterNumber,
        title: body.title || `Chuong ${nextNumber}`,
        content: body.content || 'Noi dung chuong dang duoc cap nhat.',
        preview: body.preview || 'Day la doan xem truoc cua chuong.',
        isPremium: Boolean(body.isPremium ?? body.vip),
        price: Number(body.price || 0),
        status,
        rejectionReason: status === 'rejected' ? String(body.rejectionReason || '').slice(0, 500) : '',
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt).toISOString() : '',
        password: body.password ? String(body.password) : '',
        wordCount: wordCount(body.content),
        views: 0,
        createdAt: now(),
        updatedAt: now()
      };
      const inputError = validateChapterInput(chapter, status);
      if (inputError) return badRequest(res, inputError);
      db.chapters.push(chapter);
      refreshStoryChapterMetadata(db, story);
      notifyChapterPublished(db, story, chapter, admin.id);
      logAdminAction(db, admin, 'create_chapter', 'chapter', chapter.id, null, chapterAdminSummary(db, chapter), '');
      await persistDb(db, { prune: false, only: ['stories', 'chapters', 'notifications', 'adminLogs'] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 201, { chapter: chapterAdminSummary(db, chapter) });
    }

    const adminChapterStatusParams = match(pathname, '/api/admin/chapters/:id/status');
    if (adminChapterStatusParams && req.method === 'PATCH') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      requestPerf.mark('auth');
      const chapter = db.chapters.find(item => item.id === adminChapterStatusParams.id);
      if (!chapter) return notFound(res);
      const body = await parseBody(req);
      if (!VALID_CHAPTER_STATUSES.includes(body.status)) return badRequest(res, 'Trang thai chuong khong hop le.');
      requestPerf.mark('validate');
      const before = chapterAdminSummary(db, chapter);
      const wasPublic = isPublicChapter(chapter);
      chapter.status = body.status;
      if (body.status === 'scheduled') {
        if (!body.scheduledAt) return badRequest(res, 'scheduledAt la bat buoc khi len lich chuong.');
        const scheduledAt = new Date(body.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) return badRequest(res, 'scheduledAt khong hop le.');
        chapter.scheduledAt = scheduledAt.toISOString();
      }
      if (body.scheduledAt !== undefined && body.status !== 'scheduled') {
        const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
        if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return badRequest(res, 'scheduledAt khong hop le.');
        chapter.scheduledAt = scheduledAt ? scheduledAt.toISOString() : '';
      }
      if (body.status === 'rejected') chapter.rejectionReason = String(body.rejectionReason || 'Can chinh sua truoc khi duyet.').slice(0, 500);
      if (['approved', 'published'].includes(body.status)) {
        chapter.rejectionReason = '';
        chapter.scheduledAt = '';
      }
      const publishError = publicChapterError(chapter, body.status);
      if (publishError) return badRequest(res, publishError);
      chapter.updatedAt = now();
      const story = db.stories.find(item => item.id === chapter.storyId);
      if (story) refreshStoryChapterMetadata(db, story);
      if (!wasPublic && story) notifyChapterPublished(db, story, chapter, admin.id);
      const after = chapterAdminSummary(db, chapter);
      const action = body.status === 'rejected' ? 'reject_chapter' : body.status === 'hidden' ? 'hide_chapter' : ['approved', 'published'].includes(body.status) ? 'approve_chapter' : 'update_chapter_status';
      logAdminAction(db, admin, action, 'chapter', chapter.id, before, after, chapter.rejectionReason || '');
      await persistDb(db, { prune: false, only: ['stories', 'chapters', 'notifications', 'adminLogs'] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 200, { chapter: after });
    }

    const adminChapterUpdateParams = match(pathname, '/api/admin/chapters/:id');
    if (adminChapterUpdateParams && req.method === 'PUT') {
      const admin = requireAdmin(req, res, db);
      if (!admin) return;
      requestPerf.mark('auth');
      const chapter = db.chapters.find(item => item.id === adminChapterUpdateParams.id);
      if (!chapter) return notFound(res);
      const body = await parseBody(req);
      const story = db.stories.find(item => item.id === chapter.storyId);
      const before = chapterAdminSummary(db, chapter);
      if (body.number !== undefined) {
        const nextNumber = Number(body.number);
        if (!Number.isFinite(nextNumber) || nextNumber <= 0) return badRequest(res, 'So chuong khong hop le.');
        if (chapterNumberExists(db, chapter.storyId, nextNumber, chapter.id)) return badRequest(res, 'So chuong da ton tai trong truyen nay.');
        chapter.number = nextNumber;
      }
      try {
        ['title','content','preview'].forEach(key => {
          if (body[key] !== undefined) chapter[key] = validateCleanText(String(body[key]), `chapter.${key}`);
        });
      } catch (error) {
        return badRequest(res, error.message);
      }
      if (body.isPremium !== undefined || body.vip !== undefined) chapter.isPremium = Boolean(body.isPremium ?? body.vip);
      if (body.price !== undefined) chapter.price = Number(body.price);
      const wasPublic = isPublicChapter(chapter);
      if (body.status !== undefined) {
        if (!VALID_CHAPTER_STATUSES.includes(body.status)) return badRequest(res, 'Trang thai chuong khong hop le.');
        chapter.status = body.status;
        if (body.status === 'rejected') chapter.rejectionReason = String(body.rejectionReason || 'Can chinh sua truoc khi duyet.').slice(0, 500);
        if (['approved', 'published'].includes(body.status)) chapter.rejectionReason = '';
      }
      const publishError = publicChapterError(chapter, chapter.status);
      if (publishError) return badRequest(res, publishError);
      if (body.scheduledAt !== undefined) {
        const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
        if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return badRequest(res, 'scheduledAt khong hop le.');
        chapter.scheduledAt = scheduledAt ? scheduledAt.toISOString() : '';
      }
      if (body.password !== undefined) chapter.password = String(body.password || '');
      if (body.content !== undefined) chapter.wordCount = wordCount(chapter.content);
      requestPerf.mark('validate');
      chapter.updatedAt = now();
      if (story) refreshStoryChapterMetadata(db, story);
      if (!wasPublic && story) notifyChapterPublished(db, story, chapter, admin.id);
      const after = chapterAdminSummary(db, chapter);
      logAdminAction(db, admin, 'update_chapter', 'chapter', chapter.id, before, after, '');
      await persistDb(db, { prune: false, only: ['stories', 'chapters', 'notifications', 'adminLogs'] });
      requestPerf.mark('db');
      requestPerf.log();
      return send(res, 200, { chapter: after });
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
      if (story) refreshStoryChapterMetadata(db, story);
      logAdminAction(db, admin, 'delete_chapter', 'chapter', chapter.id, chapter, null, '');
      await persistDb(db);
      return send(res, 200, { ok: true });
    }

return notFound(res);
    };

    return await (req.method === 'GET' ? runDbRequest() : dataStore.withLock(runDbRequest));
  } catch (error) {
    console.error(error);
    if (isDatabaseAvailabilityError(error)) {
      return send(res, 503, {
        message: 'Database temporarily unavailable',
        error: error.message || 'Database request failed'
      });
    }
    return send(res, 500, { message: error.message || 'Lỗi máy chủ.' });
  }
}

function normalizeCategories(input) {
  if (Array.isArray(input)) return input.map((item, index) => validateCleanText(String(item).trim(), `categories[${index}]`)).filter(Boolean);
  return String(input || '').split(',').map((item, index) => validateCleanText(item.trim(), `categories[${index}]`)).filter(Boolean);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isGmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return isEmail(email) && email.endsWith('@gmail.com');
}

function parsePositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function validateStoryInput(body) {
  try {
    normalizeIncomingTextFields(body, ['title', 'author', 'description', 'translator', 'language', 'rejectionReason', 'rejectReason'], 'story');
  } catch (error) {
    return error.message;
  }
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

function validateChapterInput(body, status = body.status || body.mode || 'draft') {
  try {
    normalizeIncomingTextFields(body, ['title', 'content', 'preview', 'rejectionReason'], 'chapter');
  } catch (error) {
    return error.message;
  }
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  const normalizedStatus = normalizeAuthorChapterStatus(status, status);
  const publishError = isPublishChapterStatus(normalizedStatus) ? publicChapterContentError(content) : '';
  if (publishError && title && content) return publishError;
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
    id, ownerId: 'u_admin', slug, title, author, cover, description, status, premium, price, featured, views, rating, follows, categories,
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
        content: lorem(`${story.title} - Chương ${number}`, premiumChapter ? 'Cao trào của câu chuyện dần hé lộ, các bí mật cũ được kết nối với lựa chọn quyết định của nhân vật chính.' : 'Chương mở ra bằng những biến cố đầu tiên, đưa nhân vật chính bước vào hành trình mới.'),
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
      { id: 'u_admin', name: 'Quản trị viên', username: 'quantri', email: 'quantri.daudotruyen@gmail.com', role: 'admin', seeds: 999, avatar: '', cover: '', socialLinks: {}, preferences: defaultAccountPreferences(), notificationPreferences: defaultNotificationPreferences(), tokenVersion: 0, createdAt: now(), salt: adminPass.salt, passwordHash: adminPass.passwordHash },
      { id: 'u_user', name: 'Bạn đọc Đậu Đỏ', username: 'bandoc', email: 'bandoc.daudotruyen@gmail.com', role: 'user', seeds: 80, avatar: '', cover: '', socialLinks: {}, preferences: defaultAccountPreferences(), notificationPreferences: defaultNotificationPreferences(), tokenVersion: 0, createdAt: now(), salt: userPass.salt, passwordHash: userPass.passwordHash }
    ],
    stories,
    chapters,
    bookmarks: [{ id: 'bm_seed_1', userId: 'u_user', storyId: 's1', createdAt: now() }],
    follows: [{ id: 'flw_seed_1', userId: 'u_user', storyId: 's7', createdAt: now() }],
    history: [{ id: 'his_seed_1', userId: 'u_user', storyId: 's1', chapterId: 'c_s1_2', chapterNumber: 2, updatedAt: now() }],
    purchases: [{ id: 'pur_seed_1', userId: 'u_user', storyId: 's1', chapterId: 'c_s1_4', price: 8, createdAt: now() }],
    transactions: [
      { id: 'txn_seed_1', userId: 'u_user', type: 'bonus', amount: 80, note: 'Đậu khởi tạo', createdAt: now() },
      { id: 'txn_seed_2', userId: 'u_user', storyId: 's1', chapterId: 'c_s1_4', price: 8, type: 'purchase', amount: -8, note: 'Mở khóa Đấu Phá Thương Khung chương 4', createdAt: now() }
    ],
    comments: [
      { id: 'cmt_seed_1', storyId: 's1', userId: 'u_user', body: 'Truyện mở đầu rất cuốn, đoạn cao trào đọc rất đã.', createdAt: now() }
    ],
    ratings: [
      { id: 'rate_seed_1', storyId: 's1', userId: 'u_user', value: 5, createdAt: now(), updatedAt: now() }
    ],
    viewEvents: [],
    notifications: [
      { id: 'noti_seed_1', userId: 'u_user', type: 'system', title: 'Chào mừng đến Đậu Đỏ Truyện', body: 'Bạn đã nhận Đậu khởi tạo để đọc chương trả phí.', link: '/wallet', read: false, createdAt: now() }
    ],
    reports: [],
    newsletters: []
  };
}

if (require.main === module) {
  http.createServer(handle).listen(PORT, () => {
    console.log(`Dau Do Truyen API running at http://localhost:${PORT}`);
  });
}

module.exports = {
  createSeedDb,
  hashPassword,
  slugify,
  ensureDbShape,
  handle,
  resetDataStore: dataStore.reset,
  getDataStoreSnapshot: dataStore.snapshot
};
