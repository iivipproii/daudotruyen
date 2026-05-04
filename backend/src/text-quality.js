const CORRUPT_TEXT_PATTERN = /[\uFFFD]|\u00C3[\u0080-\u00BF]|\u00C2(?:[\s\u00a0.,;:!?\"'\u201D\u2019)]|$)|\u00E2\u20AC|\u00C4[\u0080-\u00BF\u2018\u0090]?|\u00E1[\u00BA\u00BB]|\u00C6[\u00B0\u00A1]|\u00C5[\u0080-\u00BF]?|\u02DC|\u00E1\u00BA|\u00E1\u00BB|\u00CB[\u0080-\u00BF]?|\u00EF\u00BC/;
const REPLACEMENT_PATTERN = /[\uFFFD]/;
const TEST_PLACEHOLDER_PATTERN = /test\s+từ\s+supabase/i;

const CP1252_BYTES = {
  '\u20AC': 0x80,
  '\u201A': 0x82,
  '\u0192': 0x83,
  '\u201E': 0x84,
  '\u2026': 0x85,
  '\u2020': 0x86,
  '\u2021': 0x87,
  '\u02C6': 0x88,
  '\u2030': 0x89,
  '\u0160': 0x8a,
  '\u2039': 0x8b,
  '\u0152': 0x8c,
  '\u017D': 0x8e,
  '\u2018': 0x91,
  '\u2019': 0x92,
  '\u201C': 0x93,
  '\u201D': 0x94,
  '\u2022': 0x95,
  '\u2013': 0x96,
  '\u2014': 0x97,
  '\u02DC': 0x98,
  '\u2122': 0x99,
  '\u0161': 0x9a,
  '\u203A': 0x9b,
  '\u0153': 0x9c,
  '\u017E': 0x9e,
  '\u0178': 0x9f
};

function normalizeText(value) {
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

function hasCorruptText(value) {
  return corruptionScore(value) > 0;
}

function hasReplacementChar(value) {
  return typeof value === 'string' && REPLACEMENT_PATTERN.test(value);
}

function repairMojibake(value) {
  if (typeof value !== 'string' || hasReplacementChar(value) || !hasCorruptText(value)) return value;
  try {
    const bytes = Array.from(value, char => {
      const code = char.charCodeAt(0);
      if (code <= 0xff) return code;
      return CP1252_BYTES[char] || code;
    });
    const repaired = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)).normalize('NFC');
    return corruptionScore(repaired) < corruptionScore(value) ? repaired : value;
  } catch {
    return value;
  }
}

function corruptionScore(value = '') {
  if (typeof value !== 'string') return 0;
  const normalized = normalizeText(value);
  const markers = normalized.match(CORRUPT_TEXT_PATTERN) || [];
  const replacements = value.match(REPLACEMENT_PATTERN) || [];
  return markers.length + replacements.length * 20;
}

function validateCleanText(value, context = 'text') {
  if (typeof value !== 'string') return normalizeText(value);
  const normalized = normalizeText(value);
  const repaired = repairMojibake(normalized);
  if (corruptionScore(repaired) > 0) {
    const preview = repaired.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`Corrupt Vietnamese text in ${context}: ${preview}`);
  }
  return repaired;
}

function sanitizeChapterTextForBulk(value, context = 'chapter.content') {
  const source = normalizeText(String(value || ''));
  const repaired = repairMojibake(source);
  const warnings = [];
  let sanitized = repaired
    .replace(REPLACEMENT_PATTERN, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (repaired !== source) warnings.push(`${context}: Da tu sua ma tieng Viet.`);
  if (REPLACEMENT_PATTERN.test(repaired)) warnings.push(`${context}: Da loai ky tu hong.`);
  if (corruptionScore(sanitized) > 0) warnings.push(`${context}: Noi dung co dau hieu loi ma hoa nhung van duoc luu.`);
  return { text: sanitized.normalize('NFC'), warnings };
}

function hasTestPlaceholder(value) {
  return typeof value === 'string' && TEST_PLACEHOLDER_PATTERN.test(value);
}

function validateNoTestPlaceholder(value, context = 'text') {
  if (hasTestPlaceholder(value)) {
    throw new Error(`Test placeholder text is not allowed in ${context}.`);
  }
  return value;
}

function validateTextFields(record, fields, context) {
  fields.forEach(field => {
    if (record[field] !== undefined && record[field] !== null) {
      record[field] = validateNoTestPlaceholder(validateCleanText(String(record[field]), `${context}.${field}`), `${context}.${field}`);
    }
  });
  return record;
}

module.exports = {
  CORRUPT_TEXT_PATTERN,
  normalizeText,
  hasCorruptText,
  hasReplacementChar,
  hasTestPlaceholder,
  repairMojibake,
  corruptionScore,
  validateCleanText,
  sanitizeChapterTextForBulk,
  validateNoTestPlaceholder,
  validateTextFields
};
