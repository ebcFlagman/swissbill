/** Der einzige externe Dienst der Anwendung (Constitution Prinzip II, Ausnahme «Adressvorschläge»). */
export const GEOAPIFY_BASE_URL = 'https://api.geoapify.com';

export type GeoapifyFailure = 'offline' | 'invalid_key' | 'quota' | 'timeout' | 'unavailable';

export type GeoapifyResult = { ok: true; body: unknown } | { ok: false; reason: GeoapifyFailure };

export interface GeoapifyClient {
  autocomplete(text: string, apiKey: string): Promise<GeoapifyResult>;
}

export interface GeoapifyClientOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const LIMIT = 5;

/**
 * Basis-URL des Dienstes. Nur in einer nicht verpackten App und nur als http(s)-URL darf die Umgebungsvariable
 * `SWISSBILL_GEOAPIFY_BASE_URL` sie ersetzen (lokaler Fake-Server für Tests); sonst gilt immer der echte Host.
 */
export function resolveBaseUrl(env: NodeJS.ProcessEnv, packaged: boolean): string {
  const override = env['SWISSBILL_GEOAPIFY_BASE_URL'];
  if (packaged || !override || !/^https?:\/\//i.test(override)) return GEOAPIFY_BASE_URL;
  return override.replace(/\/+$/, '');
}

function buildUrl(baseUrl: string, text: string, apiKey: string): string {
  const url = new URL('/v1/geocode/autocomplete', baseUrl);
  url.searchParams.set('text', text);
  url.searchParams.set('format', 'json');
  url.searchParams.set('lang', 'de');
  url.searchParams.set('limit', String(LIMIT));
  url.searchParams.set('bias', 'countrycode:ch');
  url.searchParams.set('apiKey', apiKey);
  return url.toString();
}

function failureFor(status: number): GeoapifyFailure {
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 429) return 'quota';
  return 'unavailable';
}

/**
 * HTTP-Client für Geoapify. Gesendet werden nur der Suchtext, feste Parameter und der Key.
 * Fehler werden ausschliesslich als Grund zurückgegeben, nie mit URL, Key oder Antwortkörper.
 */
export function createGeoapifyClient(options: GeoapifyClientOptions = {}): GeoapifyClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl ?? GEOAPIFY_BASE_URL;

  return {
    async autocomplete(text, apiKey) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(buildUrl(baseUrl, text, apiKey), {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) return { ok: false, reason: failureFor(response.status) };
        try {
          return { ok: true, body: await response.json() };
        } catch {
          return { ok: false, reason: 'unavailable' };
        }
      } catch (error) {
        const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
        return { ok: false, reason: aborted ? 'timeout' : 'offline' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
