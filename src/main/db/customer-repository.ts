import type Database from 'better-sqlite3';
import type { Customer, CustomerInput } from '../../shared/domain/customer';
import { registerUnicodeLower } from './functions';

interface CustomerRow {
  id: number;
  name: string;
  street: string;
  house_no: string;
  zip: string;
  city: string;
  country: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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

export class CustomerRepository {
  constructor(private readonly db: Database.Database) {
    registerUnicodeLower(db);
  }

  list(search = ''): Customer[] {
    const term = search.trim().toLowerCase();
    const rows = (
      term === ''
        ? this.db.prepare('SELECT * FROM customers ORDER BY unicode_lower(name), id').all()
        : this.db
            .prepare(
              `SELECT * FROM customers
               WHERE instr(unicode_lower(name), ?) > 0 OR instr(unicode_lower(city), ?) > 0
               ORDER BY unicode_lower(name), id`,
            )
            .all(term, term)
    ) as CustomerRow[];
    return rows.map(toCustomer);
  }

  get(id: number): Customer | undefined {
    const row = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
    return row ? toCustomer(row) : undefined;
  }

  insert(input: CustomerInput, now: string): number {
    const info = this.db
      .prepare(
        `INSERT INTO customers (name, street, house_no, zip, city, country, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.name, input.street, input.houseNo, input.zip, input.city, input.country, input.notes, now, now);
    return Number(info.lastInsertRowid);
  }

  update(id: number, input: CustomerInput, now: string): void {
    this.db
      .prepare(
        `UPDATE customers SET name = ?, street = ?, house_no = ?, zip = ?, city = ?, country = ?,
           notes = ?, updated_at = ? WHERE id = ?`,
      )
      .run(input.name, input.street, input.houseNo, input.zip, input.city, input.country, input.notes, now, id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  }
}
