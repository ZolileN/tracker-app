// Layout tests for the generic statement parser and the CSV / OFX / QIF importers.
// No PDFs needed: each fixture builds the positioned text lines that pdfToLines() would return,
// reproducing the layout traits of a bank's statement (column order, date style, sign style).
// These are synthetic data, not real statements; check real ones with tools/test_parser.js.
// Usage: node tools/test_layouts.js
const P = require('../parser.js');

let fails = 0, passes = 0;
function check(name, cond, info) { if (cond) passes++; else { fails++; console.log(`  FAIL ${name}${info !== undefined ? ' -> ' + JSON.stringify(info) : ''}`); } }

/* Build lines: L(page, y, [x, r, text], ...) */
function L(page, y, ...items) {
  const its = items.map(([x, r, s]) => ({ x, r, s })).sort((a, b) => a.x - b.x);
  return { page, y, items: its, text: its.map(i => i.s).join(' ') };
}
function expectStatement(name, lines, exp) {
  const r = P.parseStatementLines(lines);
  console.log(`${name}: bank=${r.bank} account=${r.account} tx=${r.tx.length} opening=${r.opening} closing=${r.closing} recon=${r.recon ? r.recon.ok : 'n/a'}${r.warnings.length ? ' warnings=' + JSON.stringify(r.warnings) : ''}`);
  if (exp.bank) check(name + ' bank', r.bank === exp.bank, r.bank);
  if (exp.n != null) check(name + ' count', r.tx.length === exp.n, r.tx.map(t => [t.d, t.amt, t.desc]));
  if (exp.recon) check(name + ' reconciles', r.recon && r.recon.ok, r.recon);
  if (exp.opening != null) check(name + ' opening', r.opening === exp.opening, r.opening);
  if (exp.closing != null) check(name + ' closing', r.closing === exp.closing, r.closing);
  (exp.tx || []).forEach((e, i) => {
    const t = r.tx[i] || {};
    for (const k in e) check(`${name} tx${i}.${k}`, k === 'desc' ? (t.desc || '').includes(e.desc) : t[k] === e[k], t);
  });
  check(name + ' no warnings', !exp.noWarn || !r.warnings.length, r.warnings);
  return r;
}

/* 1. Standard Bank style: Details | Service Fee | Debits | Credits | Date | Balance; dates "MM DD"; debits "150.00-"; "##" fee marker */
expectStatement('Standard Bank layout', [
  L(1, 800, [40, 300, 'The Standard Bank of South Africa Limited Reg. No. 1962/000738/06']),
  L(1, 780, [40, 330, 'Statement from 25 January 2025 to 24 February 2025']),
  L(1, 760, [40, 70, 'Details'], [250, 300, 'Service Fee'], [330, 365, 'Debits'], [400, 440, 'Credits'], [460, 480, 'Date'], [520, 560, 'Balance']),
  L(1, 745, [40, 190, 'BALANCE BROUGHT FORWARD'], [460, 480, '01 25'], [520, 560, '1 200.00']),
  L(1, 730, [40, 160, 'IB PAYMENT TO'], [320, 365, '3 500.00-'], [460, 480, '01 27'], [515, 560, '2 300.00-']),
  L(1, 720, [40, 120, 'LANDLORD RENT']),
  L(1, 705, [40, 200, 'MAGTAPE CREDIT SALARY ACME'], [395, 440, '15 000.00'], [460, 480, '01 28'], [515, 560, '12 700.00']),
  L(1, 690, [40, 230, 'MONTHLY MANAGEMENT FEE'], [270, 285, '##'], [335, 365, '7.50-'], [460, 480, '01 31'], [515, 560, '12 692.50']),
  L(1, 675, [40, 200, 'POS PURCHASE SHOPRITE'], [330, 365, '845.30-'], [460, 480, '02 03'], [515, 560, '11 847.20']),
  L(1, 660, [40, 200, 'BALANCE CARRIED FORWARD'], [515, 560, '11 847.20'])
], { bank: 'Standard Bank', n: 4, recon: true, opening: 1200, closing: 11847.2, noWarn: true, tx: [
  { d: '2025-01-27', amt: -3500, desc: 'IB PAYMENT TO LANDLORD RENT' },
  { d: '2025-01-28', amt: 15000 },
  { d: '2025-01-31', amt: -7.5, fee: true },
  { d: '2025-02-03', amt: -845.3, desc: 'SHOPRITE' }
] });

/* 2. GoTyme Bank (formerly TymeBank), headings and positions from a real statement:
   Date | Details | Fees*(-) | Credits (+) | Debits (-) | Running Balance; summary box "Opening balance R0". Row values are made up. */
expectStatement('GoTyme Bank, empty period', [
  L(1, 800, [313, 421, '30 Jellicoe Avenue, Rosebank 2196']), L(1, 790, [363, 421, 'www.gotyme.co.za']),
  L(1, 760, [18, 120, 'Bank Statement']),
  L(1, 740, [18, 130, 'Current account'], [300, 360, 'Opening balance'], [560, 575, 'R0']),
  L(1, 730, [18, 200, 'Period: 18 Aug 2026 - 17 Nov 2026'], [300, 360, 'Closing balance'], [560, 575, 'R0']),
  L(1, 700, [28, 45, 'Date'], [103, 125, 'Details'], [356, 381, 'Fees*(-)'], [410, 444, 'Credits (+)'], [472, 503, 'Debits (-)'], [531, 582, 'Running Balance']),
  L(1, 685, [233, 377, 'No transactions in this statement period.']),
  L(1, 40, [231, 345, 'GoTyme Bank Limited Reg. No.: 2015/231510/06'])
], { bank: 'GoTyme Bank', n: 0, opening: 0, closing: 0 });
expectStatement('GoTyme Bank layout', [
  L(1, 790, [363, 421, 'www.gotyme.co.za']),
  L(1, 740, [18, 130, 'Current account'], [300, 360, 'Opening balance'], [545, 575, 'R500.00']),
  L(1, 730, [18, 200, 'Period: 18 Aug 2026 - 17 Nov 2026'], [300, 360, 'Closing balance'], [540, 575, 'R2 199.01']),
  L(1, 700, [28, 45, 'Date'], [103, 125, 'Details'], [356, 381, 'Fees*(-)'], [410, 444, 'Credits (+)'], [472, 503, 'Debits (-)'], [531, 582, 'Running Balance']),
  L(1, 685, [28, 70, '20 Aug 2026'], [103, 200, 'Send money to Thabo'], [360, 381, 'R1.00'], [478, 503, 'R200.00'], [552, 582, 'R299.00']),
  L(1, 670, [28, 70, '25 Aug 2026'], [103, 200, 'Deposit from employer'], [410, 444, 'R2 000.00'], [540, 582, 'R2 299.00']),
  L(1, 655, [28, 70, '02 Sep 2026'], [103, 200, 'Card purchase Checkers'], [480, 503, 'R99.99'], [540, 582, 'R2 199.01'])
], { bank: 'GoTyme Bank', n: 4, recon: true, opening: 500, closing: 2199.01, noWarn: true, tx: [
  { amt: -200, desc: 'Send money to Thabo' }, { amt: -1, fee: true }, { d: '2026-08-25', amt: 2000 }, { d: '2026-09-02', amt: -99.99 }
] });

/* 3a. Discovery Bank, column positions from a real statement: centred headings over right-aligned "R 0.23" amounts. Values made up. */
expectStatement('Discovery Bank layout', [
  L(1, 678, [53, 128, 'Account holder:'], [130, 187, 'A Person'], [350, 378, 'From:'], [380, 444, '2026-08-18'], [456, 473, 'To:'], [477, 541, '2026-11-18']),
  L(1, 663, [53, 117, 'Account type:'], [120, 273, 'Discovery Card Account'], [381, 462, 'Account number:'], [465, 541, '10000001234']),
  L(1, 632, [75, 95, 'Date'], [215, 265, 'Description'], [377, 400, 'Debit'], [429, 456, 'Credit'], [490, 524, 'Balance']),
  L(1, 615, [61, 108, '2026-09-01'], [119, 218, 'Interest Earned at 7.20%'], [444, 469, 'R 0.23'], [508, 538, 'R 37.88']),
  L(1, 599, [61, 108, '2026-09-15'], [119, 218, 'Woolworths Rosebank'], [402, 425, 'R 7.50'], [508, 538, 'R 30.38']),
  L(1, 582, [61, 108, '2026-10-01'], [119, 246, 'Salary ACME'], [430, 469, 'R 1 000.00'], [496, 538, 'R 1 030.38']),
  L(1, 100, [53, 300, 'Discovery Bank Limited. Registration number 2015/408745/06.'])
], { bank: 'Discovery Bank', n: 3, recon: true, opening: 37.65, closing: 1030.38, noWarn: true, tx: [
  { d: '2026-09-01', amt: 0.23 }, { d: '2026-09-15', amt: -7.5 }, { amt: 1000 }
] });

/* 3b. Unknown bank, newest first; Date | Description | Amount | Balance; "- R 50.00" */
expectStatement('Newest-first signed amounts', [
  L(1, 760, [40, 60, 'Date'], [100, 170, 'Description'], [400, 440, 'Amount'], [500, 540, 'Balance']),
  L(1, 745, [40, 90, '15 Mar 2025'], [100, 220, 'Woolworths Food'], [390, 440, '- R 310.45'], [490, 540, 'R 4 189.55']),
  L(1, 730, [40, 90, '14 Mar 2025'], [100, 220, 'Salary ACME'], [385, 440, 'R 4 000.00'], [490, 540, 'R 4 500.00']),
  L(1, 715, [40, 90, '10 Mar 2025'], [100, 220, 'Netflix'], [395, 440, '- R 99.00'], [500, 540, 'R 500.00'])
], { n: 3, recon: true, opening: 599, closing: 4189.55, noWarn: true, tx: [
  { d: '2025-03-10', amt: -99 }, { d: '2025-03-14', amt: 4000 }, { d: '2025-03-15', amt: -310.45 }
] });

/* 3c. Proof-of-account letter (GoTyme wording) is explained, not imported */
{ const r = P.parseStatementLines([L(1, 590, [363, 421, 'www.gotyme.co.za']), L(1, 530, [154, 285, 'Proof of Account']), L(1, 460, [18, 400, 'This serves as confirmation that the banking details below are active'])]);
  console.log('Proof of account letter: ' + JSON.stringify(r.warnings)); check('proof of account letter', r.bank === null && /confirmation letter/.test(r.warnings[0]), r); }

/* 4. Investec style: Posted Date | Trans Date | Transaction Description | Debits | Credits | Balance */
expectStatement('Investec layout', [
  L(1, 800, [40, 220, 'Investec Bank Limited Reg. No. 1969/004763/06']),
  L(1, 780, [40, 300, 'Statement period 01/04/2025 to 30/04/2025']),
  L(1, 760, [40, 90, 'Posted Date'], [100, 150, 'Trans Date'], [160, 290, 'Transaction Description'], [350, 380, 'Debits'], [420, 455, 'Credits'], [500, 540, 'Balance']),
  L(1, 745, [40, 90, '01/04/2025'], [160, 260, 'Balance brought forward'], [490, 540, '25 000.00']),
  L(1, 730, [40, 90, '03/04/2025'], [100, 150, '01/04/2025'], [160, 260, 'Uber BV Amsterdam'], [340, 380, '185.20'], [490, 540, '24 814.80']),
  L(1, 715, [40, 90, '05/04/2025'], [100, 150, '05/04/2025'], [160, 260, 'Transfer from savings'], [410, 455, '5 000.00'], [490, 540, '29 814.80'])
], { bank: 'Investec', n: 2, recon: true, opening: 25000, closing: 29814.8, noWarn: true, tx: [
  { d: '2025-04-03', amt: -185.2, desc: 'Uber BV Amsterdam' }, { amt: 5000 }
] });

/* 5. "Cr" convention with accrued charges (FNB-like): unmarked = debit; accrued charges not yet in the balance; year-less dates */
expectStatement('Cr/Dr layout with accrued charges', [
  L(1, 800, [40, 300, 'Bidvest Bank Limited']),
  L(1, 780, [40, 330, 'Statement Period : 01 December 2024 to 31 January 2025']),
  L(1, 760, [40, 60, 'Date'], [90, 160, 'Description'], [330, 370, 'Amount'], [420, 460, 'Balance'], [480, 560, 'Accrued Bank Charges']),
  L(1, 745, [90, 180, 'Opening Balance'], [400, 460, '1 000.00Cr']),
  L(1, 730, [40, 70, '28 Dec'], [90, 200, 'POS Purchase Spar'], [330, 370, '250.00'], [410, 460, '750.00Cr'], [530, 560, '3.50']),
  L(1, 715, [40, 70, '02 Jan'], [90, 200, 'Salary'], [320, 370, '9 000.00Cr'], [400, 460, '9 750.00Cr']),
  L(1, 700, [40, 70, '05 Jan'], [90, 200, 'Monthly account fee'], [340, 370, '3.50'], [400, 460, '9 746.50Cr'])
], { bank: 'Bidvest Bank', n: 3, recon: true, opening: 1000, closing: 9746.5, noWarn: true, tx: [
  { d: '2024-12-28', amt: -250 }, { d: '2025-01-02', amt: 9000 }, { d: '2025-01-05', amt: -3.5, fee: true }
] });

/* 6. Unknown layout, unknown bank, merged header item, multi-line descriptions, trailing-minus balance */
expectStatement('Unknown bank, merged header', [
  L(1, 800, [40, 200, 'Some Mutual Bank']),
  L(1, 760, [40, 330, 'Date Description Debit Credit Balance']),
  L(1, 745, [40, 95, '2025-05-01'], [110, 200, 'Opening balance'], [300, 330, '100.00-']),
  L(1, 730, [40, 95, '2025-05-02'], [110, 200, 'Payshap from Lindiwe'], [250, 275, '600.00'], [300, 330, '500.00']),
  L(1, 715, [40, 95, '2025-05-03'], [110, 200, 'Debit order'], [190, 220, '120.00'], [300, 330, '380.00']),
  L(1, 705, [110, 200, 'Old Mutual policy 1234'])
], { n: 2, recon: true, opening: -100, closing: 380, tx: [{ amt: 600 }, { amt: -120, desc: 'Debit order Old Mutual policy' }] });

/* 7. Absa-style pending charge that did not change the balance is skipped */
expectStatement('Absa pending row', [
  L(1, 760, [20, 39, 'Date'], [76, 171, 'Transaction Description'], [368, 399, 'Amount'], [476, 509, 'Balance']),
  L(1, 745, [20, 66, '2025-12-01'], [76, 200, 'Digital transf cr'], [365, 399, 'R100.00'], [480, 509, 'R100.02']),
  L(1, 730, [20, 66, '2025-12-03'], [76, 236, 'TRANSACTION CHARGE ( PENDING )'], [367, 399, '-R10.00'], [480, 509, 'R100.02'])
], { n: 1, tx: [{ amt: 100 }] });

/* ---------- CSV ---------- */
function expectText(name, text, file, exp) {
  const r = P.parseTextStatement(text, file);
  console.log(`${name}: bank=${r.bank} account=${r.account} tx=${r.tx.length} recon=${r.recon ? r.recon.ok : 'n/a'}${r.warnings.length ? ' warnings=' + JSON.stringify(r.warnings) : ''}`);
  if (exp.bank) check(name + ' bank', r.bank === exp.bank, r.bank);
  check(name + ' count', r.tx.length === exp.n, r.tx);
  if (exp.recon) check(name + ' reconciles', r.recon && r.recon.ok, r.recon);
  (exp.tx || []).forEach((e, i) => { const t = r.tx[i] || {}; for (const k in e) check(`${name} tx${i}.${k}`, k === 'desc' ? (t.desc || '').includes(e.desc) : t[k] === e[k], t); });
}
expectText('FNB-style CSV (preamble, newest first)',
  'ACCOUNT TRANSACTIONS\nFirst National Bank,Cheque Account,62000000000\n\nDate,Amount,Balance,Description\n2025/03/05,-100.00,900.00,FNB App Payment To Sipho\n2025/03/01,1000.00,1000.00,Salary\n2025/02/28,-25.00,0.00,Monthly Account Fee\n',
  'fnb.csv', { bank: 'FNB', n: 3, recon: true, tx: [{ d: '2025-02-28', fee: true }, { d: '2025-03-01', amt: 1000 }, { d: '2025-03-05', amt: -100 }] });
expectText('Headerless record CSV (Standard Bank style)',
  'ACC-NO,000123456789,STANDARD BANK\nOPEN,20250101,,0,OPENING,,0,1000.00\nHIST,20250102,,-150.00,POS PURCHASE,PICK N PAY,0,850.00\nHIST,20250103,,2000.00,CREDIT TRANSFER,ACME SALARY,0,2850.00\nHIST,20250104,,-50.00,PREPAID ELECTRICITY,,0,2800.00\nCLOSE,20250131,,0,CLOSING,,0,2800.00\n',
  'sbsa.csv', { bank: 'Standard Bank', n: 3, recon: true, tx: [{ d: '2025-01-02', amt: -150, desc: 'PICK N PAY' }, { amt: 2000 }, { amt: -50 }] });
expectText('Capitec-style CSV (money in/out/fee columns)',
  'Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,123,2025-06-01,2025-06-01,Spar,Spar Rosepark,Food,Groceries,,-120.00,,880.00\n2,123,2025-06-02,2025-06-02,Payshap,Payshap,Transfer,Transfer,,-50.00,-1.00,829.00\n',
  'capitec.csv', { n: 3, recon: true, tx: [{ amt: -120, bankCat: 'Groceries' }, { amt: -50 }, { amt: -1, fee: true }] });
expectText('Amount + Dr/Cr type column, semicolons, comma decimals',
  'Date;Description;Amount;Type\n01/07/2025;Salary;12 500,00;CR\n02/07/2025;Woolworths;345,60;DR\n',
  'other.csv', { n: 2, tx: [{ d: '2025-07-01', amt: 12500 }, { d: '2025-07-02', amt: -345.6 }] });

/* ---------- OFX / QIF ---------- */
expectText('OFX (SGML)',
  'OFXHEADER:100\nDATA:OFXSGML\n<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>ABSA</ORG></FI></SONRS></SIGNONMSGSRSV1><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>4109918617</BANKACCTFROM><BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20250312\n<TRNAMT>-128.79\n<NAME>POS PURCHASE SPAR\n<MEMO>ROSEPARK\n</STMTTRN>\n<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20250326\n<TRNAMT>20726.34\n<NAME>ACB CREDIT SALARY &amp; BONUS\n</STMTTRN>\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
  'absa.ofx', { bank: 'Absa', n: 2, tx: [{ d: '2025-03-12', amt: -128.79, desc: 'POS PURCHASE SPAR ROSEPARK' }, { amt: 20726.34, desc: 'SALARY & BONUS' }] });
expectText('QIF (dd/mm)',
  '!Type:Bank\nD13/03/2025\nT-60.00\nPPayShap to Zolile\n^\nD01/04/2025\nT-135.00\nPMONTHLY ACC FEE\n^\n',
  'absa.qif', { n: 2, tx: [{ d: '2025-03-13', amt: -60 }, { d: '2025-04-01', fee: true }] });

/* ---------- date / amount primitives ---------- */
const d = s => { const p = P.dateLead(s); return p && (p.y ? [p.y, p.m, p.d] : p.m ? [p.m, p.d] : [p.a, p.b]); };
check('date dd/mm/yyyy', JSON.stringify(d('25/09/2026 Rent')) === '[2026,9,25]', d('25/09/2026 Rent'));
check('date iso', JSON.stringify(d('2025-03-12')) === '[2025,3,12]');
check('date dd Mon yyyy', JSON.stringify(d('1 Feb 2025')) === '[2025,2,1]');
check('date dd Mon', JSON.stringify(d('05 Jan Salary')) === '[1,5]');
check('date not a word', d('12 Mayfair Spar') === null, d('12 Mayfair Spar'));
check('amount R', P.amtParse('-R1 234.56').v === 1234.56 && P.amtParse('-R1 234.56').neg);
check('amount trailing minus', P.amtParse('250.00-').neg);
check('amount Cr', P.amtParse('9 000.00Cr').sfx === 'cr');
check('amount comma decimal', P.amtParse('1 234,56').v === 1234.56);
check('amount parens', P.amtParse('(80.00)').neg);
check('amount whole rands', P.amtParse('R1 500').v === 1500 && P.amtParse('R0').v === 0);

console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
