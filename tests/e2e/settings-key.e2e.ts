import { expect, test } from '@playwright/test';
import { FAKE_ENV, startFakeGeoapify } from './fake-geoapify';
import { goTo, launchApp, setupSettings } from './helpers';

test('API-Key eintragen, prüfen, speichern, nach Neustart behalten und entfernen', async () => {
  const fake = await startFakeGeoapify();
  const env = { ...FAKE_ENV, SWISSBILL_GEOAPIFY_BASE_URL: fake.url };
  let launched = await launchApp(undefined, env);
  try {
    const { app, page } = launched;
    await goTo(app, 'Einstellungen');
    await expect(page.getByTestId('key-status')).toHaveText('Kein Key gespeichert.');
    await expect(page.getByText(/Datenschutz: Mit einem Key werden die getippten Adressangaben/)).toBeVisible();

    // Prüfen, bevor gespeichert wird
    await page.locator('#geoapifyApiKey').fill('  test-key-0123456789  ');
    await page.getByRole('button', { name: 'Key prüfen' }).click();
    await expect(page.getByTestId('key-check')).toHaveText('Der Key funktioniert.');
    fake.mode = 'invalid_key';
    await page.getByRole('button', { name: 'Key prüfen' }).click();
    await expect(page.getByTestId('key-check')).toHaveText('Der Key wird von Geoapify nicht akzeptiert.');
    fake.mode = 'ok';

    await setupSettings(app, page, 'test-key-0123456789');
    await expect(page.getByTestId('key-status')).toHaveText('Key gespeichert.');
    // der gespeicherte Key wird nie angezeigt
    await expect(page.locator('#geoapifyApiKey')).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('test-key-0123456789');

    // Neustart: der Key gilt weiterhin
    launched = await launched.relaunch();
    await goTo(launched.app, 'Einstellungen');
    await expect(launched.page.getByTestId('key-status')).toHaveText('Key gespeichert.');
    await expect(launched.page.locator('#geoapifyApiKey')).toHaveValue('');

    // Entfernen
    await launched.page.getByRole('button', { name: 'Key entfernen' }).click();
    await expect(launched.page.getByTestId('key-status')).toHaveText('Der Key wird beim Speichern entfernt.');
    await launched.page.getByRole('button', { name: 'Speichern' }).click();
    await expect(launched.page.getByText('Einstellungen gespeichert.')).toBeVisible();
    await expect(launched.page.getByTestId('key-status')).toHaveText('Kein Key gespeichert.');
  } finally {
    await launched.close();
    await fake.close();
  }
});
