import type { ParseResult } from '../parser/types';
import { categorise } from './categorise';
import { hash } from './format';
import type { Rule, Tx } from './types';

/** A file that has been read and is waiting for the person to confirm the import. */
export interface Pending {
  key: string;
  fileName: string;
  res: ParseResult;
  /** Account name the person chose (defaults to res.account) */
  acctName: string;
  tx: Tx[];
  /** How many are not saved yet */
  fresh: number;
  from?: string;
  to?: string;
}

/** Ids come from account + date + amount + balance + description (+ a counter for identical rows),
    so importing an overlapping statement skips what is already saved. */
export function withIds(list: Omit<Tx, 'id'>[], acct: string): Tx[] {
  const seen: Record<string, number> = {};
  return list.map(t => {
    const key = `${acct}|${t.d}|${t.amt}|${t.bal}|${t.desc}`;
    seen[key] = (seen[key] || 0) + 1;
    return { ...t, acct, id: hash(key + '|' + seen[key]) };
  });
}

export function prepImport(res: ParseResult, fileName: string, existing: Set<string>, rules: Rule[]): Pending {
  const acct = res.account || 'Account';
  const base = res.tx.map(t => {
    const o: Omit<Tx, 'id'> = { d: t.d, desc: t.desc, amt: t.amt, acct, src: 'imp', cat: '' };
    if (t.bankCat) o.bankCat = t.bankCat;
    if (t.fee) o.fee = true;
    if (t.bal != null) o.bal = t.bal;
    o.cat = categorise(o, rules);
    return o;
  });
  const tx = withIds(base, acct);
  const dates = tx.map(t => t.d).sort();
  return {
    key: fileName + '|' + Math.random().toString(36).slice(2),
    fileName, res, acctName: acct, tx,
    fresh: tx.filter(t => !existing.has(t.id)).length,
    from: dates[0], to: dates[dates.length - 1],
  };
}
