/* "Share this statement's layout": the positions of every piece of text on the statement, with the text
   masked so nothing personal is left. Letters become x / X and digits become 9, except a short list of
   common statement words (column headings, month names, bank names) and dates, which are what the parser
   keys on. Names, account numbers, amounts, balances and descriptions are all masked. */
import type { Line, ParseResult } from './types';

const KEEP = new Set(
  (
    // column headings and statement vocabulary
    'date dates category categories description descriptions details narrative particulars reference transaction transactions amount amounts ' +
    'balance balances debit debits credit credits fee fees charge charges service money in out opening closing brought forward ' +
    'carried statement statements period from to page of total totals turnover cr dr r zar account number no type pending uncleared ' +
    'running posting posted value trans tran txn payments payment deposits deposit withdrawals withdrawal interest vat available ' +
    'current savings cheque transfer transfers found there were the and for at on by summary accrued effective processed ' +
    // generic transaction types (say what kind of row it is, not who it was with)
    'pos purchase card online recurring international debicheck order eft immediate prepaid airtime electricity atm cash sent received ' +
    'monthly admin notification sms instant payshap app banking digital salary ' +
    // months
    'jan january feb february mar march apr april may jun june jul july aug august sep sept september oct october nov november dec december ' +
    // banks (detection works on these)
    'bank limited ltd mutual capitec capitecbank absa fnb first national firstrand nedbank standard standardbank south africa african africanbank ' +
    'gotyme tyme tymebank discovery investec bidvest bidvestbank old oldmutual zero bankzero ubank postbank grindrod sasfin mercantile co za com www'
  ).split(/\s+/),
);

/* Dates are kept as they are: their format is what most often needs fixing, and on their own they say little. */
const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const DATE_RE = new RegExp(
  '\\b(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}|\\d{1,2}[ -]' + MON + '(?:[ -,]+\\d{4})?|' + MON + ' \\d{1,2},? \\d{4}|\\d{8}(?=\\b))(?!\\d)',
  'gi',
);
/** A whole item that is just "01 27" or "01/27": a short date (Standard Bank prints "MM DD"). */
const SHORT_DATE = /^\d{1,2}[ /]\d{1,2}$/;

const maskWords = (s: string) =>
  s.replace(/[A-Za-z]+/g, w => (KEEP.has(w.toLowerCase()) ? w : w.replace(/[A-Z]/g, 'X').replace(/[a-z]/g, 'x'))).replace(/\d/g, '9');

/** Mask one piece of text, keeping its length, punctuation and any dates. */
export function maskText(s: string): string {
  if (SHORT_DATE.test(s.trim())) return s;
  let out = '', at = 0;
  for (const m of s.matchAll(DATE_RE)) {
    // an 8-digit run is kept only if it reads as a yyyymmdd date
    if (/^\d{8}$/.test(m[0]) && !/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(m[0])) continue;
    out += maskWords(s.slice(at, m.index)) + m[0].replace(/[A-Za-z]+/g, w => (KEEP.has(w.toLowerCase()) ? w : w.replace(/[A-Z]/g, 'X').replace(/[a-z]/g, 'x')));
    at = m.index! + m[0].length;
  }
  return out + maskWords(s.slice(at));
}

export function maskLines(lines: Line[]): Line[] {
  return lines.map(l => {
    const items = l.items.map(it => ({ s: maskText(it.s), x: Math.round(it.x * 10) / 10, r: Math.round(it.r * 10) / 10 }));
    return { page: l.page, y: Math.round(l.y * 10) / 10, items, text: items.map(i => i.s).join(' ') };
  });
}

export interface LayoutReport {
  kind: 'budget-tracker-layout';
  v: 1;
  app: string;
  created: string;
  file: string;
  /** What the app made of it (no amounts) */
  result: { bank: string | null; transactions: number; reconciles: boolean | null; warnings: string[] };
  /** PDF: masked text with positions */
  lines?: { p: number; y: number; items: [number, number, string][] }[];
  /** CSV / OFX / QIF: the first rows, masked */
  textHead?: string[];
}

export function layoutReport(o: { fileName: string; res: ParseResult; lines?: Line[]; text?: string; app: string }): LayoutReport {
  const ext = (o.fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
  return {
    kind: 'budget-tracker-layout',
    v: 1,
    app: o.app,
    created: new Date().toISOString().slice(0, 10),
    file: 'statement' + ext,
    result: {
      bank: o.res.bank,
      transactions: o.res.tx.length,
      reconciles: o.res.recon ? o.res.recon.ok : null,
      // warnings can quote a count, never an amount or name
      warnings: o.res.warnings.map(w => w.replace(/\d+(?:[.,]\d+)?/g, n => (/^\d{1,3}$/.test(n) ? n : '9'))),
    },
    ...(o.lines ? { lines: maskLines(o.lines).map(l => ({ p: l.page, y: l.y, items: l.items.map(i => [i.x, i.r, i.s] as [number, number, string]) })) } : {}),
    ...(o.text != null ? { textHead: o.text.split(/\r?\n/).slice(0, 60).map(maskText) } : {}),
  };
}

/** Turn a report back into lines, so the parser can be tried on it (tools/check-layout.ts). */
export function reportLines(r: LayoutReport): Line[] {
  return (r.lines ?? []).map(l => {
    const items = l.items.map(([x, rr, s]) => ({ x, r: rr, s }));
    return { page: l.p, y: l.y, items, text: items.map(i => i.s).join(' ') };
  });
}
