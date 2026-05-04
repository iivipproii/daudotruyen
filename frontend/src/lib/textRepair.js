const cp1252Bytes = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f
};

const corruptPattern = /[\uFFFD]|Ã|Ä|Â|Æ|Å|áº|á»|â|Ë|ï¼/;
const severeCorruptPattern = /[\uFFFD]/g;

function corruptionScore(value = '') {
  const text = String(value);
  const markerMatches = text.match(/Ã|Ä|Â|Æ|Å|áº|á»|â|Ë|ï¼/g) || [];
  const replacementMatches = text.match(severeCorruptPattern) || [];
  return markerMatches.length + replacementMatches.length * 20;
}

export function hasCorruptText(value) {
  return typeof value === 'string' && corruptPattern.test(value);
}

export function repairText(value) {
  if (typeof value !== 'string') return value;
  const normalized = value.normalize('NFC');
  if (!hasCorruptText(normalized)) return normalized;

  try {
    const bytes = Array.from(normalized, char => {
      const code = char.charCodeAt(0);
      if (code <= 0xff) return code;
      return cp1252Bytes[char] || code;
    });
    const repaired = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)).normalize('NFC');
    return corruptionScore(repaired) < corruptionScore(normalized) ? repaired : normalized;
  } catch {
    return normalized;
  }
}

export function repairTextFields(record = {}, fields = []) {
  return fields.reduce((next, field) => {
    if (typeof next[field] === 'string') next[field] = repairText(next[field]);
    return next;
  }, { ...record });
}

export function repairTextArray(values) {
  return Array.isArray(values) ? values.map(repairText) : [];
}
