import { z } from 'zod';
import { CHANNELS } from '../../shared/ipc/api';
import type { DraftInput, Invoice, InvoiceFilter, InvoiceSummary } from '../../shared/domain/invoice';
import {
  draftInputSchema,
  invoiceFilterSchema,
  invoiceIdSchema,
  type InvoiceIdInput,
} from '../../shared/ipc/invoices';
import type { InvoiceService } from '../services/invoice-service';
import { handle } from './handle';

export function registerInvoiceHandlers(service: InvoiceService): void {
  handle<InvoiceFilter, InvoiceSummary[]>(CHANNELS.invoicesList, invoiceFilterSchema, (filter) =>
    service.list(filter),
  );
  handle<undefined, Invoice>(CHANNELS.invoicesCreateDraft, z.undefined(), () => service.createDraft());
  handle<DraftInput, Invoice>(CHANNELS.invoicesSaveDraft, draftInputSchema, (input) =>
    service.saveDraft(input),
  );
  handle<InvoiceIdInput, Invoice>(CHANNELS.invoicesGet, invoiceIdSchema, ({ id }) => service.get(id));
  handle<InvoiceIdInput, Invoice>(CHANNELS.invoicesIssue, invoiceIdSchema, ({ id }) =>
    service.issue(id),
  );
  handle<InvoiceIdInput, Invoice>(CHANNELS.invoicesMarkPaid, invoiceIdSchema, ({ id }) =>
    service.markPaid(id),
  );
  handle<InvoiceIdInput, Invoice>(CHANNELS.invoicesReopen, invoiceIdSchema, ({ id }) =>
    service.reopen(id),
  );
  handle<InvoiceIdInput, Invoice>(CHANNELS.invoicesCancel, invoiceIdSchema, ({ id }) =>
    service.cancel(id),
  );
  handle<InvoiceIdInput, void>(CHANNELS.invoicesDeleteDraft, invoiceIdSchema, ({ id }) =>
    service.deleteDraft(id),
  );
  handle<InvoiceIdInput, Invoice>(CHANNELS.invoicesDuplicate, invoiceIdSchema, ({ id }) =>
    service.duplicate(id),
  );
}
