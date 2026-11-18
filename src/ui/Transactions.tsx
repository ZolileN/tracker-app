import { useDeferredValue, useMemo } from 'react';
import { fmtDate, R } from '../domain/format';
import { txIn } from '../domain/periods';
import { useAccounts, useAllTx, useCat, usePeriods } from '../state/derived';
import { useStore } from '../state/store';
import { CategoryOptions, PeriodSelect } from './common';

const LIMIT = 400;

export function Transactions() {
  const all = useAllTx();
  const cat = useCat();
  const accts = useAccounts();
  const { period } = usePeriods();
  const f = useStore(s => s.filter);
  const setFilter = useStore(s => s.setFilter);
  const setTxCategory = useStore(s => s.setTxCategory);
  const openEditor = useStore(s => s.openEditor);
  const q = useDeferredValue(f.q.trim().toLowerCase());

  const list = useMemo(() => {
    const base = f.period === 'all' ? all : txIn(all, period);
    return base
      .filter(t =>
        (!f.cat || t.cat === f.cat) && (!f.acct || t.acct === f.acct) &&
        (!f.type || (f.type === 'in' ? t.amt > 0 : t.amt < 0)) &&
        (!q || (t.desc || '').toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q) || String(Math.abs(t.amt)).includes(q)))
      .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  }, [all, period, f.period, f.cat, f.acct, f.type, q]);

  const tin = list.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
  const tout = list.filter(t => t.amt < 0).reduce((s, t) => s - t.amt, 0);

  return (
    <>
      <div className="bar">
        <select value={f.period} onChange={e => setFilter({ period: e.target.value as 'sel' | 'all' })} aria-label="Which dates">
          <option value="sel">Selected period</option>
          <option value="all">All dates</option>
        </select>
        {f.period === 'sel' && <PeriodSelect />}
        <select value={f.cat} onChange={e => setFilter({ cat: e.target.value })} aria-label="Category">
          <option value="">All categories</option>
          <CategoryOptions />
        </select>
        <select value={f.acct} onChange={e => setFilter({ acct: e.target.value })} aria-label="Account">
          <option value="">All accounts</option>
          {accts.map(a => <option key={a}>{a}</option>)}
        </select>
        <select value={f.type} onChange={e => setFilter({ type: e.target.value as '' | 'in' | 'out' })} aria-label="Money in or out">
          <option value="">In and out</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
        </select>
        <input type="search" placeholder="Search description or amount" value={f.q} onChange={e => setFilter({ q: e.target.value })} style={{ flex: 1, minWidth: 160 }} aria-label="Search" />
        <button className="btn pri" onClick={() => openEditor()}>+ Add</button>
      </div>
      <div className="card">
        <p className="sub">
          {list.length} transaction{list.length === 1 ? '' : 's'} · in {R(tin)} · out {R(tout)}
          {list.length > LIMIT ? ` · showing the latest ${LIMIT}` : ''}
        </p>
        <div className="scroll">
          <table className="txs">
            <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th><th className="r">Amount</th><th /></tr></thead>
            <tbody>
              {list.slice(0, LIMIT).map(t => (
                <tr key={t.id}>
                  <td className="num c-date">{fmtDate(t.d)}</td>
                  <td className="c-desc" onClick={() => window.matchMedia('(max-width: 640px)').matches && openEditor(t.id)}>
                    <div className="desc" title={t.desc + (t.note ? '\n' + t.note : '')}>
                      {t.desc} {t.src === 'man' && <span className="pill">manual</span>}
                    </div>
                  </td>
                  <td className="c-meta muted">{fmtDate(t.d)} · {t.acct}</td>
                  <td className="muted c-acct">{t.acct}</td>
                  <td className="c-cat">
                    <select value={cat(t.cat).id} onChange={e => setTxCategory(t.id, e.target.value)} aria-label={`Category for ${t.desc}`}>
                      <CategoryOptions />
                    </select>
                  </td>
                  <td className={`r num c-amt ${t.amt > 0 ? 'pos' : ''}`}>{t.amt > 0 ? '+' : ''}{R(t.amt).replace('−', '-')}</td>
                  <td className="c-edit"><button className="rowbtn" onClick={() => openEditor(t.id)} aria-label={`Edit ${t.desc}`}>Edit</button></td>
                </tr>
              ))}
              {!list.length && (
                <tr className="empty-row"><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>No transactions match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
