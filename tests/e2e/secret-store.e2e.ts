import { expect, test } from '@playwright/test';
import { goTo, launchApp, setupSettings } from './helpers';

/**
 * Echte Betriebssystem-Verschlüsselung (ohne Speicher-Store): Der Key bleibt nach einem Neustart lesbar,
 * und Electron meldet keine veralteten safeStorage-Funktionen.
 */
test('API-Key wird mit der echten Betriebssystem-Verschlüsselung gespeichert und gelesen', async () => {
  let launched = await launchApp();
  const stderr: string[] = [];
  launched.app.process().stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
  try {
    await goTo(launched.app, 'Einstellungen');
    const status = (await launched.page.getByTestId('key-status').textContent()) ?? '';
    test.skip(status.includes('Verschlüsselung auf diesem Gerät nicht verfügbar'), 'keine Verschlüsselung auf diesem Gerät');

    await setupSettings(launched.app, launched.page, 'test-key-0123456789');
    await expect(launched.page.getByTestId('key-status')).toHaveText('Key gespeichert.');

    launched = await launched.relaunch();
    launched.app.process().stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
    await goTo(launched.app, 'Einstellungen');
    await expect(launched.page.getByTestId('key-status')).toHaveText('Key gespeichert.');
    expect(stderr.join('')).not.toMatch(/deprecated/i);
  } finally {
    await launched.close();
  }
});
