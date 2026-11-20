import type { QueryFailedError } from 'typeorm';
import { AppException } from '../../shared/ipc/errors';

/** Translates a database error into an application error with a clear German message. */
export function toAppException(error: QueryFailedError): AppException {
  const message = error.message;
  if (/UNIQUE constraint failed: invoices\.number|duplicate.*number/i.test(message)) {
    return new AppException('IMMUTABLE', 'Diese Rechnungsnummer ist bereits vergeben.');
  }
  if (/UNIQUE constraint failed: invoice_items\.invoice_id|duplicate.*position/i.test(message)) {
    return new AppException('VALIDATION', 'Die Positionen der Rechnung sind nicht eindeutig nummeriert.');
  }
  if (/constraint/i.test(message)) {
    return new AppException('VALIDATION', 'Die Daten verletzen eine Datenregel und wurden nicht gespeichert.');
  }
  return new AppException('DB', 'Es ist ein Datenbankfehler aufgetreten. Details stehen im Protokoll.');
}
