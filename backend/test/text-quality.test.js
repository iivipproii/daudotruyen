const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasCorruptText,
  normalizeText,
  repairMojibake,
  validateCleanText,
  validateNoTestPlaceholder
} = require('../src/text-quality');
const { decodeHtmlBytes } = require('../src/html-decoder');

const cleanVietnamese = 'B\u00f9i Hi\u1ec3u D\u1ee5i t\u1ef1 nh\u1eadn h\u1ecd B\u00f9i, k\u1ebft h\u00f4n b\u1ed1n n\u0103m v\u1edbi C\u1ed1 Th\u1ea7n.';

test('Vietnamese text remains valid NFC after import validation', () => {
  assert.equal(normalizeText(cleanVietnamese), cleanVietnamese.normalize('NFC'));
  assert.equal(validateCleanText(cleanVietnamese, 'story.description'), cleanVietnamese);
  assert.equal(hasCorruptText(cleanVietnamese), false);
  assert.equal(hasCorruptText('th\u00e2n ph\u1eadn m\u1edbi v\u00e0 \u00e2m m\u01b0u'), false);
  assert.equal(hasCorruptText('\u00c2n nh\u00e2n c\u1ee7a Qu\u1ed1c C\u00f4ng Ph\u1ee7'), false);
});

test('mojibake can be detected and repaired before storing', () => {
  const broken = 'B\u00c3\u00b9i Hi\u00e1\u00bb\u0192u D\u00e1\u00bb\u00a5i t\u00e1\u00bb\u00b1 nh\u00e1\u00ba\u00adn h\u00e1\u00bb\u008d B\u00c3\u00b9i';
  const repaired = repairMojibake(broken);
  assert.equal(hasCorruptText(broken), true);
  assert.equal(repaired, 'B\u00f9i Hi\u1ec3u D\u1ee5i t\u1ef1 nh\u1eadn h\u1ecd B\u00f9i');
  assert.equal(hasCorruptText(repaired), false);
});

test('production mojibake samples can be repaired for public API output', () => {
  const samples = [
    ['C\u00e1\u00bb\u2018 T\u00e1\u00bb\u2022ng', 'C\u1ed1 T\u1ed5ng'],
    ['B\u00c3\u00b9i Hi \u00e2\u20ac\u201c \u00c4\u2018\u00e1\u00ba\u00a1i ti\u00e1\u00bb\u0192u th\u00c6\u00b0', 'B\u00f9i Hi \u2013 \u0111\u1ea1i ti\u1ec3u th\u01b0'],
    ['\u00c4\u0090\u00c3\u00b4 \u00c4\u0090\u00c3\u00b4 B\u00e1\u00ba\u00a3o', '\u0110\u00f4 \u0110\u00f4 B\u1ea3o'],
    ['Ti\u00e1\u00ba\u00bfng Vi\u00e1\u00bb\u2021t', 'Ti\u1ebfng Vi\u1ec7t']
  ];

  samples.forEach(([broken, expected]) => {
    const repaired = repairMojibake(broken);
    assert.equal(repaired, expected);
    assert.equal(hasCorruptText(repaired), false);
  });
});

test('replacement character is rejected and must be re-crawled', () => {
  const broken = 'B\uFFFDi Hi';
  assert.equal(hasCorruptText(broken), true);
  assert.throws(() => validateCleanText(broken, 'story.description'), /Corrupt Vietnamese text/);
});

test('Supabase test placeholders are rejected before publishing', () => {
  assert.throws(
    () => validateNoTestPlaceholder('Nội dung chương test từ Supabase.', 'chapter.content'),
    /Test placeholder/
  );
});

test('HTML import decoder keeps Vietnamese text from declared charset bytes', () => {
  const bytes = Buffer.from(cleanVietnamese, 'utf8');
  const decoded = decodeHtmlBytes(bytes, 'text/html; charset=utf-8');
  assert.equal(decoded, cleanVietnamese);
  assert.equal(hasCorruptText(decoded), false);
});
