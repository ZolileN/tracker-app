/* Bank-specific parsers for layouts checked against real statements: Capitec, Nedbank, FNB.
   Every other bank goes through the generic column parser (generic.ts). */
import type { Line, ParseResult, TextItem } from './types';
import { MONTHS, nearestCol, round2 } from './util';

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const NUM_RE = /^-?R?\s?\d{1,3}(?:[ , ]\d{3})*\.\d{2}\s?\*?$/;
const toNum = (s: string): number => parseFloat(s.replace(/[R\s, *]/g, ''));
const isoDate = (s: string): string | null => { const m = s.match(DATE_RE); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

const result = (bank: string): ParseResult => ({ bank, account: bank, tx: [], opening: null, closing: null, warnings: [], recon: null });

/** A dd/mm/yyyy date at the start of the line (Nedbank may put a 6-digit "Tran list no" first). */
function leadingDate(line: Line): { date: string | null; rest: string; idx: number } | null {
  const first = line.items[0];
  if (!first) return null;
  const m = first.s.match(/^(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
  if (m) return { date: isoDate(m[1]), rest: m[2], idx: 0 };
  const second = line.items[1];
  if (/^\d{6}$/.test(first.s) && second) {
    const m2 = second.s.match(/^(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
    if (m2) return { date: isoDate(m2[1]), rest: m2[2], idx: 1 };
  }
  return null;
}

/* ---------- Capitec "Main Account Statement" ---------- */

type CapCols = Partial<Record<'in' | 'out' | 'fee' | 'bal', number>>;
interface CapRow { date: string; desc: string[]; cat: string[]; nums: { v: number; col: keyof CapCols | null }[] }

export function parseCapitec(lines: Line[]): ParseResult {
  const out = result('Capitec');
  const joined = lines.map(l => l.text).join('\n');
  let m = joined.match(/Opening Balance:\s*(-?R[\d , ]+\.\d{2})/);
  if (m) out.opening = toNum(m[1]);
  m = joined.match(/Closing Balance:\s*(-?R[\d , ]+\.\d{2})/);
  if (m) out.closing = toNum(m[1]);
  let cols: CapCols | null = null;
  let cur: CapRow | null = null;
  let inTable = false;
  let catX: number | null = null;
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
      // the header may be one merged item; fall back to the sign of each value then
      if (cols.in == null || cols.bal == null) cols = null;
      continue;
    }
    if (!inTable) continue;
    if (/Includes VAT at|Client Care Centre|Pending Card Transactions|Unique Document No/.test(t)) { flush(); inTable = false; continue; }
    const ld = leadingDate(line);
    if (ld && ld.date) {
      flush();
      const row: CapRow = { date: ld.date, desc: [], cat: [], nums: [] };
      if (ld.rest) row.desc.push(ld.rest);
      for (let i = ld.idx + 1; i < line.items.length; i++) pushCapItem(row, line.items[i], cols, catX);
      cur = row;
    } else if (cur) {
      for (const it of line.items) pushCapItem(cur, it, cols, catX);
    }
  }
  flush();
  return out;
}

function pushCapItem(cur: CapRow, it: TextItem, cols: CapCols | null, catX: number | null) {
  if (NUM_RE.test(it.s) && (!cols || it.r > (cols.in ?? 0) - 60)) {
    cur.nums.push({ v: toNum(it.s), col: cols ? nearestCol(cols, it.r) : null });
    return;
  }
  if (catX != null && it.x >= catX - 3) cur.cat.push(it.s);
  else cur.desc.push(it.s);
}

function finishCap(cur: CapRow, out: ParseResult) {
  const desc = cur.desc.join(' ').replace(/\s+/g, ' ').trim();
  const bankCat = cur.cat.join(' ').replace(/\s+/g, ' ').trim();
  let inn = 0, outt = 0, fee = 0;
  let bal: number | null = null;
  if (cur.nums.length && cur.nums.every(n => n.col)) {
    for (const n of cur.nums) {
      if (n.col === 'in') inn = n.v;
      else if (n.col === 'out') outt = n.v;
      else if (n.col === 'fee') fee = n.v;
      else bal = n.v;
    }
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

export function parseNedbank(lines: Line[]): ParseResult {
  const out = result('Nedbank');
  let cols: Partial<Record<'debit' | 'credit' | 'bal', number>> | null = null;
  let inTable = false;
  let prev: number | null = null;
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
      const n = line.items.filter(i => NUM_RE.test(i.s)).pop();
      if (n) out.closing = toNum(n.s);
      inTable = false;
      continue;
    }
    if (/see money differently|Balance carried forward|Balance brought forward/.test(t)) continue;
    const ld = leadingDate(line);
    if (!ld || !ld.date) continue;
    const descParts = ld.rest ? [ld.rest] : [];
    const nums: { v: number; r: number }[] = [];
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
    let amt: number;
    if (prev != null && Math.abs(round2(prev + a.v) - bal) < 0.006) amt = a.v;
    else if (prev != null && Math.abs(round2(prev - a.v) - bal) < 0.006) amt = -a.v;
    else if (cols) amt = nearestCol({ debit: cols.debit, credit: cols.credit }, a.r) === 'credit' ? a.v : -a.v;
    else amt = -a.v;
    prev = bal;
    // strip the masked card number the bank glues onto card purchases
    desc = desc.replace(/\s?\d{6}X{4,}\d{4}\s*$/, '').trim();
    out.tx.push({ d: ld.date, desc, amt: round2(amt), bal, bankCat: star ? 'Fees' : '', ...(star ? { fee: true } : {}) });
  }
  return out;
}

/* ---------- FNB (cheque / business current account) ---------- */

const FNB_NUM = /^(\d{1,3}(?:[ ,]\d{3})*\.\d{2})\s?(Cr|Dr)?$/;
/** "Cr" = credit (+); "Dr" or no suffix = debit (-). */
const fnbSigned = (v: number, suf: string): number => (suf === 'Cr' ? v : -v);

/** Numbers on a line, attaching a following "Cr"/"Dr" item to the number before it. */
function fnbNums(items: TextItem[], fromIdx: number) {
  const out: { v: number; suf: string; r: number; idx: number }[] = [];
  for (let i = fromIdx; i < items.length; i++) {
    const it = items[i];
    const m = it.s.match(FNB_NUM);
    if (m) { out.push({ v: toNum(m[1]), suf: m[2] || '', r: m[2] ? it.r - 8 : it.r, idx: i }); continue; }
    const last = out[out.length - 1];
    if ((it.s === 'Cr' || it.s === 'Dr') && last && last.idx === i - 1 && !last.suf) last.suf = it.s;
  }
  return out;
}

export function parseFnb(lines: Line[]): ParseResult {
  const out = result('FNB');
  const joined = lines.map(l => l.text).join('\n');
  const pm = joined.match(/Statement Period\s*:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!pm) { out.warnings.push('Could not find the statement period, so transaction years are unknown.'); return out; }
  const sMon = MONTHS.indexOf(pm[2].slice(0, 3).toLowerCase());
  const sYr = +pm[3], eYr = +pm[6];
  // FNB rows carry "dd Mon" only: the start year for months on/after the start month, else the end year
  const yearFor = (mi: number) => (sYr === eYr || mi >= sMon ? sYr : eYr);
  for (const line of lines) {
    const lab = line.items[0]?.s;
    if (lab === 'Opening Balance' || lab === 'Closing Balance') {
      const n = fnbNums(line.items, 1)[0];
      if (!n) continue;
      if (lab === 'Opening Balance' && out.opening == null) out.opening = fnbSigned(n.v, n.suf);
      if (lab === 'Closing Balance' && out.closing == null) out.closing = fnbSigned(n.v, n.suf);
    }
  }
  let cols: Partial<Record<'amt' | 'bal' | 'chg', number>> | null = null;
  let inTable = false;
  for (const line of lines) {
    const t = line.text;
    const names = line.items.map(i => i.s);
    if (names.includes('Date') && names.includes('Description') && names.includes('Amount') && names.includes('Balance')) {
      const get = (n: string) => line.items.find(i => i.s === n);
      cols = { amt: get('Amount')!.r, bal: get('Balance')!.r };
      const chg = get('Bank') || get('Charges');
      if (chg) cols.chg = chg.r;
      inTable = true;
      continue;
    }
    if (!inTable || !cols) continue;
    if (/^\s*(Closing Balance|Turnover for Statement Period)/.test(t)) { inTable = false; continue; }
    const first = line.items[0];
    if (!first) continue;
    const dm = first.s.match(/^(\d{2}) ([A-Z][a-z]{2})(?:\s+(.*))?$/);
    if (!dm) continue;
    const mi = MONTHS.indexOf(dm[2].toLowerCase());
    if (mi < 0) continue;
    const d = `${yearFor(mi)}-${String(mi + 1).padStart(2, '0')}-${dm[1]}`;
    const nums = fnbNums(line.items, 1);
    let amt: number | null = null;
    let bal: number | null = null;
    for (const n of nums) {
      const k = nearestCol(cols, n.r);
      if (k === 'amt' && amt == null) amt = fnbSigned(n.v, n.suf);
      else if (k === 'bal' && bal == null) bal = fnbSigned(n.v, n.suf);
      // k === 'chg': accrued bank charges, billed later as their own row, so not counted here
    }
    const numIdx = new Set(nums.map(n => n.idx));
    const amtR = cols.amt ?? 0;
    let desc = [dm[3] || '']
      .concat(line.items.slice(1).filter((it, i) => !numIdx.has(i + 1) && it.s !== 'Cr' && it.s !== 'Dr' && it.r < amtR - 30).map(i => i.s))
      .join(' ');
    desc = desc.replace(/\b\d{6}\*\d{4}(\s+\d{2} [A-Z][a-z]{2})?/g, '').replace(/\s+/g, ' ').trim();
    if (amt == null || Math.abs(amt) < 0.005) continue; // e.g. "Dr.Int.Rate 24,00000  0.00"
    // FNB prints its monthly service-fee debits with no description
    const isFee = amt < 0 && (!desc || /\bfees?\b/i.test(desc));
    out.tx.push({ d, desc: desc || (amt < 0 ? 'FNB service fees' : 'FNB credit'), amt: round2(amt), bal, bankCat: isFee ? 'Fees' : '', ...(isFee ? { fee: true } : {}) });
  }
  if (!cols) out.warnings.push('Could not find the transaction table in this FNB statement.');
  return out;
}
