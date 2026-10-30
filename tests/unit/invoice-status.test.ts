import { describe, expect, it } from 'vitest';
import { canDelete, canTransition, TRANSITIONS } from '@shared/domain/invoice-status';
import type { InvoiceStatus } from '@shared/domain/invoice';

const ALL: InvoiceStatus[] = ['draft', 'issued', 'paid', 'cancelled'];

describe('canTransition', () => {
  const allowed: [InvoiceStatus, InvoiceStatus][] = [
    ['draft', 'issued'],
    ['issued', 'paid'],
    ['paid', 'issued'],
    ['issued', 'cancelled'],
    ['paid', 'cancelled'],
  ];

  it.each(allowed)('erlaubt %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it('lehnt alle übrigen Übergänge ab', () => {
    const rejected = ALL.flatMap((from) => ALL.map((to) => [from, to] as const)).filter(
      ([from, to]) => !allowed.some(([f, t]) => f === from && t === to),
    );
    expect(rejected).toHaveLength(16 - allowed.length);
    for (const [from, to] of rejected) {
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
    }
  });

  it('storniert ist endgültig', () => {
    for (const to of ALL) expect(canTransition('cancelled', to)).toBe(false);
    expect(TRANSITIONS.cancelled).toEqual([]);
  });

  it('ein Entwurf wird nur ausgestellt, nie bezahlt oder storniert', () => {
    expect(TRANSITIONS.draft).toEqual(['issued']);
  });

  it('von keinem anderen Status führt ein Weg zurück zum Entwurf', () => {
    for (const from of ALL) expect(canTransition(from, 'draft')).toBe(false);
  });
});

describe('canDelete', () => {
  it('nur Entwürfe dürfen gelöscht werden', () => {
    expect(canDelete('draft')).toBe(true);
    expect(canDelete('issued')).toBe(false);
    expect(canDelete('paid')).toBe(false);
    expect(canDelete('cancelled')).toBe(false);
  });
});
