import { rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { goTo, launchApp, QR_IBAN } from './helpers';

const WRONG_CHECKSUM = 'CH44 3199 9123 0008 8901 3';

/** Shared check of the IBAN field (the same in the editor and in the settings). */
async function checkLiveValidation(page: Page) {
  const field = page.locator('#sender-iban');
  const error = page.locator('#sender-iban-error');

  // Empty and incomplete: no message while typing
  await field.fill('');
  await expect(error).toHaveCount(0);
  await field.fill('C');
  await expect(error).toHaveCount(0);
  await field.fill('CH44 3199 9');
  await expect(error).toHaveCount(0);

  // Wrong country and invalid characters are reported immediately
  await field.fill('DE89');
  await expect(error).toContainText('Schweiz oder Liechtenstein');
  await field.fill('CH44 31$');
  await expect(error).toContainText('unzulässige Zeichen');

  // At 21 characters the checksum is checked immediately, without clicking save or issue
  await field.fill(WRONG_CHECKSUM);
  await expect(error).toContainText('Prüfsumme');
  await field.fill('CH44 3199 9123 0008 8901 22');
  await expect(error).toContainText('21 Zeichen');

  // An incomplete IBAN is reported as soon as the field is left, and disappears on continued typing
  await field.fill('CH44 3199 9123');
  await expect(error).toHaveCount(0);
  await field.press('Tab');
  await expect(error).toContainText('21 Zeichen');
  await field.fill('CH44 3199 9123 0');
  await expect(error).toHaveCount(0);

  // Valid: no message, displayed in groups of four on blur
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

    // An invalid IBAN cannot be saved
    for (const [id, value] of Object.entries({
      name: 'Robert Schneider AG',
      zip: '2501',
      city: 'Biel',
    })) {
      await page.locator(`#sender-${id}`).fill(value);
    }
    await page.locator('#sender-iban').fill(WRONG_CHECKSUM);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#sender-iban-error')).toContainText('Prüfsumme');
    await expect(page.getByText('Einstellungen gespeichert.')).toHaveCount(0);

    // With a valid IBAN it is saved; after reloading it appears in groups of four
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
