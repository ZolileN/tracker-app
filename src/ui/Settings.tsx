import { useState } from 'react';
import { todayIso } from '../domain/format';
import { makeBackup, toCsv } from '../domain/settings';
import type { CatType, Rule } from '../domain/types';
import { useAllTx, useCat } from '../state/derived';
import { useStore } from '../state/store';
import { CategoryOptions, NewCategoryForm, pickBackup } from './common';

/** Save a file (on iPhone this opens the share sheet, where "Save to Files" is). */
function download(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const FIXED = new Set(['other', 'xfer', 'fees', 'other_inc']);

export function Settings() {
  const all = useAllTx();
  const cat = useCat();
  const s = useStore(st => st.settings);
  const months = useStore(st => st.months);
  const a = useStore();
  const [rule, setRule] = useState<Rule>({ k: '', s: '', cat: 'other' });
  const used: Record<string, number> = {};
  for (const t of all) used[t.cat] = (used[t.cat] || 0) + 1;
  const userRules = s.rules.map((r, i) => ({ r, i })).filter(o => o.r.user);

  return (
    <div className="stack">
      <div className="grid half">
        <div className="card">
          <h2>Budget period</h2>
          <p className="sub">Start each period on your payday so a budget covers one pay cycle.</p>
          <label>
            Period starts on day{' '}
            <input type="number" min={1} max={28} defaultValue={s.startDay} key={s.startDay} style={{ width: 70 }}
              onBlur={e => a.setStartDay(+e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />{' '}
            of the month
          </label>
        </div>
        <div className="card">
          <h2>Backup</h2>
          <p className="sub">Your data lives on this device only. Download a backup now and then, or restore one (backups from the old version work too).</p>
          <div className="bar" style={{ margin: 0 }}>
            <button className="btn" onClick={() => download(`budget-backup-${todayIso()}.json`, makeBackup(s, months), 'application/json')}>Download backup (.json)</button>
            <button className="btn" onClick={() => download(`transactions-${todayIso()}.csv`, toCsv(all, id => cat(id).name), 'text/csv')}>Download transactions (.csv)</button>
            <button className="btn" onClick={pickBackup}>Restore from backup</button>
            <button className="btn danger" onClick={a.wipe}>Delete all data</button>
          </div>
        </div>
      </div>

      <div className="grid half">
        <CategoryGroup type="exp" title="Spending categories" sub="Where money goes. Each one can have a budget." used={used} />
        <CategoryGroup type="inc" title="Income categories" sub="Where money comes from." used={used} />
      </div>
      <CategoryGroup type="xfer" title="Not counted" sub="Money moved between your own accounts: left out of income and spending." used={used} />

      <div className="card">
        <h2>Your rules</h2>
        <p className="sub">
          When a description contains the text, the category is applied automatically, on past transactions and future imports. Rules are also
          created when you change a category in the Transactions list and choose "Apply and remember". {s.rules.length - userRules.length} built-in rules run after yours.
        </p>
        {userRules.length ? (
          <div className="scroll">
            <table>
              <thead><tr><th>Description contains</th><th>Direction</th><th>Category</th><th /></tr></thead>
              <tbody>
                {userRules.map(({ r, i }) => (
                  <tr key={i}>
                    <td>{r.k}</td>
                    <td>{r.s === 'in' ? 'money in' : r.s === 'out' ? 'money out' : 'any'}</td>
                    <td>{cat(r.cat).name}</td>
                    <td className="r"><button className="btn sm danger" onClick={() => a.deleteRule(i)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No rules of your own yet.</p>}
        <form className="bar" style={{ margin: '12px 0 0' }}
          onSubmit={e => { e.preventDefault(); const k = rule.k.trim().toLowerCase(); if (k.length >= 2) { a.addRule({ ...rule, k }); setRule({ ...rule, k: '' }); } }}>
          <input type="text" placeholder="Text, e.g. checkers" value={rule.k} onChange={e => setRule({ ...rule, k: e.target.value })} aria-label="Description contains" />
          <select value={rule.s} onChange={e => setRule({ ...rule, s: e.target.value as Rule['s'] })} aria-label="Direction">
            <option value="">Any direction</option>
            <option value="out">Money out</option>
            <option value="in">Money in</option>
          </select>
          <select value={rule.cat} onChange={e => setRule({ ...rule, cat: e.target.value })} aria-label="Category"><CategoryOptions /></select>
          <button className="btn" type="submit">Add rule</button>
        </form>
      </div>
    </div>
  );
}

/** One group of categories (spending, income or not counted): rename, delete, and add a new one to the group. */
function CategoryGroup({ type, title, sub, used }: { type: CatType; title: string; sub: string; used: Record<string, number> }) {
  const cats = useStore(st => st.settings.cats);
  const renameCategory = useStore(st => st.renameCategory);
  const deleteCategory = useStore(st => st.deleteCategory);
  const list = cats.filter(c => c.type === type);
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="sub">{sub} Rename by typing over a name. Deleting a category moves its transactions to {type === 'inc' ? 'Other income' : 'Uncategorised'}.</p>
      {type !== 'xfer' && <NewCategoryForm type={type} />}
      <table className="cats">
        <thead><tr><th>Name</th><th className="r">Transactions</th><th /></tr></thead>
        <tbody>
          {list.map(c => (
            <tr key={c.id}>
              <td>
                <input type="text" defaultValue={c.name} key={c.name} maxLength={40} aria-label={`Name of ${c.name}`}
                  onBlur={e => renameCategory(c.id, e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              </td>
              <td className="r num">{used[c.id] || 0}</td>
              <td className="r">{!FIXED.has(c.id) && <button className="btn sm danger" onClick={() => deleteCategory(c.id)} aria-label={`Delete ${c.name}`}>Delete</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
