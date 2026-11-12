import { useCallback, useMemo, useState } from 'react';
import { shouldSearch, type AddressSuggestion } from '../../shared/domain/address-suggestion';
import type { SuggestResult } from '../../shared/ipc/addresses';

/** Eine Suche liefert `null`, wenn inzwischen eine neuere Anfrage begonnen hat (die Antwort ist veraltet). */
export type SuggestionSearch = (text: string) => Promise<SuggestResult | null>;

const EMPTY: SuggestResult = { status: 'ok', suggestions: [] };

/**
 * Kapselt die Suche samt Schutz vor veralteten Antworten (FR-013): nur die Antwort der jeweils letzten Eingabe
 * zählt. Zu kurze Eingaben lösen keine Anfrage aus und machen frühere, noch laufende Anfragen ungültig.
 * Die Tipppause von 0,3 s liefert der AutoComplete-Baustein (`delay`).
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

/** Dezenter Hinweis nur bei Fehlern des Dienstes; feste deutsche Texte, nie Details. */
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
  /** Startet eine Suche; das Ergebnis erscheint in `suggestions` und `hint`. */
  search: (text: string) => void;
  clear: () => void;
}

/**
 * Vorschläge für ein Adressfeld. Ohne Key (Ergebnis `disabled`) oder bei Fehlern bleibt die Liste leer und
 * die Eingabe von Hand unberührt. Bei `enabled = false` (gesperrtes Formular) wird nie angefragt.
 */
export function useAddressSuggestions(enabled: boolean): AddressSuggestionsState {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  const run = useMemo(
    () =>
      createSuggestionSearch(async (text) => {
        const result = await window.swissbill.addresses.suggest({ text });
        // Fehler des IPC selbst (z. B. Validierung) wie ein Dienstfehler behandeln, nie blockieren
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
