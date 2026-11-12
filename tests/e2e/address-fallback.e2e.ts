import { expect, test } from '@playwright/test';
import { FAKE_ENV, startFakeGeoapify } from './fake-geoapify';
import { fillValidInvoice, goTo, issueOpenInvoice, launchApp, setupSettings } from './helpers';

test('ohne Key: keine Netzwerkanfragen, Formular funktioniert wie bisher', async () => {
  const fake = await startFakeGeoapify();
  const launched = await launchApp(undefined, { ...FAKE_ENV, SWISSBILL_GEOAPIFY_BASE_URL: fake.url });
  try {
    const { app, page } = launched;
    await setupSettings(app, page);
    await goTo(app, 'Rechnungen');
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();

    await page.locator('#debtor-street').pressSequentially('Bahnhofstrasse');
    await page.waitForTimeout(800);
    await expect(page.getByRole('option', { name: /Zürich/ })).toHaveCount(0);
    await expect(page.getByTestId('debtor-suggest-hint')).toHaveCount(0);
    await page.locator('#debtor-houseNo').fill('10');
    await expect(page.locator('#debtor-street')).toHaveValue('Bahnhofstrasse');
    expect(fake.requests).toHaveLength(0);
  } finally {
    await launched.close();
    await fake.close();
  }
});

for (const [mode, hint] of [
  ['invalid_key', 'Der Geoapify-API-Key wird nicht akzeptiert.'],
  ['quota', 'Das Geoapify-Kontingent ist erschöpft.'],
  ['down', 'Vorschläge momentan nicht verfügbar.'],
] as const) {
  test(`Dienstfehler (${mode}): dezenter Hinweis, Eingabe von Hand bleibt möglich`, async () => {
    const fake = await startFakeGeoapify();
    const launched = await launchApp(undefined, { ...FAKE_ENV, SWISSBILL_GEOAPIFY_BASE_URL: fake.url });
    try {
      const { app, page } = launched;
      await setupSettings(app, page, 'test-key-0123456789');
      fake.mode = mode;
      await goTo(app, 'Rechnungen');
      await page.getByRole('button', { name: 'Neue Rechnung' }).click();

      await page.locator('#debtor-street').pressSequentially('Grosse Marktgasse');
      await expect(page.getByTestId('debtor-suggest-hint')).toHaveText(hint);
      await expect(page.getByRole('option', { name: /Zürich/ })).toHaveCount(0);

      // Weiter von Hand ausfüllen, speichern und ausstellen
      await fillValidInvoice(page);
      await issueOpenInvoice(page);
    } finally {
      await launched.close();
      await fake.close();
    }
  });
}

test('Offline (Dienst nicht erreichbar): Eingabe bleibt möglich', async () => {
  const fake = await startFakeGeoapify();
  const url = fake.url;
  await fake.close(); // nichts hört mehr zu
  const launched = await launchApp(undefined, { ...FAKE_ENV, SWISSBILL_GEOAPIFY_BASE_URL: url });
  try {
    const { app, page } = launched;
    await setupSettings(app, page, 'test-key-0123456789');
    await goTo(app, 'Rechnungen');
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await page.locator('#debtor-street').pressSequentially('Bahnhofstrasse');
    await expect(page.getByTestId('debtor-suggest-hint')).toHaveText('Vorschläge momentan nicht verfügbar.');
    await page.locator('#debtor-city').fill('Zürich');
    await expect(page.locator('#debtor-city')).toHaveValue('Zürich');
  } finally {
    await launched.close();
  }
});

test('gesperrtes Formular (ausgestellte Rechnung) sendet keine Anfrage', async () => {
  const fake = await startFakeGeoapify();
  const launched = await launchApp(undefined, { ...FAKE_ENV, SWISSBILL_GEOAPIFY_BASE_URL: fake.url });
  try {
    const { app, page } = launched;
    await setupSettings(app, page, 'test-key-0123456789');
    await goTo(app, 'Rechnungen');
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await fillValidInvoice(page);
    await page.waitForTimeout(800); // laufende Suchen aus dem Ausfüllen abwarten
    const before = fake.requests.length;
    await issueOpenInvoice(page);

    await expect(page.locator('#debtor-street')).toBeDisabled();
    await page.waitForTimeout(600);
    expect(fake.requests.length).toBe(before);
  } finally {
    await launched.close();
    await fake.close();
  }
});
