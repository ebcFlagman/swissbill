import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeGeoapify {
  /** Basis-URL für `SWISSBILL_GEOAPIFY_BASE_URL` */
  url: string;
  /** Alle bisher empfangenen Anfragen (Pfad mit Query) */
  requests: string[];
  /** Antwortverhalten für die nächsten Anfragen */
  mode: 'ok' | 'invalid_key' | 'quota' | 'down' | 'slow';
  close(): Promise<void>;
}

/** Fiktive Antwort wie bei `format=json`; nur erfundene Adressen. */
const RESULTS = {
  results: [
    {
      country_code: 'ch',
      postcode: '8001',
      city: 'Zürich',
      street: 'Bahnhofstrasse',
      housenumber: '1',
      formatted: 'Bahnhofstrasse 1, 8001 Zürich, Schweiz',
    },
    {
      country_code: 'ch',
      postcode: '8002',
      city: 'Zürich',
      street: 'Bahnhofquai',
      formatted: 'Bahnhofquai, 8002 Zürich, Schweiz',
    },
  ],
};

/** Lokaler Ersatz für Geoapify: kein Test spricht mit dem echten Dienst. */
export async function startFakeGeoapify(): Promise<FakeGeoapify> {
  const fake: FakeGeoapify = {
    url: '',
    requests: [],
    mode: 'ok',
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const server: Server = createServer((req, res) => {
    fake.requests.push(req.url ?? '');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    switch (fake.mode) {
      case 'invalid_key':
        return send(401, { message: 'Invalid apiKey' });
      case 'quota':
        return send(429, { message: 'Too many requests' });
      case 'down':
        return send(503, { message: 'down' });
      case 'slow':
        return void setTimeout(() => send(200, RESULTS), 8_000);
      default:
        return send(200, RESULTS);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
}

export const FAKE_ENV = { SWISSBILL_SECRET_STORE: 'memory' } as const;
