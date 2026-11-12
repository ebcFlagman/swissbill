import { z } from 'zod';
import type { AddressSuggestion } from '../domain/address-suggestion';
import { API_KEY_MAX } from '../domain/settings';

export type SuggestFailure = 'offline' | 'invalid_key' | 'quota' | 'timeout' | 'unavailable';

/** `disabled`: kein (lesbarer) Key gespeichert, es wurde keine Anfrage gesendet. */
export type SuggestResult =
  | { status: 'disabled' }
  | { status: 'ok'; suggestions: AddressSuggestion[] }
  | { status: 'error'; reason: SuggestFailure };

export type KeyCheckResult = 'valid' | SuggestFailure;

export const suggestInputSchema = z.object({
  text: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(3).max(200)),
});
export type SuggestInput = z.input<typeof suggestInputSchema>;

export const testKeyInputSchema = z.object({
  apiKey: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(API_KEY_MAX)),
});
export type TestKeyInput = z.input<typeof testKeyInputSchema>;
