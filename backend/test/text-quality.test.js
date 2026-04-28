const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasCorruptText,
  normalizeText,
  repairMojibake,
  validateCleanText
} = require('../src/text-quality');
const { decodeHtmlBytes } = require('../src/html-decoder');

const cleanVietnamese = 'B\u00f9i Hi\u1ec3u D\u1ee5i t\u1ef1 nh\u1eadn h\u1ecd B\u00f9i, k\u1ebft h\u00f4n b\u1ed1n n\u0103m v\u1edbi C\u1ed1 Th\u1ea7n.';

test('Vietnamese text remains valid NFC after import validation', () => {
  assert.equal(normalizeText(cleanVietnamese), cleanVietnamese.normalize('NFC'));
  assert.equal(validateCleanText(cleanVietnamese, 'story.description'), cleanVietnamese);
  assert.equal(hasCorruptText(cleanVietnamese), false);
});

test('mojibake can be detected and repaired before storing', () => {
  const broken = 'B\u00c3\u00b9i Hi\u00e1\u00bb\u0192u D\u00e1\u00bb\u00a5i t\u00e1\u00bb\u00b1 nh\u00e1\u00ba\u00adn h\u00e1\u00bb\u008d B\u00c3\u00b9i';
  const repaired = repairMojibake(broken);
  assert.equal(hasCorruptText(broken), true);
  assert.equal(repaired, 'B\u00f9i Hi\u1ec3u D\u1ee5i t\u1ef1 nh\u1eadn h\u1ecd B\u00f9i');
  assert.equal(hasCorruptText(repaired), false);
});

test('replacement character is rejected and must be re-crawled', () => {
  const broken = 'B\uFFFDi Hi';
  assert.equal(hasCorruptText(broken), true);
  assert.throws(() => validateCleanText(broken, 'story.description'), /Corrupt Vietnamese text/);
});

test('HTML import decoder keeps Vietnamese text from declared charset bytes', () => {
  const bytes = Buffer.from(cleanVietnamese, 'utf8');
  const decoded = decodeHtmlBytes(bytes, 'text/html; charset=utf-8');
  assert.equal(decoded, cleanVietnamese);
  assert.equal(hasCorruptText(decoded), false);
});
