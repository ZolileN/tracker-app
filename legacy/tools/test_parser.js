// Parse real statements in Node and check they reconcile.
// PDFs need pdf.js:  npm i pdfjs-dist@3.11.174
// Usage: node tools/test_parser.js statement1.pdf [export.csv export.ofx export.qif ...]
const fs = require('fs');
const P = require('../parser.js');
let pdfjs = null;
(async () => {
  for (const f of process.argv.slice(2)) {
    let r;
    if (/\.pdf$/i.test(f)) {
      pdfjs = pdfjs || require('pdfjs-dist/legacy/build/pdf.js');
      r = P.parseStatementLines(await P.pdfToLines(pdfjs, new Uint8Array(fs.readFileSync(f))));
    } else r = P.parseTextStatement(fs.readFileSync(f, 'utf8'), f.split('/').pop());
    const tx = r.tx || [];
    const inn = tx.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
    const out = tx.filter(t => t.amt < 0).reduce((s, t) => s - t.amt, 0);
    console.log(`${f}\n  bank=${r.bank} account=${r.account} transactions=${tx.length} opening=${r.opening} closing=${r.closing}`);
    console.log(`  in=${inn.toFixed(2)} out=${out.toFixed(2)} reconciles=${r.recon ? r.recon.ok + ' (diff ' + r.recon.diff + ')' : 'n/a'}`);
    if (r.warnings.length) console.log('  warnings:', r.warnings);
  }
})();
