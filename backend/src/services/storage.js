const crypto = require('crypto');
const { getSupabase } = require('../supabase');

const COVER_BUCKET = process.env.SUPABASE_COVER_BUCKET || 'story-covers';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_STORAGE_BASE_URL || '').replace(/\/+$/, '');
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || (process.env.SUPABASE_URL ? 'supabase' : 'local');

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

async function uploadImage(file, objectPath) {
  if (STORAGE_PROVIDER === 'supabase') {
    const supabase = getSupabase();
    const result = await supabase.storage
      .from(COVER_BUCKET)
      .upload(objectPath, file.data || file.buffer, {
        contentType: file.mimeType || file.type || 'application/octet-stream',
        upsert: false
      });
    if (result.error) throw new Error(humanizeStorageError(result.error));
    return { path: objectPath, url: getPublicUrl(objectPath) };
  }

  return { path: objectPath, url: getPublicUrl(objectPath) };
}

async function uploadCoverImage(file, context = {}) {
  return uploadImage(file, storagePathForCover(file, context));
}

async function uploadAvatarImage(file, context = {}) {
  return uploadImage(file, storagePathForAvatar(file, context));
}

async function deleteImage(objectPath) {
  if (!objectPath || STORAGE_PROVIDER !== 'supabase') return;
  const result = await getSupabase().storage.from(COVER_BUCKET).remove([objectPath]);
  if (result.error) throw new Error(result.error.message);
}

function pathFromPublicUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) return text.replace(/^\/+/, '');
  try {
    const parsed = new URL(text);
    const bucketMarker = `/storage/v1/object/public/${COVER_BUCKET}/`;
    const bucketIndex = parsed.pathname.indexOf(bucketMarker);
    if (bucketIndex !== -1) {
      return decodeURIComponent(parsed.pathname.slice(bucketIndex + bucketMarker.length));
    }
    if (PUBLIC_BASE_URL) {
      const publicBase = new URL(PUBLIC_BASE_URL);
      const basePath = publicBase.pathname.replace(/\/+$/, '');
      if (parsed.origin === publicBase.origin && parsed.pathname.startsWith(`${basePath}/`)) {
        return decodeURIComponent(parsed.pathname.slice(basePath.length + 1));
      }
    }
  } catch {
    return '';
  }
  return '';
}

async function deleteImageByUrl(url) {
  const objectPath = pathFromPublicUrl(url);
  if (!objectPath) return;
  await deleteImage(objectPath);
}

function getPublicUrl(objectPath) {
  if (!objectPath) return '';
  if (/^https?:\/\//i.test(objectPath) || objectPath.startsWith('/')) return objectPath;
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/${objectPath.replace(/^\/+/, '')}`;
  if (STORAGE_PROVIDER === 'supabase') {
    const { data } = getSupabase().storage.from(COVER_BUCKET).getPublicUrl(objectPath);
    return data.publicUrl;
  }
  return `http://localhost:${process.env.PORT || 4000}/storage/${objectPath}`;
}

module.exports = {
  uploadCoverImage,
  uploadAvatarImage,
  deleteImage,
  deleteImageByUrl,
  getPublicUrl,
  COVER_BUCKET
};
