import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  close(): Promise<void>;
  /** Restarts the app with the same data folder (for persistence tests). */
  relaunch(): Promise<LaunchedApp>;
}

/**
 * Starts the built app (`npm run build` must have run before) with its own,
 * temporary data folder so that tests never touch real data.
 */
export async function launchApp(
  userDataDir?: string,
  extraEnv: Record<string, string> = {},
): Promise<LaunchedApp> {
  const dir = userDataDir ?? mkdtempSync(join(tmpdir(), 'swissbill-e2e-'));
  const app = await electron.launch({
    args: [resolve(__dirname, '../..'), `--user-data-dir=${dir}`],
    // As in production: no development server (an empty variable would undermine the network block)
    env: {
      ...(Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RENDERER_URL'),
      ) as Record<string, string>),
      ...extraEnv,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return {
    app,
    page,
    userDataDir: dir,
    async close() {
      await app.close();
      if (!userDataDir) rmSync(dir, { recursive: true, force: true });
    },
    async relaunch() {
      await app.close();
      return launchApp(dir, extraEnv);
    },
  };
}

export const QR_IBAN = 'CH44 3199 9123 0008 8901 2';

export async function fillAddress(page: Page, prefix: 'sender' | 'debtor', values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await page.locator(`#${prefix}-${key}`).fill(value);
  }
}

export async function fillItem(page: Page, position: number, description: string, quantity: string, price: string) {
  await page.getByLabel(`Beschreibung Position ${position}`).fill(description);
  await page.getByLabel(`Menge Position ${position}`).fill(quantity);
  await page.getByLabel(`Einzelpreis Position ${position}`).fill(price);
}

/** Fills a complete, valid invoice with fictitious data (the editor must be open). */
export async function fillValidInvoice(page: Page, debtorName = 'Pia-Maria Rutschmann-Schnyder') {
  await fillAddress(page, 'sender', {
    name: 'Robert Schneider AG',
    street: 'Rue du Lac',
    houseNo: '1268',
    zip: '2501',
    city: 'Biel',
    iban: QR_IBAN,
  });
  await fillAddress(page, 'debtor', {
    name: debtorName,
    street: 'Grosse Marktgasse',
    houseNo: '28',
    zip: '9400',
    city: 'Rorschach',
  });
  await fillItem(page, 1, 'Beratung', '2', '150.00');
}

/** Issues the open invoice, closes the dialog and returns the invoice number. */
export async function issueOpenInvoice(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Ausstellen', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Rechnung ausstellen?' });
  await confirm.getByRole('button', { name: 'Ausstellen' }).click();
  const issued = page.getByRole('dialog', { name: 'Rechnung ausgestellt' });
  const number = (await issued.getByTestId('issued-number').textContent()) ?? '';
  await issued.getByRole('button', { name: 'Schliessen' }).click();
  return number;
}

/** Triggers a menu item like a user click (main navigation only runs through the native menu). */
export async function clickMenu(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()?.getMenuItemById(menuId)?.click();
  }, id);
}

const PAGE_IDS = { Rechnungen: 'nav-invoices', Kunden: 'nav-customers', Einstellungen: 'nav-settings' } as const;

/** Switches to a main view via the "Ansicht" menu. */
export async function goTo(app: ElectronApplication, page: keyof typeof PAGE_IDS): Promise<void> {
  await clickMenu(app, PAGE_IDS[page]);
}

/** Captures the sender in the settings and optionally stores a Geoapify API key (fake service). */
export async function setupSettings(app: ElectronApplication, page: Page, apiKey?: string): Promise<void> {
  await goTo(app, 'Einstellungen');
  await fillAddress(page, 'sender', {
    name: 'Robert Schneider AG',
    street: 'Rue du Lac',
    houseNo: '1268',
    zip: '2501',
    city: 'Biel',
    iban: QR_IBAN,
  });
  if (apiKey !== undefined) await page.locator('#geoapifyApiKey').fill(apiKey);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
  // the message would otherwise cover buttons at the top right later
  await expect(page.getByText('Einstellungen gespeichert.')).toBeHidden({ timeout: 20_000 });
}
