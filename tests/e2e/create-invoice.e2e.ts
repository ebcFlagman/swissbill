import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const QR_IBAN = 'CH44 3199 9123 0008 8901 2';

async function fillAddress(page: Page, prefix: 'sender' | 'debtor', a: Record<string, string>) {
  for (const [key, value] of Object.entries(a)) {
    await page.locator(`#${prefix}-${key}`).fill(value);
  }
}

async function fillItem(
  page: Page,
  position: number,
  description: string,
  quantity: string,
  price: string,
) {
  await page.getByLabel(`Beschreibung Position ${position}`).fill(description);
  await page.getByLabel(`Menge Position ${position}`).fill(quantity);
  await page.getByLabel(`Einzelpreis Position ${position}`).fill(price);
}

test('Rechnung erfassen, ausstellen und als PDF speichern', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'swissbill-pdf-'));
  const pdfPath = join(outDir, 'rechnung.pdf');
  const launched = await launchApp();
  try {
    const { page, app } = launched;

    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await expect(page.getByRole('heading', { name: /Neue Rechnung/ })).toBeVisible();

    await fillAddress(page, 'sender', {
      name: 'Robert Schneider AG',
      street: 'Rue du Lac',
      houseNo: '1268',
      zip: '2501',
      city: 'Biel',
      iban: 'CH44 3199 9123 0008 8901 3', // deliberately wrong checksum
    });
    await fillAddress(page, 'debtor', {
      name: 'Pia-Maria Rutschmann-Schnyder',
      street: 'Grosse Marktgasse',
      houseNo: '28',
      zip: '9400',
      city: 'Rorschach',
    });

    await fillItem(page, 1, 'Beratung', '2', '150.00');
    await page.getByRole('button', { name: 'Position hinzufügen' }).click();
    await fillItem(page, 2, 'Spesen', '1', '49.75');
    await page.getByRole('button', { name: 'Position hinzufügen' }).click();
    await fillItem(page, 3, 'Material', '3', '10');
    await expect(page.getByTestId('total')).toHaveText('379.75');

    // An invalid IBAN prevents issuing, with an error message directly at the field
    await page.getByRole('button', { name: 'Ausstellen', exact: true }).click();
    await expect(page.locator('#sender-iban-error')).toContainText('Prüfsumme');
    await expect(page.getByRole('dialog', { name: 'Rechnung ausstellen?' })).toHaveCount(0);

    // Correct and issue
    await page.locator('#sender-iban').fill(QR_IBAN);
    await page.getByRole('button', { name: 'Ausstellen', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Rechnung ausstellen?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Ausstellen' }).click();

    const year = new Date().getFullYear();
    await expect(page.getByTestId('issued-number')).toHaveText(`RE-${year}-0001`);

    // Save PDF (the save dialog in main is replaced by a fixed path)
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (() =>
        Promise.resolve({ canceled: false, filePath })) as typeof dialog.showSaveDialog;
    }, pdfPath);
    const issued = page.getByRole('dialog', { name: 'Rechnung ausgestellt' });
    await issued.getByRole('button', { name: 'PDF speichern' }).click();
    await expect(page.getByText('PDF gespeichert')).toBeVisible();

    const pdf = readFileSync(pdfPath);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);

    // The issued invoice is read-only
    await issued.getByRole('button', { name: 'Schliessen' }).click();
    await expect(page.getByText('kann nicht mehr geändert werden')).toBeVisible();
    await expect(page.locator('#debtor-name')).toBeDisabled();
  } finally {
    await launched.close();
    rmSync(outDir, { recursive: true, force: true });
  }
});
