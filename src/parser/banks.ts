import type { Line } from './types';

export interface Bank {
  id: string;
  name: string;
  /** Legal names and domains. A payment that merely mentions a bank ("DIGITAL PAYMENT ABSA BANK") does not match these. */
  markers: RegExp[];
  /** Brand name(s), regex source, used only for the letterhead fallback */
  brand: string;
}

const b = (id: string, name: string, markers: RegExp[], brand: string): Bank => ({ id, name, markers, brand });

export const SA_BANKS: Bank[] = [
  b('capitec', 'Capitec', [/capitec bank limited/g, /capitecbank\.co\.za/g], 'capitec'),
  b('nedbank', 'Nedbank', [/nedbank ltd/g, /nedbank limited/g, /nedbank\.co\.za/g], 'nedbank'),
  b('fnb', 'FNB', [/first national bank/g, /firstrand bank/g, /fnb\.co\.za/g], 'fnb'),
  b('absa', 'Absa', [/absa bank (?:limited|ltd)/g, /absa\.co\.za/g, /08600 08600/g], 'absa'),
  b('standard', 'Standard Bank', [/standard bank of south africa/g, /standardbank\.co\.za/g], 'standard bank'),
  // TymeBank, renamed GoTyme Bank
  b('tyme', 'GoTyme Bank', [/(?:go)?tyme ?bank (?:limited|ltd)/g, /(?:gotyme|tymebank)\.co\.za/g], 'gotyme|tymebank'),
  b('discovery', 'Discovery Bank', [/discovery bank (?:limited|ltd)/g, /discovery\.co\.za\/bank/g], 'discovery bank'),
  b('investec', 'Investec', [/investec bank (?:limited|ltd)/g, /investec\.co(?:m|\.za)/g], 'investec'),
  b('african', 'African Bank', [/african bank (?:limited|ltd)/g, /africanbank\.co\.za/g], 'african bank'),
  b('bidvest', 'Bidvest Bank', [/bidvest bank (?:limited|ltd)/g, /bidvestbank\.co\.za/g], 'bidvest bank'),
  b('oldmutual', 'Old Mutual', [/old mutual bank/g, /oldmutual\.co\.za\/bank/g], 'old mutual bank'),
  b('access', 'Access Bank', [/access bank south africa/g, /accessbank\.co\.za/g], 'access bank'),
  b('bankzero', 'Bank Zero', [/bank zero mutual bank/g, /bankzero\.co\.za/g], 'bank zero'),
  b('ubank', 'Ubank', [/ubank (?:limited|ltd)/g, /ubank\.co\.za/g], 'ubank'),
  b('postbank', 'Postbank', [/south african postbank/g, /postbank\.co\.za/g], 'postbank'),
  b('grindrod', 'Grindrod Bank', [/grindrod bank/g], 'grindrod bank'),
  b('sasfin', 'Sasfin', [/sasfin bank/g], 'sasfin'),
  b('mercantile', 'Mercantile Bank', [/mercantile bank (?:limited|ltd)/g], 'mercantile bank'),
  b('hbz', 'HBZ Bank', [/hbz bank (?:limited|ltd)/g], 'hbz bank'),
  b('habib', 'Habib Overseas Bank', [/habib overseas bank/g], 'habib overseas'),
  b('albaraka', 'Albaraka Bank', [/al ?baraka bank/g], 'albaraka'),
  b('finbond', 'Finbond Mutual Bank', [/finbond mutual bank/g], 'finbond'),
];

export const bankName = (id: string | null): string | null => SA_BANKS.find(x => x.id === id)?.name ?? null;

/**
 * The bank with the most marker hits in `all` (lower-case text); failing that, the brand named
 * earliest in `head` (lower-case letterhead text), when given.
 */
export function detectBankText(all: string, head: string | null): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const bank of SA_BANKS) {
    const n = bank.markers.reduce((s, re) => s + (all.match(re) ?? []).length, 0);
    if (n > bestN) { best = bank.id; bestN = n; }
  }
  if (best || head == null) return best;
  let pos = 1e9;
  for (const bank of SA_BANKS) {
    const m = head.match(new RegExp('(?:^|[^a-z])(?:' + bank.brand.replace(/ /g, '\\s?') + ')(?![a-z])'));
    if (m && m.index != null && m.index < pos) { pos = m.index; best = bank.id; }
  }
  return best;
}

export function detectBank(lines: Line[]): string | null {
  return detectBankText(
    lines.map(l => l.text).join('\n').toLowerCase(),
    lines.slice(0, 60).map(l => l.text).join('\n').toLowerCase(),
  );
}
