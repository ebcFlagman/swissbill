import type Database from 'better-sqlite3';
import { validateCustomer, type Customer, type CustomerInput } from '../../shared/domain/customer';
import { AppException } from '../../shared/ipc/errors';
import { CustomerRepository } from '../db/customer-repository';

export class CustomerService {
  private readonly repo: CustomerRepository;

  constructor(
    db: Database.Database,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.repo = new CustomerRepository(db);
  }

  list(search?: string): Customer[] {
    return this.repo.list(search);
  }

  get(id: number): Customer {
    const customer = this.repo.get(id);
    if (!customer) throw new AppException('NOT_FOUND', 'Der Kunde wurde nicht gefunden.');
    return customer;
  }

  /** Legt einen Kunden an (ohne `id`) oder ändert ihn. Bestehende Rechnungen bleiben unverändert. */
  save(input: CustomerInput): Customer {
    const errors = validateCustomer(input);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    }
    const now = this.now().toISOString();
    if (input.id === undefined) {
      return this.get(this.repo.insert(input, now));
    }
    this.get(input.id);
    this.repo.update(input.id, input, now);
    return this.get(input.id);
  }

  /** Löscht einen Kunden; Rechnungen behalten ihre Momentaufnahme (`customer_id` wird NULL). */
  delete(id: number): void {
    this.get(id);
    this.repo.delete(id);
  }
}
