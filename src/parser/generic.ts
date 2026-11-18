/* Generic column-based PDF parser: Absa, Standard Bank, GoTyme, Discovery, Investec and any other bank.
   It finds the table by its column headings, reads each row's date, description and money values,
   then follows the running balance to settle signs and whether a fee column was charged or only accrued. */
import type { Line, ParseResult, ParsedTx } from './types';
import {
  AMT_SRC, AMT_TAIL, amtParse, cleanDesc, dateLead, dayNo, FEE_DESC_RE, fullDate, round2, validIso,
  type Amount, type DatePart,
} from './util';

type ColKey = 'date' | 'desc' | 'fee' | 'debit' | 'credit' | 'amount' | 'bal';
type NumKey = 'fee' | 'debit' | 'credit' | 'amount' | 'bal';
interface Span { x: number; r: number }
type Cols = Partial<Record<ColKey, Span>> & { date: Span; zone: number; dateEnd: number };

const HEAD_COLS: [ColKey, RegExp][] = [
  ['date', /^(?:trans(?:action)?\.?|posting|posted|post|value|process(?:ed|ing)?|txn|tran|effective)?\s?date$/i],
  ['desc', /^(?:transaction\s)?(?:description|details|narrative|particulars|reference|transaction|beneficiary|payee)s?$/i],
  ['fee', /^(?:(?:bank|service)\s)?(?:fees?|charges?)(?:\s\(r\))?\*?$/i],
  ['debit', /^(?:debits?|debit amount|money out|withdrawals?|payments?|paid out|amount out)(?:\s\(r\))?$/i],
  ['credit', /^(?:credits?|credit amount|money in|deposits?|receipts?|paid in|amount in)(?:\s\(r\))?$/i],
  ['amount', /^(?:transaction\s)?amount(?:\s\(r\))?$/i],
  ['bal', /^(?:running\s|closing\s)?balance(?:\s\(r\))?$/i],
];
const NUM_COLS: NumKey[] = ['fee', 'debit', 'credit', 'amount', 'bal'];

/** Split items into words with estimated positions (a header may arrive as one merged item). */
function lineWords(line: Line): { s: string; x: number; r: number }[] {
  const w: { s: string; x: number; r: number }[] = [];
  for (const it of line.items) {
    const cw = (it.r - it.x) / Math.max(1, it.s.length);
    let pos = 0;
    for (const p of it.s.split(/\s+/)) {
      if (!p) continue;
      const i = it.s.indexOf(p, pos);
      w.push({ s: p, x: it.x + i * cw, r: it.x + (i + p.length) * cw });
      pos = i + p.length;
    }
  }
  return w;
}

/** A table header: a date column, at least one money column, and mostly column words. */
export function headerCols(line: Line): Cols | null {
  const w = lineWords(line);
  if (w.length < 3 || w.length > 16) return null;
  const cols: Partial<Record<ColKey, Span>> = {};
  let used = 0;
  for (let i = 0; i < w.length;) {
    let hit = 0;
    for (let k = Math.min(3, w.length - i); k >= 1 && !hit; k--) {
      const ph = w.slice(i, i + k).map(x => x.s).join(' ')
        .replace(/\s?\((?:r|zar|\+|-|−)\)$/i, '') // "Credits (+)", "Amount (R)"
        .replace(/\*$/, '')                       // "Fees*"
        .replace(/:$/, '');
      for (const [key, re] of HEAD_COLS) {
        if (!cols[key] && re.test(ph)) { cols[key] = { x: w[i].x, r: w[i + k - 1].r }; hit = k; break; }
      }
    }
    used += hit;
    i += hit || 1;
  }
  const date = cols.date;
  if (!date || !(cols.bal || cols.amount || (cols.debit && cols.credit)) || Object.keys(cols).length < 3 || used / w.length < 0.6) return null;
  const nums = NUM_COLS.filter(k => cols[k]);
  const zone = Math.min(...nums.map(k => cols[k]!.x)) - 45; // money columns start here
  const right = (Object.keys(cols) as ColKey[]).filter(k => cols[k]!.x > date.x).map(k => cols[k]!.x);
  const dateEnd = right.length ? Math.min(...right) - 2 : date.r + 40;
  return { ...cols, date, zone, dateEnd };
}

function nearestNumCol(cols: Cols, r: number): NumKey | null {
  let best: NumKey | null = null;
  let bd = 1e9;
  for (const k of NUM_COLS) {
    const c = cols[k];
    if (!c) continue;
    const d = Math.abs(c.r - r);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

interface Num extends Amount { r: number; i: number; col: NumKey | null }
interface SplitLine { date: DatePart | null; desc: string; nums: Num[]; marks: string[] }

/** One line split into its date, description text, money values (with their column) and marks such as "##". */
function splitLine(line: Line, cols: Cols): SplitLine {
  const dc = cols.date;
  const dIdx: number[] = [];
  line.items.forEach((it, i) => { if (it.x >= dc.x - 30 && it.x < cols.dateEnd) dIdx.push(i); });
  let date: DatePart | null = null;
  let rest = '';
  if (dIdx.length) {
    const p = dateLead(dIdx.map(i => line.items[i].s).join(' '));
    if (p) { date = p; rest = p.rest || ''; }
  }
  const skip = new Set(date ? dIdx : []);
  const nums: Num[] = [];
  const desc: string[] = rest ? [rest] : [];
  const marks: string[] = [];
  line.items.forEach((it, i) => {
    if (skip.has(i)) return;
    const last = nums[nums.length - 1];
    if (/^(?:cr|dr)$/i.test(it.s) && last && last.i === i - 1 && !last.sfx) { last.sfx = it.s.toLowerCase() as 'cr' | 'dr'; return; }
    if (it.r <= cols.zone) { desc.push(it.s); return; }
    // peel amounts off the end of the item (an item may hold "Spar 34.99" or "-R128.79 R521.88")
    let s = it.s.trim();
    const cw = (it.r - it.x) / Math.max(1, it.s.length);
    const parts: Num[] = [];
    let m: RegExpMatchArray | null;
    while (s && (m = s.match(AMT_TAIL))) {
      const r = it.x + s.length * cw;
      if (r <= cols.zone) break;
      const p = amtParse(m[1]);
      if (!p) break;
      parts.unshift({ ...p, r, i, col: null });
      s = s.slice(0, m.index).trim();
    }
    for (const p of parts) nums.push({ ...p, col: nearestNumCol(cols, p.r) });
    if (s) { if (it.x < cols.zone) desc.push(s); else marks.push(s); }
  });
  let d = desc.join(' ').replace(/\s+/g, ' ').trim();
  // a second date column (posted date + transaction date) is not part of the description
  if (date) for (let q: DatePart | null; d && (q = dateLead(d)) && (q.y || q.m);) d = (q.rest || '').trim();
  return { date, desc: d, nums, marks };
}

const OPEN_RE = /^(?:opening balance|balance brought forward|brought forward|balance b\/f|bal(?:ance)? b\/fwd|b\/f balance|previous (?:statement )?balance|balance at start)/i;
const CLOSE_RE = /^(?:closing balance|balance carried forward|carried forward|balance c\/f|bal(?:ance)? c\/fwd|balance at end)/i;
const SKIP_RE = /^(?:total|sub-?total|turnover|totals|page \d)/i;
const PENDING_RE = /pending|reserved|on hold|unsuccessful|declined/i;
const SECTION_END_RE = /^\s*(?:pending (?:card )?(?:transactions|items|authori[sz]ations)|uncleared (?:items|transactions|cheques)|transactions? on hold|card authori[sz]ations)\b/i;

/** "Closing Balance: R75.99" in a summary box outside the table. */
function summaryBalance(lines: Line[], re: RegExp): Amount | null {
  for (const l of lines) {
    const m = l.text.match(re);
    if (!m || m.index == null) continue;
    const t = l.text.slice(m.index + m[0].length).match(new RegExp('^\\s*:?\\s*(' + AMT_SRC + ')(?:\\s|$)'));
    const p = t && amtParse(t[1]);
    if (p) return p;
  }
  return null;
}

function accountTail(lines: Line[], upTo: number): string {
  const head = lines.slice(0, Math.min(upTo, 60));
  const m = head.map(l => l.text).join('\n').match(/account\s*(?:number|no\.?|#)\s*:?\s*(\d[\d -]{5,20}\d)/i);
  if (m) return m[1].replace(/\D/g, '').slice(-4);
  for (const l of head) for (const it of l.items) if (/^\d{9,12}$/.test(it.s)) return it.s.slice(-4);
  return '';
}

/* ---------- year-less dates ---------- */

interface Period { start: string; end: string }

/** Statement period, used to give year-less dates ("12 Mar", "03 12") a year. */
function statementPeriod(texts: string[]): Period | null {
  const D = '(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{4})';
  const head = texts.slice(0, 150).join('\n');
  const m = head.match(new RegExp(D + '\\s*(?:to|until|through|-|–|—):?\\s*' + D, 'i'));
  if (m) {
    const a = fullDate(m[1]), b = fullDate(m[2]);
    if (a && b) return a <= b ? { start: a, end: b } : { start: b, end: a };
  }
  const all = [...texts.join('\n').matchAll(new RegExp(D, 'g'))].map(x => fullDate(x[1])).filter((x): x is string => !!x).sort();
  return all.length ? { start: all[0], end: all[all.length - 1] } : null;
}

/** Distance in days from a period (0 inside it, with 3 days' slack). */
function periodDist(iso: string, p: Period): number {
  const n = dayNo(iso), s = dayNo(p.start) - 3, e = dayNo(p.end) + 3;
  return n < s ? s - n : n > e ? n - e : 0;
}

interface Row { date: DatePart | null; desc: string[]; nums: Num[]; marks: string[]; page: number; y: number; iso?: string | null }

/** Ambiguous "nn nn" dates are read as dd/mm or mm/dd, whichever fits the period better across the whole statement. */
function resolveDates(rows: Row[], period: Period | null) {
  let ctx = period;
  if (!ctx) {
    const t = new Date();
    const iso = validIso(t.getFullYear(), t.getMonth() + 1, t.getDate())!;
    ctx = { start: iso, end: iso };
  }
  const p = ctx;
  const ey = +p.end.slice(0, 4);
  const pick = (m: number, d: number) => {
    let best: string | null = null, bs = 1e9;
    for (const y of [ey, ey - 1, ey + 1]) {
      const iso = validIso(y, m, d);
      if (iso) { const s = periodDist(iso, p); if (s < bs) { bs = s; best = iso; } }
    }
    return best ? { iso: best, s: bs } : null;
  };
  let dmScore = 0, mdScore = 0;
  for (const r of rows) {
    if (r.date?.a == null || r.date.b == null) continue;
    const x = pick(r.date.b, r.date.a), y = pick(r.date.a, r.date.b);
    dmScore += x ? Math.min(x.s, 400) : 400;
    mdScore += y ? Math.min(y.s, 400) : 400;
  }
  const md = mdScore < dmScore;
  for (const r of rows) {
    const dp = r.date;
    if (!dp) { r.iso = null; continue; }
    if (dp.y != null && dp.m != null && dp.d != null) r.iso = validIso(dp.y, dp.m, dp.d);
    else if (dp.m != null && dp.d != null) r.iso = pick(dp.m, dp.d)?.iso ?? null;
    else if (dp.a != null && dp.b != null) r.iso = (md ? pick(dp.a, dp.b) : pick(dp.b, dp.a))?.iso ?? null;
    else r.iso = null;
  }
}

/* ---------- the parser ---------- */

export function parseGeneric(lines: Line[], name: string | null): ParseResult {
  const label = name || 'Bank statement';
  const out: ParseResult = { bank: label, account: label, tx: [], opening: null, closing: null, warnings: [], recon: null };
  const rows: Row[] = [];
  let cols: Cols | null = null;
  let last: Row | null = null;
  let firstHead = -1;
  let openNum: Amount | null = null;
  let closeNum: Amount | null = null;

  lines.forEach((line, li) => {
    const h = headerCols(line);
    if (h) { cols = h; last = null; if (firstHead < 0) firstHead = li; return; }
    if (!cols) return;
    // a "Pending transactions" / "Uncleared items" section after the table is not part of the balance
    if (SECTION_END_RE.test(line.text) && !/\d[.,]\d{2}/.test(line.text)) { cols = null; last = null; return; }
    const sp = splitLine(line, cols);
    const balNum = sp.nums.find(n => n.col === 'bal') ?? sp.nums[sp.nums.length - 1];
    if (OPEN_RE.test(sp.desc)) { if (balNum && !openNum) openNum = balNum; last = null; return; }
    if (CLOSE_RE.test(sp.desc)) { if (balNum) closeNum = balNum; last = null; return; }
    if (SKIP_RE.test(sp.desc)) { last = null; return; }
    const prevRow: Row | null = last;
    if (sp.date && sp.nums.length) {
      last = { ...sp, desc: [sp.desc], page: line.page, y: line.y };
      rows.push(last);
      return;
    }
    if (!sp.date && sp.nums.some(n => n.col === 'bal') && sp.desc && prevRow && prevRow.page === line.page && prevRow.y - line.y < 60) {
      last = { ...sp, date: prevRow.date, desc: [sp.desc], page: line.page, y: line.y }; // date printed once per day
      rows.push(last);
      return;
    }
    if (!sp.date && !sp.nums.length && sp.desc && prevRow && prevRow.page === line.page && prevRow.y - line.y < 22) {
      prevRow.desc.push(sp.desc); // description continues on the next line
      prevRow.y = line.y;
      return;
    }
    last = null;
  });

  if (firstHead < 0) {
    out.warnings.push('Could not find a transaction table (a row of column headings such as Date, Description, Amount, Balance).');
    return out;
  }
  const tail = accountTail(lines, firstHead);
  out.account = label + (tail ? ' ' + tail : '');
  resolveDates(rows, statementPeriod(lines.map(l => l.text)));
  let rs = rows.filter(r => r.iso);
  // newest-first listings: put them in date order so the running balance can be followed
  let up = 0, down = 0;
  for (let i = 1; i < rs.length; i++) { if (rs[i].iso! > rs[i - 1].iso!) up++; else if (rs[i].iso! < rs[i - 1].iso!) down++; }
  if (down > up) rs = rs.reverse();
  openNum ??= summaryBalance(lines, /\b(?:opening|starting) balance\b/i);
  closeNum ??= summaryBalance(lines, /\b(?:closing|ending) balance\b/i);

  const all = rs.flatMap(r => r.nums);
  const crConv = all.some(n => n.sfx === 'cr'); // "Cr" marks credits; unmarked values are debits
  const amtSigned = all.some(n => n.col === 'amount' && n.neg);
  const sgn = (n: Amount) => (n.neg || n.sfx === 'dr' ? -1 : n.sfx === 'cr' ? 1 : crConv ? -1 : 1);
  const op: Amount | null = openNum, cl: Amount | null = closeNum;
  out.opening = op ? round2(sgn(op) * op.v) : null;
  out.closing = cl ? round2(sgn(cl) * cl.v) : null;

  let prev = out.opening;
  let mism = 0, pend = 0;
  for (const r of rs) {
    const g = (k: NumKey) => r.nums.find(n => n.col === k);
    const nb = g('bal');
    const bal = nb ? round2(sgn(nb) * nb.v) : null;
    const ni = g('credit'), no = g('debit'), na = g('amount'), nf = g('fee');
    const core = (ni ? ni.v : 0) - (no ? no.v : 0);
    // a value in Debit or Credit alone: if the running balance says it belongs in the other column (centred headings), believe the balance
    let opts = (ni && !no) || (no && !ni) ? [core, -core] : [core];
    if (na) {
      const known = na.neg || na.sfx || crConv || amtSigned;
      opts = known ? [core + sgn(na) * na.v] : [core - na.v, core + na.v];
    }
    const fee = nf ? nf.v : 0;
    const cands: [number, boolean][] = [];
    for (const o of opts) { if (fee) cands.push([o, true]); cands.push([o, false]); }
    const desc = cleanDesc(r.desc.join(' '));
    let pick: [number, boolean] | undefined;
    if (prev != null && bal != null) { const pv = prev; pick = cands.find(([o, f]) => Math.abs(round2(pv + o - (f ? fee : 0)) - bal) < 0.006); }
    if (!pick && prev != null && bal != null && Math.abs(bal - prev) < 0.006 && PENDING_RE.test(desc)) { pend++; continue; }
    if (!pick && prev != null && bal != null) mism++;
    const [mainRaw, withFee] = pick ?? cands[0];
    const main = round2(mainRaw), total = round2(main - (withFee ? fee : 0));
    if (prev == null && bal != null && out.opening == null) out.opening = round2(bal - total);
    prev = bal != null ? bal : prev != null ? round2(prev + total) : null;
    if (Math.abs(main) >= 0.005) {
      const row: ParsedTx = { d: r.iso!, desc: desc || (main < 0 ? 'Bank charge' : 'Credit'), amt: main, bal, bankCat: '' };
      if (main < 0 && (FEE_DESC_RE.test(desc) || r.marks.some(m => /^(?:##|\*)$/.test(m)) || nb?.star)) { row.fee = true; row.bankCat = 'Fees'; }
      out.tx.push(row);
    }
    if (withFee && fee >= 0.005) out.tx.push({ d: r.iso!, desc: desc ? 'Fee: ' + desc : 'Bank fee', amt: round2(-fee), bal, bankCat: 'Fees', fee: true });
  }
  if (out.closing == null && prev != null && rs.length) out.closing = prev;
  if (mism) out.warnings.push(`${mism} transaction${mism === 1 ? '' : 's'} did not follow the running balance. Check the result before relying on it.`);
  if (pend) out.warnings.push(`Skipped ${pend} pending transaction${pend === 1 ? '' : 's'} that had not changed the balance yet.`);
  return out;
}
