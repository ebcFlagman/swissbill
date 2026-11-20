import { useCallback, useMemo, useState } from 'react';
import { shouldSearch, type AddressSuggestion } from '../../shared/domain/address-suggestion';
import type { SuggestResult } from '../../shared/ipc/addresses';

/** A search returns `null` if a newer request has started in the meantime (the response is stale). */
export type SuggestionSearch = (text: string) => Promise<SuggestResult | null>;

const EMPTY: SuggestResult = { status: 'ok', suggestions: [] };

/**
 * Encapsulates the search including protection against stale responses (FR-013): only the response to the latest input
 * counts. Inputs that are too short trigger no request and invalidate earlier requests still running.
 * The typing pause of 0.3 s is provided by the AutoComplete component (`delay`).
 */
export function createSuggestionSearch(suggest: (text: string) => Promise<SuggestResult>): SuggestionSearch {
  let latest = 0;
  return async (text) => {
    const id = ++latest;
    if (!shouldSearch(text)) return EMPTY;
    let result: SuggestResult;
    try {
      result = await suggest(text.trim());
    } catch {
      result = { status: 'error', reason: 'unavailable' };
    }
    return id === latest ? result : null;
  };
}

/** Subtle hint only for service errors; fixed German texts, never details. */
export function hintFor(result: SuggestResult): string | null {
  if (result.status !== 'error') return null;
  switch (result.reason) {
    case 'invalid_key':
      return 'Der Geoapify-API-Key wird nicht akzeptiert.';
    case 'quota':
      return 'Das Geoapify-Kontingent ist erschöpft.';
    default:
      return 'Vorschläge momentan nicht verfügbar.';
  }
}

export interface AddressSuggestionsState {
  suggestions: AddressSuggestion[];
  hint: string | null;
  /** Starts a search; the result appears in `suggestions` and `hint`. */
  search: (text: string) => void;
  clear: () => void;
}

/**
 * Suggestions for an address field. Without a key (result `disabled`) or on errors the list stays empty and
 * manual input stays untouched. With `enabled = false` (locked form) no request is ever made.
 */
export function useAddressSuggestions(enabled: boolean): AddressSuggestionsState {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  const run = useMemo(
    () =>
      createSuggestionSearch(async (text) => {
        const result = await window.swissbill.addresses.suggest({ text });
        // Treat errors of the IPC itself (e.g. validation) like a service error, never block
        return result.ok ? result.value : { status: 'error', reason: 'unavailable' };
      }),
    [],
  );

  const search = useCallback(
    (text: string) => {
      if (!enabled) return;
      void run(text).then((result) => {
        if (result === null) return;
        setSuggestions(result.status === 'ok' ? result.suggestions : []);
        setHint(hintFor(result));
      });
    },
    [enabled, run],
  );

  const clear = useCallback(() => {
    setSuggestions([]);
    setHint(null);
  }, []);

  return { suggestions, hint, search, clear };
}
