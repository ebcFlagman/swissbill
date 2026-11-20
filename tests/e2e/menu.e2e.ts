import { rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { clickMenu, launchApp } from './helpers';

test('Das deutsche Anwendungsmenü steuert die Anwendung', async () => {
  const launched = await launchApp();
  try {
    const { app, page } = launched;

    // Menu structure instead of the English Electron default menu
    const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label));
    expect(labels).toEqual(['Datei', 'Bearbeiten', 'Ansicht', 'Hilfe']);

    // No navigation in the window: the main views are only reachable via the "Ansicht" menu
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('banner')).toHaveCount(0);

    // Navigation
    await clickMenu(app, 'nav-settings');
    await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
    await clickMenu(app, 'nav-customers');
    await expect(page.getByRole('heading', { name: 'Kunden' })).toBeVisible();
    await clickMenu(app, 'nav-invoices');
    await expect(page.getByRole('heading', { name: 'Rechnungen' })).toBeVisible();

    // New invoice from any view: exactly one draft is created
    await clickMenu(app, 'nav-settings');
    await clickMenu(app, 'file-new-invoice');
    await expect(page.getByRole('heading', { name: /Neue Rechnung/ })).toBeVisible();
    await page.locator('#debtor-name').fill('Menü AG');
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);

    // "New invoice" in the editor opens another draft; unsaved inputs are kept
    await page.getByRole('button', { name: 'Entwurf' }).click();
    await page.locator('#debtor-name').fill('Menü AG, geändert');
    await clickMenu(app, 'file-new-invoice');
    await expect(page.locator('#debtor-name')).toHaveValue('');
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(page.getByTestId('invoice-row')).toHaveCount(2);
    await expect(page.getByTestId('invoice-row').filter({ hasText: 'Menü AG, geändert' })).toHaveCount(1);

    // Back up the database via the menu (the save dialog in main is replaced by a fixed path)
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
