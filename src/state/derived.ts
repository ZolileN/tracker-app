import { useMemo } from 'react';
import { nextPeriod } from '../domain/budgets';
import { catLookup } from '../domain/categorise';
import { fmtDateY, todayIso } from '../domain/format';
import { periodEnd, periodKey, periodLabel, periodsOf, txIn } from '../domain/periods';
import type { Tx } from '../domain/types';
import { useStore } from './store';

export function useAllTx(): Tx[] {
  const months = useStore(s => s.months);
  return useMemo(() => Object.values(months).flat(), [months]);
}

export function useCat() {
  const cats = useStore(s => s.settings.cats);
  return useMemo(() => catLookup(cats), [cats]);
}

/** All periods (newest first) and the selected one: the person's choice, else the latest period with transactions. */
export function usePeriods(): { periods: string[]; period: string } {
  const all = useAllTx();
  const startDay = useStore(s => s.settings.startDay);
  const chosen = useStore(s => s.period);
  return useMemo(() => {
    const periods = periodsOf(all, startDay);
    const period = chosen && periods.includes(chosen) ? chosen : periods.find(p => txIn(all, p).length) ?? periods[0];
    return { periods, period };
  }, [all, startDay, chosen]);
}

export function useAccounts(): string[] {
  const all = useAllTx();
  return useMemo(() => [...new Set(all.map(t => t.acct))].sort(), [all]);
}

/** The dates Overview and Transactions show: the selected pay period, or a custom range. */
export interface Range {
  from: string;
  to: string;
  label: string;
  /** The pay period, when the range is one */
  period: string | null;
}

export function useRange(): Range {
  const { period } = usePeriods();
  const custom = useStore(s => s.custom);
  const startDay = useStore(s => s.settings.startDay);
  return useMemo(
    () =>
      custom
        ? { from: custom.from, to: custom.to, label: `${fmtDateY(custom.from)} – ${fmtDateY(custom.to)}`, period: null }
        : { from: period, to: periodEnd(period), label: periodLabel(period, startDay), period },
    [custom, period, startDay],
  );
}

/** Periods a budget can be set for: every period with transactions, the current one and the next one. */
export function useBudgetPeriods(): { periods: string[]; period: string; current: string; next: string } {
  const all = useAllTx();
  const startDay = useStore(s => s.settings.startDay);
  const chosen = useStore(s => s.period);
  return useMemo(() => {
    const current = periodKey(todayIso(), startDay);
    const next = nextPeriod(current, startDay);
    const periods = [...new Set([next, ...periodsOf(all, startDay)])].sort().reverse();
    const withData = periods.find(p => txIn(all, p).length);
    const period = chosen && periods.includes(chosen) ? chosen : withData ?? current;
    return { periods, period, current, next };
  }, [all, startDay, chosen]);
}
