import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { wrapHandler } from '../../src/main/ipc/wrap';
import { AppException, err, ok } from '@shared/ipc/errors';

describe('wrapHandler', () => {
  const schema = z.object({ id: z.number().int() });

  it('liefert den Rückgabewert als ok-Result', async () => {
    const run = wrapHandler(schema, ({ id }) => id * 2);
    expect(await run({ id: 21 })).toEqual(ok(42));
  });

  it('reicht ein vom Handler gelieferte Result unverändert durch', async () => {
    const run = wrapHandler(schema, () => err('NOT_FOUND', 'Nicht gefunden.'));
    expect(await run({ id: 1 })).toEqual(err('NOT_FOUND', 'Nicht gefunden.'));
  });

  it('wandelt ungültige Eingaben in VALIDATION mit Feldnamen um', async () => {
    const run = wrapHandler(schema, () => 'nie');
    const result = await run({ id: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.fields?.[0]?.field).toBe('id');
    }
  });

  it('wandelt AppException in das passende Result um', async () => {
    const run = wrapHandler(schema, () => {
      throw new AppException('IO', 'Datei kann nicht geschrieben werden.');
    });
    expect(await run({ id: 1 })).toEqual(err('IO', 'Datei kann nicht geschrieben werden.'));
  });

  it('erkennt Verstösse gegen die Unveränderlichkeit aus der Datenbank', async () => {
    const run = wrapHandler(schema, () => {
      throw new Error('IMMUTABLE: Eine ausgestellte Rechnung kann nicht geändert werden.');
    });
    const result = await run({ id: 1 });
    expect(result).toEqual(err('IMMUTABLE', 'Eine ausgestellte Rechnung kann nicht geändert werden.'));
  });

  it('gibt bei unerwarteten Fehlern keine Interna weiter', async () => {
    const run = wrapHandler(schema, () => {
      throw new Error('SQLITE_CORRUPT: geheime Details');
    });
    const result = await run({ id: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DB');
      expect(result.error.message).not.toMatch(/SQLITE|geheim/);
    }
  });
});
