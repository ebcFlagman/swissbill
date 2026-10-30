import { CHANNELS } from '../../shared/ipc/api';
import type { Customer, CustomerInput } from '../../shared/domain/customer';
import {
  customerIdSchema,
  customerInputSchema,
  customerSearchSchema,
  type CustomerIdInput,
  type CustomerSearchInput,
} from '../../shared/ipc/customers';
import type { CustomerService } from '../services/customer-service';
import { handle } from './handle';

export function registerCustomerHandlers(service: CustomerService): void {
  handle<CustomerSearchInput, Customer[]>(CHANNELS.customersList, customerSearchSchema, ({ search }) =>
    service.list(search),
  );
  handle<CustomerInput, Customer>(CHANNELS.customersSave, customerInputSchema, (input) =>
    service.save(input),
  );
  handle<CustomerIdInput, void>(CHANNELS.customersDelete, customerIdSchema, ({ id }) =>
    service.delete(id),
  );
}
