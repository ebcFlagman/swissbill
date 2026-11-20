import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { openAndMigrate } from '../../src/main/db/startup';
import { InvoiceService } from '../../src/main/services/invoice-service';
import type { Invoice } from '@shared/domain/invoice';
import { makeDraftInput } from './invoice';

/**
 * Where `createTestDb` gets its databases from. `null` (default): a fresh in-memory SQLite database.
 * The matrix tests (`describeMatrixDb`) set it so that the same test bodies run on every database type.
 */
let provider: (() => Promise<DataSource>) | null = null;

export function setTestDbProvider(next: (() => Promise<DataSource>) | null): void {
  provider = next;
}

/** Fresh, fully migrated database (in-memory SQLite unless a matrix provider is active). */
export function createTestDb(): Promise<DataSource> {
  return provider ? provider() : openAndMigrate(':memory:');
}

export function createService(
  dataSource: DataSource,
  clock: () => Date = () => new Date(2026, 2, 1, 10, 0),
) {
  let current = clock;
  const service = new InvoiceService(dataSource, { now: () => current() });
  return {
    service,
    setClock(next: () => Date) {
      current = next;
    },
  };
}

/** Creates a completely filled draft (valid fictitious data). */
export async function createFilledDraft(
  service: InvoiceService,
  overrides: Parameters<typeof makeDraftInput>[0] = {},
): Promise<Invoice> {
  const draft = await service.createDraft();
  return service.saveDraft(makeDraftInput({ ...overrides, id: draft.id }));
}
