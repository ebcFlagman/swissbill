import { CHANNELS } from '../../shared/ipc/api';
import {
  suggestInputSchema,
  testKeyInputSchema,
  type KeyCheckResult,
  type SuggestResult,
} from '../../shared/ipc/addresses';
import type { AddressService } from '../services/address-service';
import { handle } from './handle';

export function registerAddressHandlers(service: AddressService): void {
  handle<{ text: string }, SuggestResult>(CHANNELS.addressesSuggest, suggestInputSchema, ({ text }) =>
    service.suggest(text),
  );
  handle<{ apiKey: string }, KeyCheckResult>(CHANNELS.addressesTestKey, testKeyInputSchema, ({ apiKey }) =>
    service.testKey(apiKey),
  );
}
