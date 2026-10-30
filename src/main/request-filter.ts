/**
 * Erlaubte Anfragen der Anwendung (Constitution Prinzip II: keine Netzwerkzugriffe).
 *
 * Erlaubt sind nur lokale Quellen:
 * - eigene Dateien und Blobs (`file:`, `blob:`, `data:`)
 * - die eingebauten Chromium-Ressourcen des PDF-Betrachters in der Vorschau
 *   (`chrome://resources/…`, `chrome-untrusted://…`, `chrome-extension://…`), sie kommen aus dem Programm, nicht aus dem Netz
 * - im Entwicklungsmodus der lokale Vite-Server (HTTP und WebSocket)
 *
 * Alles andere (http, https, ws, ftp, andere chrome://-Seiten) wird abgebrochen.
 */
export function isAllowedRequest(url: string, devOrigin: string | undefined): boolean {
  if (/^(file|blob|data|devtools|chrome-extension|chrome-untrusted):/i.test(url)) return true;
  if (/^chrome:\/\/resources\//i.test(url)) return true;
  if (!devOrigin) return false;
  return url.startsWith(devOrigin) || url.startsWith(devOrigin.replace(/^http/, 'ws'));
}

/** Eine leere Umgebungsvariable bedeutet «kein Entwicklungsserver» (nicht «alles erlaubt»). */
export function readDevOrigin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env['ELECTRON_RENDERER_URL'];
  return value ? value : undefined;
}
