import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { writeConnectionConfig } from '../../src/main/db/connection-config';
import { launchApp } from './helpers';

const SERVER = {
  type: 'postgres' as const,
  host: '127.0.0.1',
  port: 1, // nothing listens here
  database: 'swissbill',
  user: 'swissbill',
  tls: { enabled: false, caPath: null },
};
const ENV = { SWISSBILL_SECRET_STORE: 'memory', SWISSBILL_CREDENTIAL_STORE: 'memory' };

test('Server nicht erreichbar: Wiederherstellungsmodus mit Meldung, Wiederholen, lokal verwenden', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'swissbill-e2e-recovery-'));
  writeConnectionConfig(dir, SERVER, 'none');
  let launched = await launchApp(dir, ENV);
  try {
    const { page } = launched;
    await expect(page.getByTestId('recovery')).toBeVisible();
    await expect(page.getByTestId('recovery-reason')).toContainText('127.0.0.1');
    await expect(page.getByTestId('recovery-reason')).toContainText('nimmt keine Verbindung an');
    // nothing of the application works without a database, and nothing was created locally
    await expect(page.getByRole('button', { name: 'Neue Rechnung' })).toHaveCount(0);
    expect(existsSync(join(dir, 'swissbill.db'))).toBe(false);

    // Retry: the server is still away, same view with the reason
    await page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.getByTestId('recovery-reason')).toContainText('nimmt keine Verbindung an');

    // Settings are reachable and show the stored connection
    await page.getByRole('button', { name: 'Einstellungen' }).click();
    await expect(page.locator('#dbHost')).toHaveValue('127.0.0.1');
    await expect(page.getByRole('button', { name: 'Verbindung testen' })).toBeVisible();

    // Use the local database for this session
    await page.getByRole('button', { name: 'Lokal verwenden' }).click();
    await expect(page.getByRole('button', { name: 'Neue Rechnung' })).toBeVisible();
    expect(existsSync(join(dir, 'swissbill.db'))).toBe(true);

    // The stored server connection stays: the next start is in recovery mode again
    launched = await launched.relaunch();
    await expect(launched.page.getByTestId('recovery')).toBeVisible();
  } finally {
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Fehlt das gespeicherte Passwort im Schlüsselbund, wird nicht verbunden, sondern neu eingegeben', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'swissbill-e2e-recovery-'));
  writeConnectionConfig(dir, SERVER, 'keychain'); // expects a password, the keychain has none
  const launched = await launchApp(dir, ENV);
  try {
    const { page } = launched;
    await expect(page.getByTestId('recovery-reason')).toContainText('Datenbankpasswort fehlt');
    await page.getByRole('button', { name: 'Einstellungen' }).click();
    await expect(page.getByTestId('db-password-status')).toContainText('fehlt im Schlüsselbund');
  } finally {
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Verbindung testen: ein nicht erreichbarer Server wird mit Stufe und Meldung angezeigt', async () => {
  const launched = await launchApp(undefined, ENV);
  try {
    const { page, app } = launched;
    const { goTo } = await import('./helpers');
    await goTo(app, 'Einstellungen');
    const form = page.getByTestId('db-connection');
    await form.locator('#dbType').selectOption('postgres');
    await form.locator('#dbHost').fill('127.0.0.1');
    await form.locator('#dbPort').fill('1');
    await form.locator('#dbName').fill('swissbill');
    await form.locator('#dbUser').fill('swissbill');
    await form.getByRole('button', { name: 'Verbindung testen' }).click();
    await expect(page.getByTestId('db-test-result')).toContainText(
      'Fehlgeschlagen bei «Erreichbarkeit»',
    );
    await expect(page.getByTestId('db-test-result')).not.toContainText('swissbill');
  } finally {
    await launched.close();
  }
});
