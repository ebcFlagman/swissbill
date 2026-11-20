import { describe, expect, it } from 'vitest';
import { createRecovery } from '../../src/main/recovery';
import type { ActiveDatabase } from '../../src/main/db/connect';
import { DatabaseStartupError } from '../../src/main/db/startup';
import { AppException } from '@shared/ipc/errors';

const database = (kind: 'local' | 'server'): ActiveDatabase =>
  ({ kind, place: kind, dataSource: {}, adapter: {} }) as unknown as ActiveDatabase;

const startupError = (message = 'Server nicht erreichbar') =>
  new DatabaseStartupError('connection', 'db.example.ch:5432/swissbill', message);

function setup(opens: (() => Promise<ActiveDatabase>)[], local?: () => Promise<ActiveDatabase>) {
  const ready: ActiveDatabase[] = [];
  const queue = [...opens];
  const recovery = createRecovery({
    open: () => (queue.shift() ?? (() => Promise.reject(new Error('leer'))))(),
    openLocal: local ?? (async () => database('local')),
    onReady: (db) => {
      ready.push(db);
    },
  });
  return { recovery, ready };
}

describe('Wiederherstellungsmodus (FR-012, Story 3)', () => {
  it('startet normal, wenn die Datenbank öffnet, und meldet sie bereit', async () => {
    const { recovery, ready } = setup([async () => database('server')]);
    await recovery.start();
    expect(recovery.state()).toEqual({ active: 'server', startupError: null });
    expect(ready).toHaveLength(1);
  });

  it('bei einem Verbindungsfehler: Wiederherstellungsmodus mit Meldung, nichts wird registriert', async () => {
    const { recovery, ready } = setup([() => Promise.reject(startupError())]);
    await recovery.start();
    expect(recovery.state()).toEqual({
      active: 'recovery',
      startupError: 'Server nicht erreichbar',
    });
    expect(ready).toEqual([]); // no data channels without a database
  });

  it('ein unerwarteter Fehler wird verständlich gemeldet, nicht roh', async () => {
    const { recovery } = setup([() => Promise.reject(new Error('boom'))]);
    await recovery.start();
    const { startupError: message } = recovery.state();
    expect(message).toMatch(/Datenbank konnte nicht geöffnet werden/);
  });

  it('«Erneut versuchen» gelingt später: normaler Betrieb', async () => {
    const { recovery, ready } = setup([
      () => Promise.reject(startupError()),
      async () => database('server'),
    ]);
    await recovery.start();
    await recovery.retry();
    expect(recovery.state()).toEqual({ active: 'server', startupError: null });
    expect(ready).toHaveLength(1);
  });

  it('«Erneut versuchen» scheitert erneut: bleibt im Modus, neue Meldung, AppException', async () => {
    const { recovery, ready } = setup([
      () => Promise.reject(startupError('erste Meldung')),
      () => Promise.reject(startupError('zweite Meldung')),
    ]);
    await recovery.start();
    const error = await recovery.retry().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).error.code).toBe('CONNECTION');
    expect((error as AppException).message).toBe('zweite Meldung');
    expect(recovery.state()).toEqual({ active: 'recovery', startupError: 'zweite Meldung' });
    expect(ready).toEqual([]);
  });

  it('«Lokal verwenden» öffnet die lokale Datenbank nur für diese Sitzung', async () => {
    const { recovery, ready } = setup([() => Promise.reject(startupError())]);
    await recovery.start();
    await recovery.useLocalOnce();
    expect(recovery.state()).toEqual({ active: 'local', startupError: null });
    expect(ready.map((d) => d.kind)).toEqual(['local']);
  });

  it('«Lokal verwenden» scheitert (z. B. beschädigte Datei): bleibt im Modus mit Meldung', async () => {
    const { recovery } = setup([() => Promise.reject(startupError())], () =>
      Promise.reject(new DatabaseStartupError('corrupt', 'swissbill.db', 'Datei beschädigt')),
    );
    await recovery.start();
    await expect(recovery.useLocalOnce()).rejects.toMatchObject({ error: { code: 'CONNECTION' } });
    expect(recovery.state().active).toBe('recovery');
  });

  it('retry und useLocalOnce gibt es nur im Wiederherstellungsmodus', async () => {
    const { recovery } = setup([async () => database('local')]);
    await recovery.start();
    await expect(recovery.retry()).rejects.toBeInstanceOf(AppException);
    await expect(recovery.useLocalOnce()).rejects.toBeInstanceOf(AppException);
  });
});
