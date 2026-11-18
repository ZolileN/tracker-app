import { isoOf } from './format';
import { periodEnd, periodKey } from './periods';
import type { Settings } from './types';

export type Budget = Record<string, number>;

/** The period whose budget applies to `period`: the latest one, on or before it, that has its own budget. */
export function budgetSourceFor(s: Settings, period: string): string | null {
  let best: string | null = null;
  for (const k of Object.keys(s.periodBudgets ?? {})) if (k <= period && (!best || k > best)) best = k;
  return best;
}

/** The budget that applies to a period. */
export function budgetFor(s: Settings, period: string): Budget {
  const src = budgetSourceFor(s, period);
  return (src && s.periodBudgets?.[src]) || s.budgets || {};
}

export const hasOwnBudget = (s: Settings, period: string) => !!s.periodBudgets?.[period];

export const budgetTotal = (b: Budget, expIds: string[]) => expIds.reduce((t, id) => t + (+b[id] || 0), 0);

/** The pay period after `key`. */
export function nextPeriod(key: string, startDay: number): string {
  const e = periodEnd(key);
  const d = new Date(+e.slice(0, 4), +e.slice(5, 7) - 1, +e.slice(8) + 1);
  return periodKey(isoOf(d), startDay);
}

/** Budget for any date range: each day gets its period's budget divided by that period's length.
    For exactly one pay period this is that period's budget. */
export function budgetForRange(s: Settings, from: string, to: string): Budget {
  const out: Budget = {};
  const cache = new Map<string, { b: Budget; days: number }>();
  for (let d = new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8)); isoOf(d) <= to; d.setDate(d.getDate() + 1)) {
    const key = periodKey(isoOf(d), s.startDay);
    let p = cache.get(key);
    if (!p) {
      const e = periodEnd(key);
      const days = Math.round((Date.UTC(+e.slice(0, 4), +e.slice(5, 7) - 1, +e.slice(8)) - Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8))) / 864e5) + 1;
      p = { b: budgetFor(s, key), days };
      cache.set(key, p);
    }
    for (const id in p.b) out[id] = (out[id] || 0) + (+p.b[id] || 0) / p.days;
  }
  for (const id in out) out[id] = Math.round(out[id] * 100) / 100;
  return out;
}
