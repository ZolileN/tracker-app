/* ===== Budget Tracker app ===== */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const R = (n, dp) => { const neg = n < -0.004; const a = Math.abs(n); const s = a.toFixed(dp == null ? 2 : dp).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (neg ? '−R' : 'R') + s; };
const R0 = n => R(n, 0);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = iso => `${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]}`;
const fmtDateY = iso => `${fmtDate(iso)} ${iso.slice(0, 4)}`;
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hash = s => { let a = 5381, b = 52711; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = (a * 33) ^ c; b = (b * 33) ^ c; } return (a >>> 0).toString(36) + (b >>> 0).toString(36); };

/* ---------- defaults ---------- */
const DEF_CATS = [
  ['salary', 'Salary', 'inc'], ['other_inc', 'Other income', 'inc'], ['rental', 'Rental income', 'inc'], ['grants', 'Grants & pension', 'inc'], ['refunds', 'Tax & other refunds', 'inc'], ['interest', 'Interest', 'inc'],
  ['housing', 'Rent & housing', 'exp'], ['groceries', 'Groceries', 'exp'], ['eating', 'Eating out & takeaways', 'exp'], ['alcohol', 'Alcohol', 'exp'], ['transport', 'Transport (Uber, Bolt, taxi)', 'exp'], ['fuel', 'Fuel & car', 'exp'],
  ['airtime', 'Airtime & data', 'exp'], ['utilities', 'Electricity & utilities', 'exp'], ['subs', 'Subscriptions & software', 'exp'], ['insurance', 'Insurance', 'exp'], ['debt', 'Loans & debt', 'exp'], ['fees', 'Bank fees', 'exp'],
  ['cash', 'Cash withdrawals', 'exp'], ['family', 'Family & support', 'exp'], ['people', 'Payments to people', 'exp'], ['health', 'Health & pharmacy', 'exp'], ['shopping', 'Clothing & shopping', 'exp'], ['fun', 'Entertainment & going out', 'exp'],
  ['other', 'Uncategorised', 'exp'], ['xfer', 'Own-account transfers', 'xfer']
].map(([id, name, type]) => ({ id, name, type }));
/* [keyword, category, sign] — keyword matches at the start of a word; sign: 'in', 'out' or '' */
const DEF_RULES = [
  ['digital transf', 'xfer', ''], ['admin charge', 'fees', 'out'], ['transaction charge', 'fees', 'out'], ['monthly acc fee', 'fees', 'out'], ['monthly management fee', 'fees', 'out'], ['stamped statement', 'fees', 'out'], ['fnb app payment', 'people', 'out'], ['send money', 'people', 'out'], ['monthly account fee', 'fees', 'out'], ['service fee', 'fees', 'out'], ['interest sweep', 'xfer', ''], ['interest', 'fees', 'out'], ['interest', 'interest', 'in'],
  ['salary', 'salary', 'in'], ['sassa', 'grants', 'in'], ['sars', 'refunds', 'in'], ['interest received', 'interest', 'in'],
  ['rent', 'rental', 'in'], ['rent', 'housing', 'out'],
  ['nedins', 'insurance', ''], ['nedlife', 'insurance', ''], ['30dlife', 'insurance', ''], ['insurance', 'insurance', ''], ['sanlam', 'insurance', ''], ['old mutual', 'insurance', ''], ['discovery', 'insurance', ''],
  ['nimble', 'debt', ''], ['capfin', 'debt', ''], ['unifi', 'debt', ''], ['wonga', 'debt', ''], ['finchoice', 'debt', ''], ['loan', 'debt', 'out'],
  ['tops', 'alcohol', 'out'], ['liquor', 'alcohol', 'out'],   ['spar', 'groceries', 'out'], ['superspar', 'groceries', 'out'], ['checkers', 'groceries', 'out'], ['pnp', 'groceries', 'out'], ['pick n pay', 'groceries', 'out'], ['shoprite', 'groceries', 'out'], ['shopritehyper', 'groceries', 'out'], ['woolworths', 'groceries', 'out'], ['ok express', 'groceries', 'out'], ['usave', 'groceries', 'out'], ['boxer', 'groceries', 'out'], ['food lover', 'groceries', 'out'], ['butchery', 'groceries', 'out'],   ['kfc', 'eating', 'out'], ['wimpy', 'eating', 'out'], ['nando', 'eating', 'out'], ['mcd', 'eating', 'out'], ['steers', 'eating', 'out'], ['debonairs', 'eating', 'out'], ['takeaway', 'eating', 'out'],   ['uber', 'transport', 'out'], ['dl*uber', 'transport', 'out'], ['bolt', 'transport', 'out'], ['dl*bolt', 'transport', 'out'], ['taxi', 'transport', 'out'],
  ['engen', 'fuel', 'out'], ['shell', 'fuel', 'out'], ['sasol', 'fuel', 'out'], ['caltex', 'fuel', 'out'], ['astron', 'fuel', 'out'],
  ['vodacom', 'airtime', 'out'], ['mtn', 'airtime', 'out'], ['telkom', 'airtime', 'out'], ['cell c', 'airtime', 'out'], ['airtime', 'airtime', 'out'],
  ['prepaid electricity', 'utilities', 'out'], ['electricity', 'utilities', 'out'],
  ['apple.com', 'subs', 'out'], ['google', 'subs', 'out'], ['godaddy', 'subs', 'out'], ['cursor', 'subs', 'out'], ['netflix', 'subs', 'out'], ['spotify', 'subs', 'out'], ['showmax', 'subs', 'out'], ['dstv', 'subs', 'out'], ['openai', 'subs', 'out'], ['anthropic', 'subs', 'out'], ['claude', 'subs', 'out'], ['github', 'subs', 'out'], ['aws', 'subs', 'out'],
  ['atm cash', 'cash', 'out'], ['cash sent', 'cash', 'out'], ['atm', 'cash', 'out'],
  ['clicks', 'health', 'out'], ['dischem', 'health', 'out'], ['dis-chem', 'health', 'out'], ['pharmacy', 'health', 'out'],
  ['mr price', 'shopping', 'out'], ['ackermans', 'shopping', 'out'], ['takealot', 'shopping', 'out'], ['pep', 'shopping', 'out'],
  ].map(([k, cat, s]) => ({ k, cat, s }));
const BANKCAT = {
  in: { 'other income': 'other_inc', 'payment received': 'other_inc', 'payments received': 'other_inc', 'allowance': 'other_inc', 'children & dependants': 'other_inc', 'other': 'other_inc', 'pension': 'grants', 'refunds': 'refunds', 'rental income': 'rental', 'interest': 'interest', 'transfer': 'xfer' },
  out: { 'public transport': 'transport', 'other transport': 'transport', 'cellphone': 'airtime', 'internet': 'subs', 'digital subscriptions': 'subs', 'online store': 'subs', 'takeaways': 'eating', 'alcohol': 'alcohol', 'going out': 'fun', 'groceries': 'groceries', 'cash withdrawal': 'cash', 'other loans & accounts': 'debt', 'fees': 'fees', 'digital payments': 'people', 'transfer': 'xfer', 'children & dependants': 'family', 'allowance': 'family', 'rental income': 'housing' }
};

/* ---------- state ---------- */
const S = {
  ready: false, loadErr: null, mode: 'local',
  settings: { cats: DEF_CATS.map(c => ({ ...c })), rules: DEF_RULES.map(r => ({ ...r })), budgets: {}, startDay: 25, batches: [], v: 1 },
  months: {},           // 'YYYY-MM' -> [tx]
  view: 'overview', period: null,
  f: { q: '', cat: '', acct: '', type: '', period: 'sel' },
  pending: [], toast: null, modal: null, busy: ''
};
const allTx = () => Object.values(S.months).flat();
const catById = id => S.settings.cats.find(c => c.id === id) || S.settings.cats.find(c => c.id === 'other') || { id: 'other', name: 'Uncategorised', type: 'exp' };
const catType = id => catById(id).type;

/* ---------- storage: private per-person cloud store, with a this-browser fallback ---------- */
const store = (() => {
  let base = null; const LS = 'budget-tracker-v1';
  const dirty = new Set(); let timer = null, writing = false, failed = false;
  function status(t, err) { const el = $('#sync'); if (el) { el.textContent = t; el.classList.toggle('err', !!err); } }
  async function init() {
    let db = null, user = null;
    try { if (window.claude && window.claude.use) { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } } catch (e) { }
    let uid = null; try { uid = user ? await user.id() : null; } catch (e) { }
    if (db && uid) {
      base = db.collection('data/users/' + uid); S.mode = 'cloud';
      const snap = await Promise.race([base.get(), new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), 10000))]);
      for (const d of snap.docs) {
        const data = d.data(); if (!data) continue;
        if (d.id === 'settings') mergeSettings(data);
        else if (d.id.startsWith('tx-')) S.months[d.id.slice(3)] = JSON.parse(JSON.stringify(data.items || []));
      }
      status('Saved to your account');
    } else {
      S.mode = 'local';
      try { const raw = localStorage.getItem(LS); if (raw) { const o = JSON.parse(raw); if (o.settings) mergeSettings(o.settings); S.months = o.months || {}; } } catch (e) { }
      status('Saved in this browser only');
    }
  }
  function mergeSettings(o) {
    const s = JSON.parse(JSON.stringify(o));
    S.settings = { ...S.settings, ...s };
    if (!Array.isArray(S.settings.cats) || !S.settings.cats.length) S.settings.cats = DEF_CATS.map(c => ({ ...c }));
    for (const k of ['other', 'xfer', 'fees']) if (!S.settings.cats.find(c => c.id === k)) S.settings.cats.push({ ...DEF_CATS.find(c => c.id === k) });
    // keep the person's own rules; built-in rules always come from this version of the app (minus deleted categories)
    const have = new Set(S.settings.cats.map(c => c.id));
    S.settings.rules = (Array.isArray(S.settings.rules) ? S.settings.rules.filter(r => r && r.user) : []).concat(DEF_RULES.filter(r => have.has(r.cat)).map(r => ({ ...r })));
  }
  function mark(key) { if (S.loadErr) return; dirty.add(key); clearTimeout(timer); timer = setTimeout(flush, 500); status('Saving…'); }
  async function flush() {
    if (writing) { timer = setTimeout(flush, 300); return; }
    writing = true; failed = false;
    const keys = [...dirty]; dirty.clear();
    try {
      if (S.mode === 'cloud') {
        for (const k of keys) {
          if (k === 'settings') await base.doc('settings').set(JSON.parse(JSON.stringify(S.settings)));
          else { const items = S.months[k]; if (items && items.length) await base.doc('tx-' + k).set({ items: JSON.parse(JSON.stringify(items)) }); else await base.doc('tx-' + k).delete(); }
        }
      } else localStorage.setItem(LS, JSON.stringify({ settings: S.settings, months: S.months }));
    } catch (e) { failed = true; keys.forEach(k => dirty.add(k)); console.error('save failed', e); }
    writing = false;
    if (failed) status(e_msg(), true); else if (dirty.size) timer = setTimeout(flush, 300); else status(S.mode === 'cloud' ? 'Saved to your account' : 'Saved in this browser only');
  }
  function e_msg() { return 'Could not save. Your latest changes are not stored yet — export a backup from Settings.'; }
  return { init, mark, saveSettings: () => mark('settings'), saveMonth: ym => mark(ym), retry: flush };
})();

/* ---------- categorising ---------- */
function merchantKey(desc) {
  let s = (desc || '').toLowerCase();
  s = s.replace(/^fee: /, '').replace(/^(recurring card purchase|online purchase|international online purchase|banking app (external )?(payshap|immediate) payment|banking app prepaid purchase|banking app cash sent|pos purchase|payshap credit|fnb app payment to|fnb app transfer (to|from)|send money( app)?( dr)?|banking app transfer (to|received from)|payshap payment received|payment received|debicheck debit order \(\d+\)|digital payment (cr|dt)( absa bank)?|digital transf (cr|dt)|imdte digital pmt( absa bank)?|payshap ext (debit|credit)|acb credit|dc track external|airtime debit|ib payment to|ib transfer (to|from)|magtape credit|credit transfer|card purchase)\s*:?\s*/, '');
  s = s.replace(/\(card \d+\)/g, '').replace(/\(\d[\d ]+\)?/g, '').replace(/[#*]?\d{5,}\S*/g, '').replace(/\s+/g, ' ').trim();
  return s;
}
function ruleHit(rule, low, amt) {
  if (rule.s === 'in' && amt < 0) return false;
  if (rule.s === 'out' && amt > 0) return false;
  let i = -1;
  while ((i = low.indexOf(rule.k, i + 1)) >= 0) { if (i === 0 || !/[a-z0-9]/.test(low[i - 1])) return true; }
  return false;
}
function categorise(t) {
  const low = (t.desc || '').toLowerCase();
  if (t.fee) return 'fees';
  for (const r of S.settings.rules) if (r.user && ruleHit(r, low, t.amt)) return r.cat;
  if (/\bfee\b/.test(low) && t.amt < 0 && Math.abs(t.amt) <= 60) return 'fees';
  for (const r of S.settings.rules) if (!r.user && ruleHit(r, low, t.amt)) return r.cat;
  const bc = (t.bankCat || '').toLowerCase();
  const m = BANKCAT[t.amt >= 0 ? 'in' : 'out'][bc]; if (m) return m;
  return t.amt >= 0 ? 'other_inc' : 'other';
}
function recategoriseAll() {
  const valid = new Set(S.settings.cats.map(c => c.id));
  for (const ym in S.months) { let ch = false; for (const t of S.months[ym]) { if (t.man && valid.has(t.cat)) continue; const c = categorise(t); const cc = valid.has(c) ? c : (t.amt >= 0 ? 'other_inc' : 'other'); if (cc !== t.cat) { t.cat = cc; ch = true; } } if (ch) store.saveMonth(ym); }
}

/* ---------- periods ---------- */
function periodKey(iso) {
  const sd = S.settings.startDay || 1; let y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8);
  if (d < sd) { m--; if (m < 1) { m = 12; y--; } }
  return `${y}-${String(m).padStart(2, '0')}-${String(sd).padStart(2, '0')}`;
}
function periodEnd(key) { const d = new Date(+key.slice(0, 4), +key.slice(5, 7), +key.slice(8) - 1); return isoOf(d); }
function periodLabel(key) {
  if ((S.settings.startDay || 1) === 1) return `${MON[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
  const e = periodEnd(key); return `${fmtDate(key)} – ${fmtDateY(e)}`;
}
function periods() { const set = new Set(allTx().map(t => periodKey(t.d))); set.add(periodKey(todayIso())); return [...set].sort().reverse(); }
function txIn(key) { const e = periodEnd(key); return allTx().filter(t => t.d >= key && t.d <= e); }
function summarise(list) {
  let inc = 0, exp = 0, xin = 0, xout = 0; const byCat = {};
  for (const t of list) {
    const ty = catType(t.cat);
    if (ty === 'xfer') { if (t.amt > 0) xin += t.amt; else xout -= t.amt; continue; }
    if (ty === 'inc') inc += t.amt; else exp -= t.amt;
    byCat[t.cat] = (byCat[t.cat] || 0) + (ty === 'inc' ? t.amt : -t.amt);
  }
  return { inc, exp, net: inc - exp, xin, xout, byCat };
}

/* ---------- mutations ---------- */
function addTx(list) {
  const ids = new Set(allTx().map(t => t.id)); let n = 0; const touched = new Set();
  for (const t of list) { if (ids.has(t.id)) continue; ids.add(t.id); const ym = t.d.slice(0, 7); (S.months[ym] = S.months[ym] || []).push(t); touched.add(ym); n++; }
  touched.forEach(store.saveMonth); return n;
}
function findTx(id) { for (const ym in S.months) { const i = S.months[ym].findIndex(t => t.id === id); if (i >= 0) return { ym, i, t: S.months[ym][i] }; } return null; }
function removeTx(id) { const f = findTx(id); if (f) { S.months[f.ym].splice(f.i, 1); store.saveMonth(f.ym); } }
function prepImport(res, fileName) {
  const acct = res.account; const seen = {}; const existing = new Set(allTx().map(t => t.id));
  const tx = res.tx.map(t => {
    const key = `${acct}|${t.d}|${t.amt}|${t.bal}|${t.desc}`; seen[key] = (seen[key] || 0) + 1;
    const o = { id: hash(key + '|' + seen[key]), d: t.d, desc: t.desc, amt: t.amt, acct, src: 'imp' };
    if (t.bankCat) o.bankCat = t.bankCat; if (t.fee) o.fee = true; if (t.bal != null) o.bal = t.bal;
    o.cat = categorise(o); return o;
  });
  const dates = tx.map(t => t.d).sort();
  return { fileName, res, tx, fresh: tx.filter(t => !existing.has(t.id)).length, from: dates[0], to: dates[dates.length - 1] };
}

/* ---------- file reading ---------- */
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
let pdfReady = null;
function ensurePdf() {
  if (!pdfReady) pdfReady = (async () => {
    const b = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    await loadScript(b + 'pdf.min.js'); await loadScript(b + 'pdf.worker.min.js'); // worker code runs on the page itself
    return window.pdfjsLib;
  })().catch(e => { pdfReady = null; throw e; });
  return pdfReady;
}
async function handleFiles(files) {
  for (const f of files) {
    S.busy = `Reading ${f.name}…`; render();
    try {
      let res;
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        const lib = await ensurePdf();
        const lines = await pdfToLines(lib, new Uint8Array(await f.arrayBuffer()));
        res = parseStatementLines(lines);
        if (res.bank === null && !lines.length) res.warnings = ['This PDF has no readable text (it may be a scan or password-protected).'];
      } else res = parseTextStatement(await f.text(), f.name);
      S.pending.push(prepImport(res.bank ? res : { ...res, account: 'Unknown', tx: [] }, f.name));
    } catch (e) {
      console.error(e);
      S.pending.push({ fileName: f.name, res: { bank: null, warnings: [/password/i.test(e && e.message || '') ? 'This PDF is password-protected. Save an unlocked copy and try again.' : 'Could not read this file: ' + (e && e.message || e)], tx: [] }, tx: [], fresh: 0 });
    }
  }
  S.busy = ''; S.view = 'import'; render();
}
function confirmImport(i) {
  const p = S.pending[i]; if (!p) return;
  const acct = (p.acctName || p.res.account || 'Account').trim() || 'Account';
  const seen = {};
  const list = p.tx.map(t => { const key = `${acct}|${t.d}|${t.amt}|${t.bal}|${t.desc}`; seen[key] = (seen[key] || 0) + 1; return { ...t, acct, id: hash(key + '|' + seen[key]) }; });
  const bid = 'b' + Date.now().toString(36); list.forEach(t => t.batch = bid);
  const n = addTx(list);
  if (n) { S.settings.batches.push({ id: bid, name: p.fileName, acct, when: todayIso(), count: n, from: p.from, to: p.to }); store.saveSettings(); }
  S.pending.splice(i, 1);
  toast(n ? `Imported ${n} transaction${n === 1 ? '' : 's'} into ${acct}.` : 'Nothing new to import — these transactions are already saved.');
  if (!S.pending.length && n) { S.period = periodKey(p.to); location.hash = '#overview'; S.view = 'overview'; }
  render();
}

/* ---------- small UI helpers ---------- */
function toast(msg, actions) { S.toast = { msg, actions: actions || [] }; clearTimeout(toast.t); if (!actions) toast.t = setTimeout(() => { S.toast = null; renderOverlay(); }, 4500); renderOverlay(); }
function catOptions(sel, type) {
  const groups = [['exp', 'Spending'], ['inc', 'Income'], ['xfer', 'Not counted']];
  return groups.filter(g => !type || g[0] === type || g[0] === 'xfer').map(([ty, lab]) => `<optgroup label="${lab}">${S.settings.cats.filter(c => c.type === ty).map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
}
function periodSelect() { const ps = periods(); if (!S.period || !ps.includes(S.period)) S.period = ps.find(p => txIn(p).length) || ps[0]; return `<select data-ch="period" aria-label="Budget period">${ps.map(p => `<option value="${p}"${p === S.period ? ' selected' : ''}>${esc(periodLabel(p))}</option>`).join('')}</select>`; }

/* ---------- views ---------- */
function viewOverview() {
  if (!allTx().length) return `<div class="card empty"><h2>Start by adding your money</h2><p class="muted">Upload a bank statement (a PDF from Absa, Capitec, FNB, Nedbank, Standard Bank, GoTyme (TymeBank), Discovery, Investec or another South African bank, or a CSV, OFX or QIF download) or capture a transaction by hand.</p><p><button class="btn pri" data-act="pick">Upload statements</button> <button class="btn" data-act="add">Add a transaction</button></p></div>`;
  const sel = periodSelect(); const list = txIn(S.period); const sm = summarise(list);
  const ps = periods().slice().reverse(); const idx = ps.indexOf(S.period);
  const prev = idx > 0 ? summarise(txIn(ps[idx - 1])) : null;
  const budTotal = S.settings.cats.filter(c => c.type === 'exp').reduce((s, c) => s + (+S.settings.budgets[c.id] || 0), 0);
  const delta = (a, b, goodUp) => { if (!prev || !b) return ''; const d = a - b; if (Math.abs(d) < 1) return 'same as previous period'; return `${d > 0 ? '▲' : '▼'} ${R0(Math.abs(d))} vs previous period`; };
  const kpis = `<div class="grid kpis">
    <div class="card kpi"><div class="lab">Income</div><div class="val num">${R0(sm.inc)}</div><div class="note">${delta(sm.inc, prev && prev.inc)}</div></div>
    <div class="card kpi"><div class="lab">Spending</div><div class="val num">${R0(sm.exp)}</div><div class="note">${delta(sm.exp, prev && prev.exp)}</div></div>
    <div class="card kpi"><div class="lab">${sm.net >= 0 ? 'Left over' : 'Overspent'}</div><div class="val num ${sm.net >= 0 ? 'pos' : 'neg'}">${R0(Math.abs(sm.net))}</div><div class="note">${sm.inc > 0 ? Math.round(sm.exp / sm.inc * 100) + '% of income spent' : 'no income recorded'}</div></div>
    <div class="card kpi"><div class="lab">Budget</div><div class="val num">${budTotal ? R0(budTotal - sm.exp) : '—'}</div><div class="note">${budTotal ? (budTotal - sm.exp >= 0 ? 'left of ' : 'over a budget of ') + R0(budTotal) : '<a href="#budget">Set a budget</a>'}</div></div>
  </div>`;
  // category bars
  const cats = Object.entries(sm.byCat).filter(([id, v]) => catType(id) === 'exp' && v > 0.005).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;
  const bars = cats.length ? `<div class="hb">${cats.map(([id, v]) => { const b = +S.settings.budgets[id] || 0; return `<div class="row" data-act="gocat" data-id="${esc(id)}" data-tip="${esc(catById(id).name)}\n${R(v)} · ${Math.round(v / sm.exp * 100)}% of spending${b ? `\nBudget ${R0(b)}` : ''}\nClick to see the transactions"><div class="name">${esc(catById(id).name)}</div><div class="trk"><div class="fill" style="width:${Math.max(0.5, v / max * 100)}%"></div></div><div class="v num">${R0(v)}</div></div>`; }).join('')}</div>` : '<p class="muted">No spending in this period.</p>';
  return `<div class="bar">${sel}<span class="grow"></span><button class="btn" data-act="pick">Upload statement</button><button class="btn pri" data-act="add">+ Add transaction</button></div>
  ${kpis}
  <div class="grid two" style="margin-top:12px">
    <div class="card"><h2>Where the money went</h2><p class="sub">Spending by category, ${esc(periodLabel(S.period))}. Transfers between your own accounts are left out.</p>${bars}</div>
    <div class="card"><h2>What stands out</h2><p class="sub">Worked out from this period's transactions</p>${insights(list, sm)}</div>
  </div>
  <div class="grid half" style="margin-top:12px">
    <div class="card"><h2>Spending through the period</h2><p class="sub">Running total of spending, day by day${budTotal ? ', against your budget' : ''}</p>${chartCumulative(list, budTotal)}</div>
    <div class="card"><h2>Income and spending by period</h2><p class="sub">Last ${Math.min(6, ps.length)} periods</p>${chartTrend(ps.slice(-6))}</div>
  </div>
  <div class="card" style="margin-top:12px"><h2>Biggest payees</h2><p class="sub">Who received the most in this period</p>${topMerchants(list)}</div>`;
}
function insights(list, sm) {
  const out = []; const spend = list.filter(t => catType(t.cat) === 'exp' && t.amt < 0);
  if (!list.length) return '<p class="muted">No transactions in this period yet.</p>';
  if (sm.exp > 0) {
    const wkEnd = isoOf(new Date(+S.period.slice(0, 4), +S.period.slice(5, 7) - 1, +S.period.slice(8) + 6));
    const early = spend.filter(t => t.d <= wkEnd).reduce((s, t) => s - t.amt, 0);
    if (early / sm.exp >= 0.4) out.push(`<b>${Math.round(early / sm.exp * 100)}%</b> of this period's spending (${R0(early)}) happened in the first 7 days.`);
    const top = Object.entries(sm.byCat).filter(([id]) => catType(id) === 'exp').sort((a, b) => b[1] - a[1])[0];
    if (top) out.push(`Biggest category: <b>${esc(catById(top[0]).name)}</b> at ${R0(top[1])} (${Math.round(top[1] / sm.exp * 100)}% of spending).`);
  }
  const fees = list.filter(t => t.cat === 'fees'); const feeSum = fees.reduce((s, t) => s - t.amt, 0);
  if (feeSum > 0) { const insf = fees.filter(t => /insufficient|ins funds|disputed/i.test(t.desc)); const insfSum = insf.reduce((s, t) => s - t.amt, 0); out.push(`Bank fees: <b>${R(feeSum)}</b> across ${fees.length} charges${insf.length ? `, including ${R(insfSum)} for ${insf.length} declined or disputed payments` : ''}.`); }
  if (sm.net < 0) out.push(`You spent <b>${R0(-sm.net)}</b> more than came in.`); else if (sm.inc > 0) out.push(`You kept <b>${R0(sm.net)}</b> (${Math.round(sm.net / sm.inc * 100)}% of income).`);
  const unc = list.filter(t => t.cat === 'other'); if (unc.length) out.push(`<b>${unc.length}</b> payments worth ${R0(unc.reduce((s, t) => s - t.amt, 0))} are uncategorised. <a href="#transactions" data-act="gocat" data-id="other">Review them</a>`);
  if (sm.xin + sm.xout > 0) out.push(`${R0(Math.max(sm.xin, sm.xout))} moved between your own accounts and is not counted as income or spending.`);
  const over = S.settings.cats.filter(c => c.type === 'exp' && +S.settings.budgets[c.id] > 0 && (sm.byCat[c.id] || 0) > +S.settings.budgets[c.id]);
  if (over.length) out.push(`Over budget in: ${over.map(c => `<b>${esc(c.name)}</b> (+${R0(sm.byCat[c.id] - S.settings.budgets[c.id])})`).join(', ')}.`);
  return `<ul class="ins">${out.map(o => `<li>${o}</li>`).join('')}</ul>`;
}
function niceMax(v) { if (v <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; }
const axisFmt = (v, max) => max >= 10000 ? (v / 1000) + 'K' : String(v);
function chartCumulative(list, budget) {
  const start = S.period, end = periodEnd(S.period); const days = [];
  for (let d = new Date(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8)); isoOf(d) <= end; d.setDate(d.getDate() + 1)) days.push(isoOf(d));
  const per = {}; for (const t of list) if (catType(t.cat) === 'exp') per[t.d] = (per[t.d] || 0) - t.amt;
  const today = todayIso(); let run = 0; const pts = [];
  for (const d of days) { if (d > today) break; run += per[d] || 0; pts.push({ d, v: run, day: per[d] || 0 }); }
  if (!pts.length || run <= 0) return '<p class="muted">No spending to chart yet.</p>';
  const W = 520, H = 220, L = 40, Rt = 12, T = 12, B = 24; const max = niceMax(Math.max(run, budget || 0));
  const x = i => L + (W - L - Rt) * (days.length > 1 ? i / (days.length - 1) : 0), y = v => T + (H - T - B) * (1 - v / max);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const grid = [0, .25, .5, .75, 1].map(f => `<line class="gl" x1="${L}" x2="${W - Rt}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end">${axisFmt(max * f, max)}</text>`).join('');
  const bw = (W - L - Rt) / days.length;
  const hits = pts.map((p, i) => `<rect class="hit" x="${x(i) - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}" data-tip="${fmtDateY(p.d)}\nSpent so far: ${R0(p.v)}\nThat day: ${R0(p.day)}"/>`).join('');
  const last = pts[pts.length - 1], li = pts.length - 1;
  const xl = [0, Math.floor((days.length - 1) / 2), days.length - 1].map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}">${fmtDate(days[i])}</text>`).join('');
  const bl = budget ? `<line x1="${L}" x2="${W - Rt}" y1="${y(budget)}" y2="${y(budget)}" stroke="var(--text-3)" stroke-width="1"/><text x="${W - Rt}" y="${y(budget) - 5}" text-anchor="end">Budget ${R0(budget)}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Running total of spending, reaching ${R0(run)}">${grid}${bl}<path d="${path}L${x(li)},${y(0)}L${x(0)},${y(0)}Z" fill="var(--series-1)" opacity=".1"/><path d="${path}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(li)}" cy="${y(last.v)}" r="4.5" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/><text x="${Math.min(x(li), W - Rt - 4)}" y="${Math.max(y(last.v) - 10, 10)}" text-anchor="end" style="fill:var(--text);font-weight:600">${R0(last.v)}</text>${xl}${hits}</svg>`;
}
function chartTrend(ps) {
  const data = ps.map(p => ({ p, ...summarise(txIn(p)) })); const mx = Math.max(...data.map(d => Math.max(d.inc, d.exp)));
  if (!(mx > 0)) return '<p class="muted">Nothing to chart yet.</p>';
  const W = 520, H = 220, L = 40, Rt = 8, T = 16, B = 34; const max = niceMax(mx);
  const y = v => T + (H - T - B) * (1 - v / max); const band = (W - L - Rt) / data.length; const bw = Math.min(24, (band - 14) / 2);
  const grid = [0, .25, .5, .75, 1].map(f => `<line class="gl" x1="${L}" x2="${W - Rt}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end">${axisFmt(max * f, max)}</text>`).join('');
  const col = (x, v, c) => { const h = Math.max(0, y(0) - y(v)); if (h < 0.5) return ''; const r = Math.min(4, h); return `<path d="M${x},${y(0)}V${y(v) + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}Z" fill="var(${c})"/>`; };
  const lab = p => (S.settings.startDay || 1) === 1 ? MON[+p.slice(5, 7) - 1] : fmtDate(p);
  const g = data.map((d, i) => { const cx = L + band * i + band / 2; return `${col(cx - bw - 1, d.inc, '--series-1')}${col(cx + 1, d.exp, '--series-2')}<text x="${cx}" y="${H - 18}" text-anchor="middle">${lab(d.p)}</text><rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" data-tip="${esc(periodLabel(d.p))}\nIncome: ${R0(d.inc)}\nSpending: ${R0(d.exp)}\n${d.net >= 0 ? 'Left over' : 'Overspent'}: ${R0(Math.abs(d.net))}" data-act="goperiod" data-id="${d.p}" style="cursor:pointer"/>`; }).join('');
  return `<div class="legend"><span><i style="background:var(--series-1)"></i>Income</span><span><i style="background:var(--series-2)"></i>Spending</span></div><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Income and spending for the last ${data.length} periods">${grid}${g}${(S.settings.startDay || 1) === 1 ? '' : `<text x="${L}" y="${H - 4}">period starting</text>`}</svg>`;
}
function topMerchants(list) {
  const m = {}; for (const t of list) { if (catType(t.cat) !== 'exp' || t.amt >= 0 || t.cat === 'fees') continue; const k = merchantKey(t.desc) || '(no description)'; (m[k] = m[k] || { v: 0, n: 0, cat: t.cat }); m[k].v -= t.amt; m[k].n++; }
  const top = Object.entries(m).sort((a, b) => b[1].v - a[1].v).slice(0, 10);
  if (!top.length) return '<p class="muted">No payments in this period.</p>';
  return `<div class="scroll"><table><thead><tr><th>Payee</th><th>Category</th><th class="r">Payments</th><th class="r">Total</th></tr></thead><tbody>${top.map(([k, o]) => `<tr><td style="text-transform:capitalize">${esc(k)}</td><td><span class="pill">${esc(catById(o.cat).name)}</span></td><td class="r num">${o.n}</td><td class="r num">${R(o.v)}</td></tr>`).join('')}</tbody></table></div>`;
}

function filteredTx() {
  const f = S.f; let list = f.period === 'all' ? allTx() : txIn(S.period);
  const q = f.q.trim().toLowerCase();
  list = list.filter(t => (!f.cat || t.cat === f.cat) && (!f.acct || t.acct === f.acct) && (!f.type || (f.type === 'in' ? t.amt > 0 : t.amt < 0)) && (!q || (t.desc || '').toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q) || String(Math.abs(t.amt)).includes(q)));
  return list.sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0);
}
function viewTransactions() {
  const sel = periodSelect(); const accts = [...new Set(allTx().map(t => t.acct))].sort(); const list = filteredTx(); const f = S.f;
  const tin = list.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0), tout = list.filter(t => t.amt < 0).reduce((s, t) => s - t.amt, 0);
  const shown = list.slice(0, 400);
  return `<div class="bar">
    <select data-ch="fperiod" aria-label="Which dates"><option value="sel"${f.period === 'sel' ? ' selected' : ''}>Selected period</option><option value="all"${f.period === 'all' ? ' selected' : ''}>All dates</option></select>
    ${f.period === 'sel' ? sel : ''}
    <select data-ch="fcat" aria-label="Category"><option value="">All categories</option>${catOptions(f.cat)}</select>
    <select data-ch="facct" aria-label="Account"><option value="">All accounts</option>${accts.map(a => `<option${a === f.acct ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <select data-ch="ftype" aria-label="Money in or out"><option value="">In and out</option><option value="in"${f.type === 'in' ? ' selected' : ''}>Money in</option><option value="out"${f.type === 'out' ? ' selected' : ''}>Money out</option></select>
    <input type="search" id="q" placeholder="Search description or amount" value="${esc(f.q)}" style="flex:1;min-width:160px" aria-label="Search">
    <button class="btn pri" data-act="add">+ Add</button>
  </div>
  <div class="card"><p class="sub" id="txsum">${list.length} transaction${list.length === 1 ? '' : 's'} · in ${R(tin)} · out ${R(tout)}${list.length > 400 ? ' · showing the latest 400' : ''}</p>
  <div class="scroll"><table><thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th><th class="r">Amount</th><th></th></tr></thead>
  <tbody>${shown.map(t => `<tr><td class="num">${fmtDate(t.d)}</td><td><div class="desc" title="${esc(t.desc)}${t.note ? '\n' + esc(t.note) : ''}">${esc(t.desc)}${t.src === 'man' ? ' <span class="pill">manual</span>' : ''}</div></td><td class="muted">${esc(t.acct)}</td><td><select data-ch="txcat" data-id="${t.id}" aria-label="Category for ${esc(t.desc)}">${catOptions(t.cat)}</select></td><td class="r num ${t.amt > 0 ? 'pos' : ''}">${t.amt > 0 ? '+' : ''}${R(t.amt).replace('−', '-')}</td><td><button class="rowbtn" data-act="edit" data-id="${t.id}" aria-label="Edit">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">No transactions match these filters.</td></tr>'}</tbody></table></div></div>`;
}

function viewBudget() {
  const sel = periodSelect(); const sm = summarise(txIn(S.period)); const B = S.settings.budgets;
  const done = periods().filter(p => periodEnd(p) < todayIso() && txIn(p).length);
  const avg = {}; let avgInc = 0;
  if (done.length) { for (const p of done) { const s = summarise(txIn(p)); avgInc += s.inc / done.length; for (const id in s.byCat) avg[id] = (avg[id] || 0) + s.byCat[id] / done.length; } }
  const exp = S.settings.cats.filter(c => c.type === 'exp');
  const tb = exp.reduce((s, c) => s + (+B[c.id] || 0), 0);
  const rows = exp.map(c => { const b = +B[c.id] || 0, sp = sm.byCat[c.id] || 0; const pct = b ? sp / b : 0; const cls = b && pct > 1 ? 'over' : b && pct > 0.85 ? 'near' : ''; const st = !b ? '' : pct > 1 ? `<span class="badc">▲ Over by ${R0(sp - b)}</span>` : pct > 0.85 ? `<span class="warnc">● ${R0(b - sp)} left</span>` : `<span class="ok">✓ ${R0(b - sp)} left</span>`;
    return `<tr><td>${esc(c.name)}</td><td class="r"><input type="number" min="0" step="50" inputmode="numeric" value="${b || ''}" placeholder="0" data-ch="budget" data-id="${esc(c.id)}" style="width:100px;text-align:right" aria-label="Budget for ${esc(c.name)}"></td><td class="r num">${R0(sp)}</td><td class="r num muted">${done.length ? R0(avg[c.id] || 0) : '—'}</td><td style="min-width:120px"><div class="meter ${cls}"><i style="width:${Math.min(100, pct * 100)}%"></i></div></td><td class="small" data-st="${esc(c.id)}">${st}</td></tr>`; }).join('');
  return `<div class="bar">${sel}<span class="grow"></span><button class="btn" data-act="fillavg"${done.length ? '' : ' disabled'}>Fill from my average spending</button></div>
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="card kpi"><div class="lab">Total budget</div><div class="val num" id="tb">${R0(tb)}</div><div class="note">per period</div></div>
    <div class="card kpi"><div class="lab">Spent this period</div><div class="val num">${R0(sm.exp)}</div><div class="note">${tb ? Math.round(sm.exp / tb * 100) + '% of budget' : ''}</div></div>
    <div class="card kpi"><div class="lab">Average income</div><div class="val num">${done.length ? R0(avgInc) : '—'}</div><div class="note">${done.length ? `over ${done.length} completed period${done.length === 1 ? '' : 's'}` : 'needs a completed period'}</div></div>
    <div class="card kpi"><div class="lab">Budget vs average income</div><div class="val num ${done.length && tb > avgInc ? 'neg' : ''}" id="tbd">${done.length && tb ? R0(avgInc - tb) : '—'}</div><div class="note">${done.length && tb ? (tb > avgInc ? 'budget is more than you earn' : 'unallocated') : ''}</div></div>
  </div>
  <div class="card"><h2>Budget by category</h2><p class="sub">Set an amount per period (${esc(periodLabel(S.period))} shown). Leave blank for no limit.</p>
  <div class="scroll"><table><thead><tr><th>Category</th><th class="r">Budget (R)</th><th class="r">Spent</th><th class="r">Average</th><th>Progress</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function viewImport() {
  const pend = S.pending.map((p, i) => {
    const r = p.res; const bad = !p.tx.length;
    const recon = r.recon ? (r.recon.ok ? `<span class="ok">✓ Adds up to the statement's closing balance (${R(r.closing)})</span>` : `<span class="badc">▲ Does not add up to the closing balance — out by ${R(r.recon.diff)}. Check the result before relying on it.</span>`) : '';
    const tin = p.tx.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0), tout = p.tx.filter(t => t.amt < 0).reduce((s, t) => s - t.amt, 0);
    return `<div class="card" style="margin-bottom:12px"><h2>${esc(p.fileName)}</h2>
      ${(r.warnings || []).map(w => `<p class="badc">${esc(w)}</p>`).join('')}
      ${bad ? '' : `<p class="sub">${esc(r.bank)} · ${fmtDateY(p.from)} to ${fmtDateY(p.to)} · ${p.tx.length} transactions (${p.fresh} new, ${p.tx.length - p.fresh} already saved) · in ${R(tin)} · out ${R(tout)}</p><p>${recon}</p>
      <div class="bar"><label class="small muted">Account name <input type="text" value="${esc(p.acctName || r.account)}" data-ch="acctname" data-id="${i}" style="width:160px"></label><span class="grow"></span><button class="btn" data-act="discard" data-id="${i}">Discard</button><button class="btn pri" data-act="confirm" data-id="${i}"${p.fresh ? '' : ' disabled'}>Import ${p.fresh} new</button></div>
      <details><summary class="small muted" style="cursor:pointer">Preview transactions</summary><div class="scroll" style="max-height:300px;overflow:auto"><table><tbody>${p.tx.slice(0, 200).map(t => `<tr><td class="num">${fmtDate(t.d)}</td><td><div class="desc">${esc(t.desc)}</div></td><td><span class="pill">${esc(catById(t.cat).name)}</span></td><td class="r num">${R(t.amt)}</td></tr>`).join('')}</tbody></table></div></details>`}
      ${bad ? `<button class="btn" data-act="discard" data-id="${i}">Dismiss</button>` : ''}</div>`;
  }).join('');
  const hist = S.settings.batches.slice().reverse().map(b => `<tr><td>${esc(b.name)}</td><td>${esc(b.acct)}</td><td class="num">${b.from ? fmtDateY(b.from) + ' – ' + fmtDateY(b.to) : ''}</td><td class="r num">${b.count}</td><td class="r"><button class="btn sm danger" data-act="delbatch" data-id="${b.id}">Remove</button></td></tr>`).join('');
  return `<div class="drop" id="drop"><p><b>Drop bank statements here</b></p><p class="muted">PDF statements from South African banks (Absa, Capitec, FNB, Nedbank, Standard Bank, GoTyme (TymeBank), Discovery, Investec, African Bank and others), or a CSV, OFX or QIF download. Files are read on this device; only the transactions are saved.</p><p><button class="btn pri" data-act="pick">Choose files</button></p>${S.busy ? `<p>${esc(S.busy)}</p>` : ''}</div>
  <div style="margin-top:12px">${pend}</div>
  <div class="card"><h2>Imported statements</h2><p class="sub">Uploading a statement that overlaps an earlier one is safe: transactions already saved are skipped.</p>${hist ? `<div class="scroll"><table><thead><tr><th>File</th><th>Account</th><th>Dates</th><th class="r">Transactions</th><th></th></tr></thead><tbody>${hist}</tbody></table></div>` : '<p class="muted">Nothing imported yet.</p>'}</div>`;
}

function viewSettings() {
  const s = S.settings; const used = {}; for (const t of allTx()) used[t.cat] = (used[t.cat] || 0) + 1;
  const fixed = new Set(['other', 'xfer', 'fees', 'other_inc']);
  const cats = s.cats.map(c => `<tr><td><input type="text" value="${esc(c.name)}" data-ch="catname" data-id="${esc(c.id)}" style="width:100%;min-width:160px" aria-label="Category name"></td><td>${c.type === 'inc' ? 'Income' : c.type === 'exp' ? 'Spending' : 'Not counted'}</td><td class="r num">${used[c.id] || 0}</td><td class="r">${fixed.has(c.id) ? '' : `<button class="btn sm danger" data-act="delcat" data-id="${esc(c.id)}">Delete</button>`}</td></tr>`).join('');
  const ur = s.rules.map((r, i) => ({ r, i })).filter(o => o.r.user);
  const rules = ur.map(({ r, i }) => `<tr><td>${esc(r.k)}</td><td>${r.s === 'in' ? 'money in' : r.s === 'out' ? 'money out' : 'any'}</td><td>${esc(catById(r.cat).name)}</td><td class="r"><button class="btn sm danger" data-act="delrule" data-id="${i}">Delete</button></td></tr>`).join('');
  return `<div class="grid half">
  <div class="card"><h2>Budget period</h2><p class="sub">Start each period on your payday so a budget covers one pay cycle.</p>
    <label>Period starts on day <input type="number" min="1" max="28" value="${s.startDay}" data-ch="startday" style="width:70px"> of the month</label></div>
  <div class="card"><h2>Backup</h2><p class="sub">Download everything as a file, or restore from one.</p>
    <div class="bar" style="margin:0"><button class="btn" data-act="exportjson" id="bx1">Download backup (.json)</button><button class="btn" data-act="exportcsv" id="bx2">Download transactions (.csv)</button><button class="btn" data-act="pickbackup">Restore from backup</button><button class="btn danger" data-act="wipe">Delete all data</button></div></div>
  </div>
  <div class="card" style="margin-top:12px"><h2>Categories</h2><p class="sub">Rename, add or remove. Deleting a category moves its transactions to Uncategorised.</p>
    <div class="scroll"><table><thead><tr><th>Name</th><th>Type</th><th class="r">Transactions</th><th></th></tr></thead><tbody>${cats}</tbody></table></div>
    <div class="bar" style="margin:12px 0 0"><input type="text" id="newcat" placeholder="New category name"><select id="newcattype"><option value="exp">Spending</option><option value="inc">Income</option></select><button class="btn" data-act="addcat">Add category</button></div></div>
  <div class="card" style="margin-top:12px"><h2>Your rules</h2><p class="sub">When a description contains the text, the category is applied automatically, on past transactions and future imports. Rules are also created when you change a category in the Transactions list and choose "Apply and remember". ${s.rules.length - ur.length} built-in rules run after yours.</p>
    ${rules ? `<div class="scroll"><table><thead><tr><th>Description contains</th><th>Direction</th><th>Category</th><th></th></tr></thead><tbody>${rules}</tbody></table></div>` : '<p class="muted">No rules of your own yet.</p>'}
    <div class="bar" style="margin:12px 0 0"><input type="text" id="rk" placeholder="Text, e.g. ester"><select id="rs"><option value="">Any direction</option><option value="out">Money out</option><option value="in">Money in</option></select><select id="rc">${catOptions('other')}</select><button class="btn" data-act="addrule">Add rule</button></div></div>`;
}

/* ---------- modal: add / edit ---------- */
function openTxModal(id) {
  const f = id ? findTx(id) : null; const t = f ? f.t : null;
  S.modal = { id: id || null, type: t ? (t.amt > 0 ? 'in' : 'out') : 'out', d: t ? t.d : todayIso(), amt: t ? Math.abs(t.amt) : '', desc: t ? t.desc : '', cat: t ? t.cat : '', acct: t ? t.acct : 'Cash', note: t ? (t.note || '') : '', imp: t && t.src !== 'man' };
  renderOverlay(); const el = $('#m-amt'); if (el && !id) el.focus();
}
function modalHtml() {
  const m = S.modal; if (!m) return '';
  const accts = [...new Set(['Cash', ...allTx().map(t => t.acct)])];
  const ty = m.type === 'in' ? 'inc' : 'exp'; const cat = m.cat && (catType(m.cat) === ty || catType(m.cat) === 'xfer') ? m.cat : (ty === 'inc' ? 'other_inc' : 'other');
  return `<div class="modal-bg" data-act="closemodal"><form class="modal" id="txform" role="dialog" aria-modal="true" aria-label="${m.id ? 'Edit' : 'Add'} transaction">
    <h3>${m.id ? 'Edit transaction' : 'Add a transaction'}</h3>
    <div class="f"><div class="seg"><button type="button" data-act="mtype" data-id="out" class="${m.type === 'out' ? 'on' : ''}">Expense</button><button type="button" data-act="mtype" data-id="in" class="${m.type === 'in' ? 'on' : ''}">Income</button></div></div>
    <div class="grid half" style="gap:10px"><div class="f"><label for="m-amt">Amount (R)</label><input id="m-amt" type="number" step="0.01" min="0.01" inputmode="decimal" required value="${esc(m.amt)}"></div>
    <div class="f"><label for="m-d">Date</label><input id="m-d" type="date" required value="${esc(m.d)}"></div></div>
    <div class="f"><label for="m-desc">Description</label><input id="m-desc" type="text" required maxlength="140" value="${esc(m.desc)}" placeholder="e.g. Taxi fare, cash from side job"></div>
    <div class="grid half" style="gap:10px"><div class="f"><label for="m-cat">Category</label><select id="m-cat">${catOptions(cat, ty)}</select></div>
    <div class="f"><label for="m-acct">Account</label><input id="m-acct" type="text" list="accts" value="${esc(m.acct)}" maxlength="30"><datalist id="accts">${accts.map(a => `<option value="${esc(a)}">`).join('')}</datalist></div></div>
    <div class="f"><label for="m-note">Note (optional)</label><input id="m-note" type="text" maxlength="200" value="${esc(m.note)}"></div>
    <div class="bar" style="margin:6px 0 0">${m.id ? `<button type="button" class="btn danger" data-act="deltx">Delete</button>` : ''}<span class="grow"></span><button type="button" class="btn" data-act="closemodal" data-force="1">Cancel</button><button class="btn pri" type="submit">Save</button></div>
  </form></div>`;
}
function saveModal() {
  const m = S.modal; const amt = Math.round(parseFloat($('#m-amt').value) * 100) / 100; const d = $('#m-d').value; const desc = $('#m-desc').value.trim();
  if (!(amt > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !desc) return;
  const o = { d, desc, amt: m.type === 'in' ? amt : -amt, cat: $('#m-cat').value, acct: $('#m-acct').value.trim() || 'Cash', man: true };
  const note = $('#m-note').value.trim(); if (note) o.note = note;
  if (m.id) { const f = findTx(m.id); if (f) { const keep = { id: f.t.id, src: f.t.src, bal: f.t.bal, bankCat: f.t.bankCat, fee: f.t.fee, batch: f.t.batch }; for (const k in keep) if (keep[k] === undefined) delete keep[k]; S.months[f.ym].splice(f.i, 1); store.saveMonth(f.ym); addTx([{ ...keep, ...o }]); } }
  else addTx([{ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), src: 'man', ...o }]);
  S.modal = null; S.period = S.f.period === 'all' ? S.period : periodKey(d); toast(m.id ? 'Transaction updated.' : 'Transaction added.'); render();
}

/* ---------- render ---------- */
const VIEWS = { overview: ['Overview', viewOverview], transactions: ['Transactions', viewTransactions], budget: ['Budget', viewBudget], import: ['Import', viewImport], settings: ['Settings', viewSettings] };
function render() {
  $('#tabs').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<a href="#${k}" class="${k === S.view ? 'on' : ''}">${v[0]}</a>`).join('');
  const main = $('#main');
  if (S.loadErr) { main.innerHTML = `<div class="banner err"><b>Your saved data could not be reached.</b> Nothing has been changed. Check your connection, then try again.</div><button class="btn pri" data-act="reload">Try again</button>`; return; }
  if (!S.ready) return;
  const banner = S.mode === 'local' ? `<div class="banner">Your data is being kept in this browser only, so it will not appear on other devices and can be lost if browser data is cleared. Use Settings to download a backup.</div>` : '';
  main.innerHTML = banner + VIEWS[S.view][1]();
  renderOverlay();
  if (S.view === 'settings') window.claude && window.claude.use && window.claude.use('downloads').then(d => { if (!d) { const a = $('#bx1'), b = $('#bx2'); if (a) a.textContent = 'Copy backup to clipboard'; if (b) b.textContent = 'Copy transactions as CSV'; } });
}
function renderOverlay() {
  const t = S.toast;
  $('#overlay').innerHTML = modalHtml() + (t ? `<div class="toast" role="status"><span>${esc(t.msg)}</span>${t.actions.map((a, i) => `<button class="btn sm" data-act="toast" data-id="${i}">${esc(a.label)}</button>`).join('')}</div>` : '');
}
function route() { const h = location.hash.slice(1); S.view = VIEWS[h] ? h : 'overview'; render(); window.scrollTo(0, 0); }

/* ---------- export ---------- */
async function saveFile(filename, data) {
  let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { }
  if (dl) { try { await dl.save({ filename, data }); toast('File saved.'); } catch (e) { if (!e || e.code !== 'declined') toast('The file could not be saved here.'); } return; }
  try { await navigator.clipboard.writeText(data); toast('Copied. Paste it into a file to keep it.'); } catch (e) { toast('Downloads are not available in this view.'); }
}
function csvOut() { const q = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`; return ['Date,Description,Amount,Account,Category,Note'].concat(allTx().sort((a, b) => a.d < b.d ? -1 : 1).map(t => [t.d, q(t.desc), t.amt.toFixed(2), q(t.acct), q(catById(t.cat).name), q(t.note || '')].join(','))).join('\n'); }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return; const act = el.dataset.act, id = el.dataset.id;
  if (act === 'closemodal') { if (e.target !== el && !el.dataset.force) return; S.modal = null; renderOverlay(); return; }
  if (el.tagName === 'A' && act !== 'gocat') return;
  switch (act) {
    case 'pick': $('#file').click(); break;
    case 'pickbackup': $('#bfile').click(); break;
    case 'add': openTxModal(); break;
    case 'edit': openTxModal(id); break;
    case 'mtype': S.modal = { ...S.modal, type: id, amt: $('#m-amt').value, d: $('#m-d').value, desc: $('#m-desc').value, acct: $('#m-acct').value, note: $('#m-note').value, cat: '' }; renderOverlay(); break;
    case 'deltx': removeTx(S.modal.id); S.modal = null; toast('Transaction deleted.'); render(); break;
    case 'gocat': e.preventDefault(); S.f = { ...S.f, cat: id, q: '', type: '', acct: '', period: 'sel' }; location.hash = '#transactions'; if (S.view === 'transactions') render(); break;
    case 'goperiod': S.period = id; render(); break;
    case 'confirm': confirmImport(+id); break;
    case 'discard': S.pending.splice(+id, 1); render(); break;
    case 'delbatch': { const b = S.settings.batches.find(x => x.id === id); toast(`Remove the ${b.count} transactions imported from ${b.name}?`, [{ label: 'Remove', fn: () => { for (const ym in S.months) { const n = S.months[ym].length; S.months[ym] = S.months[ym].filter(t => t.batch !== id); if (S.months[ym].length !== n) store.saveMonth(ym); } S.settings.batches = S.settings.batches.filter(x => x.id !== id); store.saveSettings(); render(); } }, { label: 'Keep' }]); break; }
    case 'fillavg': { const done = periods().filter(p => periodEnd(p) < todayIso() && txIn(p).length); const avg = {}; for (const p of done) { const s = summarise(txIn(p)); for (const k in s.byCat) avg[k] = (avg[k] || 0) + s.byCat[k] / done.length; } for (const c of S.settings.cats) if (c.type === 'exp') { const v = Math.ceil((avg[c.id] || 0) / 50) * 50; if (v > 0) S.settings.budgets[c.id] = v; else delete S.settings.budgets[c.id]; } store.saveSettings(); render(); toast('Budgets set to your average spending, rounded up to the nearest R50. Adjust them down where you want to cut back.'); break; }
    case 'addcat': { const name = $('#newcat').value.trim(); if (!name) break; const cid = 'c' + Date.now().toString(36); S.settings.cats.splice(S.settings.cats.length - 2, 0, { id: cid, name: name.slice(0, 40), type: $('#newcattype').value }); store.saveSettings(); render(); break; }
    case 'delcat': S.settings.cats = S.settings.cats.filter(c => c.id !== id); S.settings.rules = S.settings.rules.filter(r => r.cat !== id); delete S.settings.budgets[id]; for (const ym in S.months) for (const t of S.months[ym]) if (t.cat === id) delete t.man; store.saveSettings(); recategoriseAll(); Object.keys(S.months).forEach(store.saveMonth); render(); break;
    case 'addrule': { const k = $('#rk').value.trim().toLowerCase(); if (k.length < 2) break; S.settings.rules.unshift({ k, cat: $('#rc').value, s: $('#rs').value, user: true }); store.saveSettings(); recategoriseAll(); render(); toast('Rule added and applied.'); break; }
    case 'delrule': S.settings.rules.splice(+id, 1); store.saveSettings(); recategoriseAll(); render(); break;
    case 'exportjson': saveFile(`budget-backup-${todayIso()}.json`, JSON.stringify({ app: 'budget-tracker', v: 1, settings: S.settings, months: S.months })); break;
    case 'exportcsv': saveFile(`transactions-${todayIso()}.csv`, csvOut()); break;
    case 'wipe': toast('Delete every transaction, budget and rule? This cannot be undone.', [{ label: 'Delete everything', fn: () => { Object.keys(S.months).forEach(ym => { S.months[ym] = []; store.saveMonth(ym); }); S.settings = { cats: DEF_CATS.map(c => ({ ...c })), rules: DEF_RULES.map(r => ({ ...r })), budgets: {}, startDay: S.settings.startDay, batches: [], v: 1 }; store.saveSettings(); S.months = {}; render(); } }, { label: 'Cancel' }]); break;
    case 'toast': { const a = S.toast && S.toast.actions[+id]; S.toast = null; renderOverlay(); if (a && a.fn) a.fn(); break; }
    case 'reload': boot(); break;
  }
});
document.addEventListener('change', e => {
  const el = e.target; const ch = el.dataset && el.dataset.ch;
  if (el.id === 'file') { const fs = [...el.files]; el.value = ''; if (fs.length) handleFiles(fs); return; }
  if (el.id === 'bfile') { const f = el.files[0]; el.value = ''; if (f) f.text().then(restore); return; }
  if (!ch) return; const id = el.dataset.id;
  switch (ch) {
    case 'period': S.period = el.value; render(); break;
    case 'fperiod': S.f.period = el.value; render(); break;
    case 'fcat': S.f.cat = el.value; render(); break;
    case 'facct': S.f.acct = el.value; render(); break;
    case 'ftype': S.f.type = el.value; render(); break;
    case 'txcat': {
      const f = findTx(id); if (!f) break; const cat = el.value; f.t.cat = cat; f.t.man = true; store.saveMonth(f.ym);
      const k = merchantKey(f.t.desc); const sign = f.t.amt > 0 ? 'in' : 'out';
      const rule = { k, cat, s: sign, user: true };
      const others = k.length >= 3 ? allTx().filter(t => t.id !== f.t.id && !t.fee && t.cat !== cat && ruleHit(rule, (t.desc || '').toLowerCase(), t.amt)) : [];
      if (k.length >= 3) toast(`Set to ${catById(cat).name}. Do the same for ${others.length ? others.length + ' other' : 'future'} "${k}" transaction${others.length === 1 ? '' : 's'}?`, [{ label: 'Apply and remember', fn: () => { S.settings.rules = S.settings.rules.filter(r => !(r.user && r.k === k && r.s === sign)); S.settings.rules.unshift(rule); store.saveSettings(); for (const t of others) { t.cat = cat; delete t.man; } [...new Set(others.map(t => t.d.slice(0, 7)))].forEach(store.saveMonth); render(); toast('Rule saved.'); } }, { label: 'Just this one' }]);
      else toast(`Set to ${catById(cat).name}.`);
      break;
    }
    case 'budget': { const v = Math.max(0, Math.round(+el.value || 0)); if (v) S.settings.budgets[id] = v; else delete S.settings.budgets[id]; store.saveSettings(); render(); break; }
    case 'startday': { const v = Math.min(28, Math.max(1, Math.round(+el.value || 1))); S.settings.startDay = v; S.period = null; store.saveSettings(); render(); break; }
    case 'catname': { const c = S.settings.cats.find(c => c.id === id); if (c && el.value.trim()) { c.name = el.value.trim().slice(0, 40); store.saveSettings(); } break; }
    case 'acctname': if (S.pending[+id]) S.pending[+id].acctName = el.value; break;
  }
});
let qT = null;
document.addEventListener('input', e => {
  if (e.target.id !== 'q') return; S.f.q = e.target.value; clearTimeout(qT);
  qT = setTimeout(() => { const pos = e.target.selectionStart; render(); const q = $('#q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) { } } }, 220);
});
document.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'txform') saveModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modal) { S.modal = null; renderOverlay(); } });
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); const d = $('#drop'); if (d) d.classList.add('over'); } }));
document.addEventListener('dragleave', e => { const d = $('#drop'); if (d && !e.relatedTarget) d.classList.remove('over'); });
document.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); handleFiles([...e.dataTransfer.files]); } });
const tip = $('#tip');
document.addEventListener('mousemove', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (!el) { tip.style.display = 'none'; return; } tip.textContent = el.dataset.tip; tip.style.display = 'block'; const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, e.clientX + 14)) + 'px'; tip.style.top = (e.clientY + h + 24 > window.innerHeight ? e.clientY - h - 10 : e.clientY + 16) + 'px'; });
window.addEventListener('hashchange', route);

function restore(text) {
  let o; try { o = JSON.parse(text); } catch (e) { toast('That file is not a backup from this app.'); return; }
  if (!o || o.app !== 'budget-tracker' || !o.months) { toast('That file is not a backup from this app.'); return; }
  const n = Object.values(o.months).flat().length;
  toast(`Restore ${n} transactions from this backup? Your settings will be replaced; transactions already here are kept.`, [{ label: 'Restore', fn: () => { if (o.settings) { S.settings = { ...S.settings, ...o.settings }; store.saveSettings(); } const added = addTx(Object.values(o.months).flat().filter(t => t && t.id && t.d && typeof t.amt === 'number')); S.period = null; render(); toast(`Restored. ${added} transactions added.`); } }, { label: 'Cancel' }]);
}

async function boot() {
  S.loadErr = null; S.ready = false;
  try { await store.init(); S.ready = true; } catch (e) { console.error(e); S.loadErr = e || true; $('#sync').textContent = ''; }
  route();
}
boot();
