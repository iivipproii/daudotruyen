require('dotenv').config();

const dataStore = require('../src/db');
const { hasCorruptText, hasReplacementChar, repairMojibake, normalizeText } = require('../src/text-quality');

const TEXT_FIELDS = {
  stories: ['title', 'author', 'translator', 'description', 'language', 'rejectionReason'],
  chapters: ['title', 'content', 'preview', 'rejectionReason'],
  comments: ['body'],
  notifications: ['title', 'body'],
  adminNotifications: ['title', 'body']
};

function sourceUrlFor(record) {
  return record.sourceUrl || record.sourceURL || record.url || record.crawlUrl || record.originalUrl || record.extra?.sourceUrl || '';
}

function scanRecord(kind, record) {
  const fields = TEXT_FIELDS[kind] || [];
  const issues = [];
  const patches = {};

  fields.forEach(field => {
    const value = record[field];
    if (typeof value !== 'string') return;
    const normalized = normalizeText(value);
    if (normalized !== value) patches[field] = normalized;
    if (!hasCorruptText(normalized)) return;

    const repaired = repairMojibake(normalized);
    const canRepair = repaired !== normalized && !hasCorruptText(repaired);
    if (canRepair) patches[field] = repaired;
    issues.push({
      field,
      hasReplacement: hasReplacementChar(normalized),
      canRepair,
      preview: normalized.slice(0, 120).replace(/\s+/g, ' ')
    });
  });

  return { issues, patches };
}

async function main() {
  const dryRun = !process.argv.includes('--write');
  const db = await dataStore.loadDb();
  const report = {
    dryRun,
    clean: 0,
    errored: 0,
    repaired: 0,
    cannotRepair: 0,
    missingSourceUrl: 0,
    byTable: {}
  };

  Object.entries(TEXT_FIELDS).forEach(([kind]) => {
    const rows = db[kind] || [];
    report.byTable[kind] = { clean: 0, errored: 0, repaired: 0, cannotRepair: 0 };
    rows.forEach(record => {
      const result = scanRecord(kind, record);
      const sourceUrl = sourceUrlFor(record);
      if (!result.issues.length) {
        report.clean += 1;
        report.byTable[kind].clean += 1;
        return;
      }

      report.errored += 1;
      report.byTable[kind].errored += 1;
      const canApplyPatch = Object.keys(result.patches).length > 0 && result.issues.every(issue => issue.canRepair || !issue.hasReplacement);
      if (canApplyPatch) {
        report.repaired += 1;
        report.byTable[kind].repaired += 1;
        if (!dryRun) Object.assign(record, result.patches);
      } else {
        report.cannotRepair += 1;
        report.byTable[kind].cannotRepair += 1;
        if (!sourceUrl) report.missingSourceUrl += 1;
      }

      console.warn(JSON.stringify({
        table: kind,
        id: record.id,
        sourceUrl: sourceUrl || null,
        action: canApplyPatch ? (dryRun ? 'would-repair' : 'repaired') : 'needs-recrawl',
        issues: result.issues
      }));
    });
  });

  if (!dryRun && report.repaired > 0) {
    await dataStore.saveDb(db, { prune: false });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
