import { rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { goTo, launchApp, QR_IBAN } from './helpers';

const WRONG_CHECKSUM = 'CH44 3199 9123 0008 8901 3';

/** Gemeinsame Prüfung des IBAN-Felds (im Editor und in den Einstellungen gleich). */
async function checkLiveValidation(page: Page) {
  const field = page.locator('#sender-iban');
  const error = page.locator('#sender-iban-error');

  // Leer und unvollständig: keine Meldung während des Tippens
  await field.fill('');
  await expect(error).toHaveCount(0);
  await field.fill('C');
  await expect(error).toHaveCount(0);
  await field.fill('CH44 3199 9');
  await expect(error).toHaveCount(0);

  // Falsches Land und unzulässige Zeichen werden sofort gemeldet
  await field.fill('DE89');
  await expect(error).toContainText('Schweiz oder Liechtenstein');
  await field.fill('CH44 31$');
  await expect(error).toContainText('unzulässige Zeichen');

  // Bei 21 Zeichen wird sofort die Prüfsumme geprüft, ohne Klick auf Speichern oder Ausstellen
  await field.fill(WRONG_CHECKSUM);
  await expect(error).toContainText('Prüfsumme');
  await field.fill('CH44 3199 9123 0008 8901 22');
  await expect(error).toContainText('21 Zeichen');

  // Eine unvollständige IBAN wird gemeldet, sobald das Feld verlassen wird, und verschwindet beim Weitertippen
  await field.fill('CH44 3199 9123');
  await expect(error).toHaveCount(0);
  await field.press('Tab');
  await expect(error).toContainText('21 Zeichen');
  await field.fill('CH44 3199 9123 0');
  await expect(error).toHaveCount(0);

  // Gültig: keine Meldung, beim Verlassen Darstellung in Vierergruppen
  await field.fill('ch4431999123000889012');
  await expect(error).toHaveCount(0);
  await field.press('Tab');
  await expect(field).toHaveValue(QR_IBAN);
  await expect(error).toHaveCount(0);
}

test('IBAN im Editor: Sofortprüfung und Vierergruppen', async () => {
  const launched = await launchApp();
  try {
    const { page } = launched;
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await checkLiveValidation(page);
  } finally {
    const dir = launched.userDataDir;
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('IBAN in den Einstellungen: Sofortprüfung, Speichern nur mit gültiger IBAN, Anzeige in Vierergruppen', async () => {
  const launched = await launchApp();
  try {
    const { app, page } = launched;
    await goTo(app, 'Einstellungen');
    await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
    await checkLiveValidation(page);

    // Ungültige IBAN lässt sich nicht speichern
    for (const [id, value] of Object.entries({ name: 'Robert Schneider AG', zip: '2501', city: 'Biel' })) {
      await page.locator(`#sender-${id}`).fill(value);
    }
    await page.locator('#sender-iban').fill(WRONG_CHECKSUM);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#sender-iban-error')).toContainText('Prüfsumme');
    await expect(page.getByText('Einstellungen gespeichert.')).toHaveCount(0);

    // Mit gültiger IBAN wird gespeichert; nach dem Neuladen steht sie in Vierergruppen
    await page.locator('#sender-iban').fill('ch4431999123000889012');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
    await goTo(app, 'Rechnungen');
    await goTo(app, 'Einstellungen');
    await expect(page.locator('#sender-iban')).toHaveValue(QR_IBAN);
    await expect(page.locator('#sender-iban-error')).toHaveCount(0);
  } finally {
    const dir = launched.userDataDir;
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
