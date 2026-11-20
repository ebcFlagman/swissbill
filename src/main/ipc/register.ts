import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { app } from 'electron';
import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { CHANNELS, type AppInfo } from '@shared/ipc/api';
import { createSecretStore } from '../electron-secret-store';
import { secretStoreFor } from '../secret-store';
import { AddressService } from '../services/address-service';
import { BackupService } from '../services/backup-service';
import { createGeoapifyClient, resolveBaseUrl } from '../services/geoapify-client';
import { CustomerService } from '../services/customer-service';
import { InvoiceService } from '../services/invoice-service';
import type { Recovery } from '../recovery';
import type { ConnectionService } from '../services/connection-service';
import { SettingsService } from '../services/settings-service';
import { registerAddressHandlers } from './addresses';
import { registerCustomerHandlers } from './customers';
import type { DbAdapter } from '../db/adapters';
import { installLockGuard } from '../db/lock-guard';
import { LockRepository } from '../db/lock-repository';
import { registerConnectionHandlers } from './db-connection';
import { registerDbHandlers } from './db';
import { handle } from './handle';
import { registerInvoiceHandlers } from './invoices';
import { registerLockHandlers } from './locks';
import { registerPdfHandlers } from './pdf';
import { registerSettingsHandlers } from './settings';

/** Channels that must work before (or without) an open database; call once, before starting the database. */
export function registerPreDatabaseIpc(connection: ConnectionService, recovery: Recovery): void {
  registerConnectionHandlers(connection, recovery);
}

/**
 * Registers all channels that need the open database. Returns the edit-lock repository of this device
 * (the locks are only active for a server database; with the local database every call succeeds).
 */
export function registerIpc(dataSource: DataSource, adapter: DbAdapter): LockRepository {
  const locks = new LockRepository(dataSource, adapter, randomUUID(), hostname(), {
    enabled: adapter.type !== 'sqlite',
  });
  installLockGuard(dataSource, locks);
  const invoices = new InvoiceService(dataSource);
  const secrets = secretStoreFor(adapter.type, createSecretStore());
  const geoapify = createGeoapifyClient({ baseUrl: resolveBaseUrl(process.env, app.isPackaged) });

  handle<undefined, AppInfo>(CHANNELS.appInfo, z.undefined(), () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));
  registerInvoiceHandlers(invoices);
  registerCustomerHandlers(new CustomerService(dataSource));
  registerSettingsHandlers(new SettingsService(dataSource, secrets));
  registerAddressHandlers(new AddressService(dataSource, secrets, geoapify));
  registerDbHandlers(new BackupService(dataSource, adapter));
  registerPdfHandlers(invoices);
  registerLockHandlers(locks);
  return locks;
}
