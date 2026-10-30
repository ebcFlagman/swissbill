import { rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { clickMenu, launchApp } from './helpers';

/** Relative Luminanz und Kontrastverhältnis nach WCAG, direkt im Seitenkontext berechnet. */
async function contrastOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const parse = (value: string): [number, number, number, number] => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) throw new Error(`Unerwartetes Farbformat: ${value}`);
      const [r = 0, g = 0, b = 0, a = 1] = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [r, g, b, a];
    };
    const luminance = ([r, g, b]: number[]) => {
      const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
    };
    const element = document.querySelector(sel) as HTMLElement;
    // Hintergrund: nächster Vorfahre mit deckender Hintergrundfarbe
    let node: HTMLElement | null = element;
    let bg: [number, number, number, number] = [255, 255, 255, 1];
    while (node) {
      const candidate = parse(getComputedStyle(node).backgroundColor);
      if (candidate[3] > 0.99) {
        bg = candidate;
        break;
      }
      node = node.parentElement;
    }
    const fg = parse(getComputedStyle(element).color);
    const [a, b] = [luminance(fg), luminance(bg)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return { ratio, bgLuminance: b };
  }, selector);
}

test('Hell und Dunkel folgen dem System und bleiben lesbar', async () => {
  const launched = await launchApp();
  try {
    const { app, page } = launched;

    // Electron übernimmt den Systemmodus
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system');

    await clickMenu(app, 'nav-settings');
    await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();

    const results: Record<string, { page: number; heading: number; card: number; bg: number }> = {};
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(200);
      const body = await contrastOf(page, 'body');
      const heading = await contrastOf(page, 'h1');
      const card = await contrastOf(page, '.card h2');
      results[scheme] = { page: body.ratio, heading: heading.ratio, card: card.ratio, bg: body.bgLuminance };
      // Text muss auf seinem Hintergrund gut lesbar sein (WCAG AA: 4.5)
      expect(body.ratio, `${scheme}: Seitentext`).toBeGreaterThanOrEqual(4.5);
      expect(heading.ratio, `${scheme}: Überschrift`).toBeGreaterThanOrEqual(4.5);
      expect(card.ratio, `${scheme}: Kartentitel`).toBeGreaterThanOrEqual(4.5);
    }

    // Der Seitenhintergrund wechselt tatsächlich mit dem Systemmodus
    expect(results['light']!.bg).toBeGreaterThan(0.8);
    expect(results['dark']!.bg).toBeLessThan(0.1);
  } finally {
    const dir = launched.userDataDir;
    await launched.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
