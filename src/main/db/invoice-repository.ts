import { type DataSource, type EntityManager, In } from 'typeorm';
import { type Address, validateAddress } from '@shared/domain/address';
import { normalizeIban } from '@shared/domain/iban';
import type {
  DraftInput,
  Invoice,
  InvoiceFilter,
  InvoiceItem,
  InvoiceStatus,
  InvoiceSummary,
  Sender,
} from '@shared/domain/invoice';
import { recalculate, validateDraft, validateForIssue } from '@shared/domain/invoice';
import { canDelete, canTransition } from '@shared/domain/invoice-status';
import type { ReferenceType } from '@shared/domain/reference';
import { AppException } from '@shared/ipc/errors';
import { InvoiceEntity, type InvoiceRow } from './entities/invoice.entity';
import { InvoiceItemEntity } from './entities/invoice-item.entity';
import { isUniqueViolation } from './adapters';
import { assertLockOwned, forgetLock } from './lock-guard';
import { NumberCounterEntity } from './entities/number-counter.entity';
import { unitOfWorkFor } from './unit-of-work';

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
    // The country of the debtor is optional: NULL means "not specified"
    country: row.debtor_country ?? '',
  };
}

async function load(manager: EntityManager, id: number): Promise<Invoice | undefined> {
  const row = await manager.findOneBy(InvoiceEntity, { id });
  if (!row) return undefined;
  const itemRows = await manager.find(InvoiceItemEntity, {
    where: { invoice_id: id },
    order: { position: 'ASC' },
  });
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

const IMMUTABLE_CHANGE = 'Eine ausgestellte Rechnung kann nicht mehr geändert werden.';

/**
 * Single write path for invoices and items. The immutability of issued invoices and the
 * allowed status changes are enforced here (constitution principle III): every change is a conditional
 * `UPDATE … WHERE id = ? AND status IN (allowed previous statuses)`; if it matches no row, it is rejected.
 */
export class InvoiceRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(filter: InvoiceFilter): Promise<InvoiceSummary[]> {
    const statuses = filter.status ?? [];
    const rows = await this.dataSource.getRepository(InvoiceEntity).find({
      select: {
        id: true,
        number: true,
        status: true,
        invoice_date: true,
        due_date: true,
        debtor_name: true,
        total_rappen: true,
      },
      where: statuses.length > 0 ? { status: In(statuses) } : {},
      order: { invoice_date: 'DESC', id: 'DESC' },
    });
    const search = filter.search?.trim().toLowerCase() ?? '';
    return rows
      .filter(
        (r) =>
          search === '' ||
          (r.number ?? '').toLowerCase().includes(search) ||
          (r.debtor_name ?? '').toLowerCase().includes(search),
      )
      .map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        invoiceDate: r.invoice_date,
        dueDate: r.due_date,
        debtorName: r.debtor_name ?? '',
        totalRappen: r.total_rappen,
      }));
  }

  async get(id: number): Promise<Invoice | undefined> {
    return load(this.dataSource.manager, id);
  }

  async createDraft(draft: NewDraft): Promise<number> {
    const errors = validateAddress(draft.sender, 'sender', { partial: true });
    if (errors.length > 0)
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    return unitOfWorkFor(this.dataSource).run(async (manager) => {
      const result = await manager.insert(InvoiceEntity, {
        status: 'draft',
        invoice_date: draft.invoiceDate,
        due_date: draft.dueDate,
        sender_name: draft.sender.name,
        sender_street: draft.sender.street,
        sender_house_no: draft.sender.houseNo,
        sender_zip: draft.sender.zip,
        sender_city: draft.sender.city,
        sender_country: draft.sender.country,
        sender_iban: normalizeIban(draft.sender.iban),
        debtor_name: '',
        debtor_street: '',
        debtor_house_no: '',
        debtor_zip: '',
        debtor_city: '',
        debtor_country: 'CH',
        closing_text: draft.closingText,
        total_rappen: 0,
        created_at: draft.createdAt,
        updated_at: draft.createdAt,
      });
      return Number((result.identifiers[0] as { id: number }).id);
    });
  }

  /** Saves a draft with its items as a whole or not at all. Only drafts can be changed. */
  async saveDraft(input: DraftInput, updatedAt: string): Promise<void> {
    const errors = validateDraft(input);
    if (errors.length > 0)
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    const { items, totalRappen } = recalculate(input.items);
    await unitOfWorkFor(this.dataSource).run(async (manager) => {
      const result = await manager.update(
        InvoiceEntity,
        { id: input.id, status: 'draft' },
        {
          invoice_date: input.invoiceDate,
          due_date: input.dueDate,
          customer_id: input.customerId,
          sender_name: input.sender.name,
          sender_street: input.sender.street,
          sender_house_no: input.sender.houseNo,
          sender_zip: input.sender.zip,
          sender_city: input.sender.city,
          sender_country: input.sender.country,
          sender_iban: normalizeIban(input.sender.iban),
          debtor_name: input.debtor.name,
          debtor_street: input.debtor.street,
          debtor_house_no: input.debtor.houseNo,
          debtor_zip: input.debtor.zip,
          debtor_city: input.debtor.city,
          debtor_country: input.debtor.country === '' ? null : input.debtor.country,
          closing_text: input.closingText,
          total_rappen: totalRappen,
          updated_at: updatedAt,
        },
      );
      // Items are only written if the invoice really was a draft within the same operation
      if (!result.affected) throw new AppException('IMMUTABLE', IMMUTABLE_CHANGE);
      // Server database: only the device holding the edit lock may save (rolls everything back otherwise)
      await assertLockOwned(this.dataSource, manager, {
        entityType: 'invoice',
        entityId: input.id,
      });
      await manager.delete(InvoiceItemEntity, { invoice_id: input.id });
      if (items.length > 0) {
        await manager.insert(
          InvoiceItemEntity,
          items.map((item, index) => ({
            invoice_id: input.id,
            position: index + 1,
            description: item.description,
            quantity_milli: item.quantityMilli,
            unit_price_rappen: item.unitPriceRappen,
            amount_rappen: item.amountRappen,
          })),
        );
      }
    });
  }

  /** Deletes a draft with its items (foreign key `ON DELETE CASCADE`). Other invoices: rejected. */
  async deleteDraft(id: number): Promise<void> {
    await unitOfWorkFor(this.dataSource).run(async (manager) => {
      const result = await manager.delete(InvoiceEntity, { id, status: 'draft' });
      if (result.affected) {
        const key = { entityType: 'invoice', entityId: id } as const;
        await assertLockOwned(this.dataSource, manager, key);
        await forgetLock(this.dataSource, manager, key);
        return;
      }
      const existing = await manager.findOneBy(InvoiceEntity, { id });
      if (existing && !canDelete(existing.status)) {
        throw new AppException(
          'IMMUTABLE',
          'Eine ausgestellte Rechnung kann nicht gelöscht werden.',
        );
      }
    });
  }

  /**
   * Status change to `to` from one of the previous statuses `from` (never from draft: issuing only works via `issue`).
   * Every change must be allowed by the state machine; only the columns in `set` are changed.
   */
  private async transition(
    id: number,
    from: InvoiceStatus[],
    to: InvoiceStatus,
    set: Partial<InvoiceRow>,
  ): Promise<void> {
    const allowed = from.filter((status) => canTransition(status, to));
    await unitOfWorkFor(this.dataSource).run(async (manager) => {
      const result = await manager.update(
        InvoiceEntity,
        { id, status: In(allowed) },
        { ...set, status: to },
      );
      if (!result.affected) throw new AppException('IMMUTABLE', 'Ungültiger Statuswechsel.');
    });
  }

  /** Status change `issued → paid`: only status and `paid_at` change. */
  markPaid(id: number, now: string): Promise<void> {
    return this.transition(id, ['issued'], 'paid', { paid_at: now, updated_at: now });
  }

  /** Status change `paid → issued`: clears `paid_at`. */
  reopen(id: number, now: string): Promise<void> {
    return this.transition(id, ['paid'], 'issued', { paid_at: null, updated_at: now });
  }

  /** Status change `issued/paid → cancelled`; the number stays assigned, `paid_at` is kept. */
  cancel(id: number, now: string): Promise<void> {
    return this.transition(id, ['issued', 'paid'], 'cancelled', {
      cancelled_at: now,
      updated_at: now,
    });
  }

  /**
   * Issues a draft (`draft → issued`) in one operation: validates completely, increments the yearly counter
   * without gaps and fixes number, reference, total and layout version. On an error everything stays
   * unchanged, including the counter. `build` receives the assigned sequence number and the invoice and returns the data to fix.
   */
  async issue(
    id: number,
    year: number,
    build: (seq: number, invoice: Invoice) => IssueData,
  ): Promise<void> {
    await unitOfWorkFor(this.dataSource).run(async (manager) => {
      const invoice = await load(manager, id);
      if (!invoice) throw new AppException('NOT_FOUND', 'Die Rechnung wurde nicht gefunden.');
      if (invoice.status !== 'draft') {
        throw new AppException('IMMUTABLE', 'Die Rechnung ist bereits ausgestellt.');
      }
      const errors = validateForIssue(invoice);
      if (errors.length > 0) {
        throw new AppException('VALIDATION', 'Die Rechnung kann nicht ausgestellt werden.', errors);
      }

      const seq = await nextSequence(manager, year);
      const data = build(seq, invoice);
      const result = await manager.update(
        InvoiceEntity,
        { id, status: 'draft' },
        {
          status: 'issued',
          number: data.number,
          number_year: data.numberYear,
          number_seq: data.numberSeq,
          reference_type: data.referenceType,
          reference: data.reference,
          total_rappen: data.totalRappen,
          layout_version: data.layoutVersion,
          issued_at: data.issuedAt,
          updated_at: data.issuedAt,
        },
      );
      if (!result.affected)
        throw new AppException('IMMUTABLE', 'Die Rechnung ist bereits ausgestellt.');
    });
  }
}

const COUNTER_SAVEPOINT = 'counter_insert';

/**
 * Increments the counter of the year and returns the new sequence number (call only within a transaction).
 * The `UPDATE` locks the counter row until the transaction ends, so devices issuing at the same time queue
 * up and each gets the next number. If the row does not exist yet (first invoice of the year), it is inserted;
 * when another device was faster, the insert fails on the primary key. A failed statement would poison the
 * whole transaction on PostgreSQL, so the insert runs inside a savepoint that is rolled back to before the
 * `UPDATE` is tried again.
 */
async function nextSequence(manager: EntityManager, year: number): Promise<number> {
  const bump = () =>
    manager
      .createQueryBuilder()
      .update(NumberCounterEntity)
      .set({ last_seq: () => 'last_seq + 1' })
      .where('year = :year', { year })
      .execute();

  if (!(await bump()).affected) {
    const runner = manager.queryRunner;
    if (!runner) throw new Error('Die Nummernvergabe braucht eine Transaktion.');
    await runner.query(`SAVEPOINT ${COUNTER_SAVEPOINT}`);
    try {
      await manager.insert(NumberCounterEntity, { year, last_seq: 1 });
      await runner.query(`RELEASE SAVEPOINT ${COUNTER_SAVEPOINT}`);
      return 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await runner.query(`ROLLBACK TO SAVEPOINT ${COUNTER_SAVEPOINT}`);
      await runner.query(`RELEASE SAVEPOINT ${COUNTER_SAVEPOINT}`);
      if (!(await bump()).affected) throw error;
    }
  }
  const row = await manager.findOneByOrFail(NumberCounterEntity, { year });
  return row.last_seq;
}
