import { rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { clickMenu, launchApp } from './helpers';

test('Das deutsche Anwendungsmenü steuert die Anwendung', async () => {
  const launched = await launchApp();
  try {
    const { app, page } = launched;

    // Menüstruktur statt englischem Electron-Standardmenü
    const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label));
    expect(labels).toEqual(['Datei', 'Bearbeiten', 'Ansicht', 'Hilfe']);

    // Keine Navigation im Fenster: die Hauptansichten erreicht man nur über das Menü «Ansicht»
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('banner')).toHaveCount(0);

    // Navigation
    await clickMenu(app, 'nav-settings');
    await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
    await clickMenu(app, 'nav-customers');
    await expect(page.getByRole('heading', { name: 'Kunden' })).toBeVisible();
    await clickMenu(app, 'nav-invoices');
    await expect(page.getByRole('heading', { name: 'Rechnungen' })).toBeVisible();

    // Neue Rechnung aus beliebiger Ansicht: genau ein Entwurf wird angelegt
    await clickMenu(app, 'nav-settings');
    await clickMenu(app, 'file-new-invoice');
    await expect(page.getByRole('heading', { name: /Neue Rechnung/ })).toBeVisible();
    await page.locator('#debtor-name').fill('Menü AG');
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);

    // «Neue Rechnung» im Editor öffnet einen weiteren Entwurf; nicht gespeicherte Eingaben bleiben erhalten
    await page.getByRole('button', { name: 'Entwurf' }).click();
    await page.locator('#debtor-name').fill('Menü AG, geändert');
    await clickMenu(app, 'file-new-invoice');
    await expect(page.locator('#debtor-name')).toHaveValue('');
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(page.getByTestId('invoice-row')).toHaveCount(2);
    await expect(page.getByTestId('invoice-row').filter({ hasText: 'Menü AG, geändert' })).toHaveCount(1);

    // Datenbank sichern über das Menü (Speichern-Dialog im Main wird durch einen festen Pfad ersetzt)
    const target = `${launched.userDataDir}\\sicherung.db`;
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (() => Promise.resolve({ canceled: false, filePath })) as typeof dialog.showSaveDialog;
    }, target);
    await clickMenu(app, 'file-backup');
    await expect(page.getByText('Datenbank gesichert')).toBeVisible();
  } finally {
    const dir = launched.userDataDir;
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
