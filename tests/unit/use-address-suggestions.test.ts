import { describe, expect, it } from 'vitest';
import type { SuggestResult } from '@shared/ipc/addresses';
import { createSuggestionSearch, hintFor } from '../../src/renderer/lib/use-address-suggestions';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const ok = (street: string): SuggestResult => ({
  status: 'ok',
  suggestions: [{ label: street, street, houseNo: '', zip: '8000', city: 'Zürich', country: 'CH' }],
});

describe('createSuggestionSearch', () => {
  it('fragt unter der Mindestlänge nicht an und liefert eine leere Liste', async () => {
    const calls: string[] = [];
    const search = createSuggestionSearch(async (text) => {
      calls.push(text);
      return ok(text);
    });
    expect(await search('ab')).toEqual({ status: 'ok', suggestions: [] });
    expect(await search('  a ')).toEqual({ status: 'ok', suggestions: [] });
    expect(calls).toEqual([]);
  });

  it('fragt ab 3 Zeichen (nach dem Trimmen) an', async () => {
    const calls: string[] = [];
    const search = createSuggestionSearch(async (text) => {
      calls.push(text);
      return ok(text);
    });
    await search('  Bahn ');
    expect(calls).toEqual(['Bahn']);
  });

  it('verwirft die Antwort einer überholten Anfrage: nur die letzte zählt (FR-013)', async () => {
    const first = deferred<SuggestResult>();
    const second = deferred<SuggestResult>();
    const pending = [first, second];
    const search = createSuggestionSearch(() => (pending.shift() as typeof first).promise);

    const a = search('Bahnhof');
    const b = search('Bahnhofstr');
    second.resolve(ok('Bahnhofstrasse'));
    first.resolve(ok('Bahnhofplatz'));

    expect(await b).toEqual(ok('Bahnhofstrasse'));
    expect(await a).toBeNull(); // veraltet
  });

  it('verwirft auch, wenn eine spätere Eingabe zu kurz ist (Liste leeren, alte Antwort ignorieren)', async () => {
    const slow = deferred<SuggestResult>();
    const search = createSuggestionSearch(() => slow.promise);
    const a = search('Bahnhof');
    expect(await search('Ba')).toEqual({ status: 'ok', suggestions: [] });
    slow.resolve(ok('Bahnhofplatz'));
    expect(await a).toBeNull();
  });

  it('gibt Fehler des Dienstes als Ergebnis weiter und wirft nie', async () => {
    const search = createSuggestionSearch(async () => ({ status: 'error', reason: 'offline' }));
    expect(await search('abc')).toEqual({ status: 'error', reason: 'offline' });

    const throwing = createSuggestionSearch(async () => {
      throw new Error('kaputt');
    });
    expect(await throwing('abc')).toEqual({ status: 'error', reason: 'unavailable' });
  });
});

describe('hintFor (dezenter Hinweis, feste deutsche Texte)', () => {
  it('liefert nur bei Fehlern einen Hinweis', () => {
    expect(hintFor({ status: 'disabled' })).toBeNull();
    expect(hintFor(ok('x'))).toBeNull();
    expect(hintFor({ status: 'error', reason: 'offline' })).toBe('Vorschläge momentan nicht verfügbar.');
    expect(hintFor({ status: 'error', reason: 'invalid_key' })).toBe('Der Geoapify-API-Key wird nicht akzeptiert.');
    expect(hintFor({ status: 'error', reason: 'quota' })).toBe('Das Geoapify-Kontingent ist erschöpft.');
    expect(hintFor({ status: 'error', reason: 'timeout' })).toBe('Vorschläge momentan nicht verfügbar.');
    expect(hintFor({ status: 'error', reason: 'unavailable' })).toBe('Vorschläge momentan nicht verfügbar.');
  });
});
