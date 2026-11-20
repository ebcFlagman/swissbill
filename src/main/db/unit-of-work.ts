import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import { toAppException } from './errors';

/**
 * Runs all write operations as transactions one after another. The SQLite connection is single;
 * without serialization, concurrent operations would mix into the same transaction.
 * On an error, all changes of the operation are rolled back.
 */
export class UnitOfWork {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataSource: DataSource) {}

  run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => this.dataSource.transaction(work));
    this.tail = result.catch(() => undefined);
    return result.catch((error: unknown) => {
      throw error instanceof QueryFailedError ? toAppException(error) : error;
    });
  }
}

const instances = new WeakMap<DataSource, UnitOfWork>();

/** Exactly one `UnitOfWork` per DataSource, so that all write operations really run one after another. */
export function unitOfWorkFor(dataSource: DataSource): UnitOfWork {
  let unit = instances.get(dataSource);
  if (!unit) {
    unit = new UnitOfWork(dataSource);
    instances.set(dataSource, unit);
  }
  return unit;
}
