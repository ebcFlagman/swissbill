import type Database from 'better-sqlite3';
import { openDatabase } from '../../src/main/db/connection';
import { loadMigrations, migrate } from '../../src/main/db/migrate';
import { InvoiceService } from '../../src/main/services/invoice-service';
import type { Invoice } from '@shared/domain/invoice';
import { makeDraftInput } from './invoice';

export function createTestDb(): Database.Database {
  const db = openDatabase(':memory:');
  migrate(db, loadMigrations());
  return db;
}

export function createService(db: Database.Database, clock: () => Date = () => new Date(2026, 2, 1, 10, 0)) {
  let current = clock;
  const service = new InvoiceService(db, { now: () => current() });
  return {
    service,
    setClock(next: () => Date) {
      current = next;
    },
  };
}

/** Legt einen vollständig gefüllten Entwurf an (gültige fiktive Daten). */
export function createFilledDraft(
  service: InvoiceService,
  overrides: Parameters<typeof makeDraftInput>[0] = {},
): Invoice {
  const draft = service.createDraft();
  return service.saveDraft(makeDraftInput({ ...overrides, id: draft.id }));
}
