import { fmtDate, fmtDateY, R } from '../domain/format';
import type { Pending } from '../domain/importing';
import { useCat } from '../state/derived';
import { useStore } from '../state/store';
import { BankLogos, logoFor } from './BankLogos';
import { pickStatements } from './common';

export function Import() {
  const pending = useStore(s => s.pending);
  const busy = useStore(s => s.busy);
  const batches = useStore(s => s.settings.batches);
  const removeBatch = useStore(s => s.removeBatch);
  return (
    <div className="stack">
      <div className="drop">
        <p><b>Drop bank statements here</b></p>
        <p className="muted">
          PDF statements from South African banks (Absa, Capitec, FNB, Nedbank, Standard Bank, GoTyme (TymeBank), Discovery, Investec,
          African Bank and others), or a CSV, OFX or QIF download. Files are read on this device; only the transactions are saved.
        </p>
        <p><button className="btn pri" onClick={pickStatements}>Choose files</button></p>
        {busy && <p role="status">{busy}</p>}
        <BankLogos />
      </div>
      {pending.map(p => <PendingCard key={p.key} p={p} />)}
      <div className="card">
        <h2>Imported statements</h2>
        <p className="sub">Uploading a statement that overlaps an earlier one is safe: transactions already saved are skipped.</p>
        {batches.length ? (
          <div className="scroll">
            <table>
              <thead><tr><th>File</th><th>Account</th><th>Dates</th><th className="r">Transactions</th><th /></tr></thead>
              <tbody>
                {[...batches].reverse().map(b => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{b.acct}</td>
                    <td className="num">{b.from && b.to ? `${fmtDateY(b.from)} – ${fmtDateY(b.to)}` : ''}</td>
                    <td className="r num">{b.count}</td>
                    <td className="r"><button className="btn sm danger" onClick={() => removeBatch(b.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Nothing imported yet.</p>}
      </div>
    </div>
  );
}

function PendingCard({ p }: { p: Pending }) {
  const cat = useCat();
  const confirm = useStore(s => s.confirmImport);
  const discard = useStore(s => s.discardPending);
  const setAcct = useStore(s => s.setPendingAccount);
  const r = p.res;
  const bad = !p.tx.length;
  const tin = p.tx.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);
  const tout = p.tx.filter(t => t.amt < 0).reduce((s, t) => s - t.amt, 0);
  return (
    <div className="card">
      <div className="pending-head">
        {logoFor(r.bank) && <span className="tile"><img src={logoFor(r.bank)} alt={r.bank ?? ''} /></span>}
        <h2>{p.fileName}</h2>
      </div>
      {r.warnings.map(w => <p key={w} className="badc">{w}</p>)}
      {bad ? (
        <button className="btn" onClick={() => discard(p.key)}>Dismiss</button>
      ) : (
        <>
          <p className="sub">
            {r.bank} · {p.from && fmtDateY(p.from)} to {p.to && fmtDateY(p.to)} · {p.tx.length} transactions ({p.fresh} new, {p.tx.length - p.fresh} already saved) · in {R(tin)} · out {R(tout)}
          </p>
          {r.recon && (
            <p>
              {r.recon.ok
                ? <span className="ok">✓ Adds up to the statement's closing balance ({R(r.closing ?? 0)})</span>
                : <span className="badc">▲ Does not add up to the closing balance — out by {R(r.recon.diff)}. Check the result before relying on it.</span>}
            </p>
          )}
          <div className="bar">
            <label className="small muted">
              Account name{' '}
              <input type="text" value={p.acctName} onChange={e => setAcct(p.key, e.target.value)} style={{ width: 160 }} />
            </label>
            <span className="grow" />
            <button className="btn" onClick={() => discard(p.key)}>Discard</button>
            <button className="btn pri" onClick={() => confirm(p.key)} disabled={!p.fresh}>Import {p.fresh} new</button>
          </div>
          <details>
            <summary className="small muted">Preview transactions</summary>
            <div className="scroll" style={{ maxHeight: 300, overflow: 'auto' }}>
              <table>
                <tbody>
                  {p.tx.slice(0, 200).map(t => (
                    <tr key={t.id}>
                      <td className="num">{fmtDate(t.d)}</td>
                      <td><div className="desc">{t.desc}</div></td>
                      <td><span className="pill">{cat(t.cat).name}</span></td>
                      <td className="r num">{R(t.amt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
