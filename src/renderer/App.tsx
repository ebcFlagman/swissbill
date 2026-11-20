import { useCallback, useEffect, useState } from 'react';
import type { MenuPage } from '@shared/ipc/menu';
import type { DbConnectionState } from '@shared/ipc/db-connection';
import { AppToaster } from './components/AppToaster';
import { RecoveryView } from './components/RecoveryView';
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
 * The main navigation runs exclusively through the native application menu
 * (View → Invoices / Customers / Settings, see src/main/menu-template.ts).
 */
export function App() {
  // Recovery mode (the configured database cannot be opened): only the recovery view works
  const [connection, setConnection] = useState<DbConnectionState | null>(null);
  const loadConnection = useCallback(async () => {
    const result = await window.swissbill.dbConnection.get();
    if (result.ok) setConnection(result.value);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void window.swissbill.dbConnection.get().then((result) => {
      if (!cancelled && result.ok) setConnection(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (connection === null) return null; // a moment: the state is read from main
  if (connection.active === 'recovery') {
    return (
      <div className="app">
        <main className="app-main">
          <RecoveryView state={connection} onRecovered={() => void loadConnection()} />
        </main>
        <AppToaster />
      </div>
    );
  }

  return (
    <div className="app">
      <main className="app-main">{renderPage(page, pendingNew, pendingHandled)}</main>
      <AppToaster />
    </div>
  );
}
