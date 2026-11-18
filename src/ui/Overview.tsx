import type { ReactNode } from 'react';
import { merchantKey } from '../domain/categorise';
import { isoOf, R, R0 } from '../domain/format';
import { periodLabel, summarise, txIn, type Summary } from '../domain/periods';
import type { Category, Settings, Tx } from '../domain/types';
import { useAllTx, useCat, usePeriods } from '../state/derived';
import { useStore } from '../state/store';
import { CumulativeChart, TrendChart } from './charts';
import { PeriodSelect, pickStatements } from './common';

export function Overview() {
  const all = useAllTx();
  const cat = useCat();
  const settings = useStore(s => s.settings);
  const { periods, period } = usePeriods();
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
      </div>
    );
  }

  const list = txIn(all, period);
  const sm = summarise(list, cat);
  const asc = [...periods].reverse();
  const idx = asc.indexOf(period);
  const prev = idx > 0 ? summarise(txIn(all, asc[idx - 1]), cat) : null;
  const budTotal = settings.cats.filter(c => c.type === 'exp').reduce((s, c) => s + (+settings.budgets[c.id] || 0), 0);
  const delta = (a: number, b: number | undefined) => {
    if (!prev || !b) return '';
    const d = a - b;
    if (Math.abs(d) < 1) return 'same as previous period';
    return `${d > 0 ? '▲' : '▼'} ${R0(Math.abs(d))} vs previous period`;
  };
  const cats = Object.entries(sm.byCat).filter(([id, v]) => cat(id).type === 'exp' && v > 0.005).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;

  return (
    <>
      <div className="bar">
        <PeriodSelect />
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
          note={budTotal ? (budTotal - sm.exp >= 0 ? 'left of ' : 'over a budget of ') + R0(budTotal) : <a href="#budget">Set a budget</a>} />
      </div>
      <div className="grid two" style={{ marginTop: 12 }}>
        <div className="card">
          <h2>Where the money went</h2>
          <p className="sub">Spending by category, {periodLabel(period, settings.startDay)}. Transfers between your own accounts are left out.</p>
          {cats.length ? (
            <div className="hb">
              {cats.map(([id, v]) => {
                const b = +settings.budgets[id] || 0;
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
          <p className="sub">Worked out from this period's transactions</p>
          <Insights list={list} sm={sm} period={period} settings={settings} cat={cat} onReview={() => showCategory('other')} />
        </div>
      </div>
      <div className="grid half" style={{ marginTop: 12 }}>
        <div className="card">
          <h2>Spending through the period</h2>
          <p className="sub">Running total of spending, day by day{budTotal ? ', against your budget' : ''}</p>
          <CumulativeChart period={period} list={list} budget={budTotal} cat={cat} />
        </div>
        <div className="card">
          <h2>Income and spending by period</h2>
          <p className="sub">Last {Math.min(6, asc.length)} periods</p>
          <TrendChart periods={asc.slice(-6)} all={all} startDay={settings.startDay} cat={cat} onPick={setPeriod} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h2>Biggest payees</h2>
        <p className="sub">Who received the most in this period</p>
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

function Insights({ list, sm, period, settings, cat, onReview }: { list: Tx[]; sm: Summary; period: string; settings: Settings; cat: (id: string) => Category; onReview: () => void }) {
  if (!list.length) return <p className="muted">No transactions in this period yet.</p>;
  const out: ReactNode[] = [];
  const spend = list.filter(t => cat(t.cat).type === 'exp' && t.amt < 0);
  if (sm.exp > 0) {
    const wkEnd = isoOf(new Date(+period.slice(0, 4), +period.slice(5, 7) - 1, +period.slice(8) + 6));
    const early = spend.filter(t => t.d <= wkEnd).reduce((s, t) => s - t.amt, 0);
    if (early / sm.exp >= 0.4) out.push(<><b>{Math.round((early / sm.exp) * 100)}%</b> of this period's spending ({R0(early)}) happened in the first 7 days.</>);
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
  const over = settings.cats.filter(c => c.type === 'exp' && +settings.budgets[c.id] > 0 && (sm.byCat[c.id] || 0) > +settings.budgets[c.id]);
  if (over.length) out.push(<>Over budget in: {over.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<b>{c.name}</b> (+{R0(sm.byCat[c.id] - settings.budgets[c.id])})</span>)}.</>);
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
