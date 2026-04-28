require('dotenv').config();

const fs = require('fs');
const path = require('path');

process.env.DATA_STORE = 'supabase';

const { createSeedDb } = require('./server');
const dataStore = require('./db');
const { validateTextFields } = require('./text-quality');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function readJsonDb() {
  if (!fs.existsSync(DB_PATH)) {
    return createSeedDb();
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function validateImportPayload(db) {
  (db.stories || []).forEach(story => {
    validateTextFields(story, ['title', 'author', 'translator', 'description', 'language', 'rejectionReason'], `story:${story.id || story.slug}`);
    (story.categories || []).forEach((category, index) => validateTextFields({ category }, ['category'], `story:${story.id || story.slug}.categories[${index}]`));
    (story.tags || []).forEach((tag, index) => validateTextFields({ tag }, ['tag'], `story:${story.id || story.slug}.tags[${index}]`));
  });
  (db.chapters || []).forEach(chapter => {
    validateTextFields(chapter, ['title', 'content', 'preview', 'rejectionReason'], `chapter:${chapter.id || chapter.storyId}`);
  });
  return db;
}

async function main() {
  const source = validateImportPayload(readJsonDb());
  const current = await dataStore.loadDb();
  const shouldSeedUsers = !current.users || current.users.length === 0;
  const payload = shouldSeedUsers ? source : {
    ...source,
    users: source.users && source.users.length ? source.users : createSeedDb().users
  };

  await dataStore.saveDb(payload, { prune: false });

  const migrated = await dataStore.loadDb();
  console.log(JSON.stringify({
    ok: true,
    source: fs.existsSync(DB_PATH) ? DB_PATH : 'createSeedDb()',
    users: migrated.users.length,
    stories: migrated.stories.length,
    chapters: migrated.chapters.length,
    comments: migrated.comments.length,
    transactions: migrated.transactions.length
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
