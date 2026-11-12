import { describe, expect, it } from 'vitest';
import {
  createGeoapifyClient,
  GEOAPIFY_BASE_URL,
  resolveBaseUrl,
} from '../../src/main/services/geoapify-client';
import sample from '../fixtures/geoapify-autocomplete.json';

const KEY = 'geheimer-test-key-0123456789';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Geoapify-Client', () => {
  it('liefert bei Erfolg den Antwortkörper', async () => {
    const client = createGeoapifyClient({ fetchImpl: async () => jsonResponse(200, sample) });
    const result = await client.autocomplete('Bahnhofstr 1 Zür', KEY);
    expect(result).toEqual({ ok: true, body: sample });
  });

  it('sendet nur Suchtext und Key an api.geoapify.com mit den festen Parametern', async () => {
    const urls: string[] = [];
    const client = createGeoapifyClient({
      fetchImpl: async (input) => {
        urls.push(String(input));
        return jsonResponse(200, sample);
      },
    });
    await client.autocomplete('Bahnhofstr 1 Zür', KEY);

    const url = new URL(urls[0] as string);
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('api.geoapify.com');
    expect(url.pathname).toBe('/v1/geocode/autocomplete');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      text: 'Bahnhofstr 1 Zür',
      apiKey: KEY,
      format: 'json',
      lang: 'de',
      limit: '5',
      bias: 'countrycode:ch',
    });
  });

  it.each([
    [401, 'invalid_key'],
    [403, 'invalid_key'],
    [429, 'quota'],
    [500, 'unavailable'],
    [404, 'unavailable'],
  ])('bildet HTTP %i auf %s ab', async (status, reason) => {
    const client = createGeoapifyClient({ fetchImpl: async () => jsonResponse(status, { message: KEY }) });
    expect(await client.autocomplete('abc', KEY)).toEqual({ ok: false, reason });
  });

  it('meldet einen Netzwerkfehler als offline, ohne Key oder URL weiterzugeben', async () => {
    const client = createGeoapifyClient({
      fetchImpl: async (input) => {
        throw new TypeError(`fetch failed: ${String(input)}`);
      },
    });
    const result = await client.autocomplete('abc', KEY);
    expect(result).toEqual({ ok: false, reason: 'offline' });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('bricht nach dem Zeitlimit ab und meldet timeout', async () => {
    const client = createGeoapifyClient({
      timeoutMs: 20,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    expect(await client.autocomplete('abc', KEY)).toEqual({ ok: false, reason: 'timeout' });
  });

  it('meldet eine nicht lesbare Antwort als unavailable', async () => {
    const client = createGeoapifyClient({ fetchImpl: async () => new Response('kein json', { status: 200 }) });
    expect(await client.autocomplete('abc', KEY)).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('resolveBaseUrl (nur für Tests mit Fake-Server)', () => {
  it('nutzt immer den echten Host, wenn die App verpackt ist', () => {
    expect(resolveBaseUrl({ SWISSBILL_GEOAPIFY_BASE_URL: 'http://localhost:1234' }, true)).toBe(GEOAPIFY_BASE_URL);
  });

  it('erlaubt die Umgebungsvariable nur bei nicht verpackter App und nur als http(s)-URL', () => {
    expect(resolveBaseUrl({ SWISSBILL_GEOAPIFY_BASE_URL: 'http://localhost:1234' }, false)).toBe(
      'http://localhost:1234',
    );
    expect(resolveBaseUrl({ SWISSBILL_GEOAPIFY_BASE_URL: 'file:///etc/passwd' }, false)).toBe(GEOAPIFY_BASE_URL);
    expect(resolveBaseUrl({}, false)).toBe(GEOAPIFY_BASE_URL);
  });
});
