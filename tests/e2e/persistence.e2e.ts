import { rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fillValidInvoice, issueOpenInvoice, launchApp } from './helpers';

test('Rechnungen bleiben nach dem Neustart erhalten, sind schreibgeschützt und lassen sich verwalten', async () => {
  let launched = await launchApp();
  const dataDir = launched.userDataDir;
  try {
    let { page } = launched;
    const year = new Date().getFullYear();

    // Rechnung erfassen und ausstellen
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await fillValidInvoice(page);
    const number = await issueOpenInvoice(page);
    expect(number).toBe(`RE-${year}-0001`);
    await page.getByRole('button', { name: '← Zurück' }).click();

    const rows = page.getByTestId('invoice-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(number);
    await expect(rows.first()).toContainText('Ausgestellt');
    await expect(rows.first()).toContainText('300.00');

    // Neustart: die Rechnung ist unverändert vorhanden
    launched = await launched.relaunch();
    page = launched.page;
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);
    await page.getByRole('button', { name: number }).click();
    await expect(page.getByText('kann nicht mehr geändert werden')).toBeVisible();
    await expect(page.locator('#debtor-name')).toBeDisabled();
    await expect(page.locator('#debtor-name')).toHaveValue('Pia-Maria Rutschmann-Schnyder');

    // Duplizieren erzeugt einen bearbeitbaren Entwurf
    await page.getByRole('button', { name: 'Duplizieren' }).click();
    await expect(page.getByRole('heading', { name: /Neue Rechnung/ })).toBeVisible();
    await expect(page.locator('#debtor-name')).toBeEnabled();
    await expect(page.locator('#debtor-name')).toHaveValue('Pia-Maria Rutschmann-Schnyder');
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(page.getByTestId('invoice-row')).toHaveCount(2);

    // Suche und Statusfilter
    await page.getByLabel('Suche').fill('rutschmann');
    await expect(page.getByTestId('invoice-row')).toHaveCount(2);
    await page.getByLabel('Suche').fill('gibt-es-nicht');
    await expect(page.getByText('Keine Rechnungen gefunden.')).toBeVisible();
    await page.getByLabel('Suche').fill('');
    await page.getByLabel('Status').selectOption('draft');
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);
    await page.getByLabel('Status').selectOption('all');
    await expect(page.getByTestId('invoice-row')).toHaveCount(2);

    // Nur Entwürfe lassen sich löschen
    const issuedRow = page.getByTestId('invoice-row').filter({ hasText: number });
    await expect(issuedRow.getByRole('button', { name: 'Löschen' })).toHaveCount(0);
    const draftRow = page.getByTestId('invoice-row').filter({ hasText: 'Entwurf' });
    await draftRow.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog', { name: 'Entwurf löschen?' }).getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);

    // Autosave: Eingaben im Entwurf bleiben ohne ausdrückliches Speichern erhalten
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await page.locator('#debtor-name').fill('Autosave AG');
    await expect(page.getByTestId('saved-at')).toBeVisible();
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(page.getByTestId('invoice-row').filter({ hasText: 'Autosave AG' })).toHaveCount(1);
  } finally {
    await launched.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
