import type { ParsedTx, Recon } from './types';

export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Key of the column whose position is closest to `r`. */
export function nearestCol<K extends string>(cols: Partial<Record<K, number>>, r: number): K | null {
  let best: K | null = null;
  let bd = 1e9;
  for (const k in cols) {
    const v = cols[k];
    if (v == null) continue;
    const d = Math.abs(v - r);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

export function reconcile(res: { opening: number | null; closing: number | null; tx: ParsedTx[] }): Recon | null {
  if (res.opening == null || res.closing == null) return null;
  const sum = res.tx.reduce((s, t) => s + t.amt, 0);
  const diff = round2(res.opening + sum - res.closing);
  return { ok: Math.abs(diff) < 0.02, diff };
}

/* ---------- Dates in any format a South African bank prints ---------- */

const MON_FULL = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i;

/** 1-12 for a month name ("Mar", "March"), else 0. */
export function monIdx(s: string): number {
  return MON_FULL.test(s) ? MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1 : 0;
}

export function validIso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A date at the start of a string. Full dates have y/m/d; "12 Mar" has m/d only;
 * an ambiguous "03 12" or "03/12" has a/b (dd/mm or mm/dd, decided later from the statement period).
 */
export interface DatePart {
  y?: number;
  m?: number;
  d?: number;
  a?: number;
  b?: number;
  rest: string;
}

export function dateLead(input: string | null | undefined): DatePart | null {
  const s = (input ?? '').trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d])\s*(.*)$/)))
    return validIso(+m[1], +m[2], +m[3]) ? { y: +m[1], m: +m[2], d: +m[3], rest: m[4] } : null;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?![\d.,])\s*(.*)$/)))
    return validIso(+m[3], +m[2], +m[1]) ? { y: +m[3], m: +m[2], d: +m[1], rest: m[4] } : null;
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]([A-Za-z]{3,9})\.?(?:[\s\-,]+(\d{4}|\d{2}(?![\d.,:])))?(?![a-z])\s*(.*)$/i)) && monIdx(m[2])) {
    const mo = monIdx(m[2]);
    return m[3] ? { y: +m[3], m: mo, d: +m[1], rest: m[4] } : { m: mo, d: +m[1], rest: m[4] };
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s(\d{1,2}),?\s(\d{4})(?![\d])\s*(.*)$/)) && monIdx(m[1]))
    return { y: +m[3], m: monIdx(m[1]), d: +m[2], rest: m[4] };
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?![\d.,])\s*(.*)$/)) && validIso(+m[1], +m[2], +m[3]))
    return { y: +m[1], m: +m[2], d: +m[3], rest: m[4] };
  if ((m = s.match(/^(\d{1,2})[\s/](\d{1,2})(?![\d.,:/])\s*(.*)$/)) && +m[1] <= 31 && +m[2] <= 31)
    return { a: +m[1], b: +m[2], rest: m[3] };
  return null;
}

export function fullDate(s: string): string | null {
  const p = dateLead(s);
  return p && p.y != null && p.m != null && p.d != null ? validIso(p.y, p.m, p.d) : null;
}

export const dayNo = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8)) / 864e5;

/** Dates in loose text: "2025-03-12", "12/03/2025", "12 March 2025". */
export function anyDate(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return validIso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/))) return validIso(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return validIso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{4})/)) && monIdx(m[2])) return validIso(+m[3], monIdx(m[2]), +m[1]);
  return null;
}

/* ---------- Amounts: "R1 234.56", "-R50.00", "1,234.56 Cr", "250.00-", "(80.00)", "1 234,56", "R150" ---------- */

export const AMT_SRC =
  '(?:(?:\\(\\s?)?[-−]?\\s?R?\\s?[-−]?\\s?(?:\\d{1,3}(?:[ \\u00a0,]\\d{3})+|\\d+)[.,]\\d{2}(?:\\s?\\))?(?:\\s?(?:-|\\+|[CcDd][Rr]))?\\*?' +
  '|[-−]?\\s?R\\s?[-−]?\\s?\\d{1,3}(?:[ \\u00a0,]\\d{3})*(?![\\d.,]))';
export const AMT_TAIL = new RegExp('(?:^|\\s)(' + AMT_SRC + ')\\s*$');

export interface Amount {
  /** Absolute value */
  v: number;
  /** Written as negative: "-R5", "5.00-", "(5.00)" */
  neg: boolean;
  /** "cr" / "dr" suffix, or "" */
  sfx: '' | 'cr' | 'dr';
  /** Trailing "*" (some banks mark fees this way) */
  star: boolean;
}

export function amtParse(s: string): Amount | null {
  let t = s.replace(/[\s ]/g, '').replace(/−/g, '-');
  let neg = false;
  let sfx: Amount['sfx'] = '';
  let star = false;
  if (/\*$/.test(t)) { star = true; t = t.slice(0, -1); }
  const m = t.match(/([CcDd][Rr])$/);
  if (m) { sfx = m[1].toLowerCase() as 'cr' | 'dr'; t = t.slice(0, -2); }
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/-$/.test(t)) { neg = true; t = t.slice(0, -1); } else if (/\+$/.test(t)) t = t.slice(0, -1);
  if (/^R?-/.test(t)) neg = true;
  t = t.replace(/[R-]/g, '');
  if (/^\d[\d,]*$/.test(t) && /R/.test(s)) {           // whole rands: "R150"
    const ip = t.replace(/,/g, '');
    return /^\d+$/.test(ip) ? { v: +ip, neg, sfx, star } : null;
  }
  const dm = t.match(/^([\d,.]*\d)[.,](\d{2})$/);
  if (!dm) return null;
  const ip = dm[1].replace(/[,.]/g, '');
  if (!/^\d+$/.test(ip)) return null;
  return { v: +(ip + '.' + dm[2]), neg, sfx, star };
}

/** Loose number from a CSV cell: "R1 234.56", "-1234,56", "(80.00)", "250.00-", "1 234.56 Cr", "100.00 DR". */
export function anyNum(input: string | null | undefined): number | null {
  let s = (input ?? '').replace(/[\s ]/g, '');
  let sfx = '';
  const m = s.match(/([CcDd][Rr])$/);
  if (m) { sfx = m[1].toLowerCase(); s = s.slice(0, -2); }
  s = s.replace(/R/g, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /^-/.test(s) || sfx === 'dr';
  s = s.replace(/[()\-+]/g, '');
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

/* ---------- Descriptions ---------- */

/** Bank charges by their usual wording (not just "fee", which would catch "school fees"). */
export const FEE_DESC_RE =
  /\b(?:monthly (?:acc(?:ount)?|service|admin|management) fee|admin(?:istration)? (?:charge|fee)|transaction (?:charge|fee)|service (?:fee|charge)|bank charges?|acc(?:ount)? fee|notification fee|sms (?:fee|notification)|statement fee|stamped statement|honouring fee|unpaid .*fee|insufficient funds fee|debit order fee|cash (?:deposit|withdrawal) fee|atm (?:withdrawal )?fee|card (?:replacement )?fee|decl(?:ined)? .*fee|overdraft (?:fee|interest)|fixed monthly fee|bundle fee)\b/i;

export function cleanDesc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/\(\s*\d{1,3}(?:[ ,]\d{3})*,\d{2}\s*\)/g, ' ') // Absa shows the accrued fee as "( 7,50 )"; it is charged later as its own row
    .replace(/\(effec \d{8}\)/gi, ' ')
    .replace(/\bcard no\.? ?\d{4}\b/gi, ' ')
    .replace(/\b\d{4,6}[*xX]{4,}\d{3,4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
