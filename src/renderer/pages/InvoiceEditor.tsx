import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@primereact/ui/button';
import { Message } from '@primereact/ui/message';
import { Textarea } from '@primereact/ui/textarea';
import { InputText } from '@primereact/ui/inputtext';
import type { Address } from '../../shared/domain/address';
import type { Customer } from '../../shared/domain/customer';
import { formatIban } from '../../shared/domain/iban';
import type { Settings } from '../../shared/domain/settings';
import type { Invoice, Sender } from '../../shared/domain/invoice';
import { formatChf } from '../../shared/domain/money';
import type { AppError, FieldError } from '../../shared/ipc/errors';
import { AddressFields } from '../components/AddressFields';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field } from '../components/Field';
import { ConfirmIssueDialog, IssuedDialog } from '../components/IssueDialog';
import { ItemsTable } from '../components/ItemsTable';
import { PdfPreviewDialog } from '../components/PdfPreviewDialog';
import { StatusBadge } from '../components/StatusBadge';
import {
  collectErrors,
  formTotal,
  parseErrors,
  toDraftInput,
  toForm,
  type InvoiceForm,
} from '../lib/invoice-form';
import { notifyError, notifySuccess } from '../lib/notify';

interface InvoiceEditorProps {
  invoiceId: number;
  onBack: () => void;
  /** Öffnet eine andere Rechnung (z. B. das Duplikat) */
  onOpenInvoice: (id: number) => void;
}

/** Autosave von Entwürfen nach dieser Zeit ohne Eingabe */
const AUTOSAVE_MS = 1500;

function toMap(errors: FieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of errors) {
    if (!(error.field in map)) map[error.field] = error.message;
  }
  return map;
}

export function InvoiceEditor({ invoiceId, onBack, onOpenInvoice }: InvoiceEditorProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceForm | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [issuedOpen, setIssuedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const dirty = useRef(false);
  const latest = useRef<{ form: InvoiceForm | null; invoice: Invoice | null }>({ form: null, invoice: null });

  // Beim Verlassen des Editors (Menü, Navigation) werden noch nicht gespeicherte Eingaben im Entwurf gesichert.
  useEffect(() => {
    latest.current = { form, invoice };
  });
  useEffect(
    () => () => {
      const { form: pending, invoice: current } = latest.current;
      if (dirty.current && pending && current?.status === 'draft') {
        void window.swissbill.invoices.saveDraft(toDraftInput(invoiceId, pending));
      }
    },
    [invoiceId],
  );

  // Kunden zur Auswahl und die Standardwerte zum Zurücksetzen
  useEffect(() => {
    let cancelled = false;
    void Promise.all([window.swissbill.customers.list({}), window.swissbill.settings.get()]).then(
      ([customerResult, settingsResult]) => {
        if (cancelled) return;
        if (customerResult.ok) setCustomers(customerResult.value);
        if (settingsResult.ok) setDefaults(settingsResult.value);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.swissbill.invoices.get({ id: invoiceId }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        notifyError(result.error);
        onBack();
        return;
      }
      setInvoice(result.value);
      setForm(toForm(result.value));
    });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, onBack]);

  const errorList = useMemo(() => {
    if (!form) return [];
    return [...serverErrors, ...(showErrors ? collectErrors(form) : parseErrors(form))];
  }, [form, showErrors, serverErrors]);
  const errors = useMemo(() => toMap(errorList), [errorList]);

  const patch = useCallback((changes: Partial<InvoiceForm>) => {
    setServerErrors([]);
    dirty.current = true;
    setForm((current) => (current ? { ...current, ...changes } : current));
  }, []);

  // Entwürfe werden nach kurzer Pause automatisch gespeichert. Fehler (z. B. unvollständige Eingaben)
  // bleiben still; die Meldungen erscheinen beim ausdrücklichen Speichern oder Ausstellen.
  const autosave = useEffectEvent(async () => {
    if (!form || !invoice || invoice.status !== 'draft' || busy || !dirty.current) return;
    dirty.current = false;
    const result = await window.swissbill.invoices.saveDraft(toDraftInput(invoiceId, form));
    if (result.ok) {
      setInvoice(result.value);
      setSavedAt(new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }));
    } else {
      dirty.current = true;
    }
  });

  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => void autosave(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [form]);

  const handleError = useCallback((error: AppError) => {
    if (error.code === 'VALIDATION' && error.fields && error.fields.length > 0) {
      setServerErrors(error.fields);
      setShowErrors(true);
    } else {
      notifyError(error);
    }
  }, []);

  if (!invoice || !form) {
    return <p>Rechnung wird geladen …</p>;
  }

  const readOnly = invoice.status !== 'draft';
  const total = formTotal(form);

  /** Speichert den Entwurf; liefert `true`, wenn er gespeichert ist. */
  async function save(): Promise<boolean> {
    if (!form) return false;
    const result = await window.swissbill.invoices.saveDraft(toDraftInput(invoiceId, form));
    if (!result.ok) {
      handleError(result.error);
      return false;
    }
    setInvoice(result.value);
    setServerErrors([]);
    dirty.current = false;
    setSavedAt(new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }));
    return true;
  }

  async function changeStatus(action: 'markPaid' | 'reopen' | 'cancel', done: string) {
    setBusy(true);
    try {
      const result = await window.swissbill.invoices[action]({ id: invoiceId });
      setCancelOpen(false);
      if (result.ok) {
        setInvoice(result.value);
        notifySuccess(done);
      } else {
        notifyError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDuplicate() {
    const result = await window.swissbill.invoices.duplicate({ id: invoiceId });
    if (result.ok) onOpenInvoice(result.value.id);
    else notifyError(result.error);
  }

  async function onSave() {
    setBusy(true);
    try {
      if (await save()) notifySuccess('Entwurf gespeichert.');
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    if (!readOnly) {
      setBusy(true);
      try {
        if (!(await save())) return;
      } finally {
        setBusy(false);
      }
    }
    setPreviewOpen(true);
  }

  function onRequestIssue() {
    if (!form) return;
    setShowErrors(true);
    if (collectErrors(form).length > 0) return;
    setConfirmOpen(true);
  }

  async function onConfirmIssue() {
    setBusy(true);
    try {
      if (!(await save())) {
        setConfirmOpen(false);
        return;
      }
      const result = await window.swissbill.invoices.issue({ id: invoiceId });
      setConfirmOpen(false);
      if (!result.ok) {
        handleError(result.error);
        return;
      }
      setInvoice(result.value);
      setForm(toForm(result.value));
      setShowErrors(false);
      setIssuedOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function onSavePdf() {
    const result = await window.swissbill.pdf.save({ invoiceId });
    if (!result.ok) {
      notifyError(result.error);
    } else if ('path' in result.value) {
      notifySuccess(`PDF gespeichert: ${result.value.path}`);
    }
  }

  async function onOpenPdf() {
    const result = await window.swissbill.pdf.open({ invoiceId });
    if (!result.ok) notifyError(result.error);
  }

  return (
    <section className="editor" aria-label="Rechnung bearbeiten">
      <div className="toolbar">
        <Button variant="text" severity="secondary" onClick={onBack}>
          ← Zurück
        </Button>
        <h1 className="toolbar-title">
          {invoice.number ? `Rechnung ${invoice.number}` : 'Neue Rechnung'}
          <StatusBadge status={invoice.status} />
          {savedAt && !readOnly ? (
            <small className="saved-at" data-testid="saved-at">
              Gespeichert um {savedAt}
            </small>
          ) : null}
        </h1>
        <div className="toolbar-actions">
          {readOnly ? (
            <>
              {invoice.status === 'issued' ? (
                <Button variant="outlined" onClick={() => void changeStatus('markPaid', 'Als bezahlt markiert.')} disabled={busy}>
                  Als bezahlt markieren
                </Button>
              ) : null}
              {invoice.status === 'paid' ? (
                <Button variant="outlined" severity="secondary" onClick={() => void changeStatus('reopen', 'Zurückgesetzt auf ausgestellt.')} disabled={busy}>
                  Zurücksetzen
                </Button>
              ) : null}
              {invoice.status === 'issued' || invoice.status === 'paid' ? (
                <Button variant="outlined" severity="danger" onClick={() => setCancelOpen(true)} disabled={busy}>
                  Stornieren
                </Button>
              ) : null}
              <Button variant="outlined" severity="secondary" onClick={() => void onDuplicate()}>
                Duplizieren
              </Button>
              <Button variant="outlined" onClick={() => void onPreview()}>
                Vorschau
              </Button>
              <Button variant="outlined" onClick={() => void onOpenPdf()}>
                PDF öffnen / drucken
              </Button>
              <Button onClick={() => void onSavePdf()}>PDF speichern</Button>
            </>
          ) : (
            <>
              <Button variant="outlined" onClick={() => void onSave()} disabled={busy}>
                Speichern
              </Button>
              <Button variant="outlined" onClick={() => void onPreview()} disabled={busy}>
                Vorschau
              </Button>
              <Button onClick={onRequestIssue} disabled={busy}>
                Ausstellen
              </Button>
            </>
          )}
        </div>
      </div>

      {readOnly ? (
        <Message.Root severity="info">
          <Message.Content>
            <Message.Text>
              {invoice.status === 'cancelled'
                ? 'Diese Rechnung ist storniert. Ihre Nummer bleibt vergeben; der Inhalt kann nicht mehr geändert werden.'
                : 'Diese Rechnung ist ausgestellt und kann nicht mehr geändert werden.'}
            </Message.Text>
          </Message.Content>
        </Message.Root>
      ) : null}

      {errorList.length > 0 && !readOnly ? (
        <Message.Root severity="error" role="alert">
          <Message.Content>
            <Message.Text>
              Die Rechnung kann noch nicht ausgestellt werden. Bitte die markierten Felder prüfen ({errorList.length}).
            </Message.Text>
          </Message.Content>
        </Message.Root>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h2>Absender</h2>
          {!readOnly && defaults ? (
            <Button variant="text" severity="secondary" onClick={() => patch({ sender: { ...defaults.sender, iban: formatIban(defaults.sender.iban) } })}>
              Auf Standard zurücksetzen
            </Button>
          ) : null}
        </div>
        <AddressFields<Sender>
          prefix="sender"
          value={form.sender}
          onChange={(sender) => patch({ sender })}
          errors={errors}
          disabled={readOnly}
          withIban
        />
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Rechnungsempfänger</h2>
          {!readOnly ? (
            <select
              aria-label="Kunde übernehmen"
              className="status-select"
              value=""
              onChange={(e) => {
                const customer = customers.find((c) => c.id === Number(e.target.value));
                if (customer) {
                  patch({
                    customerId: customer.id,
                    debtor: {
                      name: customer.name,
                      street: customer.street,
                      houseNo: customer.houseNo,
                      zip: customer.zip,
                      city: customer.city,
                      country: customer.country,
                    },
                  });
                }
              }}
            >
              <option value="">Kunde übernehmen …</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}, {c.city}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <AddressFields<Address>
          prefix="debtor"
          value={form.debtor}
          onChange={(debtor) => patch({ debtor })}
          errors={errors}
          disabled={readOnly}
        />
        {!readOnly && form.debtor.name.trim() !== '' && (form.debtor.zip.trim() === '' || form.debtor.city.trim() === '') ? (
          <p className="hint" data-testid="debtor-qr-hint">
            Ohne PLZ und Ort steht der Empfänger nicht im QR-Zahlteil (das Feld «Zahlbar durch» bleibt dort leer).
            Auf der Rechnung erscheint er trotzdem.
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Rechnung</h2>
        <div className="grid">
          <Field label="Rechnungsdatum" htmlFor="invoiceDate" error={errors['invoiceDate']} className="span-3">
            <InputText
              id="invoiceDate"
              type="date"
              fluid
              value={form.invoiceDate}
              onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ invoiceDate: e.target.value })}
              invalid={!!errors['invoiceDate']}
              disabled={readOnly}
            />
          </Field>
          <Field label="Zahlbar bis" htmlFor="dueDate" error={errors['dueDate']} className="span-3">
            <InputText
              id="dueDate"
              type="date"
              fluid
              value={form.dueDate}
              onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ dueDate: e.target.value })}
              invalid={!!errors['dueDate']}
              disabled={readOnly}
            />
          </Field>
        </div>
      </div>

      <div className="card">
        <h2>Positionen</h2>
        <ItemsTable items={form.items} onChange={(items) => patch({ items })} errors={errors} disabled={readOnly} />
        <div className="total-row">
          <span>Total CHF</span>
          <strong data-testid="total">{formatChf(total)}</strong>
        </div>
        {errors['total'] ? (
          <small className="field-error" role="alert">
            {errors['total']}
          </small>
        ) : null}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Schlusstext</h2>
          {!readOnly && defaults ? (
            <Button
              variant="text"
              severity="secondary"
              onClick={() => patch({ closingText: defaults.defaultClosingText ?? '' })}
            >
              Auf Standard zurücksetzen
            </Button>
          ) : null}
        </div>
        <Field label="Text unter der Positionstabelle (optional)" htmlFor="closingText" error={errors['closingText']}>
          <Textarea
            id="closingText"
            rows={3}
            value={form.closingText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch({ closingText: e.target.value })}
            disabled={readOnly}
          />
        </Field>
      </div>

      <ConfirmIssueDialog
        open={confirmOpen}
        totalRappen={total}
        busy={busy}
        onConfirm={() => void onConfirmIssue()}
        onCancel={() => setConfirmOpen(false)}
      />
      <IssuedDialog
        open={issuedOpen}
        number={invoice.number ?? ''}
        onSave={() => void onSavePdf()}
        onOpen={() => void onOpenPdf()}
        onClose={() => setIssuedOpen(false)}
      />
      <ConfirmDialog
        open={cancelOpen}
        title="Rechnung stornieren?"
        confirmLabel="Stornieren"
        danger
        busy={busy}
        onConfirm={() => void changeStatus('cancel', 'Rechnung storniert.')}
        onCancel={() => setCancelOpen(false)}
      >
        <p>
          Die Rechnung {invoice.number} wird storniert. <strong>Das kann nicht rückgängig gemacht werden.</strong> Die
          Nummer bleibt vergeben und die Rechnung bleibt in der Liste sichtbar. Das PDF zeigt danach «STORNIERT» und
          enthält keinen Zahlteil mehr.
        </p>
      </ConfirmDialog>
      <PdfPreviewDialog invoiceId={invoiceId} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </section>
  );
}
