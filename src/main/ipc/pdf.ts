import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { CHANNELS } from '../../shared/ipc/api';
import type { Invoice } from '../../shared/domain/invoice';
import { AppException } from '../../shared/ipc/errors';
import { pdfRequestSchema, type PdfRequest, type PdfSaveResult } from '../../shared/ipc/invoices';
import type { InvoiceService } from '../services/invoice-service';
import { renderInvoicePdf } from '../services/pdf-service';
import { handle } from './handle';

function fileName(invoice: Invoice): string {
  return `${invoice.number ?? 'Entwurf'}.pdf`;
}

async function write(path: string, data: Buffer): Promise<void> {
  try {
    await writeFile(path, data);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AppException(
      'IO',
      `Die Datei konnte nicht gespeichert werden (${reason}). Die Rechnung bleibt unverändert.`,
    );
  }
}

export function registerPdfHandlers(service: InvoiceService): void {
  handle<PdfRequest, PdfSaveResult>(CHANNELS.pdfSave, pdfRequestSchema, async ({ invoiceId }) => {
    const invoice = service.get(invoiceId);
    const pdf = await renderInvoicePdf(invoice);
    const parent = BrowserWindow.getFocusedWindow() ?? undefined;
    const options = {
      title: 'PDF speichern',
      defaultPath: join(app.getPath('documents'), fileName(invoice)),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { cancelled: true as const };
    await write(result.filePath, pdf);
    return { path: result.filePath };
  });

  handle<PdfRequest, { base64: string }>(CHANNELS.pdfPreview, pdfRequestSchema, async ({ invoiceId }) => {
    const invoice = service.get(invoiceId);
    const pdf = await renderInvoicePdf(invoice, { preview: invoice.status === 'draft' });
    return { base64: pdf.toString('base64') };
  });

  handle<PdfRequest, void>(CHANNELS.pdfOpen, pdfRequestSchema, async ({ invoiceId }) => {
    const invoice = service.get(invoiceId);
    const pdf = await renderInvoicePdf(invoice);
    const path = join(app.getPath('temp'), `swissbill-${fileName(invoice)}`);
    await write(path, pdf);
    const failure = await shell.openPath(path);
    if (failure) throw new AppException('IO', `Das PDF konnte nicht geöffnet werden (${failure}).`);
  });
}
