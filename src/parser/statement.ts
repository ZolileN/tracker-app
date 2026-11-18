import { bankName, detectBank } from './banks';
import { parseGeneric } from './generic';
import { parseCapitec, parseFnb, parseNedbank } from './specific';
import { emptyResult, type Line, type ParseResult } from './types';
import { reconcile } from './util';

const SPECIFIC: Record<string, (lines: Line[]) => ParseResult> = {
  capitec: parseCapitec,
  nedbank: parseNedbank,
  fnb: parseFnb,
};

const LETTER_RE = /confirmation of bank(?:ing)? (?:details|account)|bank confirmation letter|account confirmation letter|proof of (?:bank )?account|serves as confirmation that the banking details/i;

/** Read a PDF statement (as text lines) from any South African bank. */
export function parseStatementLines(lines: Line[]): ParseResult {
  const bank = detectBank(lines);
  const special = bank ? SPECIFIC[bank] : undefined;
  let res: ParseResult | null = null;
  if (special) {
    res = special(lines);
    res.recon = reconcile(res);
  }
  // Other banks, or a known bank whose layout has changed: read the table by its column headings.
  if (!res || !res.tx.length || (res.recon && !res.recon.ok)) {
    const g = parseGeneric(lines, bankName(bank));
    g.recon = reconcile(g);
    const score = (r: ParseResult | null) => (!r ? -1 : (r.tx.length ? 1 : 0) + (r.recon?.ok ? 2 : 0));
    if (score(g) > score(res)) res = g;
  }
  const result = res!;
  const head = lines.slice(0, 40).map(l => l.text).join(' ');
  if (!result.tx.length && LETTER_RE.test(head))
    return emptyResult(null, ['This is a bank confirmation letter, not a statement. Download a statement or transaction history from your bank instead.']);
  if (!result.tx.length && !bank)
    return emptyResult(null, [
      "This statement layout could not be read. Try the bank's CSV, OFX or QIF download instead (most South African banks offer one in online banking).",
      ...result.warnings,
    ]);
  if (!result.tx.length)
    result.warnings.push(/no transactions/i.test(lines.map(l => l.text).join(' ')) ? 'The statement says there were no transactions in this period.' : 'No transactions were found in this file.');
  return result;
}
