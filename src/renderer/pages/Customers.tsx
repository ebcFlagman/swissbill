import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Button } from '@primereact/ui/button';
import { Dialog } from '@primereact/ui/dialog';
import { InputText } from '@primereact/ui/inputtext';
import { Textarea } from '@primereact/ui/textarea';
import type { Customer, CustomerInput } from '../../shared/domain/customer';
import type { FieldError } from '../../shared/ipc/errors';
import { AddressFields } from '../components/AddressFields';
import { Field } from '../components/Field';
import { notifyError, notifySuccess } from '../lib/notify';

const EMPTY: CustomerInput = {
  name: '',
  street: '',
  houseNo: '',
  zip: '',
  city: '',
  country: 'CH',
  notes: '',
};

function toMap(errors: FieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of errors) {
    if (!(error.field in map)) map[error.field] = error.message;
  }
  return map;
}

export function Customers() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CustomerInput | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Customer | null>(null);

  const load = useCallback(async (searchText: string) => {
    const result = await window.swissbill.customers.list({ search: searchText });
    if (result.ok) setCustomers(result.value);
    else notifyError(result.error);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(search), 200);
    return () => clearTimeout(timer);
  }, [search, load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const result = await window.swissbill.customers.save(editing);
      if (!result.ok) {
        if (result.error.code === 'VALIDATION' && result.error.fields) setErrors(toMap(result.error.fields));
        else notifyError(result.error);
        return;
      }
      setEditing(null);
      setErrors({});
      notifySuccess('Kunde gespeichert.');
      void load(search);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const result = await window.swissbill.customers.delete({ id: toDelete.id });
    setToDelete(null);
    if (result.ok) {
      notifySuccess('Kunde gelöscht.');
      void load(search);
    } else {
      notifyError(result.error);
    }
  }

  function startEdit(input: CustomerInput) {
    setErrors({});
    setEditing(input);
  }

  return (
    <section>
      <div className="list-header">
        <h1>Kunden</h1>
        <Button onClick={() => startEdit(EMPTY)}>Neuer Kunde</Button>
      </div>

      <div className="list-filters">
        <InputText
          aria-label="Suche"
          placeholder="Suche nach Name oder Ort"
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
      </div>

      {customers === null ? (
        <p>Kunden werden geladen …</p>
      ) : customers.length === 0 ? (
        <p className="empty">
          {search.trim() !== '' ? 'Keine Kunden gefunden.' : 'Noch keine Kunden. Erfassen Sie mit «Neuer Kunde» den ersten Kunden.'}
        </p>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Adresse</th>
              <th scope="col">Ort</th>
              <th scope="col" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} data-testid="customer-row">
                <td>{customer.name}</td>
                <td>{[customer.street, customer.houseNo].filter(Boolean).join(' ') || '–'}</td>
                <td>
                  {customer.zip} {customer.city}
                </td>
                <td className="row-actions">
                  <Button variant="text" severity="secondary" onClick={() => startEdit(customer)}>
                    Bearbeiten
                  </Button>
                  <Button variant="text" severity="danger" onClick={() => setToDelete(customer)}>
                    Löschen
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog.Root open={editing !== null} onOpenChange={(event: { value?: boolean | undefined }) => !event.value && !saving && setEditing(null)}>
        <Dialog.Portal>
          <Dialog.Positioner>
            <Dialog.Popup style={{ width: 'min(760px, 92vw)' }}>
              <Dialog.Header>
                <Dialog.Title>{editing?.id === undefined ? 'Neuer Kunde' : 'Kunde bearbeiten'}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Content>
                {editing ? (
                  <>
                    <AddressFields<CustomerInput>
                      prefix="customer"
                      value={editing}
                      onChange={(value) => setEditing(value)}
                      errors={errors}
                    />
                    <Field label="Notizen (optional)" htmlFor="customer-notes" error={errors['customer.notes']}>
                      <Textarea
                        id="customer-notes"
                        rows={3}
                        value={editing.notes}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditing({ ...editing, notes: e.target.value })}
                      />
                    </Field>
                  </>
                ) : null}
                <div className="dialog-actions">
                  <Button severity="secondary" variant="outlined" onClick={() => setEditing(null)} disabled={saving}>
                    Abbrechen
                  </Button>
                  <Button onClick={() => void save()} disabled={saving}>
                    Speichern
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Popup>
          </Dialog.Positioner>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={toDelete !== null} onOpenChange={(event: { value?: boolean | undefined }) => !event.value && setToDelete(null)}>
        <Dialog.Portal>
          <Dialog.Positioner>
            <Dialog.Popup style={{ width: '28rem' }}>
              <Dialog.Header>
                <Dialog.Title>Kunde löschen?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Content>
                <p>
                  «{toDelete?.name}» wird gelöscht. Bestehende Rechnungen bleiben unverändert und behalten die damalige
                  Adresse.
                </p>
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
