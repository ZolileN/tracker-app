import { useEffect, useState, useSyncExternalStore } from 'react';
import { todayIso } from '../domain/format';
import { makeBackup } from '../domain/settings';
import { useAllTx } from '../state/derived';
import { useStore } from '../state/store';
import { download, getPref, isInstalled, isIOS, setPref } from './files';

/* ---------- "Install the app" (Chrome / Android offer a prompt; iPhone needs Share → Add to Home Screen) ---------- */

interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let installEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    listeners.forEach(f => f());
  });
  window.addEventListener('appinstalled', () => { installEvent = null; listeners.forEach(f => f()); });
}
const useInstallEvent = () =>
  useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => installEvent);

const daysSince = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);

function InstallBanner() {
  const ev = useInstallEvent();
  const [hidden, setHidden] = useState(() => isInstalled() || daysSince(getPref('install-dismissed')) < 14);
  if (hidden || (!ev && !isIOS())) return null;
  const dismiss = () => { setPref('install-dismissed', new Date().toISOString()); setHidden(true); };
  return (
    <div className="banner install" role="note">
      <div>
        <b>Install Budget Tracker on this {isIOS() ? 'iPhone' : 'device'}.</b>{' '}
        {isIOS()
          ? <>Tap <b>Share</b> <span aria-hidden="true">⬆︎</span> below, then <b>Add to Home Screen</b>. It opens like an app, works offline, and keeps your data safe: in a Safari tab, iPhone can clear it after a week without a visit.</>
          : 'It opens like an app, works offline, and your data stays on this device.'}
      </div>
      <div className="banner-actions">
        {ev && <button className="btn pri sm" onClick={async () => { await ev.prompt(); installEvent = null; setHidden(true); }}>Install</button>}
        <button className="btn sm" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}

/* ---------- backups ---------- */

/** Download a backup and remember when. */
export function useDownloadBackup() {
  const markBackedUp = useStore(s => s.markBackedUp);
  return () => {
    const { settings, months } = useStore.getState();
    download(`budget-backup-${todayIso()}.json`, makeBackup({ ...settings, lastBackup: todayIso() }, months), 'application/json');
    markBackedUp();
  };
}

function BackupReminder() {
  const all = useAllTx();
  const last = useStore(s => s.settings.lastBackup);
  const backup = useDownloadBackup();
  const [snoozed, setSnoozed] = useState(() => daysSince(getPref('backup-snoozed')) < 7);
  useEffect(() => { if (last) setSnoozed(false); }, [last]);
  if (snoozed || all.length < 10 || daysSince(last) < 30) return null;
  return (
    <div className="banner" role="note">
      <div>
        <b>{last ? 'Time for a backup.' : 'Keep a backup.'}</b>{' '}
        Your data is only on this device{last ? `, and the last backup was ${Math.floor(daysSince(last))} days ago` : ''}. If the phone is lost or reset, a backup file is how you get it back.
      </div>
      <div className="banner-actions">
        <button className="btn pri sm" onClick={backup}>Download backup</button>
        <button className="btn sm" onClick={() => { setPref('backup-snoozed', new Date().toISOString()); setSnoozed(true); }}>Later</button>
      </div>
    </div>
  );
}

export function Banners() {
  return (
    <>
      <InstallBanner />
      <BackupReminder />
    </>
  );
}
