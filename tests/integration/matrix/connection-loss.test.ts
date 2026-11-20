import { afterEach, beforeEach, expect, it } from 'vitest';
import { CustomerEntity } from '../../../src/main/db/entities/customer.entity';
import { unitOfWorkFor } from '../../../src/main/db/unit-of-work';
import { AppException } from '@shared/ipc/errors';
import { isConnectionLost } from '../../../src/main/db/adapters';
import { createFilledDraft, createService } from '../../fixtures/db';
import { describeMatrix, type TestDb } from '../helpers/db-targets';

describeMatrix('Verbindungsabbruch im Betrieb (FR-012)', (name, create) => {
  if (name === 'sqlite') {
    it('lokal gibt es keinen Verbindungsabbruch', () => {
      expect(name).toBe('sqlite');
    });
    return;
  }

  let target: TestDb;
  beforeEach(async () => {
    target = await create();
  });
  afterEach(async () => {
    await target.close();
  });

  const count = async (db: Awaited<ReturnType<TestDb['open']>>, table: string) =>
    Number(
      ((await db.query(`SELECT COUNT(*) AS n FROM ${table}`)) as { n: string | number }[])[0]?.n,
    );

  it('im Leerlauf getrennte Verbindungen werden ersetzt: höchstens ein Versuch scheitert mit Meldung, dann geht es weiter', async () => {
    const db = await target.open();
    const { service } = createService(db);
    const draft = await createFilledDraft(service);
    await target.killConnections();
    // depending on how fast the pool notices the dropped connection, the first try works or fails cleanly
    const first = await service.issue(draft.id).catch((e: unknown) => e);
    const failed = first instanceof Error;
    if (failed) expect(isConnectionLost(first) || first instanceof AppException).toBe(true);
    const issued = failed ? await service.issue(draft.id) : first;
    expect(issued).toMatchObject({ status: 'issued', number: 'RE-2026-0001' });
  });

  it('bricht die Verbindung mitten im Speichern ab: Meldung, nichts teilweise gespeichert, danach geht es weiter', async () => {
    const db = await target.open();
    const { service } = createService(db);
    const draft = await createFilledDraft(service);
    const now = '2026-03-01T10:00:00.000Z';

    const error = await unitOfWorkFor(db)
      .run(async (manager) => {
        await manager.insert(CustomerEntity, {
          name: 'Halb gespeichert AG',
          street: '',
          house_no: '',
          zip: '8000',
          city: 'Zürich',
          country: 'CH',
          notes: null,
          created_at: now,
          updated_at: now,
        });
        await target.killConnections(); // the connection breaks before the commit
        await manager.query('SELECT 1');
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).error.code).toBe('IO');
    expect((error as AppException).message).toMatch(/Verbindung/);
    expect((error as AppException).message).toMatch(/nicht gespeichert/);
    // the insert was rolled back with the connection
    expect(await count(db, 'customers')).toBe(0);

    // the application continues: the next issue works and uses the first number
    expect((await service.get(draft.id)).status).toBe('draft');
    expect(await count(db, 'number_counters')).toBe(0);
    expect((await service.issue(draft.id)).number).toBe('RE-2026-0001');
  });
});
