const fs = require('fs');
const path = require('path');
const { createSeedDb } = require('./server');
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to reset seed JSON while NODE_ENV=production.');
}
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.writeFileSync(DB_PATH, JSON.stringify(createSeedDb(), null, 2));
console.log('Đã reset dữ liệu cục bộ:', DB_PATH);
