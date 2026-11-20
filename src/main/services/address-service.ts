import type { DataSource } from 'typeorm';
import { MAX_SUGGESTIONS, toSuggestions } from '@shared/domain/address-suggestion';
import { normalizeApiKey } from '@shared/domain/settings';
import type { KeyCheckResult, SuggestResult } from '@shared/ipc/addresses';
import { readApiKey } from '../db/settings-repository';
import { redactFromLogs } from '../logging';
import type { SecretStore } from '../secret-store';
import type { GeoapifyClient } from './geoapify-client';

/**
 * Address suggestions via Geoapify. The key is only read here in main and never given to the renderer.
 * Without a (readable) key no network request is sent.
 */
export class AddressService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly secrets: SecretStore,
    private readonly client: GeoapifyClient,
  ) {}

  async suggest(text: string): Promise<SuggestResult> {
    const apiKey = await readApiKey(this.dataSource, this.secrets);
    if (apiKey === null) return { status: 'disabled' };

    const result = await this.client.autocomplete(text, apiKey);
    if (!result.ok) return { status: 'error', reason: result.reason };
    return { status: 'ok', suggestions: toSuggestions(result.body).slice(0, MAX_SUGGESTIONS) };
  }

  /** Checks a (not yet stored) key with a test request. The key is neither stored nor logged. */
  async testKey(apiKey: string): Promise<KeyCheckResult> {
    const key = normalizeApiKey(apiKey);
    redactFromLogs(key);
    const result = await this.client.autocomplete('Bahnhofstrasse', key);
    return result.ok ? 'valid' : result.reason;
  }
}
