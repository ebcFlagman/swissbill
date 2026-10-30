import { rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { fillValidInvoice, issueOpenInvoice, launchApp } from './helpers';

async function createAndIssue(page: Page, debtor: string): Promise<string> {
  await page.getByRole('button', { name: 'Neue Rechnung' }).click();
  await fillValidInvoice(page, debtor);
  const number = await issueOpenInvoice(page);
  await page.getByRole('button', { name: '← Zurück' }).click();
  return number;
}

const row = (page: Page, number: string) => page.getByTestId('invoice-row').filter({ hasText: number });

test('Status nachführen, stornieren ohne Nummernlücken und nach Status filtern', async () => {
  const launched = await launchApp();
  try {
    const { page } = launched;
    const year = new Date().getFullYear();
    const n = (i: number) => `RE-${year}-${String(i).padStart(4, '0')}`;

    expect(await createAndIssue(page, 'Kunde Eins AG')).toBe(n(1));
    expect(await createAndIssue(page, 'Kunde Zwei AG')).toBe(n(2));
    expect(await createAndIssue(page, 'Kunde Drei AG')).toBe(n(3));
    await expect(page.getByTestId('invoice-row')).toHaveCount(3);

    // Eine Rechnung als bezahlt markieren (Schnellaktion in der Liste)
    await row(page, n(1)).getByRole('button', { name: 'Als bezahlt markieren' }).click();
    await expect(row(page, n(1))).toContainText('Bezahlt');

    // Eine Rechnung stornieren: Nummer bleibt vergeben und sichtbar
    await page.getByRole('button', { name: n(2) }).click();
    await page.getByRole('button', { name: 'Stornieren' }).click();
    const confirm = page.getByRole('dialog', { name: 'Rechnung stornieren?' });
    await expect(confirm).toContainText('kann nicht rückgängig gemacht werden');
    await confirm.getByRole('button', { name: 'Stornieren' }).click();
    await expect(page.getByText('ist storniert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stornieren' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Als bezahlt markieren' })).toHaveCount(0);
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(row(page, n(2))).toContainText('Storniert');

    // Statusfilter
    await page.getByLabel('Status').selectOption('cancelled');
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);
    await expect(row(page, n(2))).toBeVisible();
    await page.getByLabel('Status').selectOption('paid');
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);
    await expect(row(page, n(1))).toBeVisible();
    await page.getByLabel('Status').selectOption('issued');
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);
    await expect(row(page, n(3))).toBeVisible();
    await page.getByLabel('Status').selectOption('all');

    // Bezahlt lässt sich zurücksetzen (Fehlbuchung), der Inhalt bleibt unverändert
    await page.getByRole('button', { name: n(1) }).click();
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(page.getByRole('button', { name: 'Als bezahlt markieren' })).toBeVisible();
    await expect(page.locator('#debtor-name')).toHaveValue('Kunde Eins AG');
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(row(page, n(1))).toContainText('Ausgestellt');

    // Ein gelöschter Entwurf erzeugt keine Lücke; die stornierte Nummer wird nicht wiederverwendet
    await page.getByRole('button', { name: 'Neue Rechnung' }).click();
    await page.getByRole('button', { name: '← Zurück' }).click();
    const draft = page.getByTestId('invoice-row').filter({ hasText: 'Entwurf' });
    await expect(draft).toHaveCount(1);
    await draft.getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog', { name: 'Entwurf löschen?' }).getByRole('button', { name: 'Löschen' }).click();
    await expect(draft).toHaveCount(0);

    expect(await createAndIssue(page, 'Kunde Vier AG')).toBe(n(4));
  } finally {
    const dir = launched.userDataDir;
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
