import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const MAX_BYTES = 1_000_000;

let logFile: string | null = null;

/**
 * Lokales Logging in eine Datei (rotiert bei 1 MB, eine Vorgängerdatei).
 * Es gibt keine Telemetrie. Rechnungsinhalte, Namen, Adressen und IBANs dürfen NICHT geloggt werden,
 * nur technische Meldungen.
 */
export function initLogger(dir: string): void {
  mkdirSync(dir, { recursive: true });
  logFile = join(dir, 'swissbill.log');
}

function write(level: LogLevel, message: string): void {
  const line = `${new Date().toISOString()} ${level} ${message}\n`;
  if (!logFile) {
    process.stderr.write(line);
    return;
  }
  try {
    try {
      if (statSync(logFile).size > MAX_BYTES) renameSync(logFile, `${logFile}.1`);
    } catch {
      // Datei existiert noch nicht
    }
    appendFileSync(logFile, line, 'utf8');
  } catch {
    process.stderr.write(line);
  }
}

export const log = {
  info: (message: string) => write('INFO', message),
  warn: (message: string) => write('WARN', message),
  error: (message: string, cause?: unknown) =>
    write('ERROR', cause instanceof Error ? `${message}: ${cause.message}` : message),
};
