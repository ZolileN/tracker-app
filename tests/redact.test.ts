import { describe, expect, it } from 'vitest';
import { parseStatementLines } from '../src/parser';
import { layoutReport, maskText, reportLines } from '../src/parser/redact';
import { PDF_LAYOUTS } from './fixtures';

describe('masking a statement layout for sharing', () => {
  it('masks names, numbers and amounts but keeps statement words', () => {
    expect(maskText('Account number: 4100000001')).toBe('Account number: 9999999999');
    expect(maskText('PAYSHAP TO THABO MOKOENA')).toBe('PAYSHAP TO XXXXX XXXXXXX');
    expect(maskText('-R1 234.56')).toBe('-R9 999.99');
    expect(maskText('Date Description Amount Balance')).toBe('Date Description Amount Balance');
    expect(maskText('12 Mar 2026 Spar')).toBe('12 Mar 2026 Xxxx');
    expect(maskText('2025-03-12')).toBe('2025-03-12');
    expect(maskText('01 27')).toBe('01 27');
    expect(maskText('Reference 41009999')).toBe('Reference 99999999'); // 8 digits that are not a date
  });

  const fixture = PDF_LAYOUTS[0]; // Standard Bank layout
  const report = layoutReport({ fileName: 'My Statement Jan.pdf', res: parseStatementLines(fixture.lines), lines: fixture.lines, app: 'test' });
  const json = JSON.stringify(report);

  it('leaves nothing personal in the file', () => {
    for (const secret of ['LANDLORD', 'ACME', 'SHOPRITE', '3 500.00', '11 847.20', 'My Statement']) expect(json).not.toContain(secret);
    expect(report.file).toBe('statement.pdf');
  });

  it('keeps enough for the parser to find the same table and rows', () => {
    const res = parseStatementLines(reportLines(report));
    expect(res.bank).toBe('Standard Bank');
    expect(res.tx.length).toBe(fixture.expect.n);
  });

  it('masks text downloads too', () => {
    const r = layoutReport({ fileName: 'x.csv', res: { bank: 'CSV', account: 'x', tx: [], opening: null, closing: null, warnings: [], recon: null }, text: 'Date,Description,Amount\n2025/03/05,Payment to Sipho,-100.00', app: 'test' });
    expect(r.textHead).toEqual(['Date,Description,Amount', '2025/03/05,Payment to Xxxxx,-999.99']);
  });
});
