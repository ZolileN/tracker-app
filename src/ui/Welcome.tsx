import { useStore } from '../state/store';
import { BankLogos } from './BankLogos';
import { pickStatements } from './common';
import { FEEDBACK_URL } from './files';

/** First visit: what the app does, payday, how to get a statement, then upload. */
export function Welcome() {
  const startDay = useStore(s => s.settings.startDay);
  const setStartDay = useStore(s => s.setStartDay);
  const openEditor = useStore(s => s.openEditor);
  return (
    <div className="card welcome">
      <h2>Welcome to Budget Tracker <span className="beta">Beta</span></h2>
      <p className="muted">
        See where your money goes and plan a budget for each month, from your own bank statements.
        Statements are read on this device: <b>nothing is uploaded anywhere</b>.
      </p>
      <ol className="steps">
        <li>
          <h3>When is payday?</h3>
          <p className="small muted">Each budget runs from one payday to the next.</p>
          <label>
            Day{' '}
            <input type="number" min={1} max={28} defaultValue={startDay} key={startDay} style={{ width: 70 }} aria-label="Payday, day of the month"
              onBlur={e => setStartDay(+e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />{' '}
            of the month <span className="small muted">(use 1 for calendar months; 28 if payday is at month end)</span>
          </label>
        </li>
        <li>
          <h3>Get a statement</h3>
          <p className="small muted">
            In your banking app or online banking, find <b>Statements</b> (sometimes under Documents or Account details) and download a PDF for
            the last one to three months. A "transaction history" download works too, as does a CSV, OFX or QIF file.
            If the PDF asks for a password, it is often your ID number.
          </p>
        </li>
        <li>
          <h3>Upload it</h3>
          <p className="small muted">Check that it says "✓ Adds up", then import. You can add cash spending by hand.</p>
          <div className="bar" style={{ margin: 0 }}>
            <button className="btn pri" onClick={pickStatements}>Upload statements</button>
            <button className="btn" onClick={() => openEditor()}>Add a transaction</button>
          </div>
        </li>
      </ol>
      <BankLogos />
      <p className="small muted" style={{ marginBottom: 0 }}>
        This is a test version: please tell us what is confusing or wrong{FEEDBACK_URL ? <> using the <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">feedback form</a></> : ''}.
        It is not financial advice; always check against your bank.
      </p>
    </div>
  );
}
