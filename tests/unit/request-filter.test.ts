import { describe, expect, it } from 'vitest';
import { isAllowedRequest, readDevOrigin } from '../../src/main/request-filter';

const DEV = 'http://localhost:5173';

describe('isAllowedRequest (nur lokale Quellen)', () => {
  it('erlaubt eigene Dateien, Blobs und Daten', () => {
    for (const url of [
      'file:///C:/app/resources/app.asar/out/renderer/index.html',
      'blob:file:///1b9c-aaaa',
      'data:application/pdf;base64,AAAA',
    ]) {
      expect(isAllowedRequest(url, undefined), url).toBe(true);
    }
  });

  it('erlaubt die eingebauten Ressourcen des PDF-Betrachters der Vorschau', () => {
    for (const url of [
      'chrome://resources/css/text_defaults_md.css',
      'chrome://resources/lit/v3_0/lit.rollup.js',
      'chrome://resources/js/load_time_data.js',
      'chrome://resources/mojo/mojo/public/js/bindings.js',
      'chrome-untrusted://pdf/index.html',
      'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',
    ]) {
      expect(isAllowedRequest(url, undefined), url).toBe(true);
    }
  });

  it('blockiert das Netzwerk und andere interne Seiten', () => {
    for (const url of [
      'https://example.com/',
      'http://example.com/x.png',
      'ws://example.com/socket',
      'ftp://example.com/',
      'chrome://settings/',
      'chrome://gpu/',
      'http://localhost:5173/', // ohne Entwicklungsserver auch lokal nicht
    ]) {
      expect(isAllowedRequest(url, undefined), url).toBe(false);
    }
  });

  it('erlaubt im Entwicklungsmodus nur den eigenen Vite-Server (HTTP und WebSocket)', () => {
    expect(isAllowedRequest(`${DEV}/src/main.tsx`, DEV)).toBe(true);
    expect(isAllowedRequest('ws://localhost:5173/?token=x', DEV)).toBe(true);
    expect(isAllowedRequest('https://example.com/', DEV)).toBe(false);
    expect(isAllowedRequest('http://localhost:9999/', DEV)).toBe(false);
  });
});

describe('readDevOrigin', () => {
  it('liefert die URL des Entwicklungsservers', () => {
    expect(readDevOrigin({ ELECTRON_RENDERER_URL: DEV })).toBe(DEV);
  });

  it('eine fehlende oder leere Variable bedeutet: kein Entwicklungsserver (nicht «alles erlaubt»)', () => {
    expect(readDevOrigin({})).toBeUndefined();
    expect(readDevOrigin({ ELECTRON_RENDERER_URL: '' })).toBeUndefined();
  });
});
