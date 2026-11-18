// Run real statements through the parser in Node and check they reconcile.
// Usage: npm run check-statements -- statement.pdf [export.csv export.ofx export.qif ...]
// Add --tx to list every transaction read.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseStatementLines, parseTextStatement, pdfToLines, type PdfJsLike, type ParseResult } from '../src/parser';

const args = process.argv.slice(2);
const listTx = args.includes('--tx');
const files = args.filter(a => a !== '--tx');
if (!files.length) {
  console.log('Usage: npm run check-statements -- statement.pdf [more files] [--tx]');
  process.exit(1);
}

let pdfjs: PdfJsLike | null = null;
let bad = 0;
for (const f of files) {
  let r: ParseResult;
  if (/\.pdf$/i.test(f)) {
    pdfjs ??= (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
    r = parseStatementLines(await pdfToLines(pdfjs, new Uint8Array(readFileSync(f))));
  } else r = parseTextStatement(readFileSync(f, 'utf8'), basename(f));
  const inn = r.tx.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
  const out = r.tx.filter(t => t.amt < 0).reduce((s, t) => s - t.amt, 0);
  const recon = r.recon ? `${r.recon.ok ? 'yes' : 'NO'} (diff ${r.recon.diff})` : 'n/a';
  if (r.recon && !r.recon.ok) bad++;
  console.log(`${f}\n  bank=${r.bank} account=${r.account} transactions=${r.tx.length} opening=${r.opening} closing=${r.closing}`);
  console.log(`  in=${inn.toFixed(2)} out=${out.toFixed(2)} reconciles=${recon}`);
  for (const w of r.warnings) console.log('  warning: ' + w);
  if (listTx) for (const t of r.tx) console.log(`    ${t.d} ${t.amt.toFixed(2).padStart(11)} ${t.fee ? 'fee ' : '    '}${t.desc}`);
}
process.exit(bad ? 1 : 0);
