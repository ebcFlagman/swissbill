import type { QueryFailedError } from 'typeorm';
import { AppException } from '@shared/ipc/errors';
import { isUniqueViolation } from './adapters';

/** Table/constraint details some drivers put next to the message (PostgreSQL). */
function driverDetail(error: QueryFailedError): string {
  const d = error.driverError as
    { table?: unknown; constraint?: unknown; detail?: unknown } | undefined;
  return [d?.table, d?.constraint, d?.detail].filter((v) => typeof v === 'string').join(' ');
}

/** Translates a database error into an application error with a clear German message. */
export function toAppException(error: QueryFailedError): AppException {
  const message = error.message;
  if (isUniqueViolation(error)) {
    // Duplicate item position, otherwise the only other unique key a write can hit is the invoice number
    if (/invoice_items|position/i.test(`${message} ${driverDetail(error)}`)) {
      return new AppException(
        'VALIDATION',
        'Die Positionen der Rechnung sind nicht eindeutig nummeriert.',
      );
    }
    return new AppException('IMMUTABLE', 'Diese Rechnungsnummer ist bereits vergeben.');
  }
  if (/constraint/i.test(message)) {
    return new AppException(
      'VALIDATION',
      'Die Daten verletzen eine Datenregel und wurden nicht gespeichert.',
    );
  }
  return new AppException(
    'DB',
    'Es ist ein Datenbankfehler aufgetreten. Details stehen im Protokoll.',
  );
}
