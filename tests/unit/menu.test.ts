import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { buildMenuTemplate, type MenuDeps } from '../../src/main/menu-template';
import { isMenuAction, type MenuAction } from '../../src/shared/ipc/menu';

function setup(isDev = false) {
  const sent: MenuAction[] = [];
  const deps: MenuDeps = {
    isDev,
    send: (action) => sent.push(action),
    showAbout: vi.fn(),
    showDatabaseFolder: vi.fn(),
  };
  return { template: buildMenuTemplate(deps), sent, deps };
}

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])]);
}

const find = (template: MenuItemConstructorOptions[], id: string) =>
  flatten(template).find((item) => item.id === id);

describe('Anwendungsmenü', () => {
  it('hat die deutschen Hauptmenüs', () => {
    expect(setup().template.map((m) => m.label)).toEqual(['Datei', 'Bearbeiten', 'Ansicht', 'Hilfe']);
  });

  it('alle Einträge sind deutsch beschriftet (keine englischen Standardbezeichnungen)', () => {
    const labels = flatten(setup(true).template).flatMap((i) => (i.label ? [i.label] : []));
    for (const english of ['File', 'Edit', 'View', 'Window', 'Help', 'Quit', 'Copy', 'Paste', 'Toggle Developer Tools']) {
      expect(labels).not.toContain(english);
    }
    const roleItems = flatten(setup(true).template).filter((i) => i.role !== undefined);
    expect(roleItems.every((i) => typeof i.label === 'string' && i.label.length > 0)).toBe(true);
  });

  it('Datei: Neue Rechnung, Navigation und Sicherung senden die passenden Aktionen', () => {
    const { template, sent } = setup();
    const click = (id: string) => (find(template, id)?.click as () => void)();

    click('file-new-invoice');
    click('nav-invoices');
    click('nav-customers');
    click('nav-settings');
    click('file-backup');

    expect(sent).toEqual([
      { type: 'newInvoice' },
      { type: 'navigate', page: 'invoices' },
      { type: 'navigate', page: 'customers' },
      { type: 'navigate', page: 'settings' },
      { type: 'backup' },
    ]);
  });

  it('die Hauptnavigation steht im Menü «Ansicht» (es gibt keine Navigation im Fenster)', () => {
    const { template } = setup();
    const idsOf = (label: string) =>
      (template.find((m) => m.label === label)?.submenu as MenuItemConstructorOptions[]).flatMap((i) =>
        i.id ? [i.id] : [],
      );
    expect(idsOf('Ansicht')).toEqual(['nav-invoices', 'nav-customers', 'nav-settings']);
    expect(idsOf('Datei')).toEqual(['file-new-invoice', 'file-backup']);
  });

  it('hat Tastenkürzel für die wichtigsten Aktionen', () => {
    const { template } = setup();
    expect(find(template, 'file-new-invoice')?.accelerator).toBe('CmdOrCtrl+N');
    expect(find(template, 'nav-invoices')?.accelerator).toBe('CmdOrCtrl+1');
    expect(find(template, 'nav-customers')?.accelerator).toBe('CmdOrCtrl+2');
    expect(find(template, 'nav-settings')?.accelerator).toBe('CmdOrCtrl+3');
    expect(find(template, 'file-backup')?.accelerator).toBe('CmdOrCtrl+Shift+S');
  });

  it('Bearbeiten nutzt Rollen, damit Zwischenablage und Rückgängig überall funktionieren', () => {
    const { template } = setup();
    const edit = template.find((m) => m.label === 'Bearbeiten');
    const roles = (edit?.submenu as MenuItemConstructorOptions[]).flatMap((i) => (i.role ? [i.role] : []));
    expect(roles).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
  });

  it('Entwicklerwerkzeuge und «Neu laden» gibt es nur im Entwicklungsmodus', () => {
    const rolesOf = (isDev: boolean) => flatten(setup(isDev).template).flatMap((i) => (i.role ? [i.role] : []));
    expect(rolesOf(false)).not.toContain('toggleDevTools');
    expect(rolesOf(false)).not.toContain('reload');
    expect(rolesOf(true)).toContain('toggleDevTools');
    expect(rolesOf(true)).toContain('reload');
  });

  it('Hilfe: Datenbank-Ordner und Info rufen die Funktionen auf', () => {
    const { template, deps } = setup();
    (find(template, 'help-db-folder')?.click as () => void)();
    (find(template, 'help-about')?.click as () => void)();
    expect(deps.showDatabaseFolder).toHaveBeenCalledOnce();
    expect(deps.showAbout).toHaveBeenCalledOnce();
  });
});

describe('isMenuAction', () => {
  it('akzeptiert nur bekannte Aktionen', () => {
    expect(isMenuAction({ type: 'newInvoice' })).toBe(true);
    expect(isMenuAction({ type: 'backup' })).toBe(true);
    expect(isMenuAction({ type: 'navigate', page: 'settings' })).toBe(true);
  });

  it('lehnt unbekannte oder fehlerhafte Nachrichten ab', () => {
    expect(isMenuAction(null)).toBe(false);
    expect(isMenuAction('backup')).toBe(false);
    expect(isMenuAction({ type: 'navigate' })).toBe(false);
    expect(isMenuAction({ type: 'navigate', page: 'admin' })).toBe(false);
    expect(isMenuAction({ type: 'deleteEverything' })).toBe(false);
  });
});
