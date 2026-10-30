import { describe, expect, it } from 'vitest';
import { addDays, localIsoDate } from '@shared/domain/dates';

describe('localIsoDate', () => {
  it('formatiert das lokale Datum', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('addDays', () => {
  it('addiert Tage kalenderecht', () => {
    expect(addDays('2026-03-01', 30)).toBe('2026-03-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });
});
