import { z } from 'zod';
import type { SettingsInput } from '../domain/settings';

const text = (max: number) => z.string().max(max);

export const settingsSchema: z.ZodType<SettingsInput> = z.object({
  sender: z.object({
    name: text(500),
    street: text(500),
    houseNo: text(100),
    zip: text(100),
    city: text(500),
    country: text(10),
    iban: text(100),
  }),
  invoicePrefix: text(100),
  defaultClosingText: text(10000).nullable(),
  defaultPaymentDays: z.number(),
  // nicht angegeben = unverändert, '' = entfernen
  geoapifyApiKey: text(500).optional(),
});
