export type AppErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'IMMUTABLE' | 'IO' | 'DB';

export interface FieldError {
  /** z. B. `debtor.name` oder `items.0.description` */
  field: string;
  message: string;
}

export interface AppError {
  code: AppErrorCode;
  /** deutsch, benutzerverständlich */
  message: string;
  fields?: FieldError[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(
  code: AppErrorCode,
  message: string,
  fields?: FieldError[],
): Result<T> {
  return { ok: false, error: fields ? { code, message, fields } : { code, message } };
}

export function validationError<T = never>(fields: FieldError[]): Result<T> {
  return err('VALIDATION', 'Bitte die markierten Felder prüfen.', fields);
}

/** Wird von Services geworfen und im IPC-Wrapper in ein `Result` umgewandelt. */
export class AppException extends Error {
  readonly error: AppError;

  constructor(code: AppErrorCode, message: string, fields?: FieldError[]) {
    super(message);
    this.name = 'AppException';
    this.error = fields ? { code, message, fields } : { code, message };
  }
}
