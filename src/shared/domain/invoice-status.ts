import type { InvoiceStatus } from './invoice';

/**
 * Allowed status transitions. The persistence layer enforces the same rules (`src/main/db/invoice-repository.ts`).
 *
 *   draft ──issue─────▶ issued ──paid───▶ paid
 *                           │  ▲                │
 *                           │  └──reopen──────┘
 *                           └──cancel───▶ cancelled ◀──cancel─── paid
 */
export const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ['issued'],
  issued: ['paid', 'cancelled'],
  paid: ['issued', 'cancelled'],
  cancelled: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Only drafts may be deleted (FR-021). */
export function canDelete(status: InvoiceStatus): boolean {
  return status === 'draft';
}
