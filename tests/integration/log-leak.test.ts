import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { initLogging } from '../../src/main/logging';
import { wrapHandler } from '../../src/main/ipc/wrap';
import { AddressService } from '../../src/main/services/address-service';
import type { GeoapifyClient } from '../../src/main/services/geoapify-client';
import { renderInvoicePdf } from '../../src/main/services/pdf-service';
import { SettingsService } from '../../src/main/services/settings-service';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';
import { createFakeSecretStore } from '../fixtures/secret-store';
import { QR_IBAN } from '../fixtures/invoice';

const API_KEY = 'abcdef0123456789abcdef0123456789';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-logleak-'));
  initLogging(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function allLogText(): string {
  const logs = join(dir, 'logs');
  return readdirSync(logs)
    .map((name) => readFileSync(join(logs, name), 'utf8'))
    .join('\n');
}

describe('Keine Geheimnisse und Rechnungsdaten im Log (SC-002, FR-005, FR-007)', () => {
  it('Rechnungs-, Adress- und Zahlungsdaten sowie der API-Schlüssel stehen in keiner Logzeile', async () => {
    const db = await createTestDb();
    const secrets = createFakeSecretStore();
    const { service } = createService(db);
    const draft = await createFilledDraft(service);
    const issued = await service.issue(draft.id);
    await renderInvoicePdf(issued);

    // saving the key registers it for masking; a failing request and a failing handler must not reveal it
    await new SettingsService(db, secrets).save({
      sender: issued.sender,
      invoicePrefix: 'RE',
      defaultClosingText: null,
      defaultPaymentDays: 30,
      geoapifyApiKey: API_KEY,
    });
    const failing: GeoapifyClient = {
      autocomplete: async (_text, apiKey) => {
        throw new Error(`Anfrage mit Schlüssel ${apiKey} fehlgeschlagen`);
      },
    };
    await new AddressService(db, secrets, failing)
      .suggest('Grosse Marktgasse')
      .catch(() => undefined);
    await wrapHandler(z.undefined(), () => {
      throw new Error(`Unerwartet mit ${API_KEY}`);
    })(undefined);

    const text = allLogText();
    expect(text.length).toBeGreaterThan(0);
    for (const secret of [
      API_KEY,
      QR_IBAN,
      issued.reference ?? 'no-reference',
      issued.number ?? 'no-number',
      issued.debtor?.name ?? 'no-debtor',
      issued.debtor?.street ?? 'no-street',
      issued.sender.name,
      'Zahlbar innert 30 Tagen',
    ]) {
      expect(text, secret).not.toContain(secret);
    }
  });
});
