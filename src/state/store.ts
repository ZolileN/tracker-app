import { create } from 'zustand';
import { readStatementFile } from '../parser/readFile';
import { catLookup, merchantKey, recategorise, ruleHit } from '../domain/categorise';
import { plural, todayIso } from '../domain/format';
import { prepImport, withIds, type Pending } from '../domain/importing';
import { periodEnd, periodKey, periodsOf, summarise, txIn } from '../domain/periods';
import { defaultSettings, mergeSettings, readBackup } from '../domain/settings';
import type { Category, Months, Rule, Settings, Tx } from '../domain/types';

/* ---------- persistence: this device only ---------- */

const KEY = 'budget-tracker-v1'; // same key and shape as the original single-file app

function loadSaved(): { settings: Settings; months: Months } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return { settings: mergeSettings(o.settings), months: o.months && typeof o.months === 'object' ? o.months : {} };
    }
  } catch (e) {
    console.error('Could not read saved data', e);
  }
  return { settings: defaultSettings(), months: {} };
}

/* ---------- state ---------- */

export interface ToastAction { label: string; run?: () => void }
export interface Toast { id: number; msg: string; actions: ToastAction[] }
export interface Filter { q: string; cat: string; acct: string; type: '' | 'in' | 'out'; period: 'sel' | 'all' }
export type SaveState = 'saved' | 'saving' | 'error';

interface State {
  settings: Settings;
  months: Months;
  saveState: SaveState;
  /** Selected budget period (start date), or null for "the latest with data" */
  period: string | null;
  filter: Filter;
  pending: Pending[];
  busy: string;
  toast: Toast | null;
  /** Transaction editor: null = closed, { id: undefined } = new */
  editor: { id?: string } | null;
}

interface Actions {
  setPeriod(p: string | null): void;
  setFilter(f: Partial<Filter>): void;
  showCategory(cat: string): void;
  notify(msg: string, actions?: ToastAction[]): void;
  closeToast(): void;
  openEditor(id?: string): void;
  closeEditor(): void;

  saveTx(input: { id?: string; d: string; desc: string; amt: number; cat: string; acct: string; note?: string }): void;
  removeTx(id: string): void;
  setTxCategory(id: string, cat: string): void;

  importFiles(files: File[]): Promise<void>;
  confirmImport(key: string): void;
  discardPending(key: string): void;
  setPendingAccount(key: string, name: string): void;
  removeBatch(id: string): void;

  setBudget(cat: string, value: number): void;
  fillBudgetsFromAverage(): void;
  setStartDay(day: number): void;
  addCategory(name: string, type: Category['type']): void;
  renameCategory(id: string, name: string): void;
  deleteCategory(id: string): void;
  addRule(rule: Rule): void;
  deleteRule(index: number): void;
  restoreBackup(text: string): void;
  wipe(): void;
}

export type Store = State & Actions;

const allOf = (months: Months): Tx[] => Object.values(months).flat();

/** New months object with `list` added (by date). */
function withAdded(months: Months, list: Tx[]): { months: Months; added: number } {
  const ids = new Set(allOf(months).map(t => t.id));
  const next: Months = { ...months };
  let added = 0;
  for (const t of list) {
    if (ids.has(t.id)) continue;
    ids.add(t.id);
    const ym = t.d.slice(0, 7);
    next[ym] = next[ym] === months[ym] ? [...(months[ym] ?? [])] : next[ym];
    next[ym].push(t);
    added++;
  }
  return { months: added ? next : months, added };
}

function without(months: Months, pred: (t: Tx) => boolean): Months {
  const next: Months = {};
  for (const ym in months) {
    const list = months[ym].filter(t => !pred(t));
    if (list.length) next[ym] = list.length === months[ym].length ? months[ym] : list;
  }
  return next;
}

function mapTx(months: Months, pred: (t: Tx) => boolean, fn: (t: Tx) => Tx): Months {
  const next: Months = { ...months };
  for (const ym in months) if (months[ym].some(pred)) next[ym] = months[ym].map(t => (pred(t) ? fn(t) : t));
  return next;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

const saved = loadSaved();

export const useStore = create<Store>()((set, get) => {
  /** Re-apply rules after settings changed. */
  const applyRules = (settings: Settings) => {
    const changed = recategorise(get().months, settings);
    set({ settings, months: Object.keys(changed).length ? { ...get().months, ...changed } : get().months });
  };

  return {
    ...saved,
    saveState: 'saved',
    period: null,
    filter: { q: '', cat: '', acct: '', type: '', period: 'sel' },
    pending: [],
    busy: '',
    toast: null,
    editor: null,

    setPeriod: period => set({ period }),
    setFilter: f => set({ filter: { ...get().filter, ...f } }),
    showCategory: cat => {
      set({ filter: { q: '', cat, acct: '', type: '', period: 'sel' } });
      location.hash = '#transactions';
    },
    notify: (msg, actions = []) => {
      clearTimeout(toastTimer);
      set({ toast: { id: ++toastSeq, msg, actions } });
      if (!actions.length) toastTimer = setTimeout(() => set({ toast: null }), 4500);
    },
    closeToast: () => { clearTimeout(toastTimer); set({ toast: null }); },
    openEditor: id => set({ editor: { id } }),
    closeEditor: () => set({ editor: null }),

    saveTx: input => {
      const { months, filter } = get();
      const amt = Math.round(input.amt * 100) / 100;
      const o = { d: input.d, desc: input.desc, amt, cat: input.cat, acct: input.acct || 'Cash', man: true, ...(input.note ? { note: input.note } : {}) };
      if (input.id) {
        const old = allOf(months).find(t => t.id === input.id);
        if (!old) return;
        const { note: _n, ...keep } = old;
        void _n;
        const rest = without(months, t => t.id === input.id);
        set({ months: withAdded(rest, [{ ...keep, ...o }]).months });
      } else {
        const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        set({ months: withAdded(months, [{ id, src: 'man', ...o }]).months });
      }
      set({ editor: null, period: filter.period === 'all' ? get().period : periodKey(input.d, get().settings.startDay) });
      get().notify(input.id ? 'Transaction updated.' : 'Transaction added.');
    },
    removeTx: id => {
      set({ months: without(get().months, t => t.id === id), editor: null });
      get().notify('Transaction deleted.');
    },
    setTxCategory: (id, cat) => {
      const { months, settings } = get();
      const tx = allOf(months).find(t => t.id === id);
      if (!tx) return;
      set({ months: mapTx(months, t => t.id === id, t => ({ ...t, cat, man: true })) });
      const name = catLookup(settings.cats)(cat).name;
      const k = merchantKey(tx.desc);
      if (k.length < 3) { get().notify(`Set to ${name}.`); return; }
      const sign = tx.amt > 0 ? 'in' : 'out';
      const rule: Rule = { k, cat, s: sign, user: true };
      const others = allOf(get().months).filter(t => t.id !== id && !t.fee && t.cat !== cat && ruleHit(rule, (t.desc || '').toLowerCase(), t.amt));
      const otherIds = new Set(others.map(t => t.id));
      get().notify(`Set to ${name}. Do the same for ${others.length ? others.length + ' other' : 'future'} "${k}" transaction${others.length === 1 ? '' : 's'}?`, [
        {
          label: 'Apply and remember',
          run: () => {
            const s = get().settings;
            const rules = [rule, ...s.rules.filter(r => !(r.user && r.k === k && r.s === sign))];
            set({
              settings: { ...s, rules },
              months: mapTx(get().months, t => otherIds.has(t.id), t => { const { man: _m, ...rest } = t; void _m; return { ...rest, cat }; }),
            });
            get().notify('Rule saved.');
          },
        },
        { label: 'Just this one' },
      ]);
    },

    importFiles: async files => {
      for (const f of files) {
        set({ busy: `Reading ${f.name}…` });
        const res = await readStatementFile(f);
        const { settings, months } = get();
        const p = prepImport(res.bank ? res : { ...res, tx: [] }, f.name, new Set(allOf(months).map(t => t.id)), settings.rules);
        set({ pending: [...get().pending, p] });
      }
      set({ busy: '' });
    },
    confirmImport: key => {
      const p = get().pending.find(x => x.key === key);
      if (!p) return;
      const acct = p.acctName.trim() || p.res.account || 'Account';
      const bid = 'b' + Date.now().toString(36);
      const list = withIds(p.tx.map(({ id: _id, ...t }) => { void _id; return t; }), acct).map(t => ({ ...t, batch: bid }));
      const { months, added } = withAdded(get().months, list);
      const s = get().settings;
      const pending = get().pending.filter(x => x.key !== key);
      set({
        months, pending,
        ...(added ? { settings: { ...s, batches: [...s.batches, { id: bid, name: p.fileName, acct, when: todayIso(), count: added, from: p.from, to: p.to }] } } : {}),
      });
      get().notify(added ? `Imported ${plural(added, 'transaction')} into ${acct}.` : 'Nothing new to import — these transactions are already saved.');
      if (!pending.length && added && p.to) {
        set({ period: periodKey(p.to, s.startDay) });
        location.hash = '#overview';
      }
    },
    discardPending: key => set({ pending: get().pending.filter(x => x.key !== key) }),
    setPendingAccount: (key, name) => set({ pending: get().pending.map(x => (x.key === key ? { ...x, acctName: name } : x)) }),
    removeBatch: id => {
      const b = get().settings.batches.find(x => x.id === id);
      if (!b) return;
      get().notify(`Remove the ${plural(b.count, 'transaction')} imported from ${b.name}?`, [
        {
          label: 'Remove',
          run: () => {
            const s = get().settings;
            set({ months: without(get().months, t => t.batch === id), settings: { ...s, batches: s.batches.filter(x => x.id !== id) } });
          },
        },
        { label: 'Keep' },
      ]);
    },

    setBudget: (cat, value) => {
      const s = get().settings;
      const budgets = { ...s.budgets };
      const v = Math.max(0, Math.round(value || 0));
      if (v) budgets[cat] = v; else delete budgets[cat];
      set({ settings: { ...s, budgets } });
    },
    fillBudgetsFromAverage: () => {
      const { settings: s, months } = get();
      const all = allOf(months);
      const cat = catLookup(s.cats);
      const done = periodsOf(all, s.startDay).filter(p => periodEnd(p) < todayIso() && txIn(all, p).length);
      if (!done.length) return;
      const avg: Record<string, number> = {};
      for (const p of done) {
        const sm = summarise(txIn(all, p), cat);
        for (const k in sm.byCat) avg[k] = (avg[k] || 0) + sm.byCat[k] / done.length;
      }
      const budgets: Record<string, number> = { ...s.budgets };
      for (const c of s.cats) {
        if (c.type !== 'exp') continue;
        const v = Math.ceil((avg[c.id] || 0) / 50) * 50;
        if (v > 0) budgets[c.id] = v; else delete budgets[c.id];
      }
      set({ settings: { ...s, budgets } });
      get().notify('Budgets set to your average spending, rounded up to the nearest R50. Adjust them down where you want to cut back.');
    },
    setStartDay: day => set({ settings: { ...get().settings, startDay: Math.min(28, Math.max(1, Math.round(day || 1))) }, period: null }),
    addCategory: (name, type) => {
      const s = get().settings;
      const cats = [...s.cats];
      cats.splice(cats.length - 2, 0, { id: 'c' + Date.now().toString(36), name: name.trim().slice(0, 40), type });
      set({ settings: { ...s, cats } });
    },
    renameCategory: (id, name) => {
      const s = get().settings;
      if (!name.trim()) return;
      set({ settings: { ...s, cats: s.cats.map(c => (c.id === id ? { ...c, name: name.trim().slice(0, 40) } : c)) } });
    },
    deleteCategory: id => {
      const s = get().settings;
      const budgets = { ...s.budgets };
      delete budgets[id];
      const settings: Settings = { ...s, cats: s.cats.filter(c => c.id !== id), rules: s.rules.filter(r => r.cat !== id), budgets };
      set({ months: mapTx(get().months, t => t.cat === id, t => { const { man: _m, ...rest } = t; void _m; return rest; }) });
      applyRules(settings);
    },
    addRule: rule => {
      const s = get().settings;
      applyRules({ ...s, rules: [{ ...rule, user: true }, ...s.rules] });
      get().notify('Rule added and applied.');
    },
    deleteRule: index => {
      const s = get().settings;
      applyRules({ ...s, rules: s.rules.filter((_, i) => i !== index) });
    },
    restoreBackup: text => {
      const b = readBackup(text);
      if (!b) { get().notify('That file is not a backup from this app.'); return; }
      get().notify(`Restore ${plural(b.tx.length, 'transaction')} from this backup? Your settings will be replaced; transactions already here are kept.`, [
        {
          label: 'Restore',
          run: () => {
            const { months, added } = withAdded(get().months, b.tx);
            set({ months, settings: b.settings ?? get().settings, period: null });
            get().notify(`Restored. ${plural(added, 'transaction')} added.`);
          },
        },
        { label: 'Cancel' },
      ]);
    },
    wipe: () => {
      get().notify('Delete every transaction, budget and rule? This cannot be undone.', [
        { label: 'Delete everything', run: () => set({ months: {}, settings: defaultSettings(get().settings.startDay), period: null, pending: [] }) },
        { label: 'Cancel' },
      ]);
    },
  };
});

/* ---------- save on change (debounced), and pick up changes made in another tab ---------- */

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastWritten = '';
useStore.subscribe((s, prev) => {
  if (s.settings === prev.settings && s.months === prev.months) return;
  clearTimeout(saveTimer);
  if (s.saveState !== 'saving') useStore.setState({ saveState: 'saving' });
  saveTimer = setTimeout(() => {
    const { settings, months } = useStore.getState();
    try {
      lastWritten = JSON.stringify({ settings, months });
      localStorage.setItem(KEY, lastWritten);
      useStore.setState({ saveState: 'saved' });
    } catch (e) {
      console.error('save failed', e);
      useStore.setState({ saveState: 'error' });
    }
  }, 400);
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue || e.newValue === lastWritten) return;
    const next = loadSaved();
    useStore.setState({ settings: next.settings, months: next.months });
  });
  // ask the browser not to clear this data when space runs low (matters most on iPhone)
  navigator.storage?.persist?.().catch(() => undefined);
}
