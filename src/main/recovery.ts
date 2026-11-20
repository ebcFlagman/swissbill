import type { DbConnectionState } from '@shared/ipc/db-connection';
import { AppException } from '@shared/ipc/errors';
import type { ActiveDatabase } from './db/connect';
import { DatabaseStartupError } from './db/startup';

export interface RecoveryDeps {
  /** Opens the configured database (server or local) */
  open: () => Promise<ActiveDatabase>;
  /** Opens the local database without touching the stored connection settings */
  openLocal: () => Promise<ActiveDatabase>;
  /** A database is open: register the data channels, install the menu */
  onReady: (database: ActiveDatabase) => void;
}

export interface Recovery {
  state(): Pick<DbConnectionState, 'active'> & { startupError: string | null };
  /** First start: opens the database or enters recovery mode. Never throws. */
  start(): Promise<void>;
  /** Recovery mode only: try the configured database again. Throws `CONNECTION` with the reason on failure. */
  retry(): Promise<void>;
  /** Recovery mode only: use the local database for this session; the stored connection stays as it is. */
  useLocalOnce(): Promise<void>;
}

/** The user-facing reason for a failed start (never raw driver text for unexpected errors). */
function reasonOf(error: unknown): string {
  if (error instanceof DatabaseStartupError) return error.message;
  const detail = error instanceof Error ? ` (${error.message})` : '';
  return `Die Datenbank konnte nicht geöffnet werden${detail}. Es wurden keine Daten verändert.`;
}

/**
 * The start of the application with a database that may be unreachable. While no database is open the app is in
 * recovery mode: only the connection channels work, and the user can retry, change the settings or use the local
 * database for this session. Nothing is changed or written on the way.
 */
export function createRecovery(deps: RecoveryDeps): Recovery {
  let active: DbConnectionState['active'] = 'recovery';
  let startupError: string | null = null;

  const activate = (database: ActiveDatabase) => {
    active = database.kind;
    startupError = null;
    deps.onReady(database);
  };
  const requireRecovery = () => {
    if (active !== 'recovery') {
      throw new AppException(
        'VALIDATION',
        'Diese Aktion gibt es nur, wenn die Datenbank nicht geöffnet ist.',
      );
    }
  };
  const attempt = async (open: () => Promise<ActiveDatabase>, throwOnFailure: boolean) => {
    try {
      activate(await open());
    } catch (error) {
      active = 'recovery';
      startupError = reasonOf(error);
      if (throwOnFailure) throw new AppException('CONNECTION', startupError);
    }
  };

  return {
    state: () => ({ active, startupError }),
    start: () => attempt(deps.open, false),
    retry: async () => {
      requireRecovery();
      await attempt(deps.open, true);
    },
    useLocalOnce: async () => {
      requireRecovery();
      await attempt(deps.openLocal, true);
    },
  };
}
