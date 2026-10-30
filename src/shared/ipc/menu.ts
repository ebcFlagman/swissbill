/** Ereignis vom Main-Prozess an den Renderer, wenn ein Menüpunkt gewählt wird. */
export const MENU_EVENT = 'menu:action';

export type MenuPage = 'invoices' | 'customers' | 'settings';

export type MenuAction =
  | { type: 'navigate'; page: MenuPage }
  | { type: 'newInvoice' }
  | { type: 'backup' };

const PAGES: readonly string[] = ['invoices', 'customers', 'settings'];

/** Der Renderer vertraut Nachrichten nicht blind, sondern prüft sie. */
export function isMenuAction(value: unknown): value is MenuAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as { type?: unknown; page?: unknown };
  if (action.type === 'newInvoice' || action.type === 'backup') return true;
  return action.type === 'navigate' && typeof action.page === 'string' && PAGES.includes(action.page);
}
