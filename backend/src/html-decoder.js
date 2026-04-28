function charsetFromContentType(contentType = '') {
  return String(contentType).match(/charset=([^;]+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
}

function charsetFromHtmlBytes(buffer) {
  const ascii = Buffer.from(buffer).subarray(0, 4096).toString('latin1');
  return ascii.match(/<meta[^>]+charset=["']?\s*([^\s"'/>;]+)/i)?.[1]?.trim() ||
    ascii.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s/>]+)/i)?.[1]?.trim() ||
    '';
}

function normalizeCharset(charset = '') {
  const value = charset.toLowerCase().replace(/_/g, '-');
  if (value === 'utf8') return 'utf-8';
  if (value === 'windows-1258' || value === 'cp1258') return 'windows-1258';
  if (value === 'windows-1252' || value === 'cp1252' || value === 'latin1' || value === 'iso-8859-1') return 'windows-1252';
  return value || 'utf-8';
}

function decodeHtmlBytes(buffer, contentType = '') {
  const charset = normalizeCharset(charsetFromContentType(contentType) || charsetFromHtmlBytes(buffer) || 'utf-8');
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer).normalize('NFC');
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer).normalize('NFC');
  }
}

async function fetchHtmlDecoded(url, options = {}) {
  const response = await fetch(url, options);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const html = decodeHtmlBytes(bytes, response.headers.get('content-type') || '');
  return { response, html, url };
}

module.exports = {
  charsetFromContentType,
  charsetFromHtmlBytes,
  decodeHtmlBytes,
  fetchHtmlDecoded,
  normalizeCharset
};
