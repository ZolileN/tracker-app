import { describe, expect, it } from 'vitest';
import { categorise, merchantKey } from '../src/domain/categorise';
import { DEF_RULES } from '../src/domain/defaults';
import { R } from '../src/domain/format';
import { prepImport } from '../src/domain/importing';
import { periodEnd, periodKey, periodLabel } from '../src/domain/periods';
import { makeBackup, mergeSettings, readBackup } from '../src/domain/settings';
import type { ParseResult } from '../src/parser';

describe('categorise', () => {
  const t = (desc: string, amt: number, extra = {}) => categorise({ desc, amt, ...extra }, DEF_RULES);
  it('uses built-in rules by direction', () => {
    expect(t('POS PURCHASE SHOPRITE DE AAR', -120)).toBe('groceries');
    expect(t('Interest Earned at 7.20%', 0.23)).toBe('interest');
    expect(t('ADMIN CHARGE', -362)).toBe('fees');
  });
  it('lets a person\'s rule win over built-in rules', () => {
    expect(categorise({ desc: 'SPAR ROSEPARK', amt: -50 }, [{ k: 'spar rosepark', cat: 'eating', s: 'out', user: true }, ...DEF_RULES])).toBe('eating');
  });
  it('matches at the start of a word, never mid-word', () => {
    expect(t('SHOPRITEHYPER DE AAR', -80)).toBe('groceries');
    expect(t('ASPARAGUS FARM STALL', -80)).not.toBe('groceries'); // "spar" inside a word
  });
  it('always files bank fee rows under fees', () => expect(t('Something', -5, { fee: true })).toBe('fees'));
  it('falls back to uncategorised / other income', () => {
    expect(t('XYZ', -10)).toBe('other');
    expect(t('XYZ', 10)).toBe('other_inc');
  });
  it('finds the merchant in a bank description', () => expect(merchantKey('POS PURCHASE Spar Rosepark Easte')).toBe('spar rosepark easte'));
});

describe('pay-cycle periods', () => {
  it('starts on payday', () => {
    expect(periodKey('2026-03-24', 25)).toBe('2026-02-25');
    expect(periodKey('2026-03-25', 25)).toBe('2026-03-25');
    expect(periodKey('2026-01-10', 25)).toBe('2025-12-25');
    expect(periodEnd('2026-02-25')).toBe('2026-03-24');
  });
  it('labels calendar months simply', () => expect(periodLabel('2026-03-01', 1)).toBe('Mar 2026'));
});

describe('settings and backups', () => {
  it('keeps the person\'s rules and refreshes built-in ones', () => {
    const s = mergeSettings({ startDay: 25, rules: [{ k: 'my landlord', cat: 'housing', s: 'out', user: true }, { k: 'old builtin', cat: 'other', s: '' }] });
    expect(s.rules.filter(r => r.user).map(r => r.k)).toEqual(['my landlord']);
    expect(s.rules.find(r => r.k === 'old builtin')).toBeUndefined();
    expect(s.rules.length).toBe(DEF_RULES.length + 1);
  });
  it('drops built-in rules for deleted categories', () => {
    const s = mergeSettings({ cats: [{ id: 'other', name: 'Uncategorised', type: 'exp' }] });
    expect(s.rules.every(r => s.cats.some(c => c.id === r.cat))).toBe(true);
  });
  it('round-trips a backup and rejects other files', () => {
    const s = mergeSettings({});
    const months = { '2026-03': [{ id: 'a', d: '2026-03-01', desc: 'x', amt: -1, acct: 'Cash', cat: 'other', src: 'man' as const }] };
    expect(readBackup(makeBackup(s, months))?.tx).toHaveLength(1);
    expect(readBackup('{"hello":1}')).toBeNull();
    expect(readBackup('not json')).toBeNull();
  });
});

describe('importing', () => {
  const res: ParseResult = {
    bank: 'Absa', account: 'Absa 8617', opening: 0, closing: 0, warnings: [], recon: null,
    tx: [
      { d: '2026-03-01', desc: 'Same', amt: -10, bal: 90 },
      { d: '2026-03-01', desc: 'Same', amt: -10, bal: 90 },
    ],
  };
  it('gives identical rows different ids and counts what is new', () => {
    const p = prepImport(res, 'a.pdf', new Set(), DEF_RULES);
    expect(new Set(p.tx.map(t => t.id)).size).toBe(2);
    expect(p.fresh).toBe(2);
    expect(prepImport(res, 'a.pdf', new Set(p.tx.map(t => t.id)), DEF_RULES).fresh).toBe(0);
  });
});

it('formats rand amounts', () => {
  expect(R(1234.5)).toBe('R1 234.50');
  expect(R(-50)).toBe('−R50.00');
});
