const CORRUPT_TEXT_PATTERN = /[\uFFFD]|\u00C3|\u00C2(?:[\s\u00a0.,;:!?'"”’)]|$)|\u00E2\u20AC|\u00C4[\u2018\u0090]?|\u00E1[\u00BA\u00BB]|\u00C6[\u00B0\u00A1]|\u00C5|\u02DC/;
const REPLACEMENT_PATTERN = /[\uFFFD]/;

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
  return typeof value === 'string' && CORRUPT_TEXT_PATTERN.test(value);
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
    return hasCorruptText(repaired) ? value : repaired;
  } catch {
    return value;
  }
}

function validateCleanText(value, context = 'text') {
  if (typeof value !== 'string') return normalizeText(value);
  const normalized = normalizeText(value);
  if (hasCorruptText(normalized)) {
    const preview = normalized.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`Corrupt Vietnamese text in ${context}: ${preview}`);
  }
  return normalized;
}

function validateTextFields(record, fields, context) {
  fields.forEach(field => {
    if (record[field] !== undefined && record[field] !== null) {
      record[field] = validateCleanText(String(record[field]), `${context}.${field}`);
    }
  });
  return record;
}

module.exports = {
  CORRUPT_TEXT_PATTERN,
  normalizeText,
  hasCorruptText,
  hasReplacementChar,
  repairMojibake,
  validateCleanText,
  validateTextFields
};
