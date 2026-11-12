import type Database from 'better-sqlite3';
import { MAX_SUGGESTIONS, toSuggestions } from '../../shared/domain/address-suggestion';
import { normalizeApiKey } from '../../shared/domain/settings';
import type { KeyCheckResult, SuggestResult } from '../../shared/ipc/addresses';
import { readApiKey } from '../db/settings-repository';
import type { SecretStore } from '../secret-store';
import type { GeoapifyClient } from './geoapify-client';

/**
 * Adressvorschläge über Geoapify. Der Key wird nur hier im Main gelesen und nie an den Renderer gegeben.
 * Ohne (lesbaren) Key wird keine Netzwerkanfrage gesendet.
 */
export class AddressService {
  constructor(
    private readonly db: Database.Database,
    private readonly secrets: SecretStore,
    private readonly client: GeoapifyClient,
  ) {}

  async suggest(text: string): Promise<SuggestResult> {
    const apiKey = await readApiKey(this.db, this.secrets);
    if (apiKey === null) return { status: 'disabled' };

    const result = await this.client.autocomplete(text, apiKey);
    if (!result.ok) return { status: 'error', reason: result.reason };
    return { status: 'ok', suggestions: toSuggestions(result.body).slice(0, MAX_SUGGESTIONS) };
  }

  /** Prüft einen (noch nicht gespeicherten) Key mit einer Probeanfrage. Der Key wird weder gespeichert noch geloggt. */
  async testKey(apiKey: string): Promise<KeyCheckResult> {
    const result = await this.client.autocomplete('Bahnhofstrasse', normalizeApiKey(apiKey));
    return result.ok ? 'valid' : result.reason;
  }
}
