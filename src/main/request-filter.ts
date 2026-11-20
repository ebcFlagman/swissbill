/**
 * Allowed requests of the renderer (constitution principle II: no network access).
 *
 * Even with a Geoapify key the renderer stays completely cut off from the network: the only network access of the
 * application is the optional address suggestions, and they run in the main process (`geoapify-client.ts`), never here.
 *
 * Only local sources are allowed:
 * - own files and blobs (`file:`, `blob:`, `data:`)
 * - the built-in Chromium resources of the PDF viewer in the preview
 *   (`chrome://resources/…`, `chrome-untrusted://…`, `chrome-extension://…`), they come from the program, not from the network
 * - in development mode the local Vite server (HTTP and WebSocket)
 *
 * Everything else (http, https, ws, ftp, other chrome:// pages) is aborted.
 */
export function isAllowedRequest(url: string, devOrigin: string | undefined): boolean {
  if (/^(file|blob|data|devtools|chrome-extension|chrome-untrusted):/i.test(url)) return true;
  if (/^chrome:\/\/resources\//i.test(url)) return true;
  if (!devOrigin) return false;
  return url.startsWith(devOrigin) || url.startsWith(devOrigin.replace(/^http/, 'ws'));
}

/** An empty environment variable means "no development server" (not "everything allowed"). */
export function readDevOrigin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env['ELECTRON_RENDERER_URL'];
  return value ? value : undefined;
}
