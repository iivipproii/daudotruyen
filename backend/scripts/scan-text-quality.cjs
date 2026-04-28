require('dotenv').config({ path: '../.env.local' });
require('dotenv').config();

const dataStore = require('../src/db');
const { hasCorruptText, hasTestPlaceholder } = require('../src/text-quality');

const TEXT_FIELDS = {
  stories: ['title', 'author', 'slug', 'description', 'translator'],
  chapters: ['title', 'content', 'preview']
};

async function main() {
  const db = await dataStore.loadDb();
  const issues = [];

  Object.entries(TEXT_FIELDS).forEach(([table, fields]) => {
    (db[table] || []).forEach(row => {
      fields.forEach(field => {
        const value = row[field];
        if (typeof value !== 'string') return;
        if (!hasCorruptText(value) && !hasTestPlaceholder(value)) return;
        issues.push({
          table,
          id: row.id,
          storyId: row.storyId || row.id,
          field,
          corruptEncoding: hasCorruptText(value),
          testPlaceholder: hasTestPlaceholder(value),
          preview: value.slice(0, 160).replace(/\s+/g, ' ')
        });
      });
    });
  });

  console.log(JSON.stringify({ ok: issues.length === 0, count: issues.length, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
