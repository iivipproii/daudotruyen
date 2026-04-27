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

async function uploadCoverImage(file, context = {}) {
  const path = storagePathForCover(file, context);

  if (STORAGE_PROVIDER === 'supabase') {
    const supabase = getSupabase();
    const result = await supabase.storage
      .from(COVER_BUCKET)
      .upload(path, file.data || file.buffer, {
        contentType: file.mimeType || file.type || 'application/octet-stream',
        upsert: false
      });
    if (result.error) throw new Error(result.error.message);
    return { path, url: getPublicUrl(path) };
  }

  return { path, url: getPublicUrl(path) };
}

async function deleteImage(path) {
  if (!path || STORAGE_PROVIDER !== 'supabase') return;
  const result = await getSupabase().storage.from(COVER_BUCKET).remove([path]);
  if (result.error) throw new Error(result.error.message);
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
  deleteImage,
  getPublicUrl,
  COVER_BUCKET
};
