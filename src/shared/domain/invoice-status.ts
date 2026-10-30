import type { InvoiceStatus } from './invoice';

/**
 * Erlaubte Statusübergänge. Dieselben Regeln setzt die Datenbank durch (Trigger `invoices_status_transition`).
 *
 *   draft ──ausstellen──▶ issued ──bezahlt──▶ paid
 *                           │  ▲                │
 *                           │  └──zurücksetzen──┘
 *                           └──stornieren──▶ cancelled ◀──stornieren── paid
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

/** Nur Entwürfe dürfen gelöscht werden (FR-021). */
export function canDelete(status: InvoiceStatus): boolean {
  return status === 'draft';
}
