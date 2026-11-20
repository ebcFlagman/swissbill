import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AppException } from '@shared/ipc/errors';
import { CustomerService } from '../../../src/main/services/customer-service';
import { InvoiceService } from '../../../src/main/services/invoice-service';
import { installLockGuard } from '../../../src/main/db/lock-guard';
import { LockRepository, LOCK_TTL_SECONDS } from '../../../src/main/db/lock-repository';
import { makeDraftInput } from '../../fixtures/invoice';
import { describeMatrix, type TestDb } from '../helpers/db-targets';

const customer = {
  name: 'Kunde AG',
  street: '',
  houseNo: '',
  zip: '8000',
  city: 'Zürich',
  country: 'CH',
  notes: '',
};

/** SQL expression for "this heartbeat, but N seconds older" per database. */
const older = (name: string, seconds: number) =>
  name === 'postgres'
    ? `heartbeat_at - INTERVAL '${seconds} seconds'`
    : name === 'sqlite'
      ? `datetime(heartbeat_at, '-${seconds} seconds')`
      : `heartbeat_at - INTERVAL ${seconds} SECOND`;

describeMatrix('Bearbeitungssperren', (name, create) => {
  let target: TestDb;
  let ds1: DataSource;
  let ds2: DataSource;
  beforeEach(async () => {
    target = await create();
    ds1 = await target.open();
    // SQLite is a single device by design (one connection); servers get an independent second connection
    ds2 = name === 'sqlite' ? ds1 : await target.open();
  });
  afterEach(async () => {
    await target.close();
  });

  const repoA = () => new LockRepository(ds1, target.adapter, 'owner-a', 'Rechner A');
  const repoB = () => new LockRepository(ds2, target.adapter, 'owner-b', 'Rechner B');
  const key = { entityType: 'customer', entityId: 1 } as const;
  const backdate = (seconds: number) =>
    ds1.query(`UPDATE edit_locks SET heartbeat_at = ${older(name, seconds)}`);

  it('ein freier Datensatz wird gesperrt, ein belegter meldet den Besitzer', async () => {
    expect(await repoA().acquire(key)).toEqual({ acquired: true });
    expect(await repoB().acquire(key)).toEqual({ acquired: false, ownerLabel: 'Rechner A' });
    // the owner may acquire again (e.g. after reopening the dialog)
    expect(await repoA().acquire(key)).toEqual({ acquired: true });
  });

  it('Sperren verschiedener Datensätze und Typen sind unabhängig', async () => {
    expect(await repoA().acquire({ entityType: 'customer', entityId: 1 })).toEqual({
      acquired: true,
    });
    expect(await repoB().acquire({ entityType: 'customer', entityId: 2 })).toEqual({
      acquired: true,
    });
    expect(await repoB().acquire({ entityType: 'invoice', entityId: 1 })).toEqual({
      acquired: true,
    });
  });

  it('der Heartbeat verlängert nur die eigene Sperre', async () => {
    await repoA().acquire(key);
    expect(await repoA().heartbeat(key)).toBe(true);
    expect(await repoB().heartbeat(key)).toBe(false);
    expect(await repoA().heartbeat({ entityType: 'customer', entityId: 99 })).toBe(false);
  });

  it('nach 5 Minuten ohne Heartbeat ist die Sperre abgelaufen und der Datensatz wieder frei', async () => {
    expect(LOCK_TTL_SECONDS).toBe(300);
    await repoA().acquire(key);
    await backdate(LOCK_TTL_SECONDS + 1);
    expect(await repoB().acquire(key)).toEqual({ acquired: true });
    // the former owner lost the lock: heartbeat fails and saving is refused
    expect(await repoA().heartbeat(key)).toBe(false);
    await expect(
      ds1.transaction((manager) => repoA().assertOwned(manager, key)),
    ).rejects.toMatchObject({ error: { code: 'LOCK_LOST' } });
  });

  it('eine noch nicht abgelaufene Sperre bleibt bestehen', async () => {
    await repoA().acquire(key);
    await backdate(LOCK_TTL_SECONDS - 60);
    expect(await repoB().acquire(key)).toEqual({ acquired: false, ownerLabel: 'Rechner A' });
  });

  it('die Freigabe gilt nur für den Besitzer', async () => {
    await repoA().acquire(key);
    await repoB().release(key);
    expect(await repoB().acquire(key)).toEqual({ acquired: false, ownerLabel: 'Rechner A' });
    await repoA().release(key);
    expect(await repoB().acquire(key)).toEqual({ acquired: true });
  });

  it('assertOwned lässt den Besitzer durch und lehnt fremde sowie fehlende Sperren ab', async () => {
    await repoA().acquire(key);
    await ds1.transaction((manager) => repoA().assertOwned(manager, key)); // ok
    for (const repo of [repoB(), repoA()]) {
      const free = { entityType: 'customer', entityId: 5 } as const;
      const error = await ds1
        .transaction((manager) => repo.assertOwned(manager, free))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).error.code).toBe('LOCK_LOST');
    }
    await expect(
      ds2.transaction((manager) => repoB().assertOwned(manager, key)),
    ).rejects.toMatchObject({ error: { code: 'LOCK_LOST' } });
  });

  it('gleichzeitiges Sperren durch zwei Geräte: genau eines gewinnt', async () => {
    const results = await Promise.all([repoA().acquire(key), repoB().acquire(key)]);
    expect(results.filter((r) => r.acquired)).toHaveLength(1);
    expect(results.filter((r) => !r.acquired)).toHaveLength(1);
  });

  it('die Sperre eines Datensatzes wird beim Löschen mitentfernt', async () => {
    await repoA().acquire(key);
    await repoA().release(key);
    const rows = (await ds1.query('SELECT COUNT(*) AS n FROM edit_locks')) as {
      n: string | number;
    }[];
    expect(Number(rows[0]?.n)).toBe(0);
  });

  describe.skipIf(name === 'sqlite')('Durchsetzung in den Schreibpfaden', () => {
    it('Kunden mit Id: ändern und löschen brauchen die eigene Sperre; neue Kunden nicht', async () => {
      installLockGuard(ds1, repoA());
      installLockGuard(ds2, repoB());
      const a = new CustomerService(ds1);
      const b = new CustomerService(ds2);

      const created = await a.save(customer); // no lock needed for a new customer
      const id = created.id;
      const code = (e: unknown) => (e instanceof AppException ? e.error.code : 'OTHER');

      await expect(a.save({ ...customer, id, name: 'Ohne Sperre' })).rejects.toSatisfy(
        (e) => code(e) === 'LOCK_LOST',
      );
      await expect(a.delete(id)).rejects.toSatisfy((e) => code(e) === 'LOCK_LOST');

      await repoA().acquire({ entityType: 'customer', entityId: id });
      expect((await a.save({ ...customer, id, name: 'Mit Sperre' })).name).toBe('Mit Sperre');
      // the other device is locked out
      await expect(b.save({ ...customer, id, name: 'Fremd' })).rejects.toSatisfy(
        (e) => code(e) === 'LOCK_LOST',
      );
      expect((await a.get(id)).name).toBe('Mit Sperre');
      await a.delete(id);
    });

    it('Entwürfe: speichern und löschen brauchen die Sperre, Statuswechsel und Ausstellen nicht', async () => {
      installLockGuard(ds1, repoA());
      const service = new InvoiceService(ds1, { now: () => new Date(2026, 2, 1, 10, 0) });
      const created = await service.createDraft(); // creating: no lock
      await repoA().acquire({ entityType: 'invoice', entityId: created.id }); // the editor locks on open
      const draft = await service.saveDraft(makeDraftInput({ id: created.id }));
      await repoA().release({ entityType: 'invoice', entityId: draft.id });
      const code = (e: unknown) => (e instanceof AppException ? e.error.code : 'OTHER');

      await expect(
        service.saveDraft(makeDraftInput({ id: draft.id, closingText: 'x' })),
      ).rejects.toSatisfy((e) => code(e) === 'LOCK_LOST');
      await expect(service.deleteDraft(draft.id)).rejects.toSatisfy((e) => code(e) === 'LOCK_LOST');

      await repoA().acquire({ entityType: 'invoice', entityId: draft.id });
      expect(
        (await service.saveDraft(makeDraftInput({ id: draft.id, closingText: 'Mit Sperre' })))
          .closingText,
      ).toBe('Mit Sperre');

      // issuing and the status changes of an issued invoice need no lock
      const issued = await service.issue(draft.id);
      expect(issued.status).toBe('issued');
      expect((await service.markPaid(draft.id)).status).toBe('paid');
    });
  });

  it('ohne Serververbindung (Sperren aus) sind alle Aufrufe wirkungslos und berühren die Tabelle nicht', async () => {
    const off = new LockRepository(ds1, target.adapter, 'owner-a', 'Rechner A', { enabled: false });
    expect(await off.acquire(key)).toEqual({ acquired: true });
    expect(await off.heartbeat(key)).toBe(true);
    await off.release(key);
    await ds1.transaction((manager) => off.assertOwned(manager, key));
    const rows = (await ds1.query('SELECT COUNT(*) AS n FROM edit_locks')) as {
      n: string | number;
    }[];
    expect(Number(rows[0]?.n)).toBe(0);
  });
});
