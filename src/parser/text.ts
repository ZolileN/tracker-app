/* Text downloads: CSV (any bank, with or without a header row), OFX/QFX and QIF. */
import { bankName, detectBankText } from './banks';
import type { ParseResult, ParsedTx } from './types';
import { anyDate, anyNum, FEE_DESC_RE, reconcile, round2, validIso } from './util';

/** A parsed row, tagged with its source row so a fee split off a row can be grouped back with it. */
type RowTx = ParsedTx & { _r?: number };

const baseName = (name: string | undefined, fallback: string) => (name || fallback).replace(/\.[^.]+$/, '').slice(0, 30);

/** Any text download: OFX/QFX, QIF or CSV, recognised by content rather than file name. */
export function parseTextStatement(input: string, name?: string): ParseResult {
  const text = input.replace(/^﻿/, '');
  if (/<OFX>|OFXHEADER/i.test(text.slice(0, 4000))) return parseOfx(text);
  if (/^\s*!(?:Type|Account|Option)/i.test(text)) return parseQif(text, name);
  return parseCsvStatement(text, name);
}

/* ---------- CSV ---------- */

export function parseCsvText(text: string): string[][] {
  const first = text.split('\n').filter(l => l.trim()).slice(0, 15).join('\n');
  const delim = [',', ';', '\t', '|'].map(c => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

/** Date order and, when every row has a balance, opening/closing balances so the import can be reconciled. */
function finishByBalance(out: ParseResult): ParseResult {
  const tx = out.tx as RowTx[];
  if (tx.length > 1) {
    let up = 0, down = 0;
    for (let i = 1; i < tx.length; i++) { if (tx[i].d > tx[i - 1].d) up++; else if (tx[i].d < tx[i - 1].d) down++; }
    if (down > up) tx.reverse();
  }
  if (tx.length && tx.every(t => t.bal != null)) {
    const r0 = tx[0]._r;
    out.opening = round2(tx[0].bal! - tx.filter(t => t._r === r0).reduce((s, t) => s + t.amt, 0));
    out.closing = tx[tx.length - 1].bal;
    out.recon = reconcile(out);
  }
  tx.forEach(t => delete t._r);
  if (!tx.length && !out.warnings.length) out.warnings.push('No rows with a date and an amount were found.');
  return out;
}

const NUMCELL = /^\(?[-+]?R?[-+]?\d[\d,.]*\)?[-+]?(?:[CcDd][Rr])?$/;

/** Exports with no header row (e.g. Standard Bank's "HIST,20250102,,-150.00,..." records): find the date,
    amount and balance columns from the data itself; the balance column is the one the amounts add up to. */
function inferCsv(rows: string[][], out: ParseResult): boolean {
  const w = Math.max(0, ...rows.map(r => r.length));
  let dc = -1, best = 1;
  for (let c = 0; c < w; c++) { const k = rows.filter(r => anyDate(r[c])).length; if (k > best) { best = k; dc = c; } }
  if (dc < 0) return false;
  let rs = rows.filter(r => anyDate(r[dc]));
  const tags: Record<string, number> = {};
  rs.forEach(r => { const v = (r[0] || '').trim(); if (/^[A-Z]{2,6}$/.test(v)) tags[v] = (tags[v] || 0) + 1; });
  const top = Object.entries(tags).sort((a, b) => b[1] - a[1])[0];
  if (dc !== 0 && top && top[1] >= rs.length * 0.5) rs = rs.filter(r => (r[0] || '').trim() === top[0]);
  const cell = (r: string[], c: number) => (r[c] || '').replace(/[\s ]/g, '');
  const nc: number[] = [];
  for (let c = 0; c < w; c++) {
    if (c === dc) continue;
    if (rs.filter(r => NUMCELL.test(cell(r, c))).length >= rs.length * 0.8 && rs.some(r => /[.,]\d{2}(?:[CcDd][Rr])?-?\)?$/.test(cell(r, c)))) nc.push(c);
  }
  if (!nc.length) return false;
  const v = (r: string[], c: number) => anyNum(r[c]);
  let ac = nc[0], bc = -1, bs = 0;
  for (const a of nc) for (const b of nc) {
    if (a === b) continue;
    let s = 0;
    for (let i = 1; i < rs.length; i++) {
      const pb = v(rs[i - 1], b), pa = v(rs[i - 1], a), x = v(rs[i], a), y = v(rs[i], b);
      if (pb == null || x == null || y == null) continue;
      if (Math.abs(pb + x - y) < 0.006 || (pa != null && Math.abs(y + pa - pb) < 0.006)) s++;
    }
    if (s > bs) { bs = s; ac = a; bc = b; }
  }
  if (bc < 0) { const mixed = nc.find(c => rs.some(r => (v(r, c) ?? 0) < 0)); if (mixed != null) ac = mixed; }
  const tc: number[] = [];
  for (let c = 0; c < w; c++) {
    if (c === dc || nc.includes(c)) continue;
    const vals = rs.map(r => (r[c] || '').trim());
    if (vals.filter(x => /[a-z]{2}/i.test(x)).length >= rs.length * 0.3 && new Set(vals).size > 1) tc.push(c);
  }
  rs.forEach((r, ri) => {
    const amt = v(r, ac);
    if (!amt) return;
    const parts: string[] = [];
    tc.forEach(c => { const x = (r[c] || '').replace(/\s+/g, ' ').trim(); if (x && !parts.includes(x)) parts.push(x); });
    const desc = parts.join(' ');
    const row: RowTx = { d: anyDate(r[dc])!, desc: desc || 'Transaction', amt: round2(amt), bal: bc >= 0 ? v(r, bc) : null, bankCat: '', _r: ri };
    if (amt < 0 && FEE_DESC_RE.test(desc)) { row.fee = true; row.bankCat = 'Fees'; }
    out.tx.push(row);
  });
  return out.tx.length > 0;
}

export function parseCsvStatement(text: string, name?: string): ParseResult {
  const rows = parseCsvText(text);
  const out: ParseResult = { bank: 'CSV', account: baseName(name, 'CSV'), tx: [], opening: null, closing: null, warnings: [], recon: null };
  const hi = rows.findIndex(r =>
    r.filter(c => c.trim()).length >= 3 && r.every(c => c.length < 60) &&
    r.some(c => /date/i.test(c)) && r.some(c => /desc|narrat|detail|reference|transaction|payee|beneficiary|particular/i.test(c)));
  // bank name: legal-name markers anywhere, else a brand named in the preamble above the data
  const dataAt = hi >= 0 ? hi : Math.max(0, rows.findIndex(r => r.some(c => !!anyDate(c) && !/[a-z]/i.test(c))));
  out.bank = bankName(detectBankText(text.toLowerCase(), rows.slice(0, dataAt).map(r => r.join(' ')).join('\n').toLowerCase())) || 'CSV';
  if (hi < 0) {
    if (!inferCsv(rows, out)) out.warnings.push('Could not find the date, description and amount columns in this file.');
    return finishByBalance(out);
  }
  const h = rows[hi].map(c => c.trim().toLowerCase());
  const taken = new Set<number>();
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const i = h.findIndex((c, j) => !taken.has(j) && re.test(c));
      if (i >= 0) { taken.add(i); return i; }
    }
    return -1;
  };
  const cDate = find(/^(transaction |posting |posted |trans |value )?date$/, /date/);
  const cType = find(/^(type|dr\/cr|cr\/dr|debit\/credit|credit\/debit|d\/c|c\/d|transaction type|tran type)$/);
  const cDeb = find(/^(debits?|debit amount|money out|paid out|withdrawals?|amount out)/, /debit|money out|withdraw/);
  const cCred = find(/^(credits?|credit amount|money in|paid in|deposits?|amount in)/, /credit|money in|deposit/);
  const cFee = find(/^(fees?|charges?|service fees?|bank charges)\b/);
  const cBal = find(/balance/);
  const cAmt = find(/^(transaction )?amount/, /amount/);
  const cDesc = find(/^description$/, /desc|narrat|detail|particular/, /reference|transaction|payee|beneficiary/);
  const cCat = find(/^category$/, /categor/);
  const cStatus = find(/^status$/);
  let pend = 0;
  rows.slice(hi + 1).forEach((r, ri) => {
    const d = anyDate(r[cDate]);
    if (!d) return;
    if (cStatus >= 0 && /pending|reserved|authori[sz]ation/i.test(r[cStatus] || '')) { pend++; return; }
    let amt: number | null = null;
    if (cDeb >= 0 || cCred >= 0) {
      const de = anyNum(r[cDeb]), cr = anyNum(r[cCred]);
      amt = (cr ? Math.abs(cr) : 0) - (de ? Math.abs(de) : 0);
      if (!de && !cr) amt = null;
    }
    if (amt == null && cAmt >= 0) {
      amt = anyNum(r[cAmt]);
      const ty = cType >= 0 ? (r[cType] || '').trim().toLowerCase() : '';
      if (amt != null && /^(d|dr|db|debit|-)$/.test(ty)) amt = -Math.abs(amt);
      else if (amt != null && /^(c|cr|credit|\+)$/.test(ty)) amt = Math.abs(amt);
    }
    const desc = (r[cDesc] || '').replace(/\s+/g, ' ').trim();
    const bal = cBal >= 0 ? anyNum(r[cBal]) : null;
    const bankCat = cCat >= 0 ? (r[cCat] || '').trim() : '';
    if (amt) {
      const row: RowTx = { d, desc, amt: round2(amt), bal, bankCat, _r: ri };
      if (amt < 0 && !bankCat && FEE_DESC_RE.test(desc)) { row.fee = true; row.bankCat = 'Fees'; }
      out.tx.push(row);
    }
    const fee = cFee >= 0 ? anyNum(r[cFee]) : null;
    if (fee) out.tx.push({ d, desc: 'Fee: ' + desc, amt: round2(-Math.abs(fee)), bal, bankCat: 'Fees', fee: true, _r: ri } as RowTx);
  });
  if (pend) out.warnings.push(`Skipped ${pend} pending transaction${pend === 1 ? '' : 's'}.`);
  return finishByBalance(out);
}

/* ---------- OFX / QFX ---------- */

export function parseOfx(text: string): ParseResult {
  const tag = (s: string, t: string) => s.match(new RegExp('<' + t + '>\\s*([^<\\r\\n]*)', 'i'))?.[1].trim() ?? '';
  const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"');
  const org = tag(text, 'ORG') || tag(text, 'FID');
  const bank = bankName(detectBankText(text.toLowerCase(), org.toLowerCase())) || org || 'OFX';
  const acct = tag(text, 'ACCTID').replace(/\D/g, '');
  const out: ParseResult = { bank, account: bank + (acct ? ' ' + acct.slice(-4) : ''), tx: [], opening: null, closing: null, warnings: [], recon: null };
  for (const blk of text.split(/<STMTTRN>/i).slice(1).map(x => x.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0])) {
    const ds = tag(blk, 'DTPOSTED') || tag(blk, 'DTUSER');
    const d = ds.length >= 8 ? validIso(+ds.slice(0, 4), +ds.slice(4, 6), +ds.slice(6, 8)) : null;
    const amt = anyNum(tag(blk, 'TRNAMT'));
    if (!d || !amt) continue;
    const nm = unesc(tag(blk, 'NAME')), memo = unesc(tag(blk, 'MEMO'));
    const desc = [nm, memo && !nm.toLowerCase().includes(memo.toLowerCase()) ? memo : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const type = tag(blk, 'TRNTYPE').toUpperCase();
    const row: ParsedTx = { d, desc: desc || type || 'Transaction', amt: round2(amt), bal: null, bankCat: '' };
    if (amt < 0 && (type === 'FEE' || type === 'SRVCHG' || FEE_DESC_RE.test(desc))) { row.fee = true; row.bankCat = 'Fees'; }
    out.tx.push(row);
  }
  out.tx.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (!out.tx.length) out.warnings.push('No transactions were found in this OFX file.');
  return out;
}

/* ---------- QIF ---------- */

export function parseQif(text: string, name?: string): ParseResult {
  const out: ParseResult = { bank: 'QIF', account: baseName(name, 'QIF'), tx: [], opening: null, closing: null, warnings: [], recon: null };
  const recs: Record<string, string>[] = [];
  let cur: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l[0] === '!') continue;
    if (l[0] === '^') { if (cur.D) recs.push(cur); cur = {}; continue; }
    const k = l[0], v = l.slice(1).trim();
    if (k === 'U') { if (!cur.T) cur.T = v; } else if ('DTPMN'.includes(k)) cur[k] = v;
  }
  if (cur.D) recs.push(cur);
  // South African banks write dd/mm; switch to mm/dd only when the file proves it
  const parts = recs.map(r => r.D.replace(/'/g, '/').split(/[/.\-\s]+/).map(Number));
  const ymd = recs.some(r => /^\d{4}/.test(r.D));
  const mdy = !ymd && parts.some(p => p[1] > 12) && !parts.some(p => p[0] > 12);
  recs.forEach((r, i) => {
    const p = parts[i];
    const [y, m, d] = ymd ? p : mdy ? [p[2], p[0], p[1]] : [p[2], p[1], p[0]];
    const iso = validIso(y, m, d), amt = anyNum(r.T);
    if (!iso || !amt) return;
    const desc = [r.P, r.M && r.M !== r.P ? r.M : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const row: ParsedTx = { d: iso, desc: desc || 'Transaction', amt: round2(amt), bal: null, bankCat: '' };
    if (amt < 0 && FEE_DESC_RE.test(desc)) { row.fee = true; row.bankCat = 'Fees'; }
    out.tx.push(row);
  });
  out.tx.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (!out.tx.length) out.warnings.push('No transactions were found in this QIF file.');
  return out;
}
