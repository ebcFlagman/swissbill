import {
  REPORT_MESSAGE_MAX,
  REPORT_SOURCE_MAX,
  REPORT_STACK_MAX,
  type ReportInput,
} from '@shared/ipc/log';

interface ReportApi {
  report(input: ReportInput): Promise<unknown>;
}

interface Target {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

function toInput(message: string, error: unknown, source?: string): ReportInput {
  const stack = error instanceof Error ? error.stack : undefined;
  return {
    message: (message.trim() === '' ? 'Unbekannter Fehler' : message).slice(0, REPORT_MESSAGE_MAX),
    ...(stack ? { stack: stack.slice(0, REPORT_STACK_MAX) } : {}),
    ...(source ? { source: source.slice(0, REPORT_SOURCE_MAX) } : {}),
  };
}

/**
 * Reports unexpected errors of the user interface to the main process, which writes them to the log.
 * Only the error text and the stack are sent, never form or invoice contents. Failing to report is ignored.
 */
export function installErrorReporting(target: Target, api: ReportApi): () => void {
  const send = (input: ReportInput) => {
    try {
      void Promise.resolve(api.report(input)).catch(() => undefined);
    } catch {
      // reporting must never cause another error
    }
  };
  const onError = (event: Event) => {
    const { message, error, filename } = event as Event & {
      message?: string;
      error?: unknown;
      filename?: string;
    };
    send(toInput(message ?? (error instanceof Error ? error.message : ''), error, filename));
  };
  const onRejection = (event: Event) => {
    const { reason } = event as Event & { reason?: unknown };
    send(toInput(reason instanceof Error ? reason.message : String(reason ?? ''), reason));
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
