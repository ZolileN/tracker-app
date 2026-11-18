import { useMemo } from 'react';
import { budgetFor, budgetSourceFor, budgetTotal, hasOwnBudget } from '../domain/budgets';
import { R0, todayIso } from '../domain/format';
import { periodEnd, periodLabel, summarise, txIn } from '../domain/periods';
import { useAllTx, useBudgetPeriods, useCat } from '../state/derived';
import { useStore } from '../state/store';
import { BudgetPeriodSelect } from './common';

export function Budget() {
  const all = useAllTx();
  const cat = useCat();
  const { periods, period, current, next } = useBudgetPeriods();
  const settings = useStore(s => s.settings);
  const setBudget = useStore(s => s.setBudget);
  const createBudget = useStore(s => s.createBudget);
  const removePeriodBudget = useStore(s => s.removePeriodBudget);
  const setPeriod = useStore(s => s.setPeriod);
  const label = (p: string) => periodLabel(p, settings.startDay);

  const sm = summarise(txIn(all, period), cat);
  const { done, avg, avgInc } = useMemo(() => {
    const done = periods.filter(p => periodEnd(p) < todayIso() && txIn(all, p).length);
    const avg: Record<string, number> = {};
    let avgInc = 0;
    for (const p of done) {
      const s = summarise(txIn(all, p), cat);
      avgInc += s.inc / done.length;
      for (const id in s.byCat) avg[id] = (avg[id] || 0) + s.byCat[id] / done.length;
    }
    return { done, avg, avgInc };
  }, [periods, all, cat]);

  const exp = settings.cats.filter(c => c.type === 'exp');
  const B = budgetFor(settings, period);
  const tb = budgetTotal(B, exp.map(c => c.id));
  const own = hasOwnBudget(settings, period);
  const source = budgetSourceFor(settings, period);
  const isFuture = period > current;
  const nextHasOwn = hasOwnBudget(settings, next);

  return (
    <div className="stack">
      <div className="bar">
        <BudgetPeriodSelect />
        <span className="grow" />
        {period !== next && (
          <button className="btn pri" onClick={() => setPeriod(next)}>
            {nextHasOwn ? `Next month's budget` : `Plan next month (${label(next)})`}
          </button>
        )}
      </div>

      {!own && (
        <div className="card plan">
          <h2>{period === next ? `Plan your budget for ${label(next)}` : `${label(period)} has no budget of its own`}</h2>
          <p className="sub">
            {source ? `Right now it uses the budget made for ${label(source)}${tb ? ` (${R0(tb)})` : ''}. ` : tb ? `Right now it uses your starting budget (${R0(tb)}). ` : 'No budget is set yet. '}
            A budget you make here applies from {label(period)} onwards; earlier months keep theirs.
          </p>
          <div className="bar" style={{ margin: 0 }}>
            {tb > 0 && <button className="btn" onClick={() => createBudget(period, 'copy')}>Copy the current budget</button>}
            <button className="btn" onClick={() => createBudget(period, 'average')} disabled={!done.length}
              title={done.length ? '' : 'Needs at least one completed period of transactions'}>Start from my average spending</button>
            <button className="btn" onClick={() => createBudget(period, 'empty')}>Start empty</button>
          </div>
        </div>
      )}

      <div className="grid kpis">
        <div className="card kpi"><div className="lab">Budget</div><div className="val num">{R0(tb)}</div><div className="note">for {label(period)}</div></div>
        <div className="card kpi">
          <div className="lab">{isFuture ? 'Spent' : 'Spent so far'}</div>
          <div className="val num">{R0(sm.exp)}</div>
          <div className="note">{isFuture ? 'this period has not started' : tb ? Math.round((sm.exp / tb) * 100) + '% of budget' : ''}</div>
        </div>
        <div className="card kpi">
          <div className="lab">Average income</div>
          <div className="val num">{done.length ? R0(avgInc) : '—'}</div>
          <div className="note">{done.length ? `over ${done.length} completed period${done.length === 1 ? '' : 's'}` : 'needs a completed period'}</div>
        </div>
        <div className="card kpi">
          <div className="lab">Budget vs average income</div>
          <div className={`val num ${done.length && tb > avgInc ? 'neg' : ''}`}>{done.length && tb ? R0(avgInc - tb) : '—'}</div>
          <div className="note">{done.length && tb ? (tb > avgInc ? 'budget is more than you earn' : 'not yet allocated') : ''}</div>
        </div>
      </div>

      <div className="card">
        <h2>Budget by category</h2>
        <p className="sub">
          {own
            ? <>{label(period)} has its own budget. It also applies to later months until one of them gets its own.{' '}
                <button className="linkish" onClick={() => removePeriodBudget(period)}>Remove it</button></>
            : 'Changing an amount gives this period a budget of its own, starting from the amounts shown.'}{' '}
          Leave blank for no limit.
        </p>
        <div className="scroll">
          <table>
            <thead><tr><th>Category</th><th className="r">Budget (R)</th><th className="r">Spent</th><th className="r">Average</th><th>Progress</th><th>Status</th></tr></thead>
            <tbody>
              {exp.map(c => {
                const b = +B[c.id] || 0, sp = sm.byCat[c.id] || 0;
                const pct = b ? sp / b : 0;
                const cls = b && pct > 1 ? 'over' : b && pct > 0.85 ? 'near' : '';
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="r">
                      <input type="number" min={0} step={50} inputMode="numeric" defaultValue={b || ''} key={`${period}-${c.id}-${b}`} placeholder="0"
                        onBlur={e => { if ((+e.target.value || 0) !== b) setBudget(period, c.id, +e.target.value); }}
                        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        style={{ width: 100, textAlign: 'right' }} aria-label={`Budget for ${c.name}`} />
                    </td>
                    <td className="r num">{R0(sp)}</td>
                    <td className="r num muted">{done.length ? R0(avg[c.id] || 0) : '—'}</td>
                    <td style={{ minWidth: 120 }}><div className={`meter ${cls}`}><i style={{ width: `${Math.min(100, pct * 100)}%` }} /></div></td>
                    <td className="small">
                      {!b ? '' : pct > 1 ? <span className="badc">▲ Over by {R0(sp - b)}</span> : pct > 0.85 ? <span className="warnc">● {R0(b - sp)} left</span> : <span className="ok">✓ {R0(b - sp)} left</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
