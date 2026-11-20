import type { QueryRunner } from 'typeorm';

/**
 * Column types per database. The base migration was written for SQLite (`text`/`integer`) and keeps
 * producing exactly that schema there. Servers get the equivalent types that also work for indexed and
 * defaulted columns (MySQL cannot index or default an unbounded `TEXT`) and for amounts above 32 bit.
 */
export type TypeKind = 'short' | 'text' | 'int' | 'bigint' | 'blob' | 'timestamp';

export interface ColumnType {
  type: string;
  length?: string;
}

export function isSqlite(queryRunner: QueryRunner): boolean {
  return queryRunner.connection.options.type === 'better-sqlite3';
}

/** Type for a column of the given kind. `length` is only used for `short` on servers. */
export function columnType(queryRunner: QueryRunner, kind: TypeKind, length = 255): ColumnType {
  const driver = queryRunner.connection.options.type;
  if (driver === 'better-sqlite3') {
    switch (kind) {
      case 'short':
      case 'text':
        return { type: 'text' };
      case 'int':
      case 'bigint':
        return { type: 'integer' };
      case 'blob':
        return { type: 'blob' };
      case 'timestamp':
        return { type: 'text' };
    }
  }
  switch (kind) {
    case 'short':
      return { type: 'varchar', length: String(length) };
    case 'text':
      return { type: 'text' };
    case 'int':
      return { type: 'integer' };
    case 'bigint':
      return { type: 'bigint' };
    case 'blob':
      return { type: driver === 'postgres' ? 'bytea' : 'blob' };
    case 'timestamp':
      // MySQL `timestamp` ends in 2038 and has implicit defaults; `datetime` is the safe choice there
      return { type: driver === 'postgres' ? 'timestamp' : 'datetime' };
  }
}
