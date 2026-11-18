import { useEffect, useRef, useState, type ReactNode } from 'react';
import { periodLabel } from '../domain/periods';
import type { CatType } from '../domain/types';
import { usePeriods } from '../state/derived';
import { useStore } from '../state/store';

export function PeriodSelect() {
  const { periods, period } = usePeriods();
  const startDay = useStore(s => s.settings.startDay);
  const setPeriod = useStore(s => s.setPeriod);
  return (
    <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Budget period">
      {periods.map(p => <option key={p} value={p}>{periodLabel(p, startDay)}</option>)}
    </select>
  );
}

/** <option>s grouped by type; `only` limits to one type (plus "not counted"). */
export function CategoryOptions({ only }: { only?: CatType }) {
  const cats = useStore(s => s.settings.cats);
  const groups: [CatType, string][] = [['exp', 'Spending'], ['inc', 'Income'], ['xfer', 'Not counted']];
  return (
    <>
      {groups.filter(([ty]) => !only || ty === only || ty === 'xfer').map(([ty, label]) => (
        <optgroup key={ty} label={label}>
          {cats.filter(c => c.type === ty).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
    </>
  );
}

/* ---------- file pickers (one hidden input each, opened from anywhere) ---------- */

const pickers: { statements?: () => void; backup?: () => void } = {};
export const pickStatements = () => pickers.statements?.();
export const pickBackup = () => pickers.backup?.();

export function FileInputs() {
  const stmt = useRef<HTMLInputElement>(null);
  const bak = useRef<HTMLInputElement>(null);
  const importFiles = useStore(s => s.importFiles);
  const restoreBackup = useStore(s => s.restoreBackup);
  useEffect(() => {
    pickers.statements = () => stmt.current?.click();
    pickers.backup = () => bak.current?.click();
  }, []);
  return (
    <>
      <input ref={stmt} type="file" hidden multiple accept=".pdf,.csv,.txt,.ofx,.qfx,.qif,application/pdf,text/csv,application/x-ofx"
        onChange={e => {
          const fs = [...(e.target.files ?? [])];
          e.target.value = '';
          if (fs.length) { location.hash = '#import'; void importFiles(fs); }
        }} />
      <input ref={bak} type="file" hidden accept=".json,application/json"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void f.text().then(restoreBackup);
        }} />
    </>
  );
}

/* ---------- toast ---------- */

export function ToastView() {
  const toast = useStore(s => s.toast);
  const close = useStore(s => s.closeToast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.msg}</span>
      {toast.actions.map(a => (
        <button key={a.label} className="btn sm" onClick={() => { close(); a.run?.(); }}>{a.label}</button>
      ))}
    </div>
  );
}

/* ---------- tooltip for anything with data-tip ---------- */

export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]');
      if (!el) { setTip(null); return; }
      setTip({ text: el.getAttribute('data-tip') ?? '', x: e.clientX, y: e.clientY });
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);
  const w = ref.current?.offsetWidth ?? 200, h = ref.current?.offsetHeight ?? 60;
  if (!tip) return null;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, tip.x + 14));
  const top = tip.y + h + 24 > window.innerHeight ? tip.y - h - 10 : tip.y + 16;
  return <div ref={ref} className="tip" style={{ left, top }}>{tip.text}</div>;
}

/* ---------- icons (simple strokes, inherit colour) ---------- */

const I = ({ children }: { children: ReactNode }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const Icons = {
  overview: <I><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>,
  transactions: <I><path d="M4 6h16M4 12h16M4 18h10" /></I>,
  budget: <I><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5 5" /></I>,
  import: <I><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></I>,
  settings: <I><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></I>,
};

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <path d="M16 44V30M28 44V20M40 44V34M52 44H12" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
