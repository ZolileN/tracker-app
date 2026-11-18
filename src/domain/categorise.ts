import { BANKCAT } from './defaults';
import type { Category, Rule, Settings, Tx } from './types';

/** The merchant / payee part of a description: bank prefixes, card numbers and references removed. */
export function merchantKey(desc: string): string {
  let s = (desc || '').toLowerCase();
  s = s
    .replace(/^fee: /, '')
    .replace(
      /^(recurring card purchase|online purchase|international online purchase|banking app (external )?(payshap|immediate) payment|banking app prepaid purchase|banking app cash sent|pos purchase|payshap credit|fnb app payment to|fnb app transfer (to|from)|send money( app)?( dr)?|banking app transfer (to|received from)|payshap payment received|payment received|debicheck debit order \(\d+\)|digital payment (cr|dt)( absa bank)?|digital transf (cr|dt)|imdte digital pmt( absa bank)?|payshap ext (debit|credit)|acb credit|dc track external|airtime debit|ib payment to|ib transfer (to|from)|magtape credit|credit transfer|card purchase)\s*:?\s*/,
      '',
    );
  s = s.replace(/\(card \d+\)/g, '').replace(/\(\d[\d ]+\)?/g, '').replace(/[#*]?\d{5,}\S*/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

/** Does the rule's text appear at the start of a word, in the right direction? */
export function ruleHit(rule: Rule, low: string, amt: number): boolean {
  if (rule.s === 'in' && amt < 0) return false;
  if (rule.s === 'out' && amt > 0) return false;
  let i = -1;
  while ((i = low.indexOf(rule.k, i + 1)) >= 0) if (i === 0 || !/[a-z0-9]/.test(low[i - 1])) return true;
  return false;
}

/** Bank fee flag -> your rules -> small "fee" charges -> built-in rules -> the bank's category -> uncategorised. */
export function categorise(t: Pick<Tx, 'desc' | 'amt' | 'fee' | 'bankCat'>, rules: Rule[]): string {
  const low = (t.desc || '').toLowerCase();
  if (t.fee) return 'fees';
  for (const r of rules) if (r.user && ruleHit(r, low, t.amt)) return r.cat;
  if (/\bfee\b/.test(low) && t.amt < 0 && Math.abs(t.amt) <= 60) return 'fees';
  for (const r of rules) if (!r.user && ruleHit(r, low, t.amt)) return r.cat;
  const m = BANKCAT[t.amt >= 0 ? 'in' : 'out'][(t.bankCat || '').toLowerCase()];
  if (m) return m;
  return t.amt >= 0 ? 'other_inc' : 'other';
}

/** Re-run the rules over every transaction whose category was not set by hand. Returns the months that changed. */
export function recategorise(months: Record<string, Tx[]>, settings: Settings): Record<string, Tx[]> {
  const valid = new Set(settings.cats.map(c => c.id));
  const changed: Record<string, Tx[]> = {};
  for (const ym in months) {
    let ch = false;
    const list = months[ym].map(t => {
      if (t.man && valid.has(t.cat)) return t;
      const c = categorise(t, settings.rules);
      const cc = valid.has(c) ? c : t.amt >= 0 ? 'other_inc' : 'other';
      if (cc === t.cat) return t;
      ch = true;
      return { ...t, cat: cc };
    });
    if (ch) changed[ym] = list;
  }
  return changed;
}

export function catLookup(cats: Category[]) {
  const byId = new Map(cats.map(c => [c.id, c]));
  const fallback = byId.get('other') ?? { id: 'other', name: 'Uncategorised', type: 'exp' as const };
  return (id: string): Category => byId.get(id) ?? fallback;
}
