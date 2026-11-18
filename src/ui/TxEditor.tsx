import { useEffect, useMemo, useRef, useState } from 'react';
import { todayIso } from '../domain/format';
import { useAccounts, useAllTx, useCat } from '../state/derived';
import { useStore } from '../state/store';
import { CategoryOptions } from './common';

/** Add or edit a transaction. */
export function TxEditor() {
  const editor = useStore(s => s.editor);
  if (!editor) return null;
  return <EditorDialog key={editor.id ?? 'new'} id={editor.id} />;
}

function EditorDialog({ id }: { id?: string }) {
  const all = useAllTx();
  const cat = useCat();
  const accts = useAccounts();
  const close = useStore(s => s.closeEditor);
  const saveTx = useStore(s => s.saveTx);
  const removeTx = useStore(s => s.removeTx);
  const t = useMemo(() => (id ? all.find(x => x.id === id) : undefined), [all, id]);
  const [type, setType] = useState<'in' | 'out'>(t && t.amt > 0 ? 'in' : 'out');
  const [f, setF] = useState({
    amt: t ? String(Math.abs(t.amt)) : '',
    d: t?.d ?? todayIso(),
    desc: t?.desc ?? '',
    cat: t?.cat ?? '',
    acct: t?.acct ?? 'Cash',
    note: t?.note ?? '',
  });
  const amtRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!id) amtRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [id, close]);

  const ty = type === 'in' ? 'inc' : 'exp';
  const catOk = f.cat && (cat(f.cat).type === ty || cat(f.cat).type === 'xfer');
  const catVal = catOk ? f.cat : ty === 'inc' ? 'other_inc' : 'other';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.round(parseFloat(f.amt) * 100) / 100;
    if (!(amt > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(f.d) || !f.desc.trim()) return;
    saveTx({ id, d: f.d, desc: f.desc.trim(), amt: type === 'in' ? amt : -amt, cat: catVal, acct: f.acct.trim() || 'Cash', note: f.note.trim() || undefined });
  };

  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && close()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={id ? 'Edit transaction' : 'Add transaction'} onSubmit={submit}>
        <h3>{id ? 'Edit transaction' : 'Add a transaction'}</h3>
        <div className="f">
          <div className="seg">
            <button type="button" className={type === 'out' ? 'on' : ''} onClick={() => setType('out')}>Expense</button>
            <button type="button" className={type === 'in' ? 'on' : ''} onClick={() => setType('in')}>Income</button>
          </div>
        </div>
        <div className="grid half" style={{ gap: 10 }}>
          <div className="f">
            <label htmlFor="m-amt">Amount (R)</label>
            <input ref={amtRef} id="m-amt" type="number" step="0.01" min="0.01" inputMode="decimal" required value={f.amt} onChange={e => setF({ ...f, amt: e.target.value })} />
          </div>
          <div className="f">
            <label htmlFor="m-d">Date</label>
            <input id="m-d" type="date" required value={f.d} onChange={e => setF({ ...f, d: e.target.value })} />
          </div>
        </div>
        <div className="f">
          <label htmlFor="m-desc">Description</label>
          <input id="m-desc" type="text" required maxLength={140} placeholder="e.g. Taxi fare, cash from side job" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} />
        </div>
        <div className="grid half" style={{ gap: 10 }}>
          <div className="f">
            <label htmlFor="m-cat">Category</label>
            <select id="m-cat" value={catVal} onChange={e => setF({ ...f, cat: e.target.value })}><CategoryOptions only={ty} /></select>
          </div>
          <div className="f">
            <label htmlFor="m-acct">Account</label>
            <input id="m-acct" type="text" list="accts" maxLength={30} value={f.acct} onChange={e => setF({ ...f, acct: e.target.value })} />
            <datalist id="accts">{[...new Set(['Cash', ...accts])].map(a => <option key={a} value={a} />)}</datalist>
          </div>
        </div>
        <div className="f">
          <label htmlFor="m-note">Note (optional)</label>
          <input id="m-note" type="text" maxLength={200} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        </div>
        <div className="bar" style={{ margin: '6px 0 0' }}>
          {id && <button type="button" className="btn danger" onClick={() => removeTx(id)}>Delete</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button className="btn pri" type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
