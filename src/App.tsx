import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from './state/store';
import { Budget } from './ui/Budget';
import { FileInputs, Icons, Logo, ToastView, Tooltip } from './ui/common';
import { Import } from './ui/Import';
import { Overview } from './ui/Overview';
import { Settings } from './ui/Settings';
import { Transactions } from './ui/Transactions';
import { TxEditor } from './ui/TxEditor';

type View = 'overview' | 'transactions' | 'budget' | 'import' | 'settings';
const VIEWS: Record<View, { label: string; render: () => ReactNode }> = {
  overview: { label: 'Overview', render: () => <Overview /> },
  transactions: { label: 'Transactions', render: () => <Transactions /> },
  budget: { label: 'Budget', render: () => <Budget /> },
  import: { label: 'Import', render: () => <Import /> },
  settings: { label: 'Settings', render: () => <Settings /> },
};
const viewFromHash = (): View => {
  const h = location.hash.slice(1);
  return h in VIEWS ? (h as View) : 'overview';
};

function useHashView(): View {
  const [view, setView] = useState(viewFromHash);
  useEffect(() => {
    const on = () => { setView(viewFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return view;
}

/** Files dropped anywhere are imported (instead of the browser opening them). */
function useFileDrop() {
  const importFiles = useStore(s => s.importFiles);
  useEffect(() => {
    const has = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const over = (e: DragEvent) => { if (has(e)) { e.preventDefault(); document.body.classList.add('dragging'); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); };
    const drop = (e: DragEvent) => {
      document.body.classList.remove('dragging');
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      location.hash = '#import';
      void importFiles([...e.dataTransfer.files]);
    };
    document.addEventListener('dragenter', over);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', over);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, [importFiles]);
}

const SAVE_TEXT = { saved: 'Saved on this device', saving: 'Saving…', error: 'Could not save. Download a backup from Settings.' };

export function App() {
  const view = useHashView();
  const saveState = useStore(s => s.saveState);
  useFileDrop();
  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand"><Logo />Budget Tracker</div>
          <div className={`sync ${saveState === 'error' ? 'err' : ''}`} role="status">{SAVE_TEXT[saveState]}</div>
          <nav className="tabs" aria-label="Screens">
            {(Object.keys(VIEWS) as View[]).map(k => (
              <a key={k} href={`#${k}`} className={k === view ? 'on' : ''} aria-current={k === view ? 'page' : undefined}>
                {Icons[k]}
                {VIEWS[k].label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main>{VIEWS[view].render()}</main>
      <TxEditor />
      <ToastView />
      <Tooltip />
      <FileInputs />
    </>
  );
}
