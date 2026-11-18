export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "R1 234.56" / "−R50.00" (South African style: space thousands, true minus sign). */
export function R(n: number, dp = 2): string {
  const neg = n < -0.004;
  const s = Math.abs(n).toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '−R' : 'R') + s;
}
export const R0 = (n: number) => R(n, 0);

export const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => isoOf(new Date());
/** "5 Mar" */
export const fmtDate = (iso: string) => `${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]}`;
/** "5 Mar 2026" */
export const fmtDateY = (iso: string) => `${fmtDate(iso)} ${iso.slice(0, 4)}`;

/** Short stable hash, used for transaction ids (so re-importing a statement does not duplicate it). */
export function hash(s: string): string {
  let a = 5381, b = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = (a * 33) ^ c;
    b = (b * 33) ^ c;
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

export const plural = (n: number, word: string, many = word + 's') => `${n} ${n === 1 ? word : many}`;
