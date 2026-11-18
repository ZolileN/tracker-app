import { fmtDate, fmtDateY, R } from '../domain/format';
import type { Pending } from '../domain/importing';
import { useCat } from '../state/derived';
import { useStore } from '../state/store';
import { BankLogos, logoFor } from './BankLogos';
import { pickStatements } from './common';
import { APP_VERSION, shareOrDownload } from './files';
import { layoutReport } from '../parser/redact';
import { useState } from 'react';

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
      {p.locked ? (
        <PasswordForm p={p} onDiscard={() => discard(p.key)} />
      ) : bad ? (
        <>
          {r.warnings.map(w => <p key={w} className="badc">{w}</p>)}
          <div className="bar" style={{ margin: 0 }}>
            <button className="btn" onClick={() => discard(p.key)}>Dismiss</button>
          </div>
          <ShareLayout p={p} open />
        </>
      ) : (
        <>
          {r.warnings.map(w => <p key={w} className="badc">{w}</p>)}
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
          <ShareLayout p={p} open={!!r.recon && !r.recon.ok} />
        </>
      )}
    </div>
  );
}

/** A password-protected PDF: ask for the password, open it, never store it. */
function PasswordForm({ p, onDiscard }: { p: Pending; onDiscard: () => void }) {
  const unlock = useStore(s => s.unlockPending);
  const busy = useStore(s => s.busy);
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  return (
    <form className="pw" onSubmit={e => { e.preventDefault(); if (pw) void unlock(p.key, pw); }}>
      <p className={p.locked === 'wrong' ? 'badc' : ''}>
        {p.locked === 'wrong' ? 'That password did not open it. Try again.' : <>This PDF is <b>password-protected</b>. Type its password to open it.</>}
      </p>
      <p className="small muted">
        Banks that email statements often lock them with your ID number or part of it; the email the statement came with usually says.
        The password is only used to open the file on this device and is not saved.
      </p>
      <div className="bar" style={{ margin: 0 }}>
        <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="PDF password" aria-label="PDF password"
          autoComplete="off" autoFocus style={{ flex: '1 1 180px' }} />
        <label className="small muted"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show</label>
        <button className="btn pri" type="submit" disabled={!pw || !!busy}>{busy ? 'Opening…' : 'Open'}</button>
        <button className="btn" type="button" onClick={onDiscard}>Discard</button>
      </div>
    </form>
  );
}

/** Let a tester send the statement's masked layout to the developer, to fix a statement that was not read right. */
function ShareLayout({ p, open }: { p: Pending; open?: boolean }) {
  const notify = useStore(s => s.notify);
  if (!p.lines && p.text == null) return null;
  const share = async () => {
    const report = layoutReport({ fileName: p.fileName, res: p.res, lines: p.lines, text: p.text, app: APP_VERSION });
    const bank = (p.res.bank || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const how = await shareOrDownload(`statement-layout-${bank}.json`, JSON.stringify(report), 'application/json', 'Statement layout for Budget Tracker');
    if (how === 'downloaded') notify('Layout file saved. Send it to whoever shared the app with you (WhatsApp or email).');
  };
  return (
    <details className="share-layout" open={open}>
      <summary className="small muted">Not read correctly? Share this statement's layout</summary>
      <p className="small">
        This makes a file with the <b>position</b> of each piece of text on the statement, so the app can be fixed to read it.
        Everything personal is masked: names, account numbers, amounts, balances and descriptions become <code>Xxxx</code> and <code>9999</code>.
        Only dates, column headings, month names and bank names are kept.
      </p>
      <button className="btn sm" type="button" onClick={() => void share()}>Share layout file</button>
    </details>
  );
}
