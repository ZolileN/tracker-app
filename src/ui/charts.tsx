import { fmtDate, fmtDateY, isoOf, MON, R0, todayIso } from '../domain/format';
import { periodLabel, summarise, txIn } from '../domain/periods';
import type { Category, Tx } from '../domain/types';

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
const axisFmt = (v: number, max: number) => (max >= 10000 ? v / 1000 + 'K' : String(v));

function Grid({ max, y, L, right }: { max: number; y: (v: number) => number; L: number; right: number }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map(f => (
        <g key={f}>
          <line className="gl" x1={L} x2={right} y1={y(max * f)} y2={y(max * f)} />
          <text x={L - 6} y={y(max * f) + 4} textAnchor="end">{axisFmt(max * f, max)}</text>
        </g>
      ))}
    </>
  );
}

/** Running total of spending through the period, against the budget. */
export function CumulativeChart({ from, to, list, budget, cat }: { from: string; to: string; list: Tx[]; budget: number; cat: (id: string) => Category }) {
  const days: string[] = [];
  for (let d = new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8)); isoOf(d) <= to; d.setDate(d.getDate() + 1)) days.push(isoOf(d));
  const per: Record<string, number> = {};
  for (const t of list) if (cat(t.cat).type === 'exp') per[t.d] = (per[t.d] || 0) - t.amt;
  const today = todayIso();
  let run = 0;
  const pts: { d: string; v: number; day: number }[] = [];
  for (const d of days) {
    if (d > today) break;
    run += per[d] || 0;
    pts.push({ d, v: run, day: per[d] || 0 });
  }
  if (!pts.length || run <= 0) return <p className="muted">No spending to chart yet.</p>;
  const W = 520, H = 220, L = 40, Rt = 12, T = 12, B = 24;
  const max = niceMax(Math.max(run, budget || 0));
  const x = (i: number) => L + (W - L - Rt) * (days.length > 1 ? i / (days.length - 1) : 0);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const bw = (W - L - Rt) / days.length;
  const li = pts.length - 1, last = pts[li];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Running total of spending, reaching ${R0(run)}`}>
      <Grid max={max} y={y} L={L} right={W - Rt} />
      {budget > 0 && (
        <>
          <line x1={L} x2={W - Rt} y1={y(budget)} y2={y(budget)} stroke="var(--text-3)" strokeWidth={1} />
          <text x={W - Rt} y={y(budget) - 5} textAnchor="end">Budget {R0(budget)}</text>
        </>
      )}
      <path d={`${path}L${x(li)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--series-1)" opacity={0.1} />
      <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(li)} cy={y(last.v)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
      <text x={Math.min(x(li), W - Rt - 4)} y={Math.max(y(last.v) - 10, 10)} textAnchor="end" style={{ fill: 'var(--text)', fontWeight: 600 }}>{R0(last.v)}</text>
      {[0, Math.floor((days.length - 1) / 2), days.length - 1].map((i, k) => (
        <text key={k} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>{fmtDate(days[i])}</text>
      ))}
      {pts.map((p, i) => (
        <rect key={p.d} className="hit" x={x(i) - bw / 2} y={T} width={bw} height={H - T - B}
          data-tip={`${fmtDateY(p.d)}\nSpent so far: ${R0(p.v)}\nThat day: ${R0(p.day)}`} />
      ))}
    </svg>
  );
}

/** Income and spending for the last few periods; click a period to select it. */
export function TrendChart({ periods, all, startDay, cat, onPick }: { periods: string[]; all: Tx[]; startDay: number; cat: (id: string) => Category; onPick: (p: string) => void }) {
  const data = periods.map(p => ({ p, ...summarise(txIn(all, p), cat) }));
  const mx = Math.max(...data.map(d => Math.max(d.inc, d.exp)));
  if (!(mx > 0)) return <p className="muted">Nothing to chart yet.</p>;
  const W = 520, H = 220, L = 40, Rt = 8, T = 16, B = 34;
  const max = niceMax(mx);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const band = (W - L - Rt) / data.length;
  const bw = Math.min(24, (band - 14) / 2);
  const col = (cx: number, v: number, c: string) => {
    const h = Math.max(0, y(0) - y(v));
    if (h < 0.5) return null;
    const r = Math.min(4, h);
    return <path d={`M${cx},${y(0)}V${y(v) + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}Z`} fill={`var(${c})`} />;
  };
  const lab = (p: string) => ((startDay || 1) === 1 ? MON[+p.slice(5, 7) - 1] : fmtDate(p));
  return (
    <>
      <div className="legend"><span><i style={{ background: 'var(--series-1)' }} />Income</span><span><i style={{ background: 'var(--series-2)' }} />Spending</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Income and spending for the last ${data.length} periods`}>
        <Grid max={max} y={y} L={L} right={W - Rt} />
        {data.map((d, i) => {
          const cx = L + band * i + band / 2;
          return (
            <g key={d.p}>
              {col(cx - bw - 1, d.inc, '--series-1')}
              {col(cx + 1, d.exp, '--series-2')}
              <text x={cx} y={H - 18} textAnchor="middle">{lab(d.p)}</text>
              <rect className="hit" x={L + band * i} y={T} width={band} height={H - T - B} style={{ cursor: 'pointer' }} onClick={() => onPick(d.p)}
                data-tip={`${periodLabel(d.p, startDay)}\nIncome: ${R0(d.inc)}\nSpending: ${R0(d.exp)}\n${d.net >= 0 ? 'Left over' : 'Overspent'}: ${R0(Math.abs(d.net))}`} />
            </g>
          );
        })}
        {(startDay || 1) !== 1 && <text x={L} y={H - 4}>period starting</text>}
      </svg>
    </>
  );
}
