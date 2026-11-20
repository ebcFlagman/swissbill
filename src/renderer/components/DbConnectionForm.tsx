import { useEffect, useState, type ChangeEvent } from 'react';
import { Button } from '@primereact/ui/button';
import { InputText } from '@primereact/ui/inputtext';
import { Message } from '@primereact/ui/message';
import {
  dbTypeLabel,
  defaultPort,
  isDifferentDatabase,
  isServerType,
  validateConnection,
  type DbConnectionSettings,
  type DbType,
} from '@shared/domain/db-connection';
import type {
  DbConnectionState,
  DbConnectionTestResult,
  FailedStage,
  PasswordAction,
} from '@shared/ipc/db-connection';
import type { FieldError } from '@shared/ipc/errors';
import { notifyError } from '../lib/notify';
import { ConfirmDialog } from './ConfirmDialog';
import { Field } from './Field';

const TYPES: DbType[] = ['sqlite', 'postgres', 'mysql', 'mariadb'];

const STAGE_LABEL: Record<FailedStage, string> = {
  reachable: 'Erreichbarkeit',
  authentication: 'Anmeldung',
  database: 'Datenbank',
  permissions: 'Rechte',
  schema: 'Schema',
};

interface ConnectionForm {
  type: DbType;
  host: string;
  port: string;
  database: string;
  user: string;
  tlsEnabled: boolean;
  caPath: string | null;
  /** Newly entered password; empty = unchanged (the stored password is never shown) */
  password: string;
  removePassword: boolean;
}

function toForm(state: DbConnectionState): ConnectionForm {
  const s = state.settings;
  return {
    type: s?.type ?? 'sqlite',
    host: s?.host ?? '',
    port: s ? String(s.port) : '',
    database: s?.database ?? '',
    user: s?.user ?? '',
    tlsEnabled: s?.tls.enabled ?? true,
    caPath: s?.tls.caPath ?? null,
    password: '',
    removePassword: false,
  };
}

function toSettings(form: ConnectionForm): DbConnectionSettings {
  const port = Number(form.port);
  return {
    type: form.type,
    host: form.host.trim(),
    port: form.port.trim() === '' || Number.isNaN(port) ? 0 : port,
    database: form.database.trim(),
    user: form.user,
    tls: { enabled: form.tlsEnabled, caPath: form.tlsEnabled ? form.caPath : null },
  };
}

function toMap(errors: FieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of errors) if (!(error.field in map)) map[error.field] = error.message;
  return map;
}

function passwordAction(form: ConnectionForm): PasswordAction {
  if (form.removePassword) return { action: 'remove' };
  if (form.password !== '') return { action: 'set', value: form.password };
  return { action: 'keep' };
}

interface DbConnectionFormProps {
  /** Called after the state was (re)loaded, e.g. so the surrounding page can show the active mode */
  onState?: (state: DbConnectionState) => void;
}

/**
 * Where the app keeps its data: local SQLite (default) or an own PostgreSQL/MySQL/MariaDB server.
 * The password is sent to the main process only when saving and is never shown again (FR-005, FR-008).
 */
export function DbConnectionForm({ onState }: DbConnectionFormProps) {
  const [state, setState] = useState<DbConnectionState | null>(null);
  const [form, setForm] = useState<ConnectionForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DbConnectionTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.swissbill.dbConnection.get().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState(result.value);
        setForm(toForm(result.value));
        onState?.(result.value);
      } else notifyError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [onState]);

  if (!form || !state) return <p>Datenbankverbindung wird geladen …</p>;

  const server = isServerType(form.type);
  const update = (patch: Partial<ConnectionForm>) => setForm({ ...form, ...patch });

  function changeType(type: DbType) {
    if (!form) return;
    const previousDefault = isServerType(form.type) ? String(defaultPort(form.type)) : '';
    const port =
      isServerType(type) && (form.port === '' || form.port === previousDefault)
        ? String(defaultPort(type))
        : form.port;
    setForm({ ...form, type, port });
    setErrors({});
  }

  async function pickCa() {
    const result = await window.swissbill.dbConnection.pickCaFile();
    if (!result.ok) return notifyError(result.error);
    if ('path' in result.value) update({ caPath: result.value.path });
    else if ('error' in result.value) setErrors({ ...errors, 'tls.caPath': result.value.error });
  }

  async function runTest() {
    if (!form) return;
    const settings = toSettings(form);
    const fieldErrors = validateConnection(settings);
    if (fieldErrors.length > 0) {
      setErrors(toMap(fieldErrors));
      return;
    }
    setErrors({});
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.swissbill.dbConnection.test({
        settings,
        password: passwordAction(form),
      });
      if (result.ok) setTestResult(result.value);
      else notifyError(result.error);
    } finally {
      setTesting(false);
    }
  }

  /** Validates, and asks first if this means working with another database (nothing is moved) */
  function requestSave() {
    if (!form || !state) return;
    const settings = toSettings(form);
    const fieldErrors = validateConnection(settings);
    if (fieldErrors.length > 0) {
      setErrors(toMap(fieldErrors));
      return;
    }
    if (isDifferentDatabase(state.settings, settings)) setConfirmSwitch(true);
    else void save();
  }

  async function save() {
    if (!form) return;
    setConfirmSwitch(false);
    const settings = toSettings(form);
    setSaving(true);
    try {
      const result = await window.swissbill.dbConnection.save({
        settings,
        password: passwordAction(form),
      });
      if (!result.ok) {
        if (result.error.code === 'VALIDATION' && result.error.fields)
          setErrors(toMap(result.error.fields));
        else notifyError(result.error);
        return;
      }
      setErrors({});
      setRestartNeeded(true);
      const next = await window.swissbill.dbConnection.get();
      if (next.ok) {
        setState(next.value);
        setForm(toForm(next.value));
      }
    } finally {
      setSaving(false);
    }
  }

  const keychainProblem = server && !state.keychainAvailable;
  const passwordHint = form.removePassword
    ? 'Das Passwort wird beim Speichern entfernt.'
    : state.passwordMissing
      ? 'Das gespeicherte Passwort fehlt im Schlüsselbund dieses Geräts. Bitte neu eingeben.'
      : state.passwordStored
        ? 'Passwort gespeichert.'
        : 'Kein Passwort gespeichert.';

  return (
    <div data-testid="db-connection">
      {state.configError ? (
        <Message.Root severity="warn">
          <Message.Content>
            <Message.Text>{state.configError}</Message.Text>
          </Message.Content>
        </Message.Root>
      ) : null}

      <div className="grid">
        <Field label="Datenbanktyp" htmlFor="dbType" className="span-4">
          <select
            id="dbType"
            className="status-select"
            value={form.type}
            onChange={(e) => changeType(e.target.value as DbType)}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {dbTypeLabel(type)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {server ? (
        <>
          <div className="grid">
            <Field label="Server" htmlFor="dbHost" error={errors['host']} className="span-4">
              <InputText
                id="dbHost"
                fluid
                value={form.host}
                onChange={(e: ChangeEvent<HTMLInputElement>) => update({ host: e.target.value })}
                invalid={!!errors['host']}
              />
            </Field>
            <Field label="Port" htmlFor="dbPort" error={errors['port']} className="span-2">
              <InputText
                id="dbPort"
                fluid
                inputMode="numeric"
                value={form.port}
                onChange={(e: ChangeEvent<HTMLInputElement>) => update({ port: e.target.value })}
                invalid={!!errors['port']}
              />
            </Field>
            <Field
              label="Datenbankname"
              htmlFor="dbName"
              error={errors['database']}
              className="span-3"
            >
              <InputText
                id="dbName"
                fluid
                value={form.database}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  update({ database: e.target.value })
                }
                invalid={!!errors['database']}
              />
            </Field>
            <Field label="Benutzer" htmlFor="dbUser" error={errors['user']} className="span-3">
              <InputText
                id="dbUser"
                fluid
                autoComplete="off"
                value={form.user}
                onChange={(e: ChangeEvent<HTMLInputElement>) => update({ user: e.target.value })}
                invalid={!!errors['user']}
              />
            </Field>
            <Field
              label="Passwort"
              htmlFor="dbPassword"
              error={errors['password']}
              className="span-4"
            >
              <InputText
                id="dbPassword"
                fluid
                type="password"
                autoComplete="new-password"
                disabled={keychainProblem}
                value={form.password}
                placeholder={state.passwordStored ? 'gespeichert, zum Ersetzen neu eingeben' : ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  update({ password: e.target.value, removePassword: false })
                }
                invalid={!!errors['password']}
              />
            </Field>
          </div>
          <p className="hint" data-testid="db-password-status">
            {passwordHint}
          </p>
          {state.passwordStored || form.removePassword ? (
            <div className="actions">
              <Button
                variant="outlined"
                onClick={() => update({ password: '', removePassword: !form.removePassword })}
              >
                {form.removePassword ? 'Entfernen abbrechen' : 'Passwort entfernen'}
              </Button>
            </div>
          ) : null}
          {keychainProblem ? (
            <Message.Root severity="warn">
              <Message.Content>
                <Message.Text>
                  Auf diesem Gerät ist kein Schlüsselbund verfügbar. Ein Passwort kann deshalb nicht
                  gespeichert werden (unter Linux wird z. B. GNOME Keyring oder KWallet benötigt).
                </Message.Text>
              </Message.Content>
            </Message.Root>
          ) : null}

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={form.tlsEnabled}
                onChange={(e) => update({ tlsEnabled: e.target.checked })}
              />{' '}
              Verbindung verschlüsseln (TLS)
            </label>
          </div>
          {form.tlsEnabled ? (
            <div className="field">
              <div className="actions">
                <Button variant="outlined" onClick={() => void pickCa()}>
                  CA-Zertifikat wählen …
                </Button>
                {form.caPath ? (
                  <Button variant="outlined" onClick={() => update({ caPath: null })}>
                    Zertifikat entfernen
                  </Button>
                ) : null}
              </div>
              <p className="hint" data-testid="db-ca-path">
                {form.caPath
                  ? `CA-Zertifikat: ${form.caPath}`
                  : 'Das Zertifikat des Servers wird immer geprüft. Hat Ihr Server ein eigenes Zertifikat, wählen Sie hier dessen CA-Zertifikat.'}
              </p>
              {errors['tls.caPath'] ? (
                <small className="field-error" role="alert">
                  {errors['tls.caPath']}
                </small>
              ) : null}
            </div>
          ) : (
            <Message.Root severity="warn">
              <Message.Content>
                <Message.Text>
                  Ohne Verschlüsselung werden alle Daten und das Passwort unverschlüsselt über das
                  Netzwerk übertragen. Nur in einem vertrauenswürdigen Netz verwenden.
                </Message.Text>
              </Message.Content>
            </Message.Root>
          )}
        </>
      ) : null}

      {server && testResult ? (
        <Message.Root severity={testResult.ok ? 'success' : 'error'} role="status">
          <Message.Content>
            <Message.Text data-testid="db-test-result">
              {testResult.ok || !testResult.failedStage
                ? testResult.message
                : `Fehlgeschlagen bei «${STAGE_LABEL[testResult.failedStage]}»: ${testResult.message}`}
            </Message.Text>
          </Message.Content>
        </Message.Root>
      ) : null}

      <div className="actions">
        {server ? (
          <Button variant="outlined" onClick={() => void runTest()} disabled={testing || saving}>
            {testing ? 'Verbindung wird geprüft …' : 'Verbindung testen'}
          </Button>
        ) : null}
        <Button
          onClick={requestSave}
          disabled={saving || (keychainProblem && form.password !== '')}
        >
          Verbindung festlegen
        </Button>
      </div>

      <ConfirmDialog
        open={confirmSwitch}
        title="Andere Datenbank verwenden?"
        confirmLabel="Verbindung festlegen"
        busy={saving}
        onConfirm={() => void save()}
        onCancel={() => setConfirmSwitch(false)}
      >
        <p data-testid="switch-warning">
          {server
            ? 'Die Anwendung arbeitet nach dem Neustart mit dieser Datenbank. '
            : 'Die Anwendung arbeitet nach dem Neustart wieder mit der lokalen Datenbank auf diesem Gerät. '}
          <strong>Vorhandene Daten werden nicht übernommen.</strong> Weder wird etwas kopiert noch
          gelöscht: Rechnungen und Kunden bleiben in der bisherigen Datenbank und sind dort wieder
          sichtbar, wenn Sie zurückwechseln.
        </p>
      </ConfirmDialog>

      {restartNeeded ? (
        <Message.Root severity="info">
          <Message.Content>
            <Message.Text>
              Die Verbindung wurde gespeichert und gilt nach einem Neustart. Bis dahin arbeitet die
              Anwendung mit der bisherigen Datenbank.
            </Message.Text>
            <div className="actions">
              <Button onClick={() => void window.swissbill.app.relaunch()}>
                Jetzt neu starten
              </Button>
            </div>
          </Message.Content>
        </Message.Root>
      ) : null}
    </div>
  );
}
