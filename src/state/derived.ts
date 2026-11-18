import { useMemo } from 'react';
import { catLookup } from '../domain/categorise';
import { periodsOf, txIn } from '../domain/periods';
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
