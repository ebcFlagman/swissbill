import { describe, expect, it, vi } from 'vitest';
import { ok } from '@shared/ipc/errors';
import { installErrorReporting } from '../../src/renderer/lib/report-errors';

function setup(report = vi.fn(async () => ok(undefined))) {
  const target = new EventTarget();
  const uninstall = installErrorReporting(target, { report });
  return { target, report, uninstall };
}

function errorEvent(message: string, error?: unknown): Event {
  return Object.assign(new Event('error'), { message, error, filename: 'App.tsx' });
}

function rejectionEvent(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason });
}

describe('Fehlermeldung aus der Oberfläche (FR-013)', () => {
  it('meldet ein error-Ereignis mit Text, Stack und Herkunft', () => {
    const { target, report } = setup();
    const error = new Error('kaputt');
    target.dispatchEvent(errorEvent('kaputt', error));
    expect(report).toHaveBeenCalledWith({
      message: 'kaputt',
      stack: error.stack,
      source: 'App.tsx',
    });
  });

  it('meldet eine abgelehnte Zusage, auch wenn der Grund kein Error ist', () => {
    const { target, report } = setup();
    target.dispatchEvent(rejectionEvent(new Error('abgelehnt')));
    target.dispatchEvent(rejectionEvent('nur Text'));
    expect(report).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: 'abgelehnt', stack: expect.any(String) }),
    );
    expect(report).toHaveBeenNthCalledWith(2, { message: 'nur Text' });
  });

  it('kürzt zu lange Texte auf die erlaubte Länge', () => {
    const { target, report } = setup();
    target.dispatchEvent(
      errorEvent('x'.repeat(900), Object.assign(new Error('x'), { stack: 's'.repeat(9000) })),
    );
    const input = (report.mock.calls as unknown as [{ message: string; stack: string }][])[0]![0];
    expect(input.message).toHaveLength(500);
    expect(input.stack).toHaveLength(4000);
  });

  it('ersetzt einen leeren Text durch einen Standardtext', () => {
    const { target, report } = setup();
    target.dispatchEvent(errorEvent(''));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unbekannter Fehler' }));
  });

  it('verschluckt Fehler beim Melden (keine Endlosschleife)', async () => {
    const report = vi.fn(async () => {
      throw new Error('IPC kaputt');
    });
    const { target } = setup(report as never);
    target.dispatchEvent(errorEvent('a'));
    await Promise.resolve();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('uninstall entfernt die Handler', () => {
    const { target, report, uninstall } = setup();
    uninstall();
    target.dispatchEvent(errorEvent('a'));
    expect(report).not.toHaveBeenCalled();
  });
});
