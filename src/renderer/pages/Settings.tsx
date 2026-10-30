import { useEffect, useState, type ChangeEvent } from 'react';
import { Button } from '@primereact/ui/button';
import { InputText } from '@primereact/ui/inputtext';
import { Message } from '@primereact/ui/message';
import { Textarea } from '@primereact/ui/textarea';
import { formatIban, isQrIban, validateIban } from '../../shared/domain/iban';
import type { Sender } from '../../shared/domain/invoice';
import type { Settings as SettingsData } from '../../shared/domain/settings';
import type { DbInfo } from '../../shared/ipc/db';
import type { FieldError } from '../../shared/ipc/errors';
import { AddressFields } from '../components/AddressFields';
import { Field } from '../components/Field';
import { backupDatabase } from '../lib/backup';
import { notifyError, notifySuccess } from '../lib/notify';

interface SettingsForm {
  sender: Sender;
  invoicePrefix: string;
  defaultClosingText: string;
  defaultPaymentDays: string;
}

function toForm(settings: SettingsData): SettingsForm {
  return {
    sender: { ...settings.sender, iban: formatIban(settings.sender.iban) },
    invoicePrefix: settings.invoicePrefix,
    defaultClosingText: settings.defaultClosingText ?? '',
    defaultPaymentDays: String(settings.defaultPaymentDays),
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toMap(errors: FieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of errors) {
    if (!(error.field in map)) map[error.field] = error.message;
  }
  return map;
}

export function Settings() {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.swissbill.settings.get().then((result) => {
      if (cancelled) return;
      if (result.ok) setForm(toForm(result.value));
      else notifyError(result.error);
    });
    void window.swissbill.db.info().then((result) => {
      if (!cancelled && result.ok) setDbInfo(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function backup() {
    setBackingUp(true);
    try {
      await backupDatabase();
    } finally {
      setBackingUp(false);
    }
  }

  if (!form) return <p>Einstellungen werden geladen …</p>;

  const setupNeeded = form.sender.name.trim() === '';
  const iban = form.sender.iban;
  const ibanValid = validateIban(iban) === null;

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const days = Number(form.defaultPaymentDays);
      const result = await window.swissbill.settings.save({
        sender: form.sender,
        invoicePrefix: form.invoicePrefix,
        defaultClosingText: form.defaultClosingText.trim() === '' ? null : form.defaultClosingText,
        defaultPaymentDays: form.defaultPaymentDays.trim() === '' || Number.isNaN(days) ? -1 : days,
      });
      if (!result.ok) {
        if (result.error.code === 'VALIDATION' && result.error.fields) setErrors(toMap(result.error.fields));
        else notifyError(result.error);
        return;
      }
      setErrors({});
      setForm(toForm(result.value));
      notifySuccess('Einstellungen gespeichert.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor">
      <h1>Einstellungen</h1>

      {setupNeeded ? (
        <Message.Root severity="info">
          <Message.Content>
            <Message.Text>
              Bitte erfassen Sie zuerst Ihren Absender und Ihre IBAN. Beides wird in neue Rechnungen übernommen.
            </Message.Text>
          </Message.Content>
        </Message.Root>
      ) : null}

      <div className="card">
        <h2>Absender und Zahlungsangaben</h2>
        <AddressFields<Sender>
          prefix="sender"
          value={form.sender}
          onChange={(sender) => setForm({ ...form, sender })}
          errors={errors}
          withIban
        />
        {ibanValid ? (
          <p className="hint" data-testid="reference-hint">
            {isQrIban(iban)
              ? 'QR-IBAN erkannt: Die Zahlungsreferenz ist eine QR-Referenz (QRR).'
              : 'Normale IBAN erkannt: Die Zahlungsreferenz ist eine Creditor Reference (SCOR).'}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>Rechnungen</h2>
        <div className="grid">
          <Field label="Rechnungspräfix" htmlFor="invoicePrefix" error={errors['invoicePrefix']} className="span-3">
            <InputText
              id="invoicePrefix"
              fluid
              value={form.invoicePrefix}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, invoicePrefix: e.target.value })}
              invalid={!!errors['invoicePrefix']}
            />
          </Field>
          <Field label="Zahlungsfrist (Tage)" htmlFor="defaultPaymentDays" error={errors['defaultPaymentDays']} className="span-3">
            <InputText
              id="defaultPaymentDays"
              fluid
              inputMode="numeric"
              value={form.defaultPaymentDays}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, defaultPaymentDays: e.target.value })}
              invalid={!!errors['defaultPaymentDays']}
            />
          </Field>
        </div>
        <Field label="Standard-Schlusstext (optional, z. B. Zahlungsbedingungen)" htmlFor="defaultClosingText" error={errors['defaultClosingText']}>
          <Textarea
            id="defaultClosingText"
            rows={3}
            value={form.defaultClosingText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, defaultClosingText: e.target.value })}
          />
        </Field>
        <p className="hint">Änderungen gelten nur für neue Entwürfe, nie für bereits erstellte Rechnungen.</p>
      </div>

      <div>
        <Button onClick={() => void save()} disabled={saving}>
          Speichern
        </Button>
      </div>

      <div className="card">
        <h2>Datenbank und Sicherung</h2>
        {dbInfo ? (
          <dl className="db-info">
            <dt>Speicherort</dt>
            <dd data-testid="db-path">{dbInfo.path}</dd>
            <dt>Grösse</dt>
            <dd>{formatSize(dbInfo.sizeBytes)}</dd>
            <dt>Schemaversion</dt>
            <dd>{dbInfo.schemaVersion}</dd>
          </dl>
        ) : null}
        <p className="hint">
          Alle Rechnungen liegen in dieser einen Datei. Zum Sichern genügt eine Kopie. Zum Wiederherstellen die
          Anwendung schliessen und die Sicherung unter dem Namen swissbill.db in den Speicherort kopieren.
        </p>
        <Button variant="outlined" onClick={() => void backup()} disabled={backingUp}>
          Datenbank sichern
        </Button>
      </div>
    </section>
  );
}
