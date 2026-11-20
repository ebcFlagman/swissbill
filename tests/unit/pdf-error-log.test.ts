import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLogging } from '../../src/main/logging';
import { renderInvoicePdf } from '../../src/main/services/pdf-service';
import { makeIssuedInvoice } from '../fixtures/invoice';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-pdflog-'));
  initLogging(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Fehler bei der PDF-Erzeugung im Log (SC-001)', () => {
  it('ein unerwarteter Fehler erscheint mit Bereich pdf und Ursache, ohne Rechnungsdaten', async () => {
    const broken = { ...makeIssuedInvoice(), sender: undefined } as never;
    await expect(renderInvoicePdf(broken)).rejects.toThrow();
    const lines = readFileSync(join(dir, 'logs', 'swissbill.log'), 'utf8')
      .split('\n')
      .filter(Boolean);
    const entry = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'error', component: 'pdf' });
    expect(entry.err).toMatchObject({ message: expect.any(String), stack: expect.any(String) });
  });
});
