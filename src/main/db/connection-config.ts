import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { DbConnectionSettings } from '@shared/domain/db-connection';

/**
 * The non-secret connection details live in a small file in the Electron `userData` folder, because the
 * app must know where to connect before it can open any database (FR-006). The password is never part of
 * it (it lives only in the OS keychain). A missing file means: local SQLite (the default).
 */
export const CONNECTION_FILENAME = 'db-connection.json';
const CURRENT_VERSION = 1;

/** Whether the connection expects a secret from the OS keychain (`keychain`) or needs none (`none`). */
export type ConnectionAuth = 'keychain' | 'none';

const fileSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  auth: z.enum(['keychain', 'none']),
  type: z.enum(['postgres', 'mysql', 'mariadb']),
  host: z.string(),
  port: z.number().int(),
  database: z.string(),
  user: z.string(),
  tls: z.object({ enabled: z.boolean(), caPath: z.string().nullable() }),
});

export type ConnectionConfigResult =
  | { kind: 'none' }
  | { kind: 'ok'; settings: DbConnectionSettings; auth: ConnectionAuth }
  | { kind: 'unsupported-version'; version: number }
  | { kind: 'invalid'; reason: string };

export function readConnectionConfig(dir: string): ConnectionConfigResult {
  const path = join(dir, CONNECTION_FILENAME);
  if (!existsSync(path)) return { kind: 'none' };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { kind: 'invalid', reason: error instanceof Error ? error.message : String(error) };
  }
  const version = (raw as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version > CURRENT_VERSION) {
    return { kind: 'unsupported-version', version };
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return { kind: 'invalid', reason: parsed.error.message };
  const { version: _version, auth, ...settings } = parsed.data;
  return { kind: 'ok', settings, auth };
}

/**
 * Writes the connection details atomically (temporary file, then rename). Only the known fields are written,
 * so a password can never end up in the file. Local SQLite means "no file".
 */
export function writeConnectionConfig(
  dir: string,
  settings: DbConnectionSettings,
  auth: ConnectionAuth = 'none',
): void {
  if (settings.type === 'sqlite') {
    removeConnectionConfig(dir);
    return;
  }
  mkdirSync(dir, { recursive: true });
  const content = {
    version: CURRENT_VERSION,
    auth,
    type: settings.type,
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    tls: { enabled: settings.tls.enabled, caPath: settings.tls.caPath },
  };
  const path = join(dir, CONNECTION_FILENAME);
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
}

export function removeConnectionConfig(dir: string): void {
  rmSync(join(dir, CONNECTION_FILENAME), { force: true });
}
