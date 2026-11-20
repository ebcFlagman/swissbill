import type { DataSource } from 'typeorm';
import { validateCustomer, type Customer, type CustomerInput } from '../../shared/domain/customer';
import { AppException } from '../../shared/ipc/errors';
import { CustomerRepository } from '../db/customer-repository';

export class CustomerService {
  private readonly repo: CustomerRepository;

  constructor(
    dataSource: DataSource,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.repo = new CustomerRepository(dataSource);
  }

  list(search?: string): Promise<Customer[]> {
    return this.repo.list(search);
  }

  async get(id: number): Promise<Customer> {
    const customer = await this.repo.get(id);
    if (!customer) throw new AppException('NOT_FOUND', 'Der Kunde wurde nicht gefunden.');
    return customer;
  }

  /** Creates a customer (without `id`) or changes it. Existing invoices stay unchanged. */
  async save(input: CustomerInput): Promise<Customer> {
    const errors = validateCustomer(input);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    }
    const now = this.now().toISOString();
    if (input.id === undefined) {
      return this.get(await this.repo.insert(input, now));
    }
    await this.get(input.id);
    await this.repo.update(input.id, input, now);
    return this.get(input.id);
  }

  /** Deletes a customer; invoices keep their snapshot (`customer_id` becomes NULL). */
  async delete(id: number): Promise<void> {
    await this.get(id);
    await this.repo.delete(id);
  }
}
