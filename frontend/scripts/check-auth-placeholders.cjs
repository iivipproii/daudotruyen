const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const banned = ['user@example.com', 'admin@example.com', 'you@example.com', 'example@email.com'];
const sourceFiles = [
  path.join(root, 'src', 'main.jsx'),
  path.join(root, 'src', 'components', 'account', 'AccountPages.jsx')
];
const distDir = path.join(root, 'dist');

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

const failures = [];
for (const file of [...sourceFiles, ...filesUnder(distDir)]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8').toLowerCase();
  for (const needle of banned) {
    if (text.includes(needle)) failures.push(`${path.relative(root, file)} contains ${needle}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Auth placeholder check passed.');
