import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { writeConnectionConfig } from '../../src/main/db/connection-config';
import { goTo, launchApp } from './helpers';

const ENV = { SWISSBILL_SECRET_STORE: 'memory', SWISSBILL_CREDENTIAL_STORE: 'memory' };

type Entry = Record<string, unknown> & { level: string; component: string; msg: string };

function readLog(dir: string): Entry[] {
  try {
    return readFileSync(join(dir, 'logs', 'swissbill.log'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Entry);
  } catch {
    return [];
  }
}

test('Start schreibt strukturierte Einträge; Level in den Einstellungen wirkt sofort und bleibt nach dem Neustart', async () => {
  let launched = await launchApp(undefined, ENV);
  try {
    const { app, page, userDataDir } = launched;
    await expect(page.getByRole('button', { name: 'Neue Rechnung' })).toBeVisible();

    // start entries: version/platform and database kind, no credentials
    await expect
      .poll(() =>
        readLog(userDataDir)
          .map((e) => e.msg)
          .join('|'),
      )
      .toContain('Datenbank geöffnet');
    const start = readLog(userDataDir).find((e) => e.msg.includes('gestartet'));
    expect(start).toMatchObject({ level: 'info', component: 'app' });
    expect(readLog(userDataDir).find((e) => e.msg === 'Datenbank geöffnet')).toMatchObject({
      component: 'db',
      dbKind: 'local',
    });

    // default: info, no debug lines
    expect(readLog(userDataDir).some((e) => e.level === 'debug')).toBe(false);

    // set the level in the settings: immediately stored for this device
    await goTo(app, 'Einstellungen');
    await page.locator('#logLevel').selectOption('debug');
    await expect(page.getByText('Der Detailgrad des Protokolls wurde geändert.')).toBeVisible();
    expect(JSON.parse(readFileSync(join(userDataDir, 'log-settings.json'), 'utf8'))).toEqual({
      version: 1,
      level: 'debug',
    });

    // after a restart the level is still debug
    launched = await launched.relaunch();
    await goTo(launched.app, 'Einstellungen');
    await expect(launched.page.locator('#logLevel')).toHaveValue('debug');

    // and back to info
    await launched.page.locator('#logLevel').selectOption('info');
    await expect
      .poll(() => JSON.parse(readFileSync(join(userDataDir, 'log-settings.json'), 'utf8')).level)
      .toBe('info');
  } finally {
    await launched.close();
  }
});

test('Ein Fehler der Oberfläche erscheint mit Bereich ui im Log', async () => {
  const launched = await launchApp(undefined, ENV);
  try {
    const { page, userDataDir } = launched;
    await expect(page.getByRole('button', { name: 'Neue Rechnung' })).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'e2e-ui-fehler', error: new Error('e2e-ui-fehler') }),
      );
    });
    await expect
      .poll(() => readLog(userDataDir).find((e) => e.component === 'ui'))
      .toMatchObject({ level: 'error', msg: 'e2e-ui-fehler' });
  } finally {
    await launched.close();
  }
});

test('Im Wiederherstellungsmodus ohne Datenbank ist das Level einstellbar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'swissbill-e2e-logrec-'));
  writeConnectionConfig(
    dir,
    {
      type: 'postgres',
      host: '127.0.0.1',
      port: 1, // nothing listens here
      database: 'swissbill',
      user: 'swissbill',
      tls: { enabled: false, caPath: null },
    },
    'none',
  );
  const launched = await launchApp(dir, ENV);
  try {
    const { page } = launched;
    await expect(page.getByTestId('recovery')).toBeVisible();
    await page.getByRole('button', { name: 'Einstellungen' }).click();
    await page.locator('#logLevel').selectOption('debug');
    await expect
      .poll(() => JSON.parse(readFileSync(join(dir, 'log-settings.json'), 'utf8')).level)
      .toBe('debug');
    // the failed connection is in the log with the area and the cause, without a password
    const failure = readLog(dir).find((e) => e.component === 'db' && e.level === 'error');
    expect(failure?.msg).toContain('Datenbank konnte nicht geöffnet werden');
  } finally {
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Ist das Logverzeichnis nicht beschreibbar, läuft die App trotzdem (SC-006)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'swissbill-e2e-lognowrite-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'logs'), 'ich bin eine Datei, kein Ordner');
  const launched = await launchApp(dir, ENV);
  try {
    await expect(launched.page.getByRole('button', { name: 'Neue Rechnung' })).toBeVisible();
  } finally {
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
