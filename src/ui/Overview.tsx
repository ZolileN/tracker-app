import type { ReactNode } from 'react';
import { merchantKey } from '../domain/categorise';
import { isoOf, plural, R, R0 } from '../domain/format';
import { budgetForRange, budgetTotal, type Budget } from '../domain/budgets';
import { periodEnd, periodKey, summarise, type Summary } from '../domain/periods';
import type { Category, Tx } from '../domain/types';
import { useAllTx, useCat, usePeriods, useRange, type Range } from '../state/derived';
import { useStore } from '../state/store';
import { CumulativeChart, TrendChart } from './charts';
import { BankLogos } from './BankLogos';
import { pickStatements, RangePicker } from './common';

export function Overview() {
  const all = useAllTx();
  const cat = useCat();
  const settings = useStore(s => s.settings);
  const { periods } = usePeriods();
  const range = useRange();
  const openEditor = useStore(s => s.openEditor);
  const setPeriod = useStore(s => s.setPeriod);
  const showCategory = useStore(s => s.showCategory);

  if (!all.length) {
    return (
      <div className="card empty">
        <h2>Start by adding your money</h2>
        <p className="muted">
          Upload a bank statement (a PDF from Absa, Capitec, FNB, Nedbank, Standard Bank, GoTyme (TymeBank), Discovery, Investec or another
          South African bank, or a CSV, OFX or QIF download) or capture a transaction by hand.
        </p>
        <p className="bar" style={{ justifyContent: 'center' }}>
          <button className="btn pri" onClick={pickStatements}>Upload statements</button>
          <button className="btn" onClick={() => openEditor()}>Add a transaction</button>
        </p>
        <BankLogos />
      </div>
    );
  }

  const list = inRange(all, range.from, range.to);
  const sm = summarise(list, cat);
  const asc = [...periods].reverse();
  const prevRange = previousRange(range, settings.startDay);
  const prevList = inRange(all, prevRange.from, prevRange.to);
  const prev = prevList.length ? summarise(prevList, cat) : null;
  const expIds = settings.cats.filter(c => c.type === 'exp').map(c => c.id);
  const budget = budgetForRange(settings, range.from, range.to);
  const budTotal = budgetTotal(budget, expIds);
  const vs = range.period ? 'previous period' : `previous ${plural(daysIn(range), 'day')}`;
  const delta = (a: number, b: number | undefined) => {
    if (!prev || !b) return '';
    const d = a - b;
    if (Math.abs(d) < 1) return `same as ${vs}`;
    return `${d > 0 ? '▲' : '▼'} ${R0(Math.abs(d))} vs ${vs}`;
  };
  const cats = Object.entries(sm.byCat).filter(([id, v]) => cat(id).type === 'exp' && v > 0.005).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;

  return (
    <>
      <div className="bar">
        <RangePicker />
        <span className="grow" />
        <button className="btn" onClick={pickStatements}>Upload statement</button>
        <button className="btn pri" onClick={() => openEditor()}>+ Add transaction</button>
      </div>
      <div className="grid kpis">
        <Kpi label="Income" value={R0(sm.inc)} note={delta(sm.inc, prev?.inc)} />
        <Kpi label="Spending" value={R0(sm.exp)} note={delta(sm.exp, prev?.exp)} />
        <Kpi label={sm.net >= 0 ? 'Left over' : 'Overspent'} value={R0(Math.abs(sm.net))} cls={sm.net >= 0 ? 'pos' : 'neg'}
          note={sm.inc <= 0 ? 'no income recorded' : sm.exp > sm.inc ? 'spent more than came in' : Math.round((sm.exp / sm.inc) * 100) + '% of income spent'} />
        <Kpi label="Budget" value={budTotal ? R0(budTotal - sm.exp) : '—'}
          note={budTotal ? (budTotal - sm.exp >= 0 ? 'left of ' : 'over a budget of ') + R0(budTotal) + (range.period ? '' : ' (pro rata)') : <a href="#budget">Set a budget</a>} />
      </div>
      <div className="grid two" style={{ marginTop: 12 }}>
        <div className="card">
          <h2>Where the money went</h2>
          <p className="sub">Spending by category, {range.label}. Transfers between your own accounts are left out.</p>
          {cats.length ? (
            <div className="hb">
              {cats.map(([id, v]) => {
                const b = +budget[id] || 0;
                return (
                  <div key={id} className="row" role="button" tabIndex={0} onClick={() => showCategory(id)} onKeyDown={e => e.key === 'Enter' && showCategory(id)}
                    data-tip={`${cat(id).name}\n${R(v)} · ${Math.round((v / sm.exp) * 100)}% of spending${b ? `\nBudget ${R0(b)}` : ''}\nClick to see the transactions`}>
                    <div className="name">{cat(id).name}</div>
                    <div className="trk"><div className="fill" style={{ width: `${Math.max(0.5, (v / max) * 100)}%` }} /></div>
                    <div className="v num">{R0(v)}</div>
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">No spending in this period.</p>}
        </div>
        <div className="card">
          <h2>What stands out</h2>
          <p className="sub">Worked out from the transactions in these dates</p>
          <Insights list={list} sm={sm} range={range} budget={budget} expIds={expIds} cat={cat} onReview={() => showCategory('other')} />
        </div>
      </div>
      <div className="grid half" style={{ marginTop: 12 }}>
        <div className="card">
          <h2>Spending through the period</h2>
          <p className="sub">Running total of spending, day by day{budTotal ? ', against your budget' : ''}</p>
          <CumulativeChart from={range.from} to={range.to} list={list} budget={budTotal} cat={cat} />
        </div>
        <div className="card">
          <h2>Income and spending by period</h2>
          <p className="sub">Last {Math.min(6, asc.length)} periods</p>
          <TrendChart periods={asc.slice(-6)} all={all} startDay={settings.startDay} cat={cat} onPick={setPeriod} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h2>Biggest payees</h2>
        <p className="sub">Who received the most, {range.label}</p>
        <TopPayees list={list} cat={cat} />
      </div>
    </>
  );
}

function Kpi({ label, value, note, cls = '' }: { label: string; value: string; note: ReactNode; cls?: string }) {
  return (
    <div className="card kpi">
      <div className="lab">{label}</div>
      <div className={`val num ${cls}`}>{value}</div>
      <div className="note">{note}</div>
    </div>
  );
}

function Insights({ list, sm, range, budget, expIds, cat, onReview }: { list: Tx[]; sm: Summary; range: Range; budget: Budget; expIds: string[]; cat: (id: string) => Category; onReview: () => void }) {
  if (!list.length) return <p className="muted">No transactions in these dates yet.</p>;
  const period = range.from;
  const out: ReactNode[] = [];
  const spend = list.filter(t => cat(t.cat).type === 'exp' && t.amt < 0);
  if (sm.exp > 0) {
    const wkEnd = isoOf(new Date(+period.slice(0, 4), +period.slice(5, 7) - 1, +period.slice(8) + 6));
    const early = spend.filter(t => t.d <= wkEnd).reduce((s, t) => s - t.amt, 0);
    if (early / sm.exp >= 0.4) out.push(<><b>{Math.round((early / sm.exp) * 100)}%</b> of the spending ({R0(early)}) happened in the first 7 days.</>);
    const top = Object.entries(sm.byCat).filter(([id]) => cat(id).type === 'exp').sort((a, b) => b[1] - a[1])[0];
    if (top) out.push(<>Biggest category: <b>{cat(top[0]).name}</b> at {R0(top[1])} ({Math.round((top[1] / sm.exp) * 100)}% of spending).</>);
  }
  const fees = list.filter(t => t.cat === 'fees');
  const feeSum = fees.reduce((s, t) => s - t.amt, 0);
  if (feeSum > 0) {
    const insf = fees.filter(t => /insufficient|ins funds|disputed|decl/i.test(t.desc));
    const insfSum = insf.reduce((s, t) => s - t.amt, 0);
    out.push(<>Bank fees: <b>{R(feeSum)}</b> across {fees.length} charges{insf.length ? `, including ${R(insfSum)} for ${insf.length} declined or disputed payments` : ''}.</>);
  }
  if (sm.net < 0) out.push(<>You spent <b>{R0(-sm.net)}</b> more than came in.</>);
  else if (sm.inc > 0) out.push(<>You kept <b>{R0(sm.net)}</b> ({Math.round((sm.net / sm.inc) * 100)}% of income).</>);
  const unc = list.filter(t => t.cat === 'other');
  if (unc.length) out.push(<><b>{unc.length}</b> payment{unc.length === 1 ? '' : 's'} worth {R0(unc.reduce((s, t) => s - t.amt, 0))} {unc.length === 1 ? 'is' : 'are'} uncategorised. <button className="linkish" onClick={onReview}>Review them</button></>);
  if (sm.xin + sm.xout > 0) out.push(<>{R0(Math.max(sm.xin, sm.xout))} moved between your own accounts and is not counted as income or spending.</>);
  const over = expIds.filter(id => +budget[id] > 0 && (sm.byCat[id] || 0) > +budget[id]);
  if (over.length) out.push(<>Over budget in: {over.map((id, i) => <span key={id}>{i ? ', ' : ''}<b>{cat(id).name}</b> (+{R0(sm.byCat[id] - budget[id])})</span>)}.</>);
  return <ul className="ins">{out.map((o, i) => <li key={i}>{o}</li>)}</ul>;
}

function TopPayees({ list, cat }: { list: Tx[]; cat: (id: string) => Category }) {
  const m: Record<string, { v: number; n: number; cat: string }> = {};
  for (const t of list) {
    if (cat(t.cat).type !== 'exp' || t.amt >= 0 || t.cat === 'fees') continue;
    const k = merchantKey(t.desc) || '(no description)';
    m[k] ??= { v: 0, n: 0, cat: t.cat };
    m[k].v -= t.amt;
    m[k].n++;
  }
  const top = Object.entries(m).sort((a, b) => b[1].v - a[1].v).slice(0, 10);
  if (!top.length) return <p className="muted">No payments in this period.</p>;
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>Payee</th><th>Category</th><th className="r">Payments</th><th className="r">Total</th></tr></thead>
        <tbody>
          {top.map(([k, o]) => (
            <tr key={k}>
              <td style={{ textTransform: 'capitalize' }}>{k}</td>
              <td><span className="pill">{cat(o.cat).name}</span></td>
              <td className="r num">{o.n}</td>
              <td className="r num">{R(o.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inRange = (all: Tx[], from: string, to: string) => all.filter(t => t.d >= from && t.d <= to);
const dayNum = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8)) / 864e5;
const daysIn = (r: { from: string; to: string }) => dayNum(r.to) - dayNum(r.from) + 1;

/** The range to compare with: the previous pay period, or the same number of days just before a custom range. */
function previousRange(r: Range, startDay: number): { from: string; to: string } {
  const dayBefore = isoOf(new Date(+r.from.slice(0, 4), +r.from.slice(5, 7) - 1, +r.from.slice(8) - 1));
  if (r.period) {
    const p = periodKey(dayBefore, startDay);
    return { from: p, to: periodEnd(p) };
  }
  const end = new Date(+dayBefore.slice(0, 4), +dayBefore.slice(5, 7) - 1, +dayBefore.slice(8));
  return { from: isoOf(new Date(end.getFullYear(), end.getMonth(), end.getDate() - daysIn(r) + 1)), to: dayBefore };
}
