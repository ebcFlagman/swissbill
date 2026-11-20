import { CHANNELS } from '@shared/ipc/api';
import type { Customer, CustomerInput } from '@shared/domain/customer';
import {
  type CustomerIdInput,
  customerIdSchema,
  customerInputSchema,
  type CustomerSearchInput,
  customerSearchSchema,
} from '@shared/ipc/customers';
import type { CustomerService } from '../services/customer-service';
import { handle } from './handle';

export function registerCustomerHandlers(service: CustomerService): void {
  handle<CustomerSearchInput, Customer[]>(
    CHANNELS.customersList,
    customerSearchSchema,
    ({ search }) => service.list(search),
  );
  handle<CustomerInput, Customer>(CHANNELS.customersSave, customerInputSchema, (input) =>
    service.save(input),
  );
  handle<CustomerIdInput, void>(CHANNELS.customersDelete, customerIdSchema, ({ id }) =>
    service.delete(id),
  );
}
