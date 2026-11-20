import { app, BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import { CHANNELS } from '@shared/ipc/api';
import type {
  DbConnectionInput,
  DbConnectionState,
  DbConnectionTestResult,
  PickCaFileResult,
} from '@shared/ipc/db-connection';
import { checkCaFile } from '../db/ca-file';
import type { Recovery } from '../recovery';
import type { ConnectionService } from '../services/connection-service';
import { handle } from './handle';

const settingsSchema = z.object({
  type: z.enum(['sqlite', 'postgres', 'mysql', 'mariadb']),
  host: z.string(),
  port: z.number(),
  database: z.string(),
  user: z.string(),
  tls: z.object({ enabled: z.boolean(), caPath: z.string().nullable() }),
});

export const connectionInputSchema: z.ZodType<DbConnectionInput> = z.object({
  settings: settingsSchema,
  password: z.discriminatedUnion('action', [
    z.object({ action: z.literal('keep') }),
    z.object({ action: z.literal('set'), value: z.string() }),
    z.object({ action: z.literal('remove') }),
  ]),
});

/**
 * Channels that work without an open database (also in recovery mode): connection settings, certificate
 * file dialog and restart. Registered before the database is started.
 */
export function registerConnectionHandlers(service: ConnectionService, recovery: Recovery): void {
  handle<undefined, DbConnectionState>(CHANNELS.dbConnectionGet, z.undefined(), () =>
    service.getState(),
  );

  handle<DbConnectionInput, DbConnectionTestResult>(
    CHANNELS.dbConnectionTest,
    connectionInputSchema,
    (input) => service.test(input),
  );

  handle<DbConnectionInput, { restartRequired: true }>(
    CHANNELS.dbConnectionSave,
    connectionInputSchema,
    (input) => service.save(input),
  );

  handle<undefined, PickCaFileResult>(CHANNELS.dbConnectionPickCaFile, z.undefined(), async () => {
    const options = {
      title: 'CA-Zertifikat auswählen',
      properties: ['openFile' as const],
      filters: [{ name: 'Zertifikat (PEM)', extensions: ['pem', 'crt', 'cer'] }],
    };
    const parent = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return { cancelled: true as const };
    const problem = checkCaFile(path);
    return problem ? { error: problem } : { path };
  });

  // Recovery mode only (the controller refuses them otherwise)
  handle<undefined, void>(CHANNELS.dbConnectionRetry, z.undefined(), () => recovery.retry());
  handle<undefined, void>(CHANNELS.dbConnectionUseLocalOnce, z.undefined(), () =>
    recovery.useLocalOnce(),
  );

  handle<undefined, void>(CHANNELS.appRelaunch, z.undefined(), () => {
    app.relaunch();
    app.exit(0);
  });
}
