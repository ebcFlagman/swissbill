import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const MAX_BYTES = 1_000_000;

let logFile: string | null = null;
const secrets = new Set<string>();

/** Registers a secret (e.g. the database password) that must never appear in the log. */
export function redactFromLogs(secret: string): void {
  if (secret.length >= 3) secrets.add(secret);
}

function redact(message: string): string {
  let result = message;
  for (const secret of secrets) result = result.split(secret).join('***');
  return result;
}

/**
 * Local logging to a file (rotated at 1 MB, one previous file).
 * There is no telemetry. Invoice contents, names, addresses and IBANs must NOT be logged,
 * only technical messages.
 */
export function initLogger(dir: string): void {
  mkdirSync(dir, { recursive: true });
  logFile = join(dir, 'swissbill.log');
}

function write(level: LogLevel, message: string): void {
  const line = `${new Date().toISOString()} ${level} ${redact(message)}\n`;
  if (!logFile) {
    process.stderr.write(line);
    return;
  }
  try {
    try {
      if (statSync(logFile).size > MAX_BYTES) renameSync(logFile, `${logFile}.1`);
    } catch {
      // file does not exist yet
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
