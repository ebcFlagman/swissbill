import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import { CONNECTION_LOST_MESSAGE, isConnectionLost, isRetryableTransactionError } from './adapters';
import { AppException } from '@shared/ipc/errors';
import { toAppException } from './errors';

/** Deadlocks and lock timeouts between devices roll the transaction back; running it again is safe. */
const MAX_RETRIES = 8;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs all write operations as transactions one after another. The SQLite connection is single;
 * without serialization, concurrent operations would mix into the same transaction.
 * On an error, all changes of the operation are rolled back.
 */
export class UnitOfWork {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataSource: DataSource) {}

  run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const attempt = async (): Promise<T> => {
      for (let retry = 0; ; retry++) {
        try {
          return await this.dataSource.transaction(work);
        } catch (error) {
          if (retry >= MAX_RETRIES || !isRetryableTransactionError(error)) throw error;
          // short random pause so competing devices do not collide again in lockstep
          await pause(Math.random() * 20 * (retry + 1));
        }
      }
    };
    const result = this.tail.then(attempt);
    this.tail = result.catch(() => undefined);
    return result.catch((error: unknown) => {
      if (isConnectionLost(error)) {
        // the server rolled the transaction back: nothing was saved partially (FR-012)
        throw new AppException('IO', CONNECTION_LOST_MESSAGE);
      }
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
