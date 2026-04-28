const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('Missing frontend/dist. Run "npm run build" first.');
  process.exit(1);
}

const forbiddenPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /your-service-role-key/i,
  /service_role/i
];

const files = [];

function walk(currentPath) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (/\.(js|css|html)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
}

walk(distDir);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      console.error(`Forbidden secret-like string matched in bundle: ${pattern} at ${file}`);
      process.exit(1);
    }
  }
}

console.log(`OK: scanned ${files.length} built files, no service role markers found.`);
