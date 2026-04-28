const fs = require('fs/promises');
const path = require('path');

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function saveFile(filename, buffer) {
  await ensureUploadDir();

  const safeName = String(filename || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '-');

  const finalName = `${Date.now()}-${safeName}`;
  const filePath = path.join(UPLOAD_DIR, finalName);

  await fs.writeFile(filePath, buffer);

  return {
    filename: finalName,
    path: filePath,
    url: `/uploads/${finalName}`,
  };
}

async function deleteFile(filename) {
  if (!filename) return false;

  const filePath = path.join(UPLOAD_DIR, filename);

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

function getPublicUrl(filename) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

module.exports = {
  saveFile,
  deleteFile,
  getPublicUrl,
  ensureUploadDir,
};