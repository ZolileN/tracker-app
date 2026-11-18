import { DEF_CATS, DEF_RULES } from './defaults';
import type { Months, Settings, Tx } from './types';

export function defaultSettings(startDay = 25): Settings {
  return { cats: DEF_CATS.map(c => ({ ...c })), rules: DEF_RULES.map(r => ({ ...r })), budgets: {}, startDay, batches: [], v: 1 };
}

/** Saved settings on top of the defaults. The person's own rules are kept; built-in rules always come
    from this version of the app (minus categories that were deleted), so new built-in rules reach everyone. */
export function mergeSettings(saved: unknown): Settings {
  const s = (saved && typeof saved === 'object' ? JSON.parse(JSON.stringify(saved)) : {}) as Partial<Settings>;
  const out: Settings = { ...defaultSettings(), ...s, v: 1 };
  if (!Array.isArray(out.cats) || !out.cats.length) out.cats = DEF_CATS.map(c => ({ ...c }));
  for (const k of ['other', 'xfer', 'fees']) if (!out.cats.find(c => c.id === k)) out.cats.push({ ...DEF_CATS.find(c => c.id === k)! });
  const have = new Set(out.cats.map(c => c.id));
  out.rules = (Array.isArray(s.rules) ? s.rules.filter(r => r && r.user) : []).concat(DEF_RULES.filter(r => have.has(r.cat)).map(r => ({ ...r })));
  if (!out.budgets || typeof out.budgets !== 'object') out.budgets = {};
  if (!Array.isArray(out.batches)) out.batches = [];
  out.startDay = Math.min(28, Math.max(1, Math.round(+out.startDay || 25)));
  return out;
}

const isTx = (t: unknown): t is Tx => {
  const x = t as Tx;
  return !!x && typeof x.id === 'string' && typeof x.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.d) && typeof x.amt === 'number';
};

/** Backup file: the same format as the original single-file app, so old backups restore here. */
export interface Backup {
  app: 'budget-tracker';
  v: 1;
  settings: Settings;
  months: Months;
}

export function makeBackup(settings: Settings, months: Months): string {
  return JSON.stringify({ app: 'budget-tracker', v: 1, settings, months } satisfies Backup);
}

export function readBackup(text: string): { settings: Settings | null; tx: Tx[] } | null {
  let o: { app?: string; settings?: unknown; months?: Record<string, unknown[]> };
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || o.app !== 'budget-tracker' || !o.months || typeof o.months !== 'object') return null;
  const tx = Object.values(o.months).flat().filter(isTx).map(t => ({ ...t, src: t.src === 'man' ? 'man' as const : 'imp' as const, cat: t.cat || 'other', acct: t.acct || 'Account', desc: t.desc || '' }));
  return { settings: o.settings ? mergeSettings(o.settings) : null, tx };
}

export function toCsv(all: Tx[], catName: (id: string) => string): string {
  const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  return ['Date,Description,Amount,Account,Category,Note']
    .concat([...all].sort((a, b) => (a.d < b.d ? -1 : 1)).map(t => [t.d, q(t.desc), t.amt.toFixed(2), q(t.acct), q(catName(t.cat)), q(t.note)].join(',')))
    .join('\n');
}
