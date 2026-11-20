import type { DataSource } from 'typeorm';
import { type Customer, type CustomerInput, validateCustomer } from '@shared/domain/customer';
import { AppException } from '@shared/ipc/errors';
import { CustomerEntity, type CustomerRow } from './entities/customer.entity';
import { assertLockOwned, forgetLock } from './lock-guard';
import { unitOfWorkFor } from './unit-of-work';

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    street: row.street,
    houseNo: row.house_no,
    zip: row.zip,
    city: row.city,
    country: row.country,
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Database-independent lower-casing for the search (also with umlauts). */
const lower = (value: string): string => value.toLowerCase();

/** Data rules apply to every write path (formerly CHECK constraints of the database). */
function assertValid(input: CustomerInput): void {
  const errors = validateCustomer(input);
  if (errors.length > 0)
    throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class CustomerRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** Sorted by name (case-insensitive), ties broken by `id`. */
  async list(search = ''): Promise<Customer[]> {
    const rows = await this.dataSource.getRepository(CustomerEntity).find();
    const term = lower(search.trim());
    return rows
      .filter((r) => term === '' || lower(r.name).includes(term) || lower(r.city).includes(term))
      .sort((a, b) => compare(lower(a.name), lower(b.name)) || a.id - b.id)
      .map(toCustomer);
  }

  async get(id: number): Promise<Customer | undefined> {
    const row = await this.dataSource.getRepository(CustomerEntity).findOneBy({ id });
    return row ? toCustomer(row) : undefined;
  }

  async insert(input: CustomerInput, now: string): Promise<number> {
    assertValid(input);
    return unitOfWorkFor(this.dataSource).run(async (manager) => {
      const result = await manager.insert(CustomerEntity, {
        name: input.name,
        street: input.street,
        house_no: input.houseNo,
        zip: input.zip,
        city: input.city,
        country: input.country,
        notes: input.notes,
        created_at: now,
        updated_at: now,
      });
      return Number((result.identifiers[0] as { id: number }).id);
    });
  }

  async update(id: number, input: CustomerInput, now: string): Promise<void> {
    assertValid(input);
    await unitOfWorkFor(this.dataSource).run(async (manager) => {
      // Server database: only the device holding the edit lock may change the customer
      await assertLockOwned(this.dataSource, manager, { entityType: 'customer', entityId: id });
      await manager.update(
        CustomerEntity,
        { id },
        {
          name: input.name,
          street: input.street,
          house_no: input.houseNo,
          zip: input.zip,
          city: input.city,
          country: input.country,
          notes: input.notes,
          updated_at: now,
        },
      );
    });
  }

  /** Invoices keep their snapshot; their reference `customer_id` becomes NULL through the foreign key. */
  async delete(id: number): Promise<void> {
    await unitOfWorkFor(this.dataSource).run(async (manager) => {
      const key = { entityType: 'customer', entityId: id } as const;
      await assertLockOwned(this.dataSource, manager, key);
      await manager.delete(CustomerEntity, { id });
      await forgetLock(this.dataSource, manager, key);
    });
  }
}
