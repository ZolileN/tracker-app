// Look at a statement layout someone shared from the app ("Share this statement's layout") and try the parser on it.
// Amounts are masked as 9s, so totals will not reconcile; what this shows is whether the table, its columns
// and its rows are found. To support a new layout, copy the relevant lines into tests/fixtures.ts with made-up values.
// Usage: npm run check-layout -- statement-layout.json [--lines]
import { readFileSync } from 'node:fs';
import { parseStatementLines } from '../src/parser';
import { reportLines, type LayoutReport } from '../src/parser/redact';

const file = process.argv[2];
if (!file) { console.log('Usage: npm run check-layout -- statement-layout.json [--lines]'); process.exit(1); }
const r = JSON.parse(readFileSync(file, 'utf8')) as LayoutReport;
if (r.kind !== 'budget-tracker-layout') { console.log('Not a layout file from the app.'); process.exit(1); }

console.log(`Shared from app ${r.app} on ${r.created}: ${r.file}`);
console.log(`On their device: bank=${r.result.bank} transactions=${r.result.transactions} reconciles=${r.result.reconciles}`);
for (const w of r.result.warnings) console.log('  warning: ' + w);
if (r.textHead) { console.log('\nFirst rows (masked):'); r.textHead.slice(0, 25).forEach(l => console.log('  ' + l)); }
if (r.lines) {
  const lines = reportLines(r);
  const res = parseStatementLines(lines);
  console.log(`\nParser on the masked layout: bank=${res.bank} rows=${res.tx.length}`);
  for (const w of res.warnings) console.log('  warning: ' + w);
  const heads = lines.filter(l => /\b(date|balance|amount|debit|credit)\b/i.test(l.text)).slice(0, 5);
  console.log('\nLines that look like column headings:');
  heads.forEach(l => console.log(`  p${l.page} y${l.y} | ` + l.items.map(i => `[${i.x}-${i.r}]${i.s}`).join(' ')));
  if (process.argv.includes('--lines')) {
    console.log('\nAll lines:');
    lines.forEach((l, i) => console.log(`${i} p${l.page} y${l.y} | ` + l.items.map(it => `[${it.x}-${it.r}]${it.s}`).join(' ')));
  }
}
