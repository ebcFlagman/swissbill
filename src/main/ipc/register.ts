import { app } from 'electron';
import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { CHANNELS, type AppInfo } from '@shared/ipc/api';
import { createSecretStore } from '../electron-secret-store';
import { AddressService } from '../services/address-service';
import { BackupService } from '../services/backup-service';
import { createGeoapifyClient, resolveBaseUrl } from '../services/geoapify-client';
import { CustomerService } from '../services/customer-service';
import { InvoiceService } from '../services/invoice-service';
import { SettingsService } from '../services/settings-service';
import { registerAddressHandlers } from './addresses';
import { registerCustomerHandlers } from './customers';
import { registerDbHandlers } from './db';
import { handle } from './handle';
import { registerInvoiceHandlers } from './invoices';
import { registerPdfHandlers } from './pdf';
import { registerSettingsHandlers } from './settings';

export function registerIpc(dataSource: DataSource): void {
  const invoices = new InvoiceService(dataSource);
  const secrets = createSecretStore();
  const geoapify = createGeoapifyClient({ baseUrl: resolveBaseUrl(process.env, app.isPackaged) });

  handle<undefined, AppInfo>(CHANNELS.appInfo, z.undefined(), () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));
  registerInvoiceHandlers(invoices);
  registerCustomerHandlers(new CustomerService(dataSource));
  registerSettingsHandlers(new SettingsService(dataSource, secrets));
  registerAddressHandlers(new AddressService(dataSource, secrets, geoapify));
  registerDbHandlers(new BackupService(dataSource));
  registerPdfHandlers(invoices);
}
