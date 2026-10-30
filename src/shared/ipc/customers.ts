import { z } from 'zod';
import type { CustomerInput } from '../domain/customer';

const text = (max: number) => z.string().max(max);

export const customerInputSchema: z.ZodType<CustomerInput> = z.object({
  id: z.number().int().positive().optional(),
  name: text(500),
  street: text(500),
  houseNo: text(100),
  zip: text(100),
  city: text(500),
  country: text(10),
  notes: text(10000),
});

export const customerSearchSchema = z.object({ search: text(200).optional() });
export type CustomerSearchInput = z.infer<typeof customerSearchSchema>;

export const customerIdSchema = z.object({ id: z.number().int().positive() });
export type CustomerIdInput = z.infer<typeof customerIdSchema>;
