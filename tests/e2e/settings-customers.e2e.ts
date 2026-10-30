import { rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { fillAddress, fillItem, goTo, launchApp, QR_IBAN } from './helpers';

async function issue(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Ausstellen', exact: true }).click();
  await page.getByRole('dialog', { name: 'Rechnung ausstellen?' }).getByRole('button', { name: 'Ausstellen' }).click();
  const issued = page.getByRole('dialog', { name: 'Rechnung ausgestellt' });
  const number = (await issued.getByTestId('issued-number').textContent()) ?? '';
  await issued.getByRole('button', { name: 'Schliessen' }).click();
  return number;
}

test('Absender und Kunden einmal erfassen, in Rechnungen wiederverwenden und überschreiben', async () => {
  const launched = await launchApp();
  try {
    const { app, page } = launched;

    // Einstellungen: beim ersten Start fehlt der Absender
    await goTo(app, 'Einstellungen');
    await expect(page.getByText('Bitte erfassen Sie zuerst Ihren Absender')).toBeVisible();
    await fillAddress(page, 'sender', {
      name: 'Robert Schneider AG',
      street: 'Rue du Lac',
      houseNo: '1268',
      zip: '2501',
      city: 'Biel',
      iban: 'CH44 3199 9123 0008 8901 3', // falsche Prüfsumme
    });
    await page.locator('#defaultClosingText').fill('Zahlbar innert 30 Tagen.');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#sender-iban-error')).toContainText('Prüfsumme');

    await page.locator('#sender-iban').fill(QR_IBAN);
    await expect(page.getByTestId('reference-hint')).toContainText('QR-IBAN erkannt');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();

    // Kunden anlegen
    await goTo(app, 'Kunden');
    await page.getByRole('button', { name: 'Neuer Kunde' }).click();
    const dialog = page.getByRole('dialog', { name: 'Neuer Kunde' });
    for (const [key, value] of Object.entries({
      name: 'Müller AG',
      street: 'Bahnhofstrasse',
      houseNo: '10',
      zip: '8001',
      city: 'Zürich',
    })) {
      await dialog.locator(`#customer-${key}`).fill(value);
    }
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('customer-row')).toHaveCount(1);
    await expect(page.getByTestId('customer-row')).toContainText('Müller AG');

    // Rechnung 1: Absender und Schlusstext sind vorausgefüllt, Kunde wird übernommen
    await goTo(app, 'Rechnungen');
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await expect(page.locator('#sender-name')).toHaveValue('Robert Schneider AG');
    await expect(page.locator('#sender-iban')).toHaveValue(QR_IBAN); // gespeichert ohne Leerzeichen, angezeigt in Vierergruppen
    await expect(page.locator('#closingText')).toHaveValue('Zahlbar innert 30 Tagen.');
    await page.getByLabel('Kunde übernehmen').selectOption({ label: 'Müller AG, Zürich' });
    await expect(page.locator('#debtor-name')).toHaveValue('Müller AG');
    await expect(page.locator('#debtor-city')).toHaveValue('Zürich');
    await fillItem(page, 1, 'Beratung', '1', '100');
    const first = await issue(page);
    await page.getByRole('button', { name: '← Zurück' }).click();

    // Rechnung 2: Absender nur in dieser Rechnung überschreiben
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await page.locator('#sender-name').fill('Andere Firma GmbH');
    await page.getByLabel('Kunde übernehmen').selectOption({ label: 'Müller AG, Zürich' });
    await fillItem(page, 1, 'Support', '1', '50');
    const second = await issue(page);
    expect([first.endsWith('0001'), second.endsWith('0002')]).toEqual([true, true]);
    await page.getByRole('button', { name: '← Zurück' }).click();

    // Der globale Absender bleibt unverändert
    await goTo(app, 'Einstellungen');
    await expect(page.locator('#sender-name')).toHaveValue('Robert Schneider AG');

    // Globalen Absender ändern: ausgestellte Rechnungen zeigen weiterhin den damaligen Absender
    await page.locator('#sender-name').fill('Neue Firma AG');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();

    await goTo(app, 'Rechnungen');
    await page.getByRole('button', { name: first }).click();
    await expect(page.locator('#sender-name')).toHaveValue('Robert Schneider AG');
    await page.getByRole('button', { name: '← Zurück' }).click();

    // Neue Entwürfe übernehmen den neuen Standard; «Auf Standard zurücksetzen» stellt ihn wieder her
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await expect(page.locator('#sender-name')).toHaveValue('Neue Firma AG');
    await page.locator('#sender-name').fill('Etwas anderes');
    await page.getByRole('button', { name: 'Auf Standard zurücksetzen' }).first().click();
    await expect(page.locator('#sender-name')).toHaveValue('Neue Firma AG');
    await page.getByRole('button', { name: '← Zurück' }).click();

    // Kundenadresse ändern: die ausgestellte Rechnung behält die damalige Adresse
    await goTo(app, 'Kunden');
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    const edit = page.getByRole('dialog', { name: 'Kunde bearbeiten' });
    await edit.locator('#customer-city').fill('Bern');
    await edit.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('customer-row')).toContainText('Bern');

    await goTo(app, 'Rechnungen');
    await page.getByRole('button', { name: first }).click();
    await expect(page.locator('#debtor-city')).toHaveValue('Zürich');
  } finally {
    const dir = launched.userDataDir;
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
