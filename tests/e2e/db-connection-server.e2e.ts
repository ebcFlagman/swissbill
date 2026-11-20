import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { writeConnectionConfig } from '../../src/main/db/connection-config';
import { fillValidInvoice, goTo, issueOpenInvoice, launchApp } from './helpers';

/**
 * Two devices (two app instances with their own data folders) share one PostgreSQL database.
 * Runs only with `SWISSBILL_TEST_PG_URL` (see tests/integration/helpers/env.sh).
 */
const ADMIN_URL = process.env['SWISSBILL_TEST_PG_URL'];
test.skip(!ADMIN_URL, 'SWISSBILL_TEST_PG_URL ist nicht gesetzt');

test('Zwei Geräte an einer Serverdatenbank: Entwurf ist gesperrt, danach frei, Nummer lückenlos', async () => {
  const url = new URL(ADMIN_URL as string);
  const password = decodeURIComponent(url.password);
  const database = `swissbill_e2e_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const admin = new Client({
    host: url.hostname,
    port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password,
    database: url.pathname.slice(1) || 'postgres',
  });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);

  const dirs = [0, 1].map(() => mkdtempSync(join(tmpdir(), 'swissbill-e2e-device-')));
  for (const dir of dirs) {
    writeConnectionConfig(
      dir,
      {
        type: 'postgres',
        host: url.hostname,
        port: Number(url.port) || 5432,
        database,
        user: decodeURIComponent(url.username),
        tls: { enabled: false, caPath: null },
      },
      'keychain',
    );
  }
  const env = {
    SWISSBILL_SECRET_STORE: 'memory',
    SWISSBILL_CREDENTIAL_STORE: 'memory',
    SWISSBILL_CREDENTIAL_STORE_VALUE: password,
  };

  const a = await launchApp(dirs[0], env);
  const b = await launchApp(dirs[1], env);
  try {
    // Device A creates a draft and keeps it open (locked for other devices)
    await a.page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await expect(a.page.getByRole('heading', { name: /Neue Rechnung/ })).toBeVisible();
    await fillValidInvoice(a.page);
    await expect(a.page.getByTestId('saved-at')).toBeVisible({ timeout: 15_000 });

    // Device B sees the draft read-only with a clear hint
    await goTo(b.app, 'Rechnungen');
    await b.page.getByRole('button', { name: 'Entwurf' }).first().click();
    const banner = b.page.getByTestId('lock-banner');
    await expect(banner).toContainText('wird gerade von');
    await expect(banner).toContainText('nur zur Ansicht');
    await expect(b.page.locator('#sender-name')).toBeDisabled();
    await expect(b.page.getByRole('button', { name: 'Ausstellen', exact: true })).toBeDisabled();

    // Device A leaves the editor: pending input is saved, the lock is released
    await a.page.getByRole('button', { name: '← Zurück' }).click();

    // Device B tries again: the draft is now editable and shows A's data
    await banner.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(banner).toHaveCount(0);
    await expect(b.page.locator('#sender-name')).toBeEnabled();
    await expect(b.page.locator('#sender-name')).toHaveValue('Robert Schneider AG');

    // B issues it: the number comes from the shared counter
    const number = await issueOpenInvoice(b.page);
    expect(number).toBe(`RE-${new Date().getFullYear()}-0001`);
  } finally {
    await a.close().catch(() => undefined);
    await b.close().catch(() => undefined);
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
