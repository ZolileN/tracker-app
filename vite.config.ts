import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
// `npm run preview` serves the same security headers as Vercel, so the production setup can be tried locally
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
const siteHeaders = Object.fromEntries((vercel.headers.find(h => h.source === '/(.*)')?.headers ?? []).map(h => [h.key, h.value]));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budget Tracker',
        short_name: 'Budget',
        description: 'Budget tracker for South African bank statements. Statements are read on your device.',
        lang: 'en-ZA',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f3f0',
        theme_color: '#1f5fae',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the pdf.js worker is large; cache it so PDF import works offline
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true },
  preview: { headers: siteHeaders },
  test: { include: ['tests/**/*.test.ts'] },
});
