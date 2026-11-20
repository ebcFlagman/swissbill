/** Event from the main process to the renderer when a menu item is chosen. */
export const MENU_EVENT = 'menu:action';

export type MenuPage = 'invoices' | 'customers' | 'settings';

export type MenuAction =
  | { type: 'navigate'; page: MenuPage }
  | { type: 'newInvoice' }
  | { type: 'backup' };

const PAGES: readonly string[] = ['invoices', 'customers', 'settings'];

/** The renderer does not trust messages blindly but checks them. */
export function isMenuAction(value: unknown): value is MenuAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as { type?: unknown; page?: unknown };
  if (action.type === 'newInvoice' || action.type === 'backup') return true;
  return action.type === 'navigate' && typeof action.page === 'string' && PAGES.includes(action.page);
}
