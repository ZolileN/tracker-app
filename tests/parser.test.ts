import { describe, expect, it } from 'vitest';
import { amtParse, dateLead, parseStatementLines, parseTextStatement, type ParseResult } from '../src/parser';
import { L, PDF_LAYOUTS, TEXT_FILES, type Expect } from './fixtures';

function check(r: ParseResult, e: Expect) {
  if (e.bank !== undefined) expect(r.bank).toBe(e.bank);
  expect(r.tx.length, JSON.stringify(r.tx.map(t => [t.d, t.amt, t.desc]))).toBe(e.n);
  if (e.recon) expect(r.recon?.ok, JSON.stringify(r.recon)).toBe(true);
  if (e.opening !== undefined) expect(r.opening).toBe(e.opening);
  if (e.closing !== undefined) expect(r.closing).toBe(e.closing);
  if (e.noWarn) expect(r.warnings).toEqual([]);
  (e.tx ?? []).forEach((want, i) => {
    const got = r.tx[i];
    expect(got, `transaction ${i}`).toBeDefined();
    const { desc, ...rest } = want;
    expect(got).toMatchObject(rest);
    if (desc) expect(got.desc).toContain(desc);
  });
}

describe('PDF statement layouts', () => {
  for (const f of PDF_LAYOUTS) it(f.name, () => check(parseStatementLines(f.lines), f.expect));

  it('explains a proof-of-account letter instead of importing it', () => {
    const r = parseStatementLines([
      L(1, 590, [363, 421, 'www.gotyme.co.za']),
      L(1, 530, [154, 285, 'Proof of Account']),
      L(1, 460, [18, 400, 'This serves as confirmation that the banking details below are active']),
    ]);
    expect(r.bank).toBeNull();
    expect(r.warnings[0]).toMatch(/confirmation letter/);
  });
});

describe('CSV, OFX and QIF downloads', () => {
  for (const f of TEXT_FILES) it(f.name, () => check(parseTextStatement(f.text, f.file), f.expect));
});

describe('dates', () => {
  const parts = (s: string) => {
    const p = dateLead(s);
    return p && (p.y ? [p.y, p.m, p.d] : p.m ? [p.m, p.d] : [p.a, p.b]);
  };
  it('reads dd/mm/yyyy with text after it', () => expect(parts('25/09/2026 Rent')).toEqual([2026, 9, 25]));
  it('reads ISO dates', () => expect(parts('2025-03-12')).toEqual([2025, 3, 12]));
  it('reads "1 Feb 2025"', () => expect(parts('1 Feb 2025')).toEqual([2025, 2, 1]));
  it('reads year-less "05 Jan"', () => expect(parts('05 Jan Salary')).toEqual([1, 5]));
  it('does not read "Mayfair" as May', () => expect(dateLead('12 Mayfair Spar')).toBeNull());
});

describe('amounts', () => {
  it('"-R1 234.56"', () => expect(amtParse('-R1 234.56')).toMatchObject({ v: 1234.56, neg: true }));
  it('trailing minus', () => expect(amtParse('250.00-')?.neg).toBe(true));
  it('Cr suffix', () => expect(amtParse('9 000.00Cr')?.sfx).toBe('cr'));
  it('comma decimals', () => expect(amtParse('1 234,56')?.v).toBe(1234.56));
  it('brackets', () => expect(amtParse('(80.00)')?.neg).toBe(true));
  it('whole rands', () => {
    expect(amtParse('R1 500')?.v).toBe(1500);
    expect(amtParse('R0')?.v).toBe(0);
  });
});
