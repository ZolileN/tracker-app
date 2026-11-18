/* Banks whose statements the app can read, with their logos.
   Logos are trademarks of their banks, shown only to say which statements can be imported. */
import absa from '../assets/banks/absa.svg';
import african from '../assets/banks/african.png';
import bankzero from '../assets/banks/bankzero.png';
import bidvest from '../assets/banks/bidvest.svg';
import capitec from '../assets/banks/capitec.svg';
import discovery from '../assets/banks/discovery.svg';
import fnb from '../assets/banks/fnb.svg';
import investec from '../assets/banks/investec.svg';
import nedbank from '../assets/banks/nedbank.svg';
import oldmutual from '../assets/banks/oldmutual.svg';
import standard from '../assets/banks/standard.png';
import tyme from '../assets/banks/tyme.png';

export interface BankInfo {
  /** Same name the parser reports (src/parser/banks.ts) */
  name: string;
  logo: string;
  /** Checked against real statements, not only layout fixtures */
  tested: boolean;
}

export const BANKS: BankInfo[] = [
  { name: 'Capitec', logo: capitec, tested: true },
  { name: 'Absa', logo: absa, tested: true },
  { name: 'FNB', logo: fnb, tested: true },
  { name: 'Nedbank', logo: nedbank, tested: true },
  { name: 'Discovery Bank', logo: discovery, tested: true },
  { name: 'Standard Bank', logo: standard, tested: false },
  { name: 'GoTyme Bank', logo: tyme, tested: false },
  { name: 'Investec', logo: investec, tested: false },
  { name: 'African Bank', logo: african, tested: false },
  { name: 'Bidvest Bank', logo: bidvest, tested: false },
  { name: 'Old Mutual', logo: oldmutual, tested: false },
  { name: 'Bank Zero', logo: bankzero, tested: false },
];

export const logoFor = (bankName: string | null | undefined) => BANKS.find(b => b.name === bankName)?.logo;

export function BankLogos() {
  return (
    <section className="banks" aria-labelledby="banks-h">
      <h3 id="banks-h">Banks it can read</h3>
      <ul className="logos">
        {BANKS.map(b => (
          <li key={b.name} data-tip={`${b.name}\n${b.tested ? 'Checked against real statements' : 'Supported; not yet checked against a real statement'}`}>
            <span className="tile"><img src={b.logo} alt={b.name} loading="lazy" /></span>
            <span className={`st ${b.tested ? 'ok' : 'muted'}`}>{b.tested ? '✓ Tested' : 'Supported'}</span>
          </li>
        ))}
      </ul>
      <p className="small muted">
        ✓ Tested = checked against real statements. Other South African banks usually work too, and any bank's CSV, OFX or QIF download
        can be imported. Logos are trademarks of their banks.
      </p>
    </section>
  );
}
