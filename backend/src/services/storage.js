const crypto = require('crypto');
const { put, del } = require('@vercel/blob');
const { getSupabase } = require('../supabase');

const COVER_BUCKET = process.env.SUPABASE_COVER_BUCKET || 'story-covers';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_STORAGE_BASE_URL || '').replace(/\/+$/, '');
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || (process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : process.env.SUPABASE_URL ? 'supabase' : 'local');
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (process.env.NODE_ENV === 'production' && STORAGE_PROVIDER === 'local') {
  throw new Error('Production storage requires Vercel Blob or Supabase. Set BLOB_READ_WRITE_TOKEN or Supabase storage env vars.');
}

if (process.env.NODE_ENV === 'production' && STORAGE_PROVIDER === 'vercel-blob' && !BLOB_TOKEN) {
  throw new Error('BLOB_READ_WRITE_TOKEN must be set when STORAGE_PROVIDER=vercel-blob.');
}

function extensionForMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function safePathPart(value, fallback) {
  return String(value || fallback || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

function storagePathForCover(file, { storyId, userId } = {}) {
  const storyPart = safePathPart(storyId || 'draft', 'draft');
  const userPart = safePathPart(userId || 'anonymous', 'anonymous');
  const ext = extensionForMime(file.mimeType || file.type);
  const nonce = crypto.randomBytes(6).toString('hex');
  return `covers/${storyPart}/${Date.now()}-${userPart}-${nonce}.${ext}`;
}

function storagePathForAvatar(file, { userId } = {}) {
  const userPart = safePathPart(userId || 'anonymous', 'anonymous');
  const ext = extensionForMime(file.mimeType || file.type);
  const nonce = crypto.randomBytes(6).toString('hex');
  return `avatars/${userPart}/${Date.now()}-${nonce}.${ext}`;
}

function humanizeStorageError(error) {
  const message = String(error?.message || '').trim();
  if (!message) return `Upload ảnh thất bại với bucket ${COVER_BUCKET}.`;
  if (/bucket/i.test(message) && /not found|does not exist/i.test(message)) {
    return `Thiếu bucket ${COVER_BUCKET}.`;
  }
  if (/mime type/i.test(message)) {
    return `Loại file không được hỗ trợ: ${message}`;
  }
  if (/duplicate/i.test(message)) {
    return 'Tên file ảnh bị trùng. Vui lòng thử lại.';
  }
  return `Upload ảnh thất bại: ${message}`;
}

async function uploadImage(file, path) {
  const contentType = file.mimeType || file.type || 'application/octet-stream';
  const body = file.data || file.buffer;

  if (STORAGE_PROVIDER === 'vercel-blob') {
    if (!BLOB_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required for Vercel Blob uploads.');
    const blob = await put(path, body, {
      access: 'public',
      contentType,
      token: BLOB_TOKEN
    });
    return { path: blob.pathname || path, url: blob.url };
  }

  if (STORAGE_PROVIDER === 'supabase') {
    const supabase = getSupabase();
    const result = await supabase.storage
      .from(COVER_BUCKET)
      .upload(path, body, {
        contentType,
        upsert: false
      });
    if (result.error) throw new Error(humanizeStorageError(result.error));
    return { path, url: getPublicUrl(path) };
  }

  return { path, url: getPublicUrl(path) };
}

async function uploadCoverImage(file, context = {}) {
  return uploadImage(file, storagePathForCover(file, context));
}

async function uploadAvatarImage(file, context = {}) {
  return uploadImage(file, storagePathForAvatar(file, context));
}

async function deleteImage(path) {
  if (!path) return;
  if (STORAGE_PROVIDER === 'vercel-blob') {
    if (!BLOB_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required for Vercel Blob deletes.');
    await del(path, { token: BLOB_TOKEN });
    return;
  }
  if (STORAGE_PROVIDER !== 'supabase') return;
  const result = await getSupabase().storage.from(COVER_BUCKET).remove([path]);
  if (result.error) throw new Error(result.error.message);
}

function pathFromPublicUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) return text.replace(/^\/+/, '');
  try {
    const parsed = new URL(text);
    const marker = `/storage/v1/object/public/${COVER_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex !== -1) {
      return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    }
    const publicBase = PUBLIC_BASE_URL ? new URL(PUBLIC_BASE_URL) : null;
    if (publicBase && parsed.origin === publicBase.origin && parsed.pathname.startsWith(publicBase.pathname.replace(/\/+$/, '') + '/')) {
      return decodeURIComponent(parsed.pathname.slice(publicBase.pathname.replace(/\/+$/, '').length + 1));
    }
    if (STORAGE_PROVIDER === 'vercel-blob') return text;
  } catch {
    return '';
  }
  return '';
}

async function deleteImageByUrl(url) {
  const path = pathFromPublicUrl(url);
  if (!path) return;
  await deleteImage(path);
}

function getPublicUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/${path.replace(/^\/+/, '')}`;
  if (STORAGE_PROVIDER === 'supabase') {
    const { data } = getSupabase().storage.from(COVER_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
  return `http://localhost:${process.env.PORT || 4000}/storage/${path}`;
}

module.exports = {
  uploadCoverImage,
  uploadAvatarImage,
  deleteImage,
  deleteImageByUrl,
  getPublicUrl,
  COVER_BUCKET
};
