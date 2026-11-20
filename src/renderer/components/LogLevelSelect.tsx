import { useEffect, useState } from 'react';
import { LOG_LEVELS, type LogLevel } from '@shared/ipc/log';
import { notifyError, notifySuccess } from '../lib/notify';
import { Field } from './Field';

const LABELS: Record<LogLevel, string> = {
  error: 'Nur Fehler',
  warn: 'Warnungen und Fehler',
  info: 'Information (Standard)',
  debug: 'Debug (ausführlich)',
};

/**
 * Choice of the log level of this device. It works without a database (also in recovery mode), takes effect
 * immediately and is stored only on this device.
 */
export function LogLevelSelect() {
  const [level, setLevel] = useState<LogLevel | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.swissbill.log.getLevel().then((result) => {
      if (!cancelled && result.ok) setLevel(result.value.level);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(next: LogLevel) {
    const previous = level;
    setLevel(next);
    const result = await window.swissbill.log.setLevel({ level: next });
    if (result.ok) notifySuccess('Der Detailgrad des Protokolls wurde geändert.');
    else {
      notifyError(result.error);
      // the level applies until the next start even if it could not be stored
      if (result.error.code !== 'IO') setLevel(previous);
    }
  }

  return (
    <>
      <Field label="Detailgrad" htmlFor="logLevel" className="span-4">
        <select
          id="logLevel"
          className="status-select"
          value={level ?? 'info'}
          disabled={level === null}
          onChange={(e) => void change(e.target.value as LogLevel)}
        >
          {LOG_LEVELS.map((value) => (
            <option key={value} value={value}>
              {LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <p className="hint">
        Gilt nur für dieses Gerät und sofort. Die Protokolldatei enthält keine Rechnungsdaten,
        Namen, Adressen, IBANs oder Passwörter.
      </p>
    </>
  );
}
