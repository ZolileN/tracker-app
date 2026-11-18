import { useMemo } from 'react';
import { R0, todayIso } from '../domain/format';
import { periodEnd, periodLabel, summarise, txIn } from '../domain/periods';
import { useAllTx, useCat, usePeriods } from '../state/derived';
import { useStore } from '../state/store';
import { PeriodSelect } from './common';

export function Budget() {
  const all = useAllTx();
  const cat = useCat();
  const { periods, period } = usePeriods();
  const settings = useStore(s => s.settings);
  const setBudget = useStore(s => s.setBudget);
  const fill = useStore(s => s.fillBudgetsFromAverage);
  const B = settings.budgets;
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
  const tb = exp.reduce((s, c) => s + (+B[c.id] || 0), 0);

  return (
    <>
      <div className="bar">
        <PeriodSelect />
        <span className="grow" />
        <button className="btn" onClick={fill} disabled={!done.length}>Fill from my average spending</button>
      </div>
      <div className="grid kpis" style={{ marginBottom: 12 }}>
        <div className="card kpi"><div className="lab">Total budget</div><div className="val num">{R0(tb)}</div><div className="note">per period</div></div>
        <div className="card kpi"><div className="lab">Spent this period</div><div className="val num">{R0(sm.exp)}</div><div className="note">{tb ? Math.round((sm.exp / tb) * 100) + '% of budget' : ''}</div></div>
        <div className="card kpi">
          <div className="lab">Average income</div>
          <div className="val num">{done.length ? R0(avgInc) : '—'}</div>
          <div className="note">{done.length ? `over ${done.length} completed period${done.length === 1 ? '' : 's'}` : 'needs a completed period'}</div>
        </div>
        <div className="card kpi">
          <div className="lab">Budget vs average income</div>
          <div className={`val num ${done.length && tb > avgInc ? 'neg' : ''}`}>{done.length && tb ? R0(avgInc - tb) : '—'}</div>
          <div className="note">{done.length && tb ? (tb > avgInc ? 'budget is more than you earn' : 'unallocated') : ''}</div>
        </div>
      </div>
      <div className="card">
        <h2>Budget by category</h2>
        <p className="sub">Set an amount per period ({periodLabel(period, settings.startDay)} shown). Leave blank for no limit.</p>
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
                      <input type="number" min={0} step={50} inputMode="numeric" defaultValue={b || ''} key={`${c.id}-${b}`} placeholder="0"
                        onBlur={e => setBudget(c.id, +e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
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
    </>
  );
}
