import { rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fillAddress, fillItem, launchApp, QR_IBAN } from './helpers';

test('Rechnungsempfänger: nur der Name ist Pflicht, der Rest ist optional', async () => {
  const launched = await launchApp();
  try {
    const { page } = launched;
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();

    await fillAddress(page, 'sender', {
      name: 'Robert Schneider AG',
      street: 'Rue du Lac',
      houseNo: '1268',
      zip: '2501',
      city: 'Biel',
      iban: QR_IBAN,
    });
    await fillItem(page, 1, 'Beratung', '1', '100');

    // Ohne Empfängername lässt sich nicht ausstellen, nur der Name wird bemängelt
    await page.getByRole('button', { name: 'Ausstellen', exact: true }).click();
    await expect(page.locator('#debtor-name-error')).toContainText('erforderlich');
    for (const field of ['street', 'houseNo', 'zip', 'city', 'country']) {
      await expect(page.locator(`#debtor-${field}-error`)).toHaveCount(0);
    }

    // Nur Name (Land leer): Hinweis zum QR-Zahlteil, Ausstellen gelingt
    await page.locator('#debtor-name').fill('Pia Muster');
    await page.locator('#debtor-country').fill('');
    await expect(page.getByTestId('debtor-qr-hint')).toContainText('nicht im QR-Zahlteil');
    await page.getByRole('button', { name: 'Ausstellen', exact: true }).click();
    await page.getByRole('dialog', { name: 'Rechnung ausstellen?' }).getByRole('button', { name: 'Ausstellen' }).click();
    const issued = page.getByRole('dialog', { name: 'Rechnung ausgestellt' });
    await expect(issued.getByTestId('issued-number')).toBeVisible();
    await issued.getByRole('button', { name: 'Schliessen' }).click();

    // Der gespeicherte Empfänger bleibt unverändert (Land leer, nicht CH)
    await expect(page.locator('#debtor-name')).toHaveValue('Pia Muster');
    await expect(page.locator('#debtor-country')).toHaveValue('');
    await expect(page.getByTestId('debtor-qr-hint')).toHaveCount(0); // ausgestellt: kein Hinweis mehr
  } finally {
    const dir = launched.userDataDir;
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Der Hinweis zum QR-Zahlteil verschwindet, sobald PLZ und Ort angegeben sind', async () => {
  const launched = await launchApp();
  try {
    const { page } = launched;
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await page.locator('#debtor-name').fill('Pia Muster');
    await expect(page.getByTestId('debtor-qr-hint')).toBeVisible();
    await page.locator('#debtor-zip').fill('9400');
    await expect(page.getByTestId('debtor-qr-hint')).toBeVisible(); // Ort fehlt noch
    await page.locator('#debtor-city').fill('Rorschach');
    await expect(page.getByTestId('debtor-qr-hint')).toHaveCount(0);
  } finally {
    const dir = launched.userDataDir;
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
