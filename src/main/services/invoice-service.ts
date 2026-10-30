import type Database from 'better-sqlite3';
import { addDays, localIsoDate } from '../../shared/domain/dates';
import {
  LAYOUT_VERSION,
  recalculate,
  validateDraft,
  validateForIssue,
  type DraftInput,
  type Invoice,
  type InvoiceFilter,
  type InvoiceStatus,
  type InvoiceSummary,
} from '../../shared/domain/invoice';
import { canDelete, canTransition } from '../../shared/domain/invoice-status';
import { formatInvoiceNumber } from '../../shared/domain/invoice-number';
import { buildCreditorReference, buildQrReference, referenceTypeFor } from '../../shared/domain/reference';
import { AppException } from '../../shared/ipc/errors';
import { InvoiceRepository } from '../db/invoice-repository';
import { getSettings } from '../db/settings-repository';

export interface InvoiceServiceOptions {
  /** Uhr, für Tests austauschbar (Jahreswechsel) */
  now?: () => Date;
}

export class InvoiceService {
  private readonly repo: InvoiceRepository;
  private readonly now: () => Date;

  constructor(
    private readonly db: Database.Database,
    options: InvoiceServiceOptions = {},
  ) {
    this.repo = new InvoiceRepository(db);
    this.now = options.now ?? (() => new Date());
  }

  get(id: number): Invoice {
    const invoice = this.repo.get(id);
    if (!invoice) throw new AppException('NOT_FOUND', 'Die Rechnung wurde nicht gefunden.');
    return invoice;
  }

  /** Prüft den Statuswechsel gegen die Zustandsmaschine und liefert die Rechnung. */
  private requireTransition(id: number, to: InvoiceStatus, message: string): Invoice {
    const invoice = this.get(id);
    if (!canTransition(invoice.status, to)) {
      throw new AppException('IMMUTABLE', message);
    }
    return invoice;
  }

  /** `issued → paid`; der Inhalt der Rechnung bleibt unverändert. */
  markPaid(id: number): Invoice {
    this.requireTransition(id, 'paid', 'Nur ausgestellte Rechnungen können als bezahlt markiert werden.');
    this.repo.markPaid(id, this.now().toISOString());
    return this.get(id);
  }

  /** `paid → issued` (Korrektur einer Fehlbuchung). */
  reopen(id: number): Invoice {
    this.requireTransition(id, 'issued', 'Nur bezahlte Rechnungen können zurückgesetzt werden.');
    this.repo.reopen(id, this.now().toISOString());
    return this.get(id);
  }

  /** `issued/paid → cancelled`; endgültig. Die Nummer bleibt vergeben und wird nie wiederverwendet. */
  cancel(id: number): Invoice {
    this.requireTransition(
      id,
      'cancelled',
      'Nur ausgestellte oder bezahlte Rechnungen können storniert werden.',
    );
    this.repo.cancel(id, this.now().toISOString());
    return this.get(id);
  }

  list(filter: InvoiceFilter): InvoiceSummary[] {
    return this.repo.list(filter);
  }

  /** Löscht einen Entwurf. Nummern werden erst beim Ausstellen vergeben, daher entsteht keine Lücke. */
  deleteDraft(id: number): void {
    const invoice = this.get(id);
    if (!canDelete(invoice.status)) {
      throw new AppException('IMMUTABLE', 'Nur Entwürfe können gelöscht werden.');
    }
    this.repo.deleteDraft(id);
  }

  /** Neuer Entwurf mit dem Inhalt einer bestehenden Rechnung (Datum heute, ohne Nummer und Referenz). */
  duplicate(id: number): Invoice {
    const source = this.get(id);
    const settings = getSettings(this.db);
    const now = this.now();
    const invoiceDate = localIsoDate(now);
    const newId = this.repo.runInTransaction(() => {
      const created = this.repo.createDraft({
        invoiceDate,
        dueDate: addDays(invoiceDate, settings.defaultPaymentDays),
        sender: source.sender,
        closingText: source.closingText,
        createdAt: now.toISOString(),
      });
      this.repo.saveDraft(
        {
          id: created,
          invoiceDate,
          dueDate: addDays(invoiceDate, settings.defaultPaymentDays),
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
      return created;
    });
    return this.get(newId);
  }

  /** Neuer Entwurf: Absender, Schlusstext und Fälligkeit aus den Einstellungen vorausgefüllt. */
  createDraft(): Invoice {
    const settings = getSettings(this.db);
    const now = this.now();
    const invoiceDate = localIsoDate(now);
    const id = this.repo.createDraft({
      invoiceDate,
      dueDate: addDays(invoiceDate, settings.defaultPaymentDays),
      sender: settings.sender,
      closingText: settings.defaultClosingText,
      createdAt: now.toISOString(),
    });
    return this.get(id);
  }

  /** Speichert einen Entwurf; ausgestellte Rechnungen sind unveränderlich. */
  saveDraft(input: DraftInput): Invoice {
    const existing = this.get(input.id);
    if (existing.status !== 'draft') {
      throw new AppException('IMMUTABLE', 'Eine ausgestellte Rechnung kann nicht mehr geändert werden.');
    }
    const errors = validateDraft(input);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    }
    this.repo.saveDraft(input, this.now().toISOString());
    return this.get(input.id);
  }

  /**
   * Stellt einen Entwurf aus: validiert vollständig und schreibt Nummer, Referenz, Total und Layoutversion
   * in einer Transaktion fest. Ein Fehler hinterlässt weder eine vergebene Nummer noch einen geänderten Status.
   */
  issue(id: number): Invoice {
    const invoice = this.get(id);
    if (invoice.status !== 'draft') {
      throw new AppException('IMMUTABLE', 'Die Rechnung ist bereits ausgestellt.');
    }
    const errors = validateForIssue(invoice);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Die Rechnung kann nicht ausgestellt werden.', errors);
    }

    const prefix = getSettings(this.db).invoicePrefix;
    const now = this.now();

    this.db.transaction(() => {
      const year = now.getFullYear();
      const seq = this.repo.nextSequence(year);
      const referenceType = referenceTypeFor(invoice.sender.iban);
      this.repo.markIssued(id, {
        number: formatInvoiceNumber(prefix, year, seq),
        numberYear: year,
        numberSeq: seq,
        referenceType,
        reference: referenceType === 'QRR' ? buildQrReference(year, seq) : buildCreditorReference(year, seq),
        totalRappen: recalculate(invoice.items).totalRappen,
        layoutVersion: LAYOUT_VERSION,
        issuedAt: now.toISOString(),
      });
    })();

    return this.get(id);
  }
}
