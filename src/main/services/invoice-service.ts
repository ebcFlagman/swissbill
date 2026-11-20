import type { DataSource } from 'typeorm';
import { addDays, localIsoDate } from '@shared/domain/dates';
import {
  type DraftInput,
  type Invoice,
  type InvoiceFilter,
  type InvoiceStatus,
  type InvoiceSummary,
  LAYOUT_VERSION,
  recalculate,
  validateDraft,
  validateForIssue,
} from '@shared/domain/invoice';
import { canDelete, canTransition } from '@shared/domain/invoice-status';
import { formatInvoiceNumber } from '@shared/domain/invoice-number';
import {
  buildCreditorReference,
  buildQrReference,
  referenceTypeFor,
} from '@shared/domain/reference';
import { AppException } from '@shared/ipc/errors';
import { InvoiceRepository } from '../db/invoice-repository';
import { getSettings } from '../db/settings-repository';

export interface InvoiceServiceOptions {
  /** Clock, replaceable for tests (year change) */
  now?: () => Date;
}

export class InvoiceService {
  private readonly repo: InvoiceRepository;
  private readonly now: () => Date;

  constructor(
    private readonly dataSource: DataSource,
    options: InvoiceServiceOptions = {},
  ) {
    this.repo = new InvoiceRepository(dataSource);
    this.now = options.now ?? (() => new Date());
  }

  async get(id: number): Promise<Invoice> {
    const invoice = await this.repo.get(id);
    if (!invoice) throw new AppException('NOT_FOUND', 'Die Rechnung wurde nicht gefunden.');
    return invoice;
  }

  /** Checks the status change against the state machine and returns the invoice. */
  private async requireTransition(
    id: number,
    to: InvoiceStatus,
    message: string,
  ): Promise<Invoice> {
    const invoice = await this.get(id);
    if (!canTransition(invoice.status, to)) {
      throw new AppException('IMMUTABLE', message);
    }
    return invoice;
  }

  /** `issued → paid`; the content of the invoice stays unchanged. */
  async markPaid(id: number): Promise<Invoice> {
    await this.requireTransition(
      id,
      'paid',
      'Nur ausgestellte Rechnungen können als bezahlt markiert werden.',
    );
    await this.repo.markPaid(id, this.now().toISOString());
    return this.get(id);
  }

  /** `paid → issued` (correction of a wrong booking). */
  async reopen(id: number): Promise<Invoice> {
    await this.requireTransition(
      id,
      'issued',
      'Nur bezahlte Rechnungen können zurückgesetzt werden.',
    );
    await this.repo.reopen(id, this.now().toISOString());
    return this.get(id);
  }

  /** `issued/paid → cancelled`; final. The number stays assigned and is never reused. */
  async cancel(id: number): Promise<Invoice> {
    await this.requireTransition(
      id,
      'cancelled',
      'Nur ausgestellte oder bezahlte Rechnungen können storniert werden.',
    );
    await this.repo.cancel(id, this.now().toISOString());
    return this.get(id);
  }

  list(filter: InvoiceFilter): Promise<InvoiceSummary[]> {
    return this.repo.list(filter);
  }

  /** Deletes a draft. Numbers are only assigned on issuing, so no gap arises. */
  async deleteDraft(id: number): Promise<void> {
    const invoice = await this.get(id);
    if (!canDelete(invoice.status)) {
      throw new AppException('IMMUTABLE', 'Nur Entwürfe können gelöscht werden.');
    }
    await this.repo.deleteDraft(id);
  }

  /** New draft with the content of an existing invoice (date today, without number and reference). */
  async duplicate(id: number): Promise<Invoice> {
    const source = await this.get(id);
    const settings = await getSettings(this.dataSource);
    const now = this.now();
    const invoiceDate = localIsoDate(now);
    const dueDate = addDays(invoiceDate, settings.defaultPaymentDays);
    const newId = await this.repo.createDraft({
      invoiceDate,
      dueDate,
      sender: source.sender,
      closingText: source.closingText,
      createdAt: now.toISOString(),
    });
    try {
      await this.repo.saveDraft(
        {
          id: newId,
          invoiceDate,
          dueDate,
          customerId: source.customerId,
          sender: source.sender,
          debtor: source.debtor,
          closingText: source.closingText,
          items: source.items.map(({ description, quantityMilli, unitPriceRappen }) => ({
            description,
            quantityMilli,
            unitPriceRappen,
          })),
        },
        now.toISOString(),
      );
    } catch (error) {
      // A half-created draft is not left behind
      await this.repo.deleteDraft(newId);
      throw error;
    }
    return this.get(newId);
  }

  /** New draft: sender, closing text and due date prefilled from the settings. */
  async createDraft(): Promise<Invoice> {
    const settings = await getSettings(this.dataSource);
    const now = this.now();
    const invoiceDate = localIsoDate(now);
    const id = await this.repo.createDraft({
      invoiceDate,
      dueDate: addDays(invoiceDate, settings.defaultPaymentDays),
      sender: settings.sender,
      closingText: settings.defaultClosingText,
      createdAt: now.toISOString(),
    });
    return this.get(id);
  }

  /** Saves a draft; issued invoices are immutable. */
  async saveDraft(input: DraftInput): Promise<Invoice> {
    const existing = await this.get(input.id);
    if (existing.status !== 'draft') {
      throw new AppException(
        'IMMUTABLE',
        'Eine ausgestellte Rechnung kann nicht mehr geändert werden.',
      );
    }
    const errors = validateDraft(input);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    }
    await this.repo.saveDraft(input, this.now().toISOString());
    return this.get(input.id);
  }

  /**
   * Issues a draft: validates completely and fixes number, reference, total and layout version
   * in one transaction. An error leaves neither an assigned number nor a changed status.
   */
  async issue(id: number): Promise<Invoice> {
    const invoice = await this.get(id);
    if (invoice.status !== 'draft') {
      throw new AppException('IMMUTABLE', 'Die Rechnung ist bereits ausgestellt.');
    }
    const errors = validateForIssue(invoice);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Die Rechnung kann nicht ausgestellt werden.', errors);
    }

    const prefix = (await getSettings(this.dataSource)).invoicePrefix;
    const now = this.now();
    const year = now.getFullYear();

    await this.repo.issue(id, year, (seq, current) => {
      const referenceType = referenceTypeFor(current.sender.iban);
      return {
        number: formatInvoiceNumber(prefix, year, seq),
        numberYear: year,
        numberSeq: seq,
        referenceType,
        reference:
          referenceType === 'QRR' ? buildQrReference(year, seq) : buildCreditorReference(year, seq),
        totalRappen: recalculate(current.items).totalRappen,
        layoutVersion: LAYOUT_VERSION,
        issuedAt: now.toISOString(),
      };
    });

    return this.get(id);
  }
}
