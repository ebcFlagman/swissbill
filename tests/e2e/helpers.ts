import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  close(): Promise<void>;
  /** Startet die App mit demselben Datenordner neu (für Persistenztests). */
  relaunch(): Promise<LaunchedApp>;
}

/**
 * Startet die gebaute App (`npm run build` muss vorher gelaufen sein) mit einem eigenen,
 * temporären Datenordner, damit Tests nie echte Daten berühren.
 */
export async function launchApp(userDataDir?: string): Promise<LaunchedApp> {
  const dir = userDataDir ?? mkdtempSync(join(tmpdir(), 'swissbill-e2e-'));
  const app = await electron.launch({
    args: [resolve(__dirname, '../..'), `--user-data-dir=${dir}`],
    // Wie in der Produktion: kein Entwicklungsserver (eine leere Variable würde die Netzwerksperre aushebeln)
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RENDERER_URL')) as Record<
      string,
      string
    >,
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
      return launchApp(dir);
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

/** Füllt eine vollständige, gültige Rechnung mit fiktiven Daten (Editor muss offen sein). */
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

/** Stellt die geöffnete Rechnung aus, schliesst den Dialog und liefert die Rechnungsnummer. */
export async function issueOpenInvoice(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Ausstellen', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Rechnung ausstellen?' });
  await confirm.getByRole('button', { name: 'Ausstellen' }).click();
  const issued = page.getByRole('dialog', { name: 'Rechnung ausgestellt' });
  const number = (await issued.getByTestId('issued-number').textContent()) ?? '';
  await issued.getByRole('button', { name: 'Schliessen' }).click();
  return number;
}

/** Löst einen Menüpunkt wie ein Klick des Benutzers aus (Hauptnavigation läuft nur über das native Menü). */
export async function clickMenu(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()?.getMenuItemById(menuId)?.click();
  }, id);
}

const PAGE_IDS = { Rechnungen: 'nav-invoices', Kunden: 'nav-customers', Einstellungen: 'nav-settings' } as const;

/** Wechselt über das Menü «Ansicht» zu einer Hauptansicht. */
export async function goTo(app: ElectronApplication, page: keyof typeof PAGE_IDS): Promise<void> {
  await clickMenu(app, PAGE_IDS[page]);
}
