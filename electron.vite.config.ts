import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const shared = resolve(__dirname, 'src/shared');

/**
 * Content-Security-Policy nur im Produktions-Build (im Dev-Modus braucht Vite Inline-Skripte für HMR).
 * Keine externen Quellen (Prinzip II). `style-src 'unsafe-inline'` ist nötig, weil PrimeReact seine Styles
 * zur Laufzeit als <style> einfügt; Skripte bleiben auf 'self' beschränkt.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob: data:",
  "object-src 'self' blob: data:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const cspPlugin = {
  name: 'swissbill-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) =>
    html.replace('</title>', `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), cspPlugin],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
