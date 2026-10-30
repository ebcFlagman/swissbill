import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Button } from '@primereact/ui/button';
import { Dialog } from '@primereact/ui/dialog';
import { InputText } from '@primereact/ui/inputtext';
import { formatDateCh } from '../../shared/domain/dates';
import type { InvoiceStatus, InvoiceSummary } from '../../shared/domain/invoice';
import { formatChf } from '../../shared/domain/money';
import { StatusBadge, STATUS_LABEL } from '../components/StatusBadge';
import { notifyError, notifySuccess } from '../lib/notify';

interface InvoiceListProps {
  onOpen: (id: number) => void;
  onCreate: () => void;
  creating: boolean;
}

type StatusFilter = InvoiceStatus | 'all';

export function InvoiceList({ onOpen, onCreate, creating }: InvoiceListProps) {
  const [rows, setRows] = useState<InvoiceSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [toDelete, setToDelete] = useState<InvoiceSummary | null>(null);

  const load = useCallback(async (searchText: string, statusFilter: StatusFilter) => {
    const result = await window.swissbill.invoices.list({
      search: searchText,
      status: statusFilter === 'all' ? [] : [statusFilter],
    });
    if (result.ok) setRows(result.value);
    else notifyError(result.error);
  }, []);

  // Suche leicht verzögern, damit nicht jeder Tastendruck eine Abfrage auslöst.
  useEffect(() => {
    const timer = setTimeout(() => void load(search, status), 200);
    return () => clearTimeout(timer);
  }, [search, status, load]);

  async function duplicate(row: InvoiceSummary) {
    const result = await window.swissbill.invoices.duplicate({ id: row.id });
    if (result.ok) onOpen(result.value.id);
    else notifyError(result.error);
  }

  async function markPaid(row: InvoiceSummary) {
    const result = await window.swissbill.invoices.markPaid({ id: row.id });
    if (result.ok) {
      notifySuccess(`${row.number ?? 'Rechnung'} als bezahlt markiert.`);
      void load(search, status);
    } else {
      notifyError(result.error);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const result = await window.swissbill.invoices.deleteDraft({ id: toDelete.id });
    setToDelete(null);
    if (result.ok) {
      notifySuccess('Entwurf gelöscht.');
      void load(search, status);
    } else {
      notifyError(result.error);
    }
  }

  const filtered = search.trim() !== '' || status !== 'all';

  return (
    <section>
      <div className="list-header">
        <h1>Rechnungen</h1>
        <Button onClick={onCreate} disabled={creating}>
          Neue Rechnung
        </Button>
      </div>

      <div className="list-filters">
        <InputText
          aria-label="Suche"
          placeholder="Suche nach Nummer oder Kunde"
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
        <select
          aria-label="Status"
          className="status-select"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">Alle Status</option>
          {(Object.keys(STATUS_LABEL) as InvoiceStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {rows === null ? (
        <p>Rechnungen werden geladen …</p>
      ) : rows.length === 0 ? (
        <p className="empty">
          {filtered
            ? 'Keine Rechnungen gefunden.'
            : 'Noch keine Rechnungen. Erstellen Sie mit «Neue Rechnung» die erste Rechnung.'}
        </p>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th scope="col">Nummer</th>
              <th scope="col">Kunde</th>
              <th scope="col">Datum</th>
              <th scope="col" className="num">
                Betrag (CHF)
              </th>
              <th scope="col">Status</th>
              <th scope="col" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid="invoice-row">
                <td>
                  <button type="button" className="link" onClick={() => onOpen(row.id)}>
                    {row.number ?? 'Entwurf'}
                  </button>
                </td>
                <td>{row.debtorName || '–'}</td>
                <td>{formatDateCh(row.invoiceDate)}</td>
                <td className="num">{formatChf(row.totalRappen)}</td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td className="row-actions">
                  {row.status === 'issued' ? (
                    <Button variant="text" onClick={() => void markPaid(row)}>
                      Als bezahlt markieren
                    </Button>
                  ) : null}
                  <Button variant="text" severity="secondary" onClick={() => void duplicate(row)}>
                    Duplizieren
                  </Button>
                  {row.status === 'draft' ? (
                    <Button variant="text" severity="danger" onClick={() => setToDelete(row)}>
                      Löschen
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog.Root open={toDelete !== null} onOpenChange={(event: { value?: boolean | undefined }) => !event.value && setToDelete(null)}>
        <Dialog.Portal>
          <Dialog.Positioner>
            <Dialog.Popup style={{ width: '28rem' }}>
              <Dialog.Header>
                <Dialog.Title>Entwurf löschen?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Content>
                <p>Der Entwurf wird endgültig gelöscht. Es entsteht keine Lücke in der Rechnungsnummer.</p>
                <div className="dialog-actions">
                  <Button severity="secondary" variant="outlined" onClick={() => setToDelete(null)}>
                    Abbrechen
                  </Button>
                  <Button severity="danger" onClick={() => void confirmDelete()}>
                    Löschen
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Popup>
          </Dialog.Positioner>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
