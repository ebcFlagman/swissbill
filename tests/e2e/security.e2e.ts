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
    // The network block must not block anything the application itself needs (e.g. the PDF viewer of the preview)
    page.on('requestfailed', (request) =>
      failed.push(`${request.url()} ${request.failure()?.errorText ?? ''}`),
    );

    // Window settings in the main process
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
    expect(prefs).toEqual({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });

    // No Node and no ipcRenderer in the renderer; the API is narrow
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
      api: [
        'addresses',
        'app',
        'customers',
        'db',
        'dbConnection',
        'invoices',
        'locks',
        'log',
        'menu',
        'pdf',
        'settings',
      ],
    });

    // Content security policy without external sources and without eval
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/https?:|\*/);
    expect(csp).not.toContain("'unsafe-eval'");
    // Injected inline scripts are blocked by the CSP (CDP evaluations bypass the CSP, hence via a script element)
    const injected = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true;';
      document.head.appendChild(script);
      return (window as unknown as { __injected?: boolean }).__injected === true
        ? 'executed'
        : 'blocked';
    });
    expect(injected).toBe('blocked');

    // External network access is blocked
    const fetched = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/');
        return 'allowed';
      } catch {
        return 'blocked';
      }
    });
    expect(fetched).toBe('blocked');
    // Geoapify is also unreachable from the renderer: the only access runs in the main process (only with a key)
    const geoapify = await page.evaluate(async () => {
      try {
        await fetch('https://api.geoapify.com/v1/geocode/autocomplete?text=abc&apiKey=x');
        return 'allowed';
      } catch {
        return 'blocked';
      }
    });
    expect(geoapify).toBe('blocked');

    // A typical flow triggers no requests outside the app
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await fillValidInvoice(page);
    await page.getByRole('button', { name: 'Vorschau' }).click();
    await expect(page.getByRole('dialog', { name: 'Vorschau' })).toBeVisible();
    await page.waitForTimeout(1500); // the PDF viewer loads its resources after opening
    expect(failed).toEqual([]);
    // Only local sources are allowed (the same rule as in the application)
    const external = requests.filter((url) => !isAllowedRequest(url, undefined));
    expect(external).toEqual([]);
    expect(requests.some((url) => /^https?:/i.test(url))).toBe(false);

    // Navigation away from the app and new windows are blocked (last: otherwise Playwright waits for the aborted navigation)
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
