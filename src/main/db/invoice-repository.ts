import type Database from 'better-sqlite3';
import type { Address } from '../../shared/domain/address';
import { normalizeIban } from '../../shared/domain/iban';
import type {
  DraftInput,
  Invoice,
  InvoiceFilter,
  InvoiceItem,
  InvoiceSummary,
  InvoiceStatus,
  Sender,
} from '../../shared/domain/invoice';
import { recalculate } from '../../shared/domain/invoice';
import type { ReferenceType } from '../../shared/domain/reference';
import { registerUnicodeLower } from './functions';

interface InvoiceRow {
  id: number;
  status: InvoiceStatus;
  number: string | null;
  number_year: number | null;
  number_seq: number | null;
  invoice_date: string;
  due_date: string;
  customer_id: number | null;
  sender_name: string | null;
  sender_street: string | null;
  sender_house_no: string | null;
  sender_zip: string | null;
  sender_city: string | null;
  sender_country: string | null;
  sender_iban: string | null;
  debtor_name: string | null;
  debtor_street: string | null;
  debtor_house_no: string | null;
  debtor_zip: string | null;
  debtor_city: string | null;
  debtor_country: string | null;
  closing_text: string | null;
  reference_type: ReferenceType | null;
  reference: string | null;
  total_rappen: number;
  layout_version: number | null;
  issued_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  description: string;
  quantity_milli: number;
  unit_price_rappen: number;
  amount_rappen: number;
}

export interface NewDraft {
  invoiceDate: string;
  dueDate: string;
  sender: Sender;
  closingText: string | null;
  createdAt: string;
}

export interface IssueData {
  number: string;
  numberYear: number;
  numberSeq: number;
  referenceType: ReferenceType;
  reference: string;
  totalRappen: number;
  layoutVersion: number;
  issuedAt: string;
}

function toSender(row: InvoiceRow): Sender {
  return {
    name: row.sender_name ?? '',
    street: row.sender_street ?? '',
    houseNo: row.sender_house_no ?? '',
    zip: row.sender_zip ?? '',
    city: row.sender_city ?? '',
    country: row.sender_country ?? 'CH',
    iban: row.sender_iban ?? '',
  };
}

function toDebtor(row: InvoiceRow): Address {
  return {
    name: row.debtor_name ?? '',
    street: row.debtor_street ?? '',
    houseNo: row.debtor_house_no ?? '',
    zip: row.debtor_zip ?? '',
    city: row.debtor_city ?? '',
    // Das Land des Rechnungsempfängers ist optional: NULL bedeutet «nicht angegeben»
    country: row.debtor_country ?? '',
  };
}

export class InvoiceRepository {
  constructor(private readonly db: Database.Database) {
    registerUnicodeLower(db);
  }

  list(filter: InvoiceFilter): InvoiceSummary[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    const search = filter.search?.trim().toLowerCase() ?? '';
    if (search !== '') {
      where.push('(instr(unicode_lower(number), ?) > 0 OR instr(unicode_lower(debtor_name), ?) > 0)');
      params.push(search, search);
    }
    if (filter.status && filter.status.length > 0) {
      where.push(`status IN (${filter.status.map(() => '?').join(', ')})`);
      params.push(...filter.status);
    }
    const sql = `SELECT id, number, status, invoice_date, due_date, debtor_name, total_rappen FROM invoices
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY invoice_date DESC, id DESC`;
    const rows = this.db.prepare(sql).all(...params) as {
      id: number;
      number: string | null;
      status: InvoiceStatus;
      invoice_date: string;
      due_date: string;
      debtor_name: string | null;
      total_rappen: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      invoiceDate: r.invoice_date,
      dueDate: r.due_date,
      debtorName: r.debtor_name ?? '',
      totalRappen: r.total_rappen,
    }));
  }

  /** Löscht einen Entwurf samt Positionen (Fremdschlüssel `ON DELETE CASCADE`). */
  deleteDraft(id: number): void {
    this.db.prepare("DELETE FROM invoices WHERE id = ? AND status = 'draft'").run(id);
  }

  /** Statuswechsel `issued → paid`: nur Status und `paid_at` ändern sich. */
  markPaid(id: number, now: string): void {
    this.db
      .prepare("UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }

  /** Statuswechsel `paid → issued`: löscht `paid_at`. */
  reopen(id: number, now: string): void {
    this.db
      .prepare("UPDATE invoices SET status = 'issued', paid_at = NULL, updated_at = ? WHERE id = ?")
      .run(now, id);
  }

  /** Statuswechsel `issued/paid → cancelled`; die Nummer bleibt vergeben, `paid_at` bleibt erhalten. */
  cancel(id: number, now: string): void {
    this.db
      .prepare("UPDATE invoices SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }

  runInTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  createDraft(draft: NewDraft): number {
    const info = this.db
      .prepare(
        `INSERT INTO invoices (status, invoice_date, due_date, sender_name, sender_street, sender_house_no,
                               sender_zip, sender_city, sender_country, sender_iban,
                               debtor_name, debtor_street, debtor_house_no, debtor_zip, debtor_city, debtor_country,
                               closing_text, created_at, updated_at)
         VALUES ('draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', '', 'CH', ?, ?, ?)`,
      )
      .run(
        draft.invoiceDate,
        draft.dueDate,
        draft.sender.name,
        draft.sender.street,
        draft.sender.houseNo,
        draft.sender.zip,
        draft.sender.city,
        draft.sender.country,
        normalizeIban(draft.sender.iban),
        draft.closingText,
        draft.createdAt,
        draft.createdAt,
      );
    return Number(info.lastInsertRowid);
  }

  /** Speichert einen Entwurf samt Positionen. Der Aufrufer stellt sicher, dass der Status `draft` ist. */
  saveDraft(input: DraftInput, updatedAt: string): void {
    const { items, totalRappen } = recalculate(input.items);
    const save = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE invoices SET invoice_date = ?, due_date = ?, customer_id = ?,
             sender_name = ?, sender_street = ?, sender_house_no = ?, sender_zip = ?, sender_city = ?,
             sender_country = ?, sender_iban = ?,
             debtor_name = ?, debtor_street = ?, debtor_house_no = ?, debtor_zip = ?, debtor_city = ?,
             debtor_country = ?, closing_text = ?, total_rappen = ?, updated_at = ?
           WHERE id = ? AND status = 'draft'`,
        )
        .run(
          input.invoiceDate,
          input.dueDate,
          input.customerId,
          input.sender.name,
          input.sender.street,
          input.sender.houseNo,
          input.sender.zip,
          input.sender.city,
          input.sender.country,
          normalizeIban(input.sender.iban),
          input.debtor.name,
          input.debtor.street,
          input.debtor.houseNo,
          input.debtor.zip,
          input.debtor.city,
          input.debtor.country === '' ? null : input.debtor.country,
          input.closingText,
          totalRappen,
          updatedAt,
          input.id,
        );
      this.db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(input.id);
      const insert = this.db.prepare(
        `INSERT INTO invoice_items (invoice_id, position, description, quantity_milli, unit_price_rappen, amount_rappen)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      items.forEach((item, index) => {
        insert.run(
          input.id,
          index + 1,
          item.description,
          item.quantityMilli,
          item.unitPriceRappen,
          item.amountRappen,
        );
      });
    });
    save();
  }

  get(id: number): Invoice | undefined {
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow | undefined;
    if (!row) return undefined;
    const itemRows = this.db
      .prepare(
        `SELECT description, quantity_milli, unit_price_rappen, amount_rappen
         FROM invoice_items WHERE invoice_id = ? ORDER BY position`,
      )
      .all(id) as ItemRow[];
    const items: InvoiceItem[] = itemRows.map((r) => ({
      description: r.description,
      quantityMilli: r.quantity_milli,
      unitPriceRappen: r.unit_price_rappen,
      amountRappen: r.amount_rappen,
    }));
    return {
      id: row.id,
      status: row.status,
      number: row.number,
      numberYear: row.number_year,
      numberSeq: row.number_seq,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      customerId: row.customer_id,
      sender: toSender(row),
      debtor: toDebtor(row),
      closingText: row.closing_text,
      referenceType: row.reference_type,
      reference: row.reference,
      totalRappen: row.total_rappen,
      layoutVersion: row.layout_version,
      issuedAt: row.issued_at,
      paidAt: row.paid_at,
      cancelledAt: row.cancelled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items,
    };
  }

  /** Erhöht den Zähler des Jahres und liefert die neue Nummer (lückenlos, atomar). */
  nextSequence(year: number): number {
    const row = this.db
      .prepare(
        `INSERT INTO number_counters (year, last_seq) VALUES (?, 1)
         ON CONFLICT(year) DO UPDATE SET last_seq = last_seq + 1
         RETURNING last_seq`,
      )
      .get(year) as { last_seq: number };
    return row.last_seq;
  }

  /** Schreibt einen Entwurf fest (Übergang `draft → issued`). */
  markIssued(id: number, data: IssueData): void {
    this.db
      .prepare(
        `UPDATE invoices SET status = 'issued', number = ?, number_year = ?, number_seq = ?,
           reference_type = ?, reference = ?, total_rappen = ?, layout_version = ?,
           issued_at = ?, updated_at = ?
         WHERE id = ? AND status = 'draft'`,
      )
      .run(
        data.number,
        data.numberYear,
        data.numberSeq,
        data.referenceType,
        data.reference,
        data.totalRappen,
        data.layoutVersion,
        data.issuedAt,
        data.issuedAt,
        id,
      );
  }
}
