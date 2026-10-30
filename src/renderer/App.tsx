import { useCallback, useEffect, useState } from 'react';
import type { MenuPage } from '../shared/ipc/menu';
import { AppToaster } from './components/AppToaster';
import { backupDatabase } from './lib/backup';
import { Customers } from './pages/Customers';
import { Invoices } from './pages/Invoices';
import { Settings } from './pages/Settings';
import './styles.css';

function renderPage(page: MenuPage, pendingNew: boolean, onPendingHandled: () => void) {
  switch (page) {
    case 'invoices':
      return <Invoices pendingNew={pendingNew} onPendingHandled={onPendingHandled} />;
    case 'customers':
      return <Customers />;
    case 'settings':
      return <Settings />;
  }
}

/**
 * Die Hauptnavigation läuft ausschliesslich über das native Anwendungsmenü
 * (Ansicht → Rechnungen / Kunden / Einstellungen, siehe src/main/menu-template.ts).
 */
export function App() {
  const [page, setPage] = useState<MenuPage>('invoices');
  const [pendingNew, setPendingNew] = useState(false);
  const pendingHandled = useCallback(() => setPendingNew(false), []);

  useEffect(
    () =>
      window.swissbill.menu.onAction((action) => {
        switch (action.type) {
          case 'navigate':
            setPage(action.page);
            break;
          case 'newInvoice':
            setPage('invoices');
            setPendingNew(true);
            break;
          case 'backup':
            void backupDatabase();
            break;
        }
      }),
    [],
  );

  return (
    <div className="app">
      <main className="app-main">{renderPage(page, pendingNew, pendingHandled)}</main>
      <AppToaster />
    </div>
  );
}
