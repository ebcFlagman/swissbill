import type { FieldError } from '../ipc/errors';

/** Where the app keeps its data. `sqlite` is the local default; the others are user-configured servers. */
export type DbType = 'sqlite' | 'postgres' | 'mysql' | 'mariadb';

export const SERVER_TYPES = ['postgres', 'mysql', 'mariadb'] as const;
export type ServerDbType = (typeof SERVER_TYPES)[number];

/** Connection details without the password (the password lives only in the OS keychain). */
export interface DbConnectionSettings {
  type: DbType;
  host: string;
  port: number;
  database: string;
  user: string;
  tls: { enabled: boolean; caPath: string | null };
}

export const HOST_MAX = 255;
export const DATABASE_MAX = 64;
export const USER_MAX = 64;

export function isServerType(type: DbType): type is ServerDbType {
  return type !== 'sqlite';
}

export function defaultPort(type: ServerDbType): number {
  return type === 'postgres' ? 5432 : 3306;
}

/** Display name of a database type (German UI). */
export function dbTypeLabel(type: DbType): string {
  switch (type) {
    case 'sqlite':
      return 'Lokal (SQLite)';
    case 'postgres':
      return 'PostgreSQL';
    case 'mysql':
      return 'MySQL';
    case 'mariadb':
      return 'MariaDB';
  }
}

function requiredText(field: string, label: string, value: string, max: number): FieldError[] {
  if (value.trim() === '') return [{ field, message: `${label} ist erforderlich.` }];
  if (value.length > max) {
    return [{ field, message: `${label} darf höchstens ${max} Zeichen lang sein.` }];
  }
  return [];
}

/**
 * Validates the connection details. Special characters in user and database are allowed as they are
 * (they are passed as separate options, never built into a URL). Local SQLite has nothing to check.
 */
export function validateConnection(settings: DbConnectionSettings): FieldError[] {
  if (!isServerType(settings.type)) return [];
  const errors: FieldError[] = [
    ...requiredText('host', 'Der Server', settings.host, HOST_MAX),
    ...requiredText('database', 'Der Datenbankname', settings.database, DATABASE_MAX),
    ...requiredText('user', 'Der Benutzer', settings.user, USER_MAX),
  ];
  if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) {
    errors.push({ field: 'port', message: 'Der Port muss eine ganze Zahl von 1 bis 65535 sein.' });
  }
  if (!settings.tls.enabled && settings.tls.caPath !== null) {
    errors.push({
      field: 'tls.caPath',
      message: 'Ein CA-Zertifikat ist nur bei aktivierter Verschlüsselung möglich.',
    });
  }
  return errors;
}

/**
 * Does the new setting point to a different database than the stored one? `null` means the local default.
 * Switching never moves data, so the user must confirm it (FR-013).
 */
export function isDifferentDatabase(
  current: DbConnectionSettings | null,
  next: DbConnectionSettings,
): boolean {
  const currentType: DbType = current?.type ?? 'sqlite';
  if (currentType === 'sqlite' || next.type === 'sqlite') return currentType !== next.type;
  return (
    current === null ||
    current.type !== next.type ||
    current.host.trim().toLowerCase() !== next.host.trim().toLowerCase() ||
    current.port !== next.port ||
    current.database !== next.database
  );
}
