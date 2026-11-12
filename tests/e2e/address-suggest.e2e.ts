import { expect, test } from '@playwright/test';
import { FAKE_ENV, startFakeGeoapify } from './fake-geoapify';
import { goTo, launchApp, setupSettings } from './helpers';

const OPTION = 'Bahnhofstrasse 1, 8001 Zürich, Schweiz';

test('Adressvorschlag wählen füllt Strasse, Nr., PLZ, Ort und Land; Name bleibt; alles bleibt änderbar', async () => {
  const fake = await startFakeGeoapify();
  const launched = await launchApp(undefined, { ...FAKE_ENV, SWISSBILL_GEOAPIFY_BASE_URL: fake.url });
  try {
    const { app, page } = launched;
    await setupSettings(app, page, 'test-key-0123456789');

    await goTo(app, 'Rechnungen');
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await page.locator('#debtor-name').fill('Pia Muster');

    // Maus: Vorschläge erscheinen ab 3 Zeichen
    await page.locator('#debtor-street').pressSequentially('Bahnhofstr 1 Zür');
    await expect(page.getByRole('option', { name: OPTION })).toBeVisible();
    await page.getByRole('option', { name: OPTION }).click();

    await expect(page.locator('#debtor-street')).toHaveValue('Bahnhofstrasse');
    await expect(page.locator('#debtor-houseNo')).toHaveValue('1');
    await expect(page.locator('#debtor-zip')).toHaveValue('8001');
    await expect(page.locator('#debtor-city')).toHaveValue('Zürich');
    await expect(page.locator('#debtor-country')).toHaveValue('CH');
    await expect(page.locator('#debtor-name')).toHaveValue('Pia Muster');

    // Danach von Hand änderbar, nichts wird zurückgesetzt
    await page.locator('#debtor-city').fill('Zürich-Enge');
    await expect(page.locator('#debtor-city')).toHaveValue('Zürich-Enge');
    await expect(page.locator('#debtor-street')).toHaveValue('Bahnhofstrasse');

    // Tastatur: Pfeiltasten, Enter, Escape
    await page.locator('#debtor-street').fill('');
    await page.locator('#debtor-street').pressSequentially('Bahnhofq');
    await expect(page.getByRole('option', { name: /Zürich/ }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('option', { name: /Zürich/ })).toHaveCount(0);
    await page.locator('#debtor-street').press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#debtor-zip')).toHaveValue(/^800[12]$/);
    await expect(page.locator('#debtor-name')).toHaveValue('Pia Muster');

    // Ab 3 Zeichen: zu kurze Eingabe sendet nichts
    const before = fake.requests.length;
    await page.locator('#debtor-street').fill('');
    await page.locator('#debtor-street').pressSequentially('Ba');
    await page.waitForTimeout(700);
    expect(fake.requests.length).toBe(before);
  } finally {
    await launched.close();
    await fake.close();
  }
});

test('Vorschläge gibt es auch beim Absender (Einstellungen) und beim Kunden', async () => {
  const fake = await startFakeGeoapify();
  const launched = await launchApp(undefined, { ...FAKE_ENV, SWISSBILL_GEOAPIFY_BASE_URL: fake.url });
  try {
    const { app, page } = launched;
    await setupSettings(app, page, 'test-key-0123456789');

    await page.locator('#sender-street').fill('');
    await page.locator('#sender-street').pressSequentially('Bahnhofstr 1');
    await page.getByRole('option', { name: OPTION }).click();
    await expect(page.locator('#sender-zip')).toHaveValue('8001');
    await expect(page.locator('#sender-name')).toHaveValue('Robert Schneider AG');
    await expect(page.locator('#sender-iban')).not.toHaveValue('');

    await goTo(app, 'Kunden');
    await page.getByRole('button', { name: 'Neuer Kunde' }).click();
    const dialog = page.getByRole('dialog', { name: 'Neuer Kunde' });
    await dialog.locator('#customer-street').pressSequentially('Bahnhofstr 1');
    await page.getByRole('option', { name: OPTION }).click();
    await expect(dialog.locator('#customer-city')).toHaveValue('Zürich');
  } finally {
    await launched.close();
    await fake.close();
  }
});
