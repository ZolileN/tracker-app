/** App version from package.json (set in vite.config.ts) */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Where testers send feedback, e.g. a Google Form. Set it in Vercel → Settings → Environment Variables. */
  readonly VITE_FEEDBACK_URL?: string;
}
