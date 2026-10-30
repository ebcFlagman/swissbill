import type { ZodType } from 'zod';
import { AppException, err, ok, type Result } from '../../shared/ipc/errors';
import { log } from '../log';

type Handler<I, O> = (input: I) => O | Promise<O>;

function isResult(value: unknown): value is Result<unknown> {
  return typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean';
}

/**
 * Macht aus einer Funktion einen IPC-tauglichen Handler:
 * Eingabe mit zod validieren, Ausnahmen in `Result` umwandeln. Es werden nie Ausnahmen an den Renderer gereicht.
 */
export function wrapHandler<I, O>(
  schema: ZodType<I>,
  handler: Handler<I, O | Result<O>>,
): (rawInput: unknown) => Promise<Result<O>> {
  return async (rawInput) => {
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) {
      return err(
        'VALIDATION',
        'Ungültige Eingabe.',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    try {
      const value = await handler(parsed.data);
      return isResult(value) ? (value as Result<O>) : ok(value as O);
    } catch (error) {
      if (error instanceof AppException) return { ok: false, error: error.error };
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('IMMUTABLE:')) {
        return err('IMMUTABLE', message.slice(message.indexOf('IMMUTABLE:') + 'IMMUTABLE:'.length).trim());
      }
      log.error('Unerwarteter Fehler im IPC-Handler', error);
      return err('DB', 'Es ist ein unerwarteter Fehler aufgetreten. Details stehen im Protokoll.');
    }
  };
}
