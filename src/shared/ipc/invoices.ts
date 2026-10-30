import { z } from 'zod';
import type { Address } from '../domain/address';
import type { DraftInput, InvoiceFilter, InvoiceItemInput, Sender } from '../domain/invoice';

/** Grosszügige Obergrenzen gegen Missbrauch; die fachlichen Grenzen prüft die Domäne. */
const text = (max: number) => z.string().max(max);

const addressSchema: z.ZodType<Address> = z.object({
  name: text(500),
  street: text(500),
  houseNo: text(100),
  zip: text(100),
  city: text(500),
  country: text(10),
});

const senderSchema: z.ZodType<Sender> = z.object({
  name: text(500),
  street: text(500),
  houseNo: text(100),
  zip: text(100),
  city: text(500),
  country: text(10),
  iban: text(100),
});

const itemSchema: z.ZodType<InvoiceItemInput> = z.object({
  description: text(5000),
  quantityMilli: z.number().int(),
  unitPriceRappen: z.number().int(),
});

export const draftInputSchema: z.ZodType<DraftInput> = z.object({
  id: z.number().int().positive(),
  invoiceDate: text(20),
  dueDate: text(20),
  customerId: z.number().int().positive().nullable(),
  sender: senderSchema,
  debtor: addressSchema,
  closingText: text(10000).nullable(),
  items: z.array(itemSchema).max(1000),
});

export const invoiceFilterSchema: z.ZodType<InvoiceFilter> = z.object({
  search: text(200).optional(),
  status: z.array(z.enum(['draft', 'issued', 'paid', 'cancelled'])).max(4).optional(),
});

export const invoiceIdSchema = z.object({ id: z.number().int().positive() });
export type InvoiceIdInput = z.infer<typeof invoiceIdSchema>;

export const pdfRequestSchema = z.object({ invoiceId: z.number().int().positive() });
export type PdfRequest = z.infer<typeof pdfRequestSchema>;

export type PdfSaveResult = { path: string } | { cancelled: true };
