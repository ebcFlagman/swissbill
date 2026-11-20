import { afterEach, beforeEach, expect, it } from 'vitest';
import { testConnection } from '../../../src/main/db/connect';
import type { DbConnectionSettings } from '@shared/domain/db-connection';
import { describeMatrix, type TestDb } from '../helpers/db-targets';

const SPECIAL_USER = 'sp@ce:u/ü';
const SPECIAL_PASSWORD = 'p@ss:w/rd ü"\'';

describeMatrix('Verbindungstest (FR-004, SC-005)', (name, create) => {
  if (name === 'sqlite') {
    it('lokales SQLite braucht keinen Test und meldet das', async () => {
      const result = await testConnection(
        {
          type: 'sqlite',
          host: '',
          port: 0,
          database: '',
          user: '',
          tls: { enabled: false, caPath: null },
        },
        null,
      );
      expect(result).toMatchObject({ ok: true, failedStage: null });
    });
    return;
  }

  let target: TestDb;
  let settings: DbConnectionSettings;
  let password: string;
  const created: string[] = [];
  beforeEach(async () => {
    target = await create();
    if (target.target.kind !== 'server') throw new Error('Server erwartet');
    settings = target.target.settings;
    password = target.target.password ?? '';
  });
  afterEach(async () => {
    await target.close();
    for (const user of created.splice(0)) {
      await target.serverAdmin(
        name === 'postgres' ? `DROP ROLE IF EXISTS "${user}"` : `DROP USER IF EXISTS '${user}'@'%'`,
      );
    }
  });

  /** Does the test leave any table behind? */
  const tables = async () => {
    const ds = await target.openRaw();
    const runner = ds.createQueryRunner();
    try {
      const found: string[] = [];
      for (const t of ['migrations', 'settings', 'stranger']) {
        if (await runner.hasTable(t)) found.push(t);
      }
      return found;
    } finally {
      await runner.release();
    }
  };

  /** A database user with the given rights (all on the test database, or read-only). */
  async function createUser(user: string, pass: string, rights: 'all' | 'read') {
    created.push(user);
    const db = settings.database;
    if (name === 'postgres') {
      await target.serverAdmin(
        `CREATE ROLE "${user}" LOGIN PASSWORD '${pass.replaceAll("'", "''")}'`,
      );
      await target.admin(`GRANT CONNECT ON DATABASE "${db}" TO "${user}"`);
      if (rights === 'all') {
        await target.serverAdmin(`ALTER DATABASE "${db}" OWNER TO "${user}"`);
        await target.admin(`ALTER SCHEMA public OWNER TO "${user}"`);
      } else {
        await target.admin(`GRANT USAGE ON SCHEMA public TO "${user}"`);
      }
    } else {
      const esc = (v: string) => v.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
      await target.serverAdmin(`CREATE USER '${esc(user)}'@'%' IDENTIFIED BY '${esc(pass)}'`);
      await target.serverAdmin(
        `GRANT ${rights === 'all' ? 'ALL' : 'SELECT'} ON \`${db}\`.* TO '${esc(user)}'@'%'`,
      );
    }
  }

  it('Erfolg bei einer leeren Datenbank: Schema «leer», nichts wird angelegt', async () => {
    const result = await testConnection(settings, password);
    expect(result).toMatchObject({ ok: true, failedStage: null, schema: 'empty' });
    expect(result.message).toMatch(/leer/);
    expect(await tables()).toEqual([]);
  });

  it('eine bereits eingerichtete Datenbank meldet «aktuell», eine ältere «älter»', async () => {
    const ds = await target.open();
    expect(await testConnection(settings, password)).toMatchObject({ ok: true, schema: 'current' });
    const e = (n: string) => ds.driver.escape(n);
    await ds.query(
      `DELETE FROM ${e('migrations')} WHERE ${e('name')} = 'AddEditLocks1700000000004'`,
    );
    expect(await testConnection(settings, password)).toMatchObject({ ok: true, schema: 'older' });
  });

  it('eine fremde, nicht leere Datenbank ist ein Schemafehler und bleibt unverändert', async () => {
    await target.admin('CREATE TABLE stranger (id integer)');
    const result = await testConnection(settings, password);
    expect(result).toMatchObject({ ok: false, failedStage: 'schema', schema: 'foreign' });
    expect(await tables()).toEqual(['stranger']);
  });

  it('ein neueres Schema ist ein Schemafehler mit Update-Hinweis', async () => {
    const ds = await target.open();
    const e = (n: string) => ds.driver.escape(n);
    await ds.query(
      `INSERT INTO ${e('migrations')} (${e('timestamp')}, ${e('name')}) VALUES (1900000000999, 'Future1900000000999')`,
    );
    const result = await testConnection(settings, password);
    expect(result).toMatchObject({ ok: false, failedStage: 'schema', schema: 'newer' });
    expect(result.message).toMatch(/aktualisieren/);
  });

  it('falsches Passwort → Stufe Anmeldung, ohne das Passwort zu nennen', async () => {
    const result = await testConnection(settings, 'falsches-Passwort-123');
    expect(result).toMatchObject({ ok: false, failedStage: 'authentication' });
    expect(result.message).not.toContain('falsches-Passwort-123');
    expect(result.message).not.toContain(settings.user);
  });

  it('nicht existierende Datenbank → Stufe Datenbank', async () => {
    const result = await testConnection({ ...settings, database: 'gibt_es_nicht_xyz' }, password);
    expect(result).toMatchObject({ ok: false, failedStage: 'database' });
    expect(result.message).toContain('gibt_es_nicht_xyz');
  });

  it('Server nicht erreichbar → Stufe erreichbar, mit Servername', async () => {
    const result = await testConnection({ ...settings, port: 1 }, password);
    expect(result).toMatchObject({ ok: false, failedStage: 'reachable' });
    expect(result.message).toContain(settings.host);
  });

  it('Benutzer nur mit Leserechten → Stufe Rechte', async () => {
    await createUser('swissbill_ro', 'ro-pass', 'read');
    const result = await testConnection({ ...settings, user: 'swissbill_ro' }, 'ro-pass');
    expect(result).toMatchObject({ ok: false, failedStage: 'permissions' });
  });

  it('Benutzer und Passwort mit Sonderzeichen verbinden und migrieren (Edge Case)', async () => {
    await createUser(SPECIAL_USER, SPECIAL_PASSWORD, 'all');
    const special = { ...settings, user: SPECIAL_USER };
    expect(await testConnection(special, SPECIAL_PASSWORD)).toMatchObject({
      ok: true,
      schema: 'empty',
    });
    // the real startup path works with these characters as well
    const { openDatabase } = await import('../../../src/main/db/startup');
    const ds = await openDatabase(target.adapter, {
      kind: 'server',
      settings: special,
      password: SPECIAL_PASSWORD,
    });
    expect(ds.isInitialized).toBe(true);
    await ds.destroy();
  });

  it('der Test hinterlässt keine Probe-Tabelle', async () => {
    await testConnection(settings, password);
    await testConnection(settings, password);
    expect(await tables()).toEqual([]);
  });
});
