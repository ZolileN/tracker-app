export type CatType = 'inc' | 'exp' | 'xfer';

export interface Category {
  id: string;
  name: string;
  /** inc = income, exp = spending, xfer = not counted (transfers between own accounts) */
  type: CatType;
}

export interface Rule {
  /** Lower-case text; matches at the start of a word in the description */
  k: string;
  cat: string;
  /** Direction: money in, money out, or either */
  s: '' | 'in' | 'out';
  /** Made by the person (built-in rules come from the code) */
  user?: boolean;
}

/** One imported statement file */
export interface Batch {
  id: string;
  name: string;
  acct: string;
  when: string;
  count: number;
  from?: string;
  to?: string;
}

export interface Settings {
  cats: Category[];
  rules: Rule[];
  /** Category id -> budget per period, in rand */
  budgets: Record<string, number>;
  /** Day of the month a budget period starts (payday), 1-28 */
  startDay: number;
  batches: Batch[];
  v: 1;
}

export interface Tx {
  id: string;
  /** ISO date */
  d: string;
  desc: string;
  /** money in > 0, money out < 0 */
  amt: number;
  acct: string;
  cat: string;
  /** imp = imported from a statement, man = captured by hand */
  src: 'imp' | 'man';
  bal?: number | null;
  bankCat?: string;
  fee?: boolean;
  batch?: string;
  /** Category set by hand: rules no longer change it */
  man?: boolean;
  note?: string;
}

/** 'YYYY-MM' -> transactions dated in that calendar month */
export type Months = Record<string, Tx[]>;

export type BankCatMap = { in: Record<string, string>; out: Record<string, string> };
