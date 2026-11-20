import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { openActiveDatabase } from '../../src/main/db/connect';
import { CONNECTION_FILENAME } from '../../src/main/db/connection-config';
import { CustomerService } from '../../src/main/services/customer-service';
import { ConnectionService } from '../../src/main/services/connection-service';
import type { DbConnectionSettings } from '@shared/domain/db-connection';
import { createFakeCredentialStore } from '../fixtures/credential-store';
import { describeMatrix, type TestDb } from './helpers/db-targets';

const customer = (name: string) => ({
  name,
  street: '',
  houseNo: '',
  zip: '8000',
  city: 'Zürich',
  country: 'CH',
  notes: '',
});

const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

describeMatrix(
  'Wechsel zwischen lokaler Datenbank und Server (Story 4, FR-013)',
  (name, create) => {
    if (name === 'sqlite') {
      it('für SQLite gibt es keinen Wechsel auf einen Server', () => {
        expect(name).toBe('sqlite');
      });
      return;
    }

    let target: TestDb;
    let dir: string;
    beforeEach(async () => {
      target = await create();
      dir = mkdtempSync(join(tmpdir(), 'swissbill-switch-'));
    });
    afterEach(async () => {
      await target.close();
      rmSync(dir, { recursive: true, force: true });
    });

    const names = async (ds: DataSource) =>
      (await new CustomerService(ds).list()).map((c) => c.name);

    it('lokal → Server → lokal → Server: nichts wird kopiert, gelöscht oder verändert', async () => {
      if (target.target.kind !== 'server') throw new Error('Server erwartet');
      const settings: DbConnectionSettings = target.target.settings;
      const password = target.target.password ?? '';
      const credentials = createFakeCredentialStore();
      const service = new ConnectionService({ dir, credentials, active: () => 'local' });
      const open = () =>
        openActiveDatabase({ dir, resolvePassword: () => service.resolvePassword() });

      // 1. local database with its own data
      const local = await open();
      expect(local.kind).toBe('local');
      await new CustomerService(local.dataSource).save(customer('Lokal AG'));
      await local.dataSource.destroy();
      const localFile = join(dir, 'swissbill.db');
      const before = sha(localFile);

      // 2. switch to the server: it starts empty, the local data is not copied
      await service.save({ settings, password: { action: 'set', value: password } });
      const server = await open();
      expect(server.kind).toBe('server');
      expect(await names(server.dataSource)).toEqual([]);
      await new CustomerService(server.dataSource).save(customer('Server AG'));
      await server.dataSource.destroy();
      expect(sha(localFile)).toBe(before); // the local file was never touched meanwhile

      // 3. back to local: the server connection and its password are gone, the local data is back
      await service.save({
        settings: { ...settings, type: 'sqlite' },
        password: { action: 'keep' },
      });
      expect(existsSync(join(dir, CONNECTION_FILENAME))).toBe(false);
      expect(credentials.value).toBeNull();
      const again = await open();
      expect(again.kind).toBe('local');
      expect(await names(again.dataSource)).toEqual(['Lokal AG']);
      await again.dataSource.destroy();
      expect(sha(localFile)).toBe(before);

      // 4. to the server again: its data is still there
      await service.save({ settings, password: { action: 'set', value: password } });
      const serverAgain = await open();
      expect(await names(serverAgain.dataSource)).toEqual(['Server AG']);
      await serverAgain.dataSource.destroy();
    });

    it('ohne Verbindungsdatei (z. B. entfernt) startet die App wieder lokal', async () => {
      if (target.target.kind !== 'server') throw new Error('Server erwartet');
      const credentials = createFakeCredentialStore();
      const service = new ConnectionService({ dir, credentials, active: () => 'local' });
      await service.save({
        settings: target.target.settings,
        password: { action: 'set', value: target.target.password ?? '' },
      });
      rmSync(join(dir, CONNECTION_FILENAME));
      const database = await openActiveDatabase({ dir, resolvePassword: async () => null });
      expect(database.kind).toBe('local');
      await database.dataSource.destroy();
    });
  },
);
