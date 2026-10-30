import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const exe = resolve(__dirname, '../../release/win-unpacked/SwissBill.exe');

// Prüft die verpackte Anwendung (`npm run package`); ohne Paket wird der Test übersprungen.
test.skip(!existsSync(exe), 'Kein Paket vorhanden (npm run package ausführen).');

test('Die verpackte Anwendung startet, öffnet die Datenbank und erzeugt ein PDF', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'swissbill-packaged-'));
  const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${dir}`] });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Rechnungen' })).toBeVisible();

    // Deutsches Menü, keine Entwicklerwerkzeuge im Paket
    const menu = await app.evaluate(({ Menu, BrowserWindow }) => {
      const view = Menu.getApplicationMenu()?.items.find((i) => i.label === 'Ansicht');
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      contents.openDevTools(); // bei devTools: false wirkungslos
      return {
        titles: Menu.getApplicationMenu()?.items.map((i) => i.label),
        viewRoles: view?.submenu?.items.map((i) => i.role ?? ''),
        devToolsOpened: contents.isDevToolsOpened(),
      };
    });
    expect(menu.titles).toEqual(['Datei', 'Bearbeiten', 'Ansicht', 'Hilfe']);
    expect(menu.viewRoles?.map((r) => r.toLowerCase())).not.toContain('toggledevtools');
    expect(menu.devToolsOpened).toBe(false);

    // better-sqlite3 lädt im Paket ohne Rebuild: Datenbank anlegen und Rechnung speichern
    const draft = await page.evaluate(() => window.swissbill.invoices.createDraft());
    expect(draft.ok).toBe(true);
    const info = await page.evaluate(() => window.swissbill.db.info());
    expect(info.ok && info.value.path.endsWith('swissbill.db')).toBe(true);

    // Vorschau in der Oberfläche: der PDF-Betrachter lädt seine Ressourcen, nichts wird blockiert
    const failed: string[] = [];
    page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
    await page.evaluate(() => window.swissbill.invoices.createDraft()); // zweiter Entwurf, damit die Liste Zeilen hat
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await page.getByRole('button', { name: 'Vorschau' }).click();
    await expect(page.getByRole('dialog', { name: 'Vorschau' })).toBeVisible();
    await expect(page.locator('iframe[title="PDF-Vorschau"]')).toBeVisible();
    await page.waitForTimeout(2000);
    expect(failed).toEqual([]);
    await page.getByRole('dialog', { name: 'Vorschau' }).getByRole('button', { name: 'Schliessen' }).click();

    // PDF-Erzeugung (pdfkit und swissqrbill im Paket)
    const id = draft.ok ? draft.value.id : 0;
    const preview = await page.evaluate((invoiceId) => window.swissbill.pdf.preview({ invoiceId }), id);
    expect(preview.ok && preview.value.base64.length > 1000).toBe(true);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
