import { describe, expect, it } from 'vitest';
import { budgetFor, budgetForRange, budgetSourceFor, nextPeriod } from '../src/domain/budgets';
import { mergeSettings } from '../src/domain/settings';

const settings = mergeSettings({
  startDay: 25,
  budgets: { groceries: 1000 }, // starting budget
  periodBudgets: {
    '2026-09-25': { groceries: 2000 },
    '2026-11-25': { groceries: 3000, transport: 500 },
  },
});

describe('budgets per period', () => {
  it('uses the starting budget before any period has its own', () => expect(budgetFor(settings, '2026-08-25')).toEqual({ groceries: 1000 }));
  it('uses a period\'s own budget', () => expect(budgetFor(settings, '2026-09-25')).toEqual({ groceries: 2000 }));
  it('carries a budget forward to later periods', () => {
    expect(budgetFor(settings, '2026-10-25')).toEqual({ groceries: 2000 });
    expect(budgetSourceFor(settings, '2026-10-25')).toBe('2026-09-25');
  });
  it('lets next month have its own budget without changing earlier months', () => {
    expect(budgetFor(settings, '2026-11-25').transport).toBe(500);
    expect(budgetFor(settings, '2026-10-25').transport).toBeUndefined();
  });
  it('finds the next pay period, across a year end', () => {
    expect(nextPeriod('2026-10-25', 25)).toBe('2026-11-25');
    expect(nextPeriod('2026-12-25', 25)).toBe('2027-01-25');
    expect(nextPeriod('2026-12-01', 1)).toBe('2027-01-01');
  });
});

describe('budget for a custom date range', () => {
  it('equals the period budget for exactly one period', () => expect(budgetForRange(settings, '2026-09-25', '2026-10-24').groceries).toBe(2000));
  it('is pro rata for part of a period', () => expect(budgetForRange(settings, '2026-09-25', '2026-10-09').groceries).toBe(1000)); // 15 of 30 days
  it('adds up across periods with different budgets', () => {
    // all of 25 Sep–24 Oct (2000) + all of 25 Oct–24 Nov (2000, carried forward) + all of 25 Nov–24 Dec (3000)
    expect(budgetForRange(settings, '2026-09-25', '2026-12-24').groceries).toBe(7000);
  });
});
