export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const FEEDBACK_URL: string | undefined = import.meta.env.VITE_FEEDBACK_URL || undefined;

/** Save a file. On iPhone this opens the share sheet, where "Save to Files" is. */
export function download(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Share a file (WhatsApp, email…) where the device can; otherwise download it. Returns how it went. */
export async function shareOrDownload(filename: string, data: string, type: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([data], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }
  download(filename, data, type);
  return 'downloaded';
}

/** Running as an installed app (home-screen icon) rather than in a browser tab. */
export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* Per-device conveniences (which tips were dismissed). Never needed for the app to work. */
export function getPref(key: string): string | null {
  try { return localStorage.getItem('bt-pref-' + key); } catch { return null; }
}
export function setPref(key: string, value: string) {
  try { localStorage.setItem('bt-pref-' + key, value); } catch { /* private mode: fine */ }
}
