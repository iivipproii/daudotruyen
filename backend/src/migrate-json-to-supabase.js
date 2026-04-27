require('dotenv').config();

const fs = require('fs');
const path = require('path');

process.env.DATA_STORE = 'supabase';

const { createSeedDb } = require('./server');
const dataStore = require('./db');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function readJsonDb() {
  if (!fs.existsSync(DB_PATH)) {
    return createSeedDb();
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

async function main() {
  const source = readJsonDb();
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
