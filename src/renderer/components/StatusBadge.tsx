import type { InvoiceStatus } from '../../shared/domain/invoice';

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Entwurf',
  issued: 'Ausgestellt',
  paid: 'Bezahlt',
  cancelled: 'Storniert',
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className="status" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}
