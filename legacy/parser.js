/* ===== Statement parsing (shared by the page and the Node test) ===== */
/* A "line" is {y, page, items:[{s, x, r}]} where x = left edge, r = right edge, sorted by x. */

async function pdfToLines(pdfjsLib, data) {
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      const s = it.str;
      if (!s || !s.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!row) { row = { y, page: p, items: [] }; rows.push(row); }
      row.items.push({ s: s.trim(), x, r: x + it.width });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) { r.items.sort((a, b) => a.x - b.x); r.text = r.items.map(i => i.s).join(' '); lines.push(r); }
  }
  return lines;
}

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const NUM_RE = /^-?R?\s?\d{1,3}(?:[ ,\u00a0]\d{3})*\.\d{2}\s?\*?$/;
function toNum(s) { return parseFloat(s.replace(/[R\s, *]/g, '')); }
function isoDate(s) { const m = s.match(DATE_RE); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; }
function round2(n) { return Math.round(n * 100) / 100; }

/* Items can hold several tokens ("25/09/2026 Rent"); split a leading date off the first item. */
function leadingDate(line) {
  const first = line.items[0];
  if (!first) return null;
  const m = first.s.match(/^(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
  if (m) return { date: isoDate(m[1]), rest: m[2], idx: 0 };
  // Nedbank: an optional "Tran list no" item precedes the date
  const second = line.items[1];
  if (/^\d{6}$/.test(first.s) && second) {
    const m2 = second.s.match(/^(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
    if (m2) return { date: isoDate(m2[1]), rest: m2[2], idx: 1 };
  }
  return null;
}

function nearestCol(cols, r) {
  let best = null, bd = 1e9;
  for (const k in cols) { const d = Math.abs(cols[k] - r); if (d < bd) { bd = d; best = k; } }
  return best;
}

/* South African banks: [id, display name, legal-name / domain markers, brand name for the letterhead fallback].
   Markers are legal names and domains, so a payment that merely mentions another bank
   ("Payment: Nkululeko Fnb", "DIGITAL PAYMENT ABSA BANK") does not change the detected bank. */
const SA_BANKS = [
  ['capitec', 'Capitec', [/capitec bank limited/g, /capitecbank\.co\.za/g], 'capitec'],
  ['nedbank', 'Nedbank', [/nedbank ltd/g, /nedbank limited/g, /nedbank\.co\.za/g], 'nedbank'],
  ['fnb', 'FNB', [/first national bank/g, /firstrand bank/g, /fnb\.co\.za/g], 'fnb'],
  ['absa', 'Absa', [/absa bank (?:limited|ltd)/g, /absa\.co\.za/g, /08600 08600/g], 'absa'],
  ['standard', 'Standard Bank', [/standard bank of south africa/g, /standardbank\.co\.za/g], 'standard bank'],
  ['tyme', 'GoTyme Bank', [/(?:go)?tyme ?bank (?:limited|ltd)/g, /(?:gotyme|tymebank)\.co\.za/g], 'gotyme|tymebank'],   // TymeBank, renamed GoTyme Bank
  ['discovery', 'Discovery Bank', [/discovery bank (?:limited|ltd)/g, /discovery\.co\.za\/bank/g], 'discovery bank'],
  ['investec', 'Investec', [/investec bank (?:limited|ltd)/g, /investec\.co(?:m|\.za)/g], 'investec'],
  ['african', 'African Bank', [/african bank (?:limited|ltd)/g, /africanbank\.co\.za/g], 'african bank'],
  ['bidvest', 'Bidvest Bank', [/bidvest bank (?:limited|ltd)/g, /bidvestbank\.co\.za/g], 'bidvest bank'],
  ['oldmutual', 'Old Mutual', [/old mutual bank/g, /oldmutual\.co\.za\/bank/g], 'old mutual bank'],
  ['access', 'Access Bank', [/access bank south africa/g, /accessbank\.co\.za/g], 'access bank'],
  ['bankzero', 'Bank Zero', [/bank zero mutual bank/g, /bankzero\.co\.za/g], 'bank zero'],
  ['ubank', 'Ubank', [/ubank (?:limited|ltd)/g, /ubank\.co\.za/g], 'ubank'],
  ['postbank', 'Postbank', [/south african postbank/g, /postbank\.co\.za/g], 'postbank'],
  ['grindrod', 'Grindrod Bank', [/grindrod bank/g], 'grindrod bank'],
  ['sasfin', 'Sasfin', [/sasfin bank/g], 'sasfin'],
  ['mercantile', 'Mercantile Bank', [/mercantile bank (?:limited|ltd)/g], 'mercantile bank'],
  ['hbz', 'HBZ Bank', [/hbz bank (?:limited|ltd)/g], 'hbz bank'],
  ['habib', 'Habib Overseas Bank', [/habib overseas bank/g], 'habib overseas'],
  ['albaraka', 'Albaraka Bank', [/al ?baraka bank/g], 'albaraka'],
  ['finbond', 'Finbond Mutual Bank', [/finbond mutual bank/g], 'finbond']
];
function bankName(id) { const b = SA_BANKS.find(b => b[0] === id); return b ? b[1] : null; }

/* Pick the bank with the most marker hits; failing that, the brand named earliest in the letterhead. */
function detectBankText(all, head) {
  let best = null, bestN = 0;
  for (const [id, , res] of SA_BANKS) {
    const n = res.reduce((s, re) => s + (all.match(re) || []).length, 0);
    if (n > bestN) { best = id; bestN = n; }
  }
  if (best || head == null) return best;
  let pos = 1e9;
  for (const [id, , , brand] of SA_BANKS) {
    const m = head.match(new RegExp('(?:^|[^a-z])(?:' + brand.replace(/ /g, '\\s?') + ')(?![a-z])'));
    if (m && m.index < pos) { pos = m.index; best = id; }
  }
  return best;
}
function detectBank(lines) {
  return detectBankText(lines.map(l => l.text).join('\n').toLowerCase(), lines.slice(0, 60).map(l => l.text).join('\n').toLowerCase());
}

/* ---------- Capitec "Main Account Statement" ---------- */
function parseCapitec(lines) {
  const out = { bank: 'Capitec', account: 'Capitec', tx: [], opening: null, closing: null, warnings: [] };
  const joined = lines.map(l => l.text).join('\n');
  let m = joined.match(/Opening Balance:\s*(-?R[\d , ]+\.\d{2})/); if (m) out.opening = toNum(m[1]);
  m = joined.match(/Closing Balance:\s*(-?R[\d , ]+\.\d{2})/); if (m) out.closing = toNum(m[1]);
  let cols = null, cur = null, inTable = false, catX = null;
  const flush = () => { if (cur) { finishCap(cur, out); cur = null; } };
  for (const line of lines) {
    const t = line.text;
    if (/^Date\s+Description\s+Category\s+Money In/.test(t)) {
      flush();
      cols = {}; inTable = true;
      for (const it of line.items) {
        if (it.s === 'Money In') cols.in = it.r;
        else if (it.s === 'Money Out') cols.out = it.r;
        else if (/^Fee/.test(it.s)) cols.fee = it.r;
        else if (it.s === 'Balance') cols.bal = it.r;
        else if (it.s === 'Category') catX = it.x;
      }
      // header may be one merged item; fall back to proportional positions later
      if (cols.in == null || cols.bal == null) cols = null;
      continue;
    }
    if (!inTable) continue;
    if (/Includes VAT at|Client Care Centre|Pending Card Transactions|Unique Document No/.test(t)) { flush(); inTable = false; continue; }
    const ld = leadingDate(line);
    if (ld) {
      flush();
      cur = { date: ld.date, desc: [], cat: [], nums: [] };
      if (ld.rest) cur.desc.push(ld.rest);
      for (let i = ld.idx + 1; i < line.items.length; i++) pushCapItem(cur, line.items[i], cols, catX);
    } else if (cur) {
      for (const it of line.items) pushCapItem(cur, it, cols, catX);
    }
  }
  flush();
  return out;
}
function pushCapItem(cur, it, cols, catX) {
  if (NUM_RE.test(it.s) && (!cols || it.r > cols.in - 60)) { cur.nums.push({ v: toNum(it.s), col: cols ? nearestCol(cols, it.r) : null }); return; }
  if (catX != null && it.x >= catX - 3) cur.cat.push(it.s); else cur.desc.push(it.s);
}
function finishCap(cur, out) {
  const desc = cur.desc.join(' ').replace(/\s+/g, ' ').trim();
  const bankCat = cur.cat.join(' ').replace(/\s+/g, ' ').trim();
  let inn = 0, outt = 0, fee = 0, bal = null;
  if (cur.nums.length && cur.nums.every(n => n.col)) {
    for (const n of cur.nums) { if (n.col === 'in') inn = n.v; else if (n.col === 'out') outt = n.v; else if (n.col === 'fee') fee = n.v; else bal = n.v; }
  } else if (cur.nums.length >= 2) {
    bal = cur.nums[cur.nums.length - 1].v;
    const rest = cur.nums.slice(0, -1).map(n => n.v);
    const pos = rest.filter(v => v > 0), neg = rest.filter(v => v < 0);
    if (pos.length) inn = pos[0];
    if (neg.length === 2) { outt = neg[0]; fee = neg[1]; }
    else if (neg.length === 1) { if (/^Fees?$/.test(bankCat) || /Fee$/.test(desc)) fee = neg[0]; else outt = neg[0]; }
  }
  if (bal == null) return; // rows with no amounts (e.g. "Insf. Funds ..." notes)
  if (inn) out.tx.push({ d: cur.date, desc, amt: round2(inn), bal, bankCat });
  if (outt) out.tx.push({ d: cur.date, desc, amt: round2(-Math.abs(outt)), bal, bankCat });
  if (fee) {
    const pure = !inn && !outt;
    out.tx.push({ d: cur.date, desc: pure ? desc : 'Fee: ' + desc, amt: round2(-Math.abs(fee)), bal, bankCat: 'Fees', fee: true });
  }
}

/* ---------- Nedbank current account statement ---------- */
function parseNedbank(lines) {
  const out = { bank: 'Nedbank', account: 'Nedbank', tx: [], opening: null, closing: null, warnings: [] };
  let cols = null, inTable = false, prev = null;
  for (const line of lines) {
    const t = line.text;
    if (/Date\s+Description\s+Fees \(R\)\s+Debits \(R\)/.test(t) || (/Tran list no/.test(t) && /Balance \(R\)/.test(t))) {
      cols = {}; inTable = true;
      for (const it of line.items) {
        if (/^Debits/.test(it.s)) cols.debit = it.r;
        else if (/^Credits/.test(it.s)) cols.credit = it.r;
        else if (/^Balance/.test(it.s)) cols.bal = it.r;
      }
      if (cols.debit == null || cols.credit == null || cols.bal == null) cols = null;
      continue;
    }
    if (!inTable) continue;
    if (/^Closing balance/i.test(t)) {
      const n = line.items.filter(i => NUM_RE.test(i.s)).pop(); if (n) out.closing = toNum(n.s);
      inTable = false; continue;
    }
    if (/see money differently|Balance carried forward|Balance brought forward/.test(t)) continue;
    const ld = leadingDate(line);
    if (!ld) continue;
    const descParts = ld.rest ? [ld.rest] : [];
    const nums = [];
    let star = false;
    for (let i = ld.idx + 1; i < line.items.length; i++) {
      const it = line.items[i];
      if (it.s === '*') { star = true; continue; }
      if (NUM_RE.test(it.s)) { if (/\*$/.test(it.s)) star = true; nums.push({ v: toNum(it.s), r: it.r }); }
      else descParts.push(it.s);
    }
    let desc = descParts.join(' ').replace(/\s+/g, ' ').trim();
    if (!nums.length) continue;
    const bal = nums[nums.length - 1].v;
    if (/^Opening balance/i.test(desc)) { out.opening = bal; prev = bal; continue; }
    if (nums.length < 2) continue;
    const a = nums[nums.length - 2];
    let amt;
    if (prev != null && Math.abs(round2(prev + a.v) - bal) < 0.006) amt = a.v;
    else if (prev != null && Math.abs(round2(prev - a.v) - bal) < 0.006) amt = -a.v;
    else if (cols) amt = nearestCol({ debit: cols.debit, credit: cols.credit }, a.r) === 'credit' ? a.v : -a.v;
    else amt = -a.v;
    prev = bal;
    // strip the masked card number the bank glues onto card purchases
    desc = desc.replace(/\s?\d{6}X{4,}\d{4}\s*$/, '').trim();
    out.tx.push({ d: ld.date, desc, amt: round2(amt), bal, bankCat: star ? 'Fees' : '', fee: star || undefined });
  }
  return out;
}

/* ---------- FNB (cheque / business current account) ---------- */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FNB_NUM = /^(\d{1,3}(?:[ ,]\d{3})*\.\d{2})\s?(Cr|Dr)?$/;
/* Signed value from an FNB amount: "Cr" = credit (+); "Dr" or no suffix = debit (-). */
function fnbSigned(v, suf) { return suf === 'Cr' ? v : -v; }
/* Collect numbers on a line, attaching a following "Cr"/"Dr" item to the number before it. */
function fnbNums(items, fromIdx) {
  const out = [];
  for (let i = fromIdx; i < items.length; i++) {
    const it = items[i], m = it.s.match(FNB_NUM);
    if (m) { out.push({ v: toNum(m[1]), suf: m[2] || '', r: m[2] ? it.r - 8 : it.r, idx: i }); continue; }
    if ((it.s === 'Cr' || it.s === 'Dr') && out.length && out[out.length - 1].idx === i - 1 && !out[out.length - 1].suf) out[out.length - 1].suf = it.s;
  }
  return out;
}
function parseFnb(lines) {
  const out = { bank: 'FNB', account: 'FNB', tx: [], opening: null, closing: null, warnings: [] };
  const joined = lines.map(l => l.text).join('\n');
  const pm = joined.match(/Statement Period\s*:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!pm) { out.warnings.push('Could not find the statement period, so transaction years are unknown.'); return out; }
  const sMon = MONTHS.indexOf(pm[2].slice(0, 3).toLowerCase()), sYr = +pm[3], eYr = +pm[6];
  // FNB rows carry "dd Mon" only: take the start year for months on/after the start month, else the end year.
  const yearFor = mi => (sYr === eYr || mi >= sMon) ? sYr : eYr;
  for (const line of lines) {
    const lab = line.items[0] && line.items[0].s;
    if (lab === 'Opening Balance' || lab === 'Closing Balance') {
      const n = fnbNums(line.items, 1)[0];
      if (n && (lab === 'Opening Balance' ? out.opening == null : out.closing == null)) out[lab === 'Opening Balance' ? 'opening' : 'closing'] = fnbSigned(n.v, n.suf);
    }
  }
  let cols = null, inTable = false;
  for (const line of lines) {
    const t = line.text;
    const names = line.items.map(i => i.s);
    if (names.includes('Date') && names.includes('Description') && names.includes('Amount') && names.includes('Balance')) {
      const get = n => line.items.find(i => i.s === n);
      cols = { amt: get('Amount').r, bal: get('Balance').r };
      const chg = get('Bank') || get('Charges'); if (chg) cols.chg = chg.r;
      inTable = true; continue;
    }
    if (!inTable) continue;
    if (/^\s*(Closing Balance|Turnover for Statement Period)/.test(t)) { inTable = false; continue; }
    const first = line.items[0]; if (!first) continue;
    const dm = first.s.match(/^(\d{2}) ([A-Z][a-z]{2})(?:\s+(.*))?$/);
    if (!dm) continue;
    const mi = MONTHS.indexOf(dm[2].toLowerCase()); if (mi < 0) continue;
    const d = `${yearFor(mi)}-${String(mi + 1).padStart(2, '0')}-${dm[1]}`;
    const nums = fnbNums(line.items, 1);
    let amt = null, bal = null;
    for (const n of nums) {
      const k = nearestCol(cols, n.r);
      if (k === 'amt' && amt == null) amt = fnbSigned(n.v, n.suf);
      else if (k === 'bal' && bal == null) bal = fnbSigned(n.v, n.suf);
      // k === 'chg': accrued bank charges, billed later as their own row, so not counted here
    }
    const numIdx = new Set(nums.map(n => n.idx));
    let desc = [dm[3] || ''].concat(line.items.slice(1).filter((it, i) => !numIdx.has(i + 1) && it.s !== 'Cr' && it.s !== 'Dr' && it.r < cols.amt - 30).map(i => i.s)).join(' ');
    desc = desc.replace(/\b\d{6}\*\d{4}(\s+\d{2} [A-Z][a-z]{2})?/g, '').replace(/\s+/g, ' ').trim();
    if (amt == null || Math.abs(amt) < 0.005) continue;   // e.g. "Dr.Int.Rate 24,00000  0.00"
    // FNB prints its monthly service-fee debits with no description
    const row = { d, desc: desc || (amt < 0 ? 'FNB service fees' : 'FNB credit'), amt: round2(amt), bal, bankCat: '' };
    if (amt < 0 && (!desc || /\bfees?\b/i.test(desc))) { row.fee = true; row.bankCat = 'Fees'; }
    out.tx.push(row);
  }
  if (!cols) out.warnings.push('Could not find the transaction table in this FNB statement.');
  return out;
}

function reconcile(res) {
  if (res.opening == null || res.closing == null) return null;
  const sum = res.tx.reduce((s, t) => s + t.amt, 0);
  const diff = round2(res.opening + sum - res.closing);
  return { ok: Math.abs(diff) < 0.02, diff };
}

/* ---------- Dates in any format a SA bank prints ---------- */
const MON_FULL = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i;
function monIdx(s) { return MON_FULL.test(s) ? MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1 : 0; }
function validIso(y, m, d) {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/* Read a date at the start of s. Returns {y?, m?, d?, a?, b?, rest}; a/b are an ambiguous "nn nn" pair. */
function dateLead(s) {
  s = (s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?![\d])\s*(.*)$/))) return validIso(+m[1], +m[2], +m[3]) ? { y: +m[1], m: +m[2], d: +m[3], rest: m[4] } : null;
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})(?![\d.,])\s*(.*)$/))) return validIso(+m[3], +m[2], +m[1]) ? { y: +m[3], m: +m[2], d: +m[1], rest: m[4] } : null;
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-]([A-Za-z]{3,9})\.?(?:[\s\-,]+(\d{4}|\d{2}(?![\d.,:])))?(?![a-z])\s*(.*)$/i)) && monIdx(m[2])) {
    const mo = monIdx(m[2]); return m[3] ? { y: +m[3], m: mo, d: +m[1], rest: m[4] } : { m: mo, d: +m[1], rest: m[4] };
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s(\d{1,2}),?\s(\d{4})(?![\d])\s*(.*)$/)) && monIdx(m[1])) return { y: +m[3], m: monIdx(m[1]), d: +m[2], rest: m[4] };
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?![\d.,])\s*(.*)$/)) && validIso(+m[1], +m[2], +m[3])) return { y: +m[1], m: +m[2], d: +m[3], rest: m[4] };
  if ((m = s.match(/^(\d{1,2})[\s\/](\d{1,2})(?![\d.,:\/])\s*(.*)$/)) && +m[1] <= 31 && +m[2] <= 31) return { a: +m[1], b: +m[2], rest: m[3] };
  return null;
}
function fullDate(s) { const p = dateLead(s); return p && p.y ? validIso(p.y, p.m, p.d) : null; }
const dayNo = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8)) / 864e5;
/* Statement period, used to give year-less dates ("12 Mar", "03 12") a year. */
function statementPeriod(texts) {
  const D = '(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{4})';
  const head = texts.slice(0, 150).join('\n');
  const m = head.match(new RegExp(D + '\\s*(?:to|until|through|-|–|—):?\\s*' + D, 'i'));
  if (m) { const a = fullDate(m[1]), b = fullDate(m[2]); if (a && b) return a <= b ? { start: a, end: b } : { start: b, end: a }; }
  const all = [...texts.join('\n').matchAll(new RegExp(D, 'g'))].map(x => fullDate(x[1])).filter(Boolean).sort();
  return all.length ? { start: all[0], end: all[all.length - 1] } : null;
}
/* Distance in days from a period (0 inside it). */
function periodDist(iso, ctx) { const n = dayNo(iso), s = dayNo(ctx.start) - 3, e = dayNo(ctx.end) + 3; return n < s ? s - n : n > e ? n - e : 0; }
/* Resolve every row's date; ambiguous "nn nn" dates are read as dd/mm or mm/dd, whichever fits the period better overall. */
function resolveDates(rows, ctx) {
  if (!ctx) { const t = new Date(); const iso = validIso(t.getFullYear(), t.getMonth() + 1, t.getDate()); ctx = { start: iso, end: iso }; }
  const ey = +ctx.end.slice(0, 4);
  const pick = (m, d) => { let best = null, bs = 1e9; for (const y of [ey, ey - 1, ey + 1]) { const iso = validIso(y, m, d); if (iso) { const s = periodDist(iso, ctx); if (s < bs) { bs = s; best = iso; } } } return best ? { iso: best, s: bs } : null; };
  let dmScore = 0, mdScore = 0;
  for (const r of rows) if (r.date && r.date.a != null) {
    const x = pick(r.date.b, r.date.a), y = pick(r.date.a, r.date.b);
    dmScore += x ? Math.min(x.s, 400) : 400; mdScore += y ? Math.min(y.s, 400) : 400;
  }
  const md = mdScore < dmScore;
  for (const r of rows) {
    const p = r.date; if (!p) { r.iso = null; continue; }
    if (p.y) r.iso = validIso(p.y, p.m, p.d);
    else if (p.m) { const x = pick(p.m, p.d); r.iso = x && x.iso; }
    else { const x = md ? pick(p.a, p.b) : pick(p.b, p.a); r.iso = x && x.iso; }
  }
}

/* ---------- Amounts: "R1 234.56", "-R50.00", "1,234.56 Cr", "250.00-", "(80.00)", "1 234,56" ---------- */
const AMT_SRC = '(?:(?:\\(\\s?)?[-−]?\\s?R?\\s?[-−]?\\s?(?:\\d{1,3}(?:[ \\u00a0,]\\d{3})+|\\d+)[.,]\\d{2}(?:\\s?\\))?(?:\\s?(?:-|\\+|[CcDd][Rr]))?\\*?|[-−]?\\s?R\\s?[-−]?\\s?\\d{1,3}(?:[ \\u00a0,]\\d{3})*(?![\\d.,]))';
const AMT_TAIL = new RegExp('(?:^|\\s)(' + AMT_SRC + ')\\s*$');
function amtParse(s) {
  let t = s.replace(/[\s ]/g, '').replace(/−/g, '-'), neg = false, sfx = '', star = false;
  if (/\*$/.test(t)) { star = true; t = t.slice(0, -1); }
  const m = t.match(/([CcDd][Rr])$/); if (m) { sfx = m[1].toLowerCase(); t = t.slice(0, -2); }
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/-$/.test(t)) { neg = true; t = t.slice(0, -1); } else if (/\+$/.test(t)) t = t.slice(0, -1);
  if (/^R?-/.test(t)) neg = true;
  t = t.replace(/[R-]/g, '');
  if (/^R?\d[\d,]*$/.test(t) && /R/.test(s)) { const ip = t.replace(/[R,]/g, ''); return /^\d+$/.test(ip) ? { v: +ip, neg, sfx, star } : null; }   // "R150"
  const dm = t.match(/^([\d,.]*\d)[.,](\d{2})$/); if (!dm) return null;
  const ip = dm[1].replace(/[,.]/g, ''); if (!/^\d+$/.test(ip)) return null;
  return { v: +(ip + '.' + dm[2]), neg, sfx, star };
}

/* ---------- Generic column-based PDF parser (Absa, Standard Bank, TymeBank, Discovery, Investec, ...) ---------- */
const HEAD_COLS = [
  ['date', /^(?:trans(?:action)?\.?|posting|posted|post|value|process(?:ed|ing)?|txn|tran|effective)?\s?date$/i],
  ['desc', /^(?:transaction\s)?(?:description|details|narrative|particulars|reference|transaction|beneficiary|payee)s?$/i],
  ['fee', /^(?:(?:bank|service)\s)?(?:fees?|charges?)(?:\s\(r\))?\*?$/i],
  ['debit', /^(?:debits?|debit amount|money out|withdrawals?|payments?|paid out|amount out)(?:\s\(r\))?$/i],
  ['credit', /^(?:credits?|credit amount|money in|deposits?|receipts?|paid in|amount in)(?:\s\(r\))?$/i],
  ['amount', /^(?:transaction\s)?amount(?:\s\(r\))?$/i],
  ['bal', /^(?:running\s|closing\s)?balance(?:\s\(r\))?$/i]
];
const NUM_COLS = ['fee', 'debit', 'credit', 'amount', 'bal'];
function lineWords(line) {
  const w = [];
  for (const it of line.items) {
    const cw = (it.r - it.x) / Math.max(1, it.s.length); let pos = 0;
    for (const p of it.s.split(/\s+/)) { if (!p) continue; const i = it.s.indexOf(p, pos); w.push({ s: p, x: it.x + i * cw, r: it.x + (i + p.length) * cw }); pos = i + p.length; }
  }
  return w;
}
/* A table header: a date column, at least one money column, and mostly column words. */
function headerCols(line) {
  const w = lineWords(line); if (w.length < 3 || w.length > 16) return null;
  const cols = {}; let used = 0;
  for (let i = 0; i < w.length;) {
    let hit = 0;
    for (let k = Math.min(3, w.length - i); k >= 1 && !hit; k--) {
      const ph = w.slice(i, i + k).map(x => x.s).join(' ').replace(/\s?\((?:r|zar|\+|-|−)\)$/i, '').replace(/\*$/, '').replace(/[:]$/, '');
      for (const [key, re] of HEAD_COLS) if (!cols[key] && re.test(ph)) { cols[key] = { x: w[i].x, r: w[i + k - 1].r }; hit = k; break; }
    }
    used += hit; i += hit || 1;
  }
  if (!cols.date || !(cols.bal || cols.amount || (cols.debit && cols.credit)) || Object.keys(cols).length < 3 || used / w.length < 0.6) return null;
  const nums = NUM_COLS.filter(k => cols[k]);
  cols.zone = Math.min(...nums.map(k => cols[k].x)) - 45;          // money columns start here
  const right = Object.keys(cols).filter(k => k !== 'zone' && cols[k].x > cols.date.x).map(k => cols[k].x);
  cols.dateEnd = right.length ? Math.min(...right) - 2 : cols.date.r + 40;
  return cols;
}
function nearestNumCol(cols, r) { let best = null, bd = 1e9; for (const k of NUM_COLS) if (cols[k]) { const d = Math.abs(cols[k].r - r); if (d < bd) { bd = d; best = k; } } return best; }
/* Split one line into date, description text, money values (with their column) and marks such as "##". */
function splitLine(line, cols) {
  const dIdx = []; const dc = cols.date;
  line.items.forEach((it, i) => { if (it.x >= dc.x - 30 && it.x < cols.dateEnd) dIdx.push(i); });
  let date = null, rest = '';
  if (dIdx.length) { const p = dateLead(dIdx.map(i => line.items[i].s).join(' ')); if (p) { date = p; rest = p.rest || ''; } }
  const skip = new Set(date ? dIdx : []);
  const nums = [], desc = rest ? [rest] : [], marks = [];
  line.items.forEach((it, i) => {
    if (skip.has(i)) return;
    if (/^(?:cr|dr)$/i.test(it.s) && nums.length && nums[nums.length - 1].i === i - 1 && !nums[nums.length - 1].sfx) { nums[nums.length - 1].sfx = it.s.toLowerCase(); return; }
    if (it.r <= cols.zone) { desc.push(it.s); return; }
    let s = it.s.trim(); const cw = (it.r - it.x) / Math.max(1, it.s.length); const parts = []; let m;
    while (s && (m = s.match(AMT_TAIL))) {
      const r = it.x + s.length * cw; if (r <= cols.zone) break;
      const p = amtParse(m[1]); if (!p) break;
      parts.unshift({ ...p, r, i }); s = s.slice(0, m.index).trim();
    }
    for (const p of parts) nums.push({ ...p, col: nearestNumCol(cols, p.r) });
    if (s) { if (it.x < cols.zone) desc.push(s); else marks.push(s); }
  });
  let d = desc.join(' ').replace(/\s+/g, ' ').trim();
  // a second date column (posted date + transaction date) is not part of the description
  if (date) for (let q; d && (q = dateLead(d)) && (q.y || q.m);) d = (q.rest || '').trim();
  return { date, desc: d, nums, marks };
}
const OPEN_RE = /^(?:opening balance|balance brought forward|brought forward|balance b\/f|bal(?:ance)? b\/fwd|b\/f balance|previous (?:statement )?balance|balance at start)/i;
const CLOSE_RE = /^(?:closing balance|balance carried forward|carried forward|balance c\/f|bal(?:ance)? c\/fwd|balance at end)/i;
const SKIP_RE = /^(?:total|sub-?total|turnover|totals|page \d)/i;
const PENDING_RE = /pending|reserved|on hold|unsuccessful|declined/i;
const SECTION_END_RE = /^\s*(?:pending (?:card )?(?:transactions|items|authori[sz]ations)|uncleared (?:items|transactions|cheques)|transactions? on hold|card authori[sz]ations)\b/i;
/* "Closing Balance: R75.99" in a summary box outside the table. */
function summaryBalance(lines, re) {
  for (const l of lines) {
    const m = l.text.match(re); if (!m) continue;
    const t = l.text.slice(m.index + m[0].length).match(new RegExp('^\\s*:?\\s*(' + AMT_SRC + ')(?:\\s|$)'));
    const p = t && amtParse(t[1]); if (p) return p;
  }
  return null;
}
const FEE_DESC_RE = /\b(?:monthly (?:acc(?:ount)?|service|admin|management) fee|admin(?:istration)? (?:charge|fee)|transaction (?:charge|fee)|service (?:fee|charge)|bank charges?|acc(?:ount)? fee|notification fee|sms (?:fee|notification)|statement fee|stamped statement|honouring fee|unpaid .*fee|insufficient funds fee|debit order fee|cash (?:deposit|withdrawal) fee|atm (?:withdrawal )?fee|card (?:replacement )?fee|decl(?:ined)? .*fee|overdraft (?:fee|interest)|fixed monthly fee|bundle fee)\b/i;
function cleanDesc(s) {
  return (s || '')
    .replace(/\(\s*\d{1,3}(?:[ ,]\d{3})*,\d{2}\s*\)/g, ' ')          // Absa shows the accrued fee as "( 7,50 )"; it is charged later as its own row
    .replace(/\(effec \d{8}\)/ig, ' ')
    .replace(/\bcard no\.? ?\d{4}\b/ig, ' ')
    .replace(/\b\d{4,6}[*xX]{4,}\d{3,4}\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function accountTail(lines, upTo) {
  const head = lines.slice(0, Math.min(upTo, 60));
  const m = head.map(l => l.text).join('\n').match(/account\s*(?:number|no\.?|#)\s*:?\s*(\d[\d -]{5,20}\d)/i);
  if (m) return m[1].replace(/\D/g, '').slice(-4);
  for (const l of head) for (const it of l.items) if (/^\d{9,12}$/.test(it.s)) return it.s.slice(-4);
  return '';
}
function parseGeneric(lines, name) {
  const label = name || 'Bank statement';
  const out = { bank: label, account: label, tx: [], opening: null, closing: null, warnings: [] };
  const rows = []; let cols = null, last = null, firstHead = -1;
  lines.forEach((line, li) => {
    const h = headerCols(line);
    if (h) { cols = h; last = null; if (firstHead < 0) firstHead = li; return; }
    if (!cols) return;
    // a "Pending transactions" / "Uncleared items" section after the table is not part of the balance
    if (SECTION_END_RE.test(line.text) && !/\d[.,]\d{2}/.test(line.text)) { cols = null; last = null; return; }
    const sp = splitLine(line, cols);
    const balNum = sp.nums.find(n => n.col === 'bal') || sp.nums[sp.nums.length - 1];
    if (OPEN_RE.test(sp.desc)) { if (balNum && out.opening == null) out.opening = balNum; last = null; return; }
    if (CLOSE_RE.test(sp.desc)) { if (balNum) out.closing = balNum; last = null; return; }
    if (SKIP_RE.test(sp.desc)) { last = null; return; }
    if (sp.date && sp.nums.length) { last = { ...sp, desc: [sp.desc], page: line.page, y: line.y }; rows.push(last); return; }
    if (!sp.date && sp.nums.some(n => n.col === 'bal') && sp.desc && last && last.page === line.page && last.y - line.y < 60) {
      last = { ...sp, date: last.date, desc: [sp.desc], page: line.page, y: line.y }; rows.push(last); return;   // date printed once per day
    }
    if (!sp.date && !sp.nums.length && sp.desc && last && last.page === line.page && last.y - line.y < 22) { last.desc.push(sp.desc); last.y = line.y; return; }
    last = null;
  });
  if (firstHead < 0) { out.warnings.push('Could not find a transaction table (a row of column headings such as Date, Description, Amount, Balance).'); return out; }
  out.account = label + ((t => t ? ' ' + t : '')(accountTail(lines, firstHead < 0 ? 40 : firstHead)));
  resolveDates(rows, statementPeriod(lines.map(l => l.text)));
  let rs = rows.filter(r => r.iso);
  // newest-first listings: put them in date order so the running balance can be followed
  let up = 0, down = 0; for (let i = 1; i < rs.length; i++) { if (rs[i].iso > rs[i - 1].iso) up++; else if (rs[i].iso < rs[i - 1].iso) down++; }
  if (down > up) rs = rs.reverse();
  if (out.opening == null) out.opening = summaryBalance(lines, /\b(?:opening|starting) balance\b/i);
  if (out.closing == null) out.closing = summaryBalance(lines, /\b(?:closing|ending) balance\b/i);
  const all = rs.flatMap(r => r.nums);
  const crConv = all.some(n => n.sfx === 'cr');                        // "Cr" marks credits; unmarked values are debits
  const amtSigned = all.some(n => n.col === 'amount' && n.neg);
  const sgn = n => (n.neg || n.sfx === 'dr') ? -1 : n.sfx === 'cr' ? 1 : crConv ? -1 : 1;
  const ob = out.opening; out.opening = ob ? round2(sgn(ob) * ob.v) : null;
  const cb = out.closing; out.closing = cb ? round2(sgn(cb) * cb.v) : null;
  let prev = out.opening, mism = 0, pend = 0;
  for (const r of rs) {
    const g = k => r.nums.find(n => n.col === k);
    const nb = g('bal'), bal = nb ? round2(sgn(nb) * nb.v) : null;
    const ni = g('credit'), no = g('debit'), na = g('amount'), nf = g('fee');
    const core = (ni ? ni.v : 0) - (no ? no.v : 0);
    let opts = (ni && !no) || (no && !ni) ? [core, -core] : [core];
    if (na) {
      const known = na.neg || na.sfx || crConv || amtSigned;
      opts = known ? [core + sgn(na) * na.v] : [core - na.v, core + na.v];
    }
    const fee = nf ? nf.v : 0;
    const cands = []; for (const o of opts) { if (fee) cands.push([o, true]); cands.push([o, false]); }
    const desc = cleanDesc(r.desc.join(' '));
    let pick = null;
    if (prev != null && bal != null) pick = cands.find(([o, f]) => Math.abs(round2(prev + o - (f ? fee : 0)) - bal) < 0.006);
    if (!pick && prev != null && bal != null && Math.abs(bal - prev) < 0.006 && PENDING_RE.test(desc)) { pend++; continue; }
    if (!pick && prev != null && bal != null) mism++;
    pick = pick || cands[0];
    const main = round2(pick[0]), total = round2(main - (pick[1] ? fee : 0));
    if (prev == null && bal != null && out.opening == null) out.opening = round2(bal - total);
    prev = bal != null ? bal : (prev != null ? round2(prev + total) : null);
    if (Math.abs(main) >= 0.005) {
      const row = { d: r.iso, desc: desc || (main < 0 ? 'Bank charge' : 'Credit'), amt: main, bal, bankCat: '' };
      if (main < 0 && (FEE_DESC_RE.test(desc) || r.marks.some(m => /^(?:##|\*)$/.test(m)) || nb && nb.star)) { row.fee = true; row.bankCat = 'Fees'; }
      out.tx.push(row);
    }
    if (pick[1] && fee >= 0.005) out.tx.push({ d: r.iso, desc: desc ? 'Fee: ' + desc : 'Bank fee', amt: round2(-fee), bal, bankCat: 'Fees', fee: true });
  }
  if (out.closing == null && prev != null && rs.length) out.closing = prev;
  if (mism) out.warnings.push(`${mism} transaction${mism === 1 ? '' : 's'} did not follow the running balance. Check the result before relying on it.`);
  if (pend) out.warnings.push(`Skipped ${pend} pending transaction${pend === 1 ? '' : 's'} that had not changed the balance yet.`);
  return out;
}

function parseStatementLines(lines) {
  const bank = detectBank(lines);
  const special = { capitec: parseCapitec, nedbank: parseNedbank, fnb: parseFnb }[bank];
  let res = null;
  if (special) { res = special(lines); res.recon = reconcile(res); }
  // Other banks, or a known bank whose layout has changed: read the table by its column headings.
  if (!res || !res.tx.length || (res.recon && !res.recon.ok)) {
    const g = parseGeneric(lines, bankName(bank)); g.recon = reconcile(g);
    const score = r => !r ? -1 : (r.tx.length ? 1 : 0) + (r.recon && r.recon.ok ? 2 : 0);
    if (score(g) > score(res)) res = g;
  }
  const head = lines.slice(0, 40).map(l => l.text).join(' ');
  if (!res.tx.length && /confirmation of bank(?:ing)? (?:details|account)|bank confirmation letter|account confirmation letter|proof of (?:bank )?account|serves as confirmation that the banking details/i.test(head))
    return { bank: null, tx: [], warnings: ['This is a bank confirmation letter, not a statement. Download a statement or transaction history from your bank instead.'] };
  if (!res.tx.length && !bank)
    return { bank: null, tx: [], warnings: ['This statement layout could not be read. Try the bank\'s CSV, OFX or QIF download instead (most South African banks offer one in online banking).'].concat(res.warnings || []) };
  if (!res.tx.length) res.warnings.push(/no transactions/i.test(lines.map(l => l.text).join(' ')) ? 'The statement says there were no transactions in this period.' : 'No transactions were found in this file.');
  return res;
}

/* ---------- CSV (any bank) ---------- */
function parseCsvText(text) {
  const first = text.split('\n').filter(l => l.trim()).slice(0, 15).join('\n');
  const delim = [',', ';', '\t', '|'].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
function anyDate(s) {
  s = (s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/))) return validIso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-\/. ](\d{1,2})[-\/. ](\d{4})/))) return validIso(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return validIso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{4})/)) && monIdx(m[2])) return validIso(+m[3], monIdx(m[2]), +m[1]);
  return null;
}
/* "R1 234.56", "-1234,56", "(80.00)", "250.00-", "1 234.56 Cr", "100.00 DR" */
function anyNum(s) {
  s = (s || '').replace(/[\s ]/g, '');
  let sfx = ''; const m = s.match(/([CcDd][Rr])$/); if (m) { sfx = m[1].toLowerCase(); s = s.slice(0, -2); }
  s = s.replace(/R/g, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /^-/.test(s) || sfx === 'dr';
  s = s.replace(/[()\-+]/g, '');
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s); if (isNaN(n)) return null;
  return neg ? -n : n;
}
/* Order by date and, when every row has a balance, derive opening/closing so the import can be reconciled. */
function finishByBalance(out) {
  const tx = out.tx;
  if (tx.length > 1) { let up = 0, down = 0; for (let i = 1; i < tx.length; i++) { if (tx[i].d > tx[i - 1].d) up++; else if (tx[i].d < tx[i - 1].d) down++; } if (down > up) tx.reverse(); }
  if (tx.length && tx.every(t => t.bal != null)) {
    const r0 = tx[0]._r;
    out.opening = round2(tx[0].bal - tx.filter(t => t._r === r0).reduce((s, t) => s + t.amt, 0));
    out.closing = tx[tx.length - 1].bal;
    out.recon = reconcile(out);
  }
  tx.forEach(t => delete t._r);
  if (!tx.length && !out.warnings.length) out.warnings.push('No rows with a date and an amount were found.');
  return out;
}
/* Exports with no header row (e.g. Standard Bank's "HIST,20250102,,-150.00,..." records): find the date,
   amount and balance columns from the data itself; the balance column is the one the amounts add up to. */
const NUMCELL = /^\(?[-+]?R?[-+]?\d[\d,.]*\)?[-+]?(?:[CcDd][Rr])?$/;
function inferCsv(rows, out) {
  const w = Math.max(0, ...rows.map(r => r.length));
  let dc = -1, best = 1;
  for (let c = 0; c < w; c++) { const k = rows.filter(r => anyDate(r[c])).length; if (k > best) { best = k; dc = c; } }
  if (dc < 0) return false;
  let rs = rows.filter(r => anyDate(r[dc]));
  const tags = {}; rs.forEach(r => { const v = (r[0] || '').trim(); if (/^[A-Z]{2,6}$/.test(v)) tags[v] = (tags[v] || 0) + 1; });
  const top = Object.entries(tags).sort((a, b) => b[1] - a[1])[0];
  if (dc !== 0 && top && top[1] >= rs.length * 0.5) rs = rs.filter(r => (r[0] || '').trim() === top[0]);
  const cell = (r, c) => (r[c] || '').replace(/[\s ]/g, '');
  const nc = [];
  for (let c = 0; c < w; c++) if (c !== dc && rs.filter(r => NUMCELL.test(cell(r, c))).length >= rs.length * 0.8 && rs.some(r => /[.,]\d{2}(?:[CcDd][Rr])?-?\)?$/.test(cell(r, c)))) nc.push(c);
  if (!nc.length) return false;
  const v = (r, c) => anyNum(r[c]);
  let ac = nc[0], bc = -1, bs = 0;
  for (const a of nc) for (const b of nc) if (a !== b) {
    let s = 0;
    for (let i = 1; i < rs.length; i++) {
      const pb = v(rs[i - 1], b), pa = v(rs[i - 1], a), x = v(rs[i], a), y = v(rs[i], b);
      if (pb == null || x == null || y == null) continue;
      if (Math.abs(pb + x - y) < 0.006 || (pa != null && Math.abs(y + pa - pb) < 0.006)) s++;
    }
    if (s > bs) { bs = s; ac = a; bc = b; }
  }
  if (bc < 0) { const mixed = nc.find(c => rs.some(r => (v(r, c) || 0) < 0)); if (mixed != null) ac = mixed; }
  const tc = [];
  for (let c = 0; c < w; c++) {
    if (c === dc || nc.includes(c)) continue;
    const vals = rs.map(r => (r[c] || '').trim());
    if (vals.filter(x => /[a-z]{2}/i.test(x)).length >= rs.length * 0.3 && new Set(vals).size > 1) tc.push(c);
  }
  rs.forEach((r, ri) => {
    const amt = v(r, ac); if (!amt) return;
    const parts = []; tc.forEach(c => { const x = (r[c] || '').replace(/\s+/g, ' ').trim(); if (x && !parts.includes(x)) parts.push(x); });
    const desc = parts.join(' ');
    const row = { d: anyDate(r[dc]), desc: desc || 'Transaction', amt: round2(amt), bal: bc >= 0 ? v(r, bc) : null, bankCat: '', _r: ri };
    if (amt < 0 && FEE_DESC_RE.test(desc)) { row.fee = true; row.bankCat = 'Fees'; }
    out.tx.push(row);
  });
  return out.tx.length > 0;
}
function parseCsvStatement(text, name) {
  const rows = parseCsvText(text);
  const out = { bank: 'CSV', account: (name || 'CSV').replace(/\.[^.]+$/, '').slice(0, 30), tx: [], opening: null, closing: null, warnings: [], recon: null };
  const hi = rows.findIndex(r => r.filter(c => c.trim()).length >= 3 && r.every(c => c.length < 60) && r.some(c => /date/i.test(c)) && r.some(c => /desc|narrat|detail|reference|transaction|payee|beneficiary|particular/i.test(c)));
  // bank name: legal-name markers anywhere, else a brand named in the preamble above the data
  const dataAt = hi >= 0 ? hi : Math.max(0, rows.findIndex(r => r.some(c => anyDate(c) && !/[a-z]/i.test(c))));
  out.bank = bankName(detectBankText(text.toLowerCase(), rows.slice(0, dataAt).map(r => r.join(' ')).join('\n').toLowerCase())) || 'CSV';
  if (hi < 0) {
    if (!inferCsv(rows, out)) out.warnings.push('Could not find the date, description and amount columns in this file.');
    return finishByBalance(out);
  }
  const h = rows[hi].map(c => c.trim().toLowerCase()); const taken = new Set();
  const find = (...res) => { for (const re of res) { const i = h.findIndex((c, j) => !taken.has(j) && re.test(c)); if (i >= 0) { taken.add(i); return i; } } return -1; };
  const cDate = find(/^(transaction |posting |posted |trans |value )?date$/, /date/);
  const cType = find(/^(type|dr\/cr|cr\/dr|debit\/credit|credit\/debit|d\/c|c\/d|transaction type|tran type)$/);
  const cDeb = find(/^(debits?|debit amount|money out|paid out|withdrawals?|amount out)/, /debit|money out|withdraw/);
  const cCred = find(/^(credits?|credit amount|money in|paid in|deposits?|amount in)/, /credit|money in|deposit/);
  const cFee = find(/^(fees?|charges?|service fees?|bank charges)\b/);
  const cBal = find(/balance/);
  const cAmt = find(/^(transaction )?amount/, /amount/);
  const cDesc = find(/^description$/, /desc|narrat|detail|particular/, /reference|transaction|payee|beneficiary/);
  const cCat = find(/^category$/, /categor/);
  const cStatus = find(/^status$/);
  let pend = 0;
  rows.slice(hi + 1).forEach((r, ri) => {
    const d = anyDate(r[cDate]); if (!d) return;
    if (cStatus >= 0 && /pending|reserved|authori[sz]ation/i.test(r[cStatus] || '')) { pend++; return; }
    let amt = null;
    if (cDeb >= 0 || cCred >= 0) { const de = anyNum(r[cDeb]), cr = anyNum(r[cCred]); amt = (cr ? Math.abs(cr) : 0) - (de ? Math.abs(de) : 0); if (!de && !cr) amt = null; }
    if (amt == null && cAmt >= 0) {
      amt = anyNum(r[cAmt]);
      const ty = cType >= 0 ? (r[cType] || '').trim().toLowerCase() : '';
      if (amt != null && /^(d|dr|db|debit|-)$/.test(ty)) amt = -Math.abs(amt); else if (amt != null && /^(c|cr|credit|\+)$/.test(ty)) amt = Math.abs(amt);
    }
    const desc = (r[cDesc] || '').replace(/\s+/g, ' ').trim();
    const bal = cBal >= 0 ? anyNum(r[cBal]) : null, bankCat = cCat >= 0 ? (r[cCat] || '').trim() : '';
    if (amt) { const row = { d, desc, amt: round2(amt), bal, bankCat, _r: ri }; if (amt < 0 && !bankCat && FEE_DESC_RE.test(desc)) { row.fee = true; row.bankCat = 'Fees'; } out.tx.push(row); }
    const fee = cFee >= 0 ? anyNum(r[cFee]) : null;
    if (fee) out.tx.push({ d, desc: 'Fee: ' + desc, amt: round2(-Math.abs(fee)), bal, bankCat: 'Fees', fee: true, _r: ri });
  });
  if (pend) out.warnings.push(`Skipped ${pend} pending transaction${pend === 1 ? '' : 's'}.`);
  return finishByBalance(out);
}

/* ---------- OFX / QFX (Absa, FNB, Standard Bank, Nedbank, Investec and others offer these downloads) ---------- */
function parseOfx(text, name) {
  const tag = (s, t) => { const m = s.match(new RegExp('<' + t + '>\\s*([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  const unesc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"');
  const org = tag(text, 'ORG') || tag(text, 'FID');
  const bank = bankName(detectBankText(text.toLowerCase(), org.toLowerCase())) || org || 'OFX';
  const acct = tag(text, 'ACCTID').replace(/\D/g, '');
  const out = { bank, account: bank + (acct ? ' ' + acct.slice(-4) : ''), tx: [], opening: null, closing: null, warnings: [], recon: null };
  for (const b of text.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0])) {
    const ds = tag(b, 'DTPOSTED') || tag(b, 'DTUSER');
    const d = ds.length >= 8 ? validIso(+ds.slice(0, 4), +ds.slice(4, 6), +ds.slice(6, 8)) : null;
    const amt = anyNum(tag(b, 'TRNAMT'));
    if (!d || !amt) continue;
    const nm = unesc(tag(b, 'NAME')), memo = unesc(tag(b, 'MEMO'));
    const desc = [nm, memo && !nm.toLowerCase().includes(memo.toLowerCase()) ? memo : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const type = tag(b, 'TRNTYPE').toUpperCase();
    const row = { d, desc: desc || type || 'Transaction', amt: round2(amt), bal: null, bankCat: '' };
    if (amt < 0 && (type === 'FEE' || type === 'SRVCHG' || FEE_DESC_RE.test(desc))) { row.fee = true; row.bankCat = 'Fees'; }
    out.tx.push(row);
  }
  out.tx.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  if (!out.tx.length) out.warnings.push('No transactions were found in this OFX file.');
  return out;
}

/* ---------- QIF ---------- */
function parseQif(text, name) {
  const out = { bank: 'QIF', account: (name || 'QIF').replace(/\.[^.]+$/, '').slice(0, 30), tx: [], opening: null, closing: null, warnings: [], recon: null };
  const recs = []; let cur = {};
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l[0] === '!') continue;
    if (l[0] === '^') { if (cur.D) recs.push(cur); cur = {}; continue; }
    const k = l[0], v = l.slice(1).trim();
    if (k === 'U') { if (!cur.T) cur.T = v; } else if ('DTPMN'.includes(k)) cur[k] = v;
  }
  if (cur.D) recs.push(cur);
  // South African banks write dd/mm; switch to mm/dd only when the file proves it
  const parts = recs.map(r => r.D.replace(/'/g, '/').split(/[\/.\-\s]+/).map(Number));
  const ymd = recs.some(r => /^\d{4}/.test(r.D));
  const mdy = !ymd && parts.some(p => p[1] > 12) && !parts.some(p => p[0] > 12);
  recs.forEach((r, i) => {
    const p = parts[i]; const [y, m, d] = ymd ? p : mdy ? [p[2], p[0], p[1]] : [p[2], p[1], p[0]];
    const iso = validIso(y, m, d), amt = anyNum(r.T);
    if (!iso || !amt) return;
    const desc = [r.P, r.M && r.M !== r.P ? r.M : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const row = { d: iso, desc: desc || 'Transaction', amt: round2(amt), bal: null, bankCat: '' };
    if (amt < 0 && FEE_DESC_RE.test(desc)) { row.fee = true; row.bankCat = 'Fees'; }
    out.tx.push(row);
  });
  out.tx.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  if (!out.tx.length) out.warnings.push('No transactions were found in this QIF file.');
  return out;
}

/* Any text download: OFX/QFX, QIF or CSV, recognised by content rather than file name. */
function parseTextStatement(text, name) {
  text = text.replace(/^﻿/, '');
  if (/<OFX>|OFXHEADER/i.test(text.slice(0, 4000))) return parseOfx(text, name);
  if (/^\s*!(?:Type|Account|Option)/i.test(text)) return parseQif(text, name);
  return parseCsvStatement(text, name);
}

if (typeof module !== 'undefined') module.exports = { pdfToLines, parseStatementLines, parseCsvStatement, parseTextStatement, parseOfx, parseQif, parseGeneric, parseFnb, detectBank, dateLead, amtParse };
