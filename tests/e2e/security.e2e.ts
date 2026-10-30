import { expect, test } from '@playwright/test';
import { isAllowedRequest } from '../../src/main/request-filter';
import { fillValidInvoice, launchApp } from './helpers';

test('Electron-Sicherheit: Isolation, CSP, keine Netzwerkzugriffe, keine fremden Fenster', async () => {
  const launched = await launchApp();
  try {
    const { app, page } = launched;
    const requests: string[] = [];
    const failed: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    // Die Netzwerksperre darf nichts blockieren, was die Anwendung selbst braucht (z. B. den PDF-Betrachter der Vorschau)
    page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));

    // Fenster-Einstellungen im Main-Prozess
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents as unknown as {
        getLastWebPreferences(): Record<string, unknown>;
      };
      const p = contents.getLastWebPreferences();
      return {
        nodeIntegration: p.nodeIntegration,
        contextIsolation: p.contextIsolation,
        sandbox: p.sandbox,
        webSecurity: p.webSecurity,
      };
    });
    expect(prefs).toEqual({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });

    // Kein Node und kein ipcRenderer im Renderer; die API ist schmal
    const exposure = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        require: typeof w['require'],
        process: typeof w['process'],
        module: typeof w['module'],
        ipcRenderer: typeof w['ipcRenderer'],
        electron: typeof w['electron'],
        api: Object.keys(window.swissbill).sort(),
      };
    });
    expect(exposure).toEqual({
      require: 'undefined',
      process: 'undefined',
      module: 'undefined',
      ipcRenderer: 'undefined',
      electron: 'undefined',
      api: ['app', 'customers', 'db', 'invoices', 'menu', 'pdf', 'settings'],
    });

    // Content-Security-Policy ohne externe Quellen und ohne eval
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/https?:|\*/);
    expect(csp).not.toContain("'unsafe-eval'");
    // Eingeschleuste Inline-Skripte werden von der CSP blockiert (CDP-Auswertungen umgehen die CSP, daher über ein Script-Element)
    const injected = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true;';
      document.head.appendChild(script);
      return (window as unknown as { __injected?: boolean }).__injected === true ? 'executed' : 'blocked';
    });
    expect(injected).toBe('blocked');

    // Externe Netzwerkzugriffe sind blockiert
    const fetched = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/');
        return 'allowed';
      } catch {
        return 'blocked';
      }
    });
    expect(fetched).toBe('blocked');

    // Ein typischer Ablauf löst keine Anfragen ausserhalb der App aus
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await fillValidInvoice(page);
    await page.getByRole('button', { name: 'Vorschau' }).click();
    await expect(page.getByRole('dialog', { name: 'Vorschau' })).toBeVisible();
    await page.waitForTimeout(1500); // der PDF-Betrachter lädt seine Ressourcen nach dem Öffnen
    expect(failed).toEqual([]);
    // Erlaubt sind nur lokale Quellen (dieselbe Regel wie in der Anwendung)
    const external = requests.filter((url) => !isAllowedRequest(url, undefined));
    expect(external).toEqual([]);
    expect(requests.some((url) => /^https?:/i.test(url))).toBe(false);

    // Navigation weg von der App und neue Fenster sind blockiert (zuletzt: Playwright wartet sonst auf die abgebrochene Navigation)
    const startUrl = page.url();
    await page.evaluate(() => {
      window.open('https://example.com/');
    });
    await page.evaluate(() => {
      window.location.href = 'https://example.com/';
    });
    await page.waitForTimeout(500);
    expect(app.windows()).toHaveLength(1);
    expect(page.url()).toBe(startUrl);
  } finally {
    await launched.close();
  }
});
