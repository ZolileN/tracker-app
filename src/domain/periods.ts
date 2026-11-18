import { fmtDate, fmtDateY, isoOf, MON, todayIso } from './format';
import type { Category, Tx } from './types';

/** Budget periods run from payday to the day before the next payday. The key is the start date. */
export function periodKey(iso: string, startDay: number): string {
  const sd = startDay || 1;
  let y = +iso.slice(0, 4), m = +iso.slice(5, 7);
  const d = +iso.slice(8);
  if (d < sd) { m--; if (m < 1) { m = 12; y--; } }
  return `${y}-${String(m).padStart(2, '0')}-${String(sd).padStart(2, '0')}`;
}

export function periodEnd(key: string): string {
  return isoOf(new Date(+key.slice(0, 4), +key.slice(5, 7), +key.slice(8) - 1));
}

export function periodLabel(key: string, startDay: number): string {
  if ((startDay || 1) === 1) return `${MON[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
  return `${fmtDate(key)} – ${fmtDateY(periodEnd(key))}`;
}

/** Every period that has a transaction, plus the current one, newest first. */
export function periodsOf(all: Tx[], startDay: number): string[] {
  const set = new Set(all.map(t => periodKey(t.d, startDay)));
  set.add(periodKey(todayIso(), startDay));
  return [...set].sort().reverse();
}

export function txIn(all: Tx[], key: string): Tx[] {
  const e = periodEnd(key);
  return all.filter(t => t.d >= key && t.d <= e);
}

export interface Summary {
  inc: number;
  exp: number;
  net: number;
  /** transfers in / out between own accounts (not counted) */
  xin: number;
  xout: number;
  /** category id -> total (positive for both income and spending) */
  byCat: Record<string, number>;
}

export function summarise(list: Tx[], cat: (id: string) => Category): Summary {
  let inc = 0, exp = 0, xin = 0, xout = 0;
  const byCat: Record<string, number> = {};
  for (const t of list) {
    const ty = cat(t.cat).type;
    if (ty === 'xfer') { if (t.amt > 0) xin += t.amt; else xout -= t.amt; continue; }
    if (ty === 'inc') inc += t.amt; else exp -= t.amt;
    byCat[t.cat] = (byCat[t.cat] || 0) + (ty === 'inc' ? t.amt : -t.amt);
  }
  return { inc, exp, net: inc - exp, xin, xout, byCat };
}
