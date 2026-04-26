const fs = require('fs');
const path = require('path');
const { createSeedDb } = require('./server');
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.writeFileSync(DB_PATH, JSON.stringify(createSeedDb(), null, 2));
console.log('Đã reset dữ liệu cục bộ:', DB_PATH);
