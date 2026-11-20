import { useState } from 'react';
import { Button } from '@primereact/ui/button';
import { Message } from '@primereact/ui/message';
import type { DbConnectionState } from '@shared/ipc/db-connection';
import { notifyError } from '../lib/notify';
import { DbConnectionForm } from './DbConnectionForm';
import { LogLevelSelect } from './LogLevelSelect';

interface RecoveryViewProps {
  state: DbConnectionState;
  /** The database is open now: the application takes over */
  onRecovered: () => void;
}

/**
 * Shown instead of the application while the configured database cannot be opened (recovery mode):
 * try again, fix the connection settings, or work with the local database for this session.
 */
export function RecoveryView({ state, onRecovered }: RecoveryViewProps) {
  const [reason, setReason] = useState(
    state.startupError ?? state.configError ?? 'Die Datenbank konnte nicht geöffnet werden.',
  );
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  async function run(action: 'retry' | 'useLocalOnce') {
    setBusy(true);
    try {
      const result = await window.swissbill.dbConnection[action]();
      if (result.ok) {
        onRecovered();
        return;
      }
      if (result.error.code === 'CONNECTION') setReason(result.error.message);
      else notifyError(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="editor" aria-label="Datenbank nicht verfügbar" data-testid="recovery">
      <h1>Die Datenbank ist nicht verfügbar</h1>
      <Message.Root severity="error" role="alert">
        <Message.Content>
          <Message.Text data-testid="recovery-reason" style={{ whiteSpace: 'pre-line' }}>
            {reason}
          </Message.Text>
        </Message.Content>
      </Message.Root>
      <p className="hint">
        Es wurde nichts verändert und nichts gespeichert. Sie können es erneut versuchen, die
        Verbindung in den Einstellungen ändern oder in dieser Sitzung die lokale Datenbank
        verwenden. Die gespeicherte Serververbindung bleibt dabei bestehen, die Daten auf dem Server
        sind in dieser Sitzung aber nicht sichtbar.
      </p>
      <div className="actions">
        <Button onClick={() => void run('retry')} disabled={busy}>
          Erneut versuchen
        </Button>
        <Button variant="outlined" onClick={() => setShowSettings(!showSettings)} disabled={busy}>
          Einstellungen
        </Button>
        <Button variant="outlined" onClick={() => void run('useLocalOnce')} disabled={busy}>
          Lokal verwenden
        </Button>
      </div>
      {showSettings ? (
        <>
          <div className="card">
            <h2>Datenbankverbindung</h2>
            <DbConnectionForm />
          </div>
          <div className="card">
            <h2>Protokoll</h2>
            <LogLevelSelect />
          </div>
        </>
      ) : null}
    </section>
  );
}
