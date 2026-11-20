import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { goTo, launchApp } from './helpers';

const PASSWORD = 'p@ss:w/rd-Geheim-1';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    try {
      const info = lstatSync(path);
      if (info.isDirectory()) return filesUnder(path);
      return info.isFile() ? [path] : []; // skip sockets and links Chromium leaves behind
    } catch {
      return [];
    }
  });
}

test('Datenbankpasswort speichern, nie wieder anzeigen, ersetzen und entfernen (nur im Schlüsselbund)', async () => {
  const { app, page, userDataDir, close } = await launchApp(undefined, {
    SWISSBILL_SECRET_STORE: 'memory',
    SWISSBILL_CREDENTIAL_STORE: 'memory',
  });
  try {
    await goTo(app, 'Einstellungen');
    const connection = page.getByTestId('db-connection');
    await expect(connection.locator('#dbType')).toHaveValue('sqlite');

    await connection.locator('#dbType').selectOption('postgres');
    await expect(connection.locator('#dbPort')).toHaveValue('5432');
    await connection.locator('#dbHost').fill('db.example.ch');
    await connection.locator('#dbName').fill('swissbill');
    await connection.locator('#dbUser').fill('swissbill');
    await connection.locator('#dbPassword').fill(PASSWORD);
    await connection.getByRole('button', { name: 'Verbindung festlegen' }).click();

    // local → server is a switch: nothing is moved, the user has to confirm (FR-013)
    const confirm = page.getByRole('dialog', { name: 'Andere Datenbank verwenden?' });
    await expect(confirm.getByTestId('switch-warning')).toContainText(
      'Vorhandene Daten werden nicht übernommen',
    );
    await confirm.getByRole('button', { name: 'Verbindung festlegen' }).click();

    await expect(page.getByText(/gilt nach einem Neustart/)).toBeVisible();
    await expect(page.getByTestId('db-password-status')).toHaveText('Passwort gespeichert.');
    // the stored password is never shown again
    await expect(connection.locator('#dbPassword')).toHaveValue('');
    await expect(page.locator('body')).not.toContainText(PASSWORD);

    // the connection file has the details, but never the password
    const file = join(userDataDir, 'db-connection.json');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('db.example.ch');
    for (const path of filesUnder(userDataDir)) {
      expect(readFileSync(path).includes(Buffer.from(PASSWORD)), path).toBe(false);
    }

    // remove
    await connection.getByRole('button', { name: 'Passwort entfernen' }).click();
    await expect(page.getByTestId('db-password-status')).toHaveText(
      'Das Passwort wird beim Speichern entfernt.',
    );
    await connection.getByRole('button', { name: 'Verbindung festlegen' }).click();
    await expect(page.getByTestId('db-password-status')).toHaveText('Kein Passwort gespeichert.');
  } finally {
    await close();
  }
});
