import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('App startet, IPC-Brücke antwortet und der Renderer ist isoliert', async () => {
  const launched = await launchApp();
  try {
    const { page, userDataDir } = launched;

    await expect(page.getByRole('heading', { name: 'Rechnungen' })).toBeVisible();

    const info = await page.evaluate(() => window.swissbill.app.info());
    expect(info.ok).toBe(true);

    // No Node in the renderer
    const nodeAccess = await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
    }));
    expect(nodeAccess).toEqual({ require: 'undefined', process: 'undefined' });

    // The database is a single file in the userData folder
    expect(existsSync(join(userDataDir, 'swissbill.db'))).toBe(true);
    expect(existsSync(join(userDataDir, 'swissbill.db-wal'))).toBe(false);
  } finally {
    await launched.close();
  }
});
