/** One piece of text on a PDF page: `x` = left edge, `r` = right edge (PDF points). */
export interface TextItem {
  s: string;
  x: number;
  r: number;
}

/** A visual line of a PDF page: items sorted left to right, `text` = items joined by spaces. */
export interface Line {
  y: number;
  page: number;
  items: TextItem[];
  text: string;
}

/** A transaction as read from a statement, before it is categorised and saved. */
export interface ParsedTx {
  /** ISO date, YYYY-MM-DD */
  d: string;
  desc: string;
  /** Signed amount in rand: money in > 0, money out < 0 */
  amt: number;
  /** Running balance after this transaction, when the statement prints one */
  bal: number | null;
  /** The bank's own category (Capitec, some CSV exports) */
  bankCat?: string;
  /** A bank charge */
  fee?: boolean;
}

export interface Recon {
  ok: boolean;
  /** opening + sum(transactions) - closing, rounded to cents */
  diff: number;
}

export interface ParseResult {
  /** Bank name for display, or null when the file could not be read */
  bank: string | null;
  /** Suggested account name, e.g. "Absa 8617" */
  account: string;
  tx: ParsedTx[];
  opening: number | null;
  closing: number | null;
  warnings: string[];
  recon: Recon | null;
}

export function emptyResult(bank: string | null, warnings: string[] = [], account = 'Unknown'): ParseResult {
  return { bank, account, tx: [], opening: null, closing: null, warnings, recon: null };
}
