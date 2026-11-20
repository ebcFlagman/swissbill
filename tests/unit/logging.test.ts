import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSecrets,
  getLogLevel,
  getLogger,
  initLogging,
  redactFromLogs,
  setLogLevel,
} from '../../src/main/logging';
import { LOG_SETTINGS_FILENAME } from '../../src/main/logging/log-settings';

let dir: string;
const logFile = () => join(dir, 'logs', 'swissbill.log');
const entries = () =>
  readFileSync(logFile(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-log-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  clearSecrets();
  rmSync(dir, { recursive: true, force: true });
});

describe('Logging mit pino', () => {
  it('schreibt pro Eintrag eine JSON-Zeile mit Zeit, Level, Bereich und Meldung', () => {
    initLogging(dir);
    getLogger('db').info('Datenbank geöffnet');
    const [entry] = entries();
    expect(entry).toMatchObject({ level: 'info', component: 'db', msg: 'Datenbank geöffnet' });
    expect(new Date(entry!.time as string).toISOString()).toBe(entry!.time);
    expect(entry).not.toHaveProperty('hostname');
  });

  it('Fehler tragen Meldung, Stacktrace und verschachtelte Ursache (FR-003)', () => {
    initLogging(dir);
    const error = new Error('Verbindung fehlgeschlagen', { cause: new Error('ECONNREFUSED') });
    getLogger('db').error({ err: error }, 'Datenbank konnte nicht geöffnet werden');
    const [entry] = entries();
    const err = entry!.err as { message: string; stack: string; cause?: { message: string } };
    expect(entry).toMatchObject({ level: 'error', component: 'db' });
    expect(err.message).toContain('Verbindung fehlgeschlagen');
    expect(err.stack).toContain('Error: Verbindung fehlgeschlagen');
    expect(JSON.stringify(err)).toContain('ECONNREFUSED');
  });

  it('zirkuläre Referenzen im Kontext erzeugen weiterhin gültiges JSON', () => {
    initLogging(dir);
    const context: Record<string, unknown> = { name: 'x' };
    context.self = context;
    getLogger('app').info({ context }, 'zirkulär');
    expect(entries()).toHaveLength(1);
  });

  it('vor initLogging geht der Eintrag auf stderr und nicht verloren', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    getLogger('app').warn('sehr früh');
    expect(String(spy.mock.calls[0]?.[0])).toContain('sehr früh');
  });

  it('ein bereits vor initLogging erzeugter Logger schreibt danach in die Datei', () => {
    const logger = getLogger('pdf');
    initLogging(dir);
    logger.error('später');
    expect(entries()[0]).toMatchObject({ component: 'pdf', msg: 'später' });
  });

  it('Standard-Level ist info, debug erscheint nicht', () => {
    initLogging(dir);
    getLogger('app').debug('versteckt');
    getLogger('app').info('sichtbar');
    expect(getLogLevel()).toBe('info');
    expect(entries().map((e) => e.msg)).toEqual(['sichtbar']);
  });

  it('setLogLevel wirkt sofort auch auf bereits erzeugte Logger', () => {
    initLogging(dir);
    const logger = getLogger('ipc');
    setLogLevel('debug');
    logger.debug('jetzt sichtbar');
    setLogLevel('info');
    logger.debug('wieder versteckt');
    expect(entries().map((e) => e.msg)).toEqual(['jetzt sichtbar']);
  });

  it('liest das gespeicherte Level beim Start', () => {
    writeFileSync(join(dir, LOG_SETTINGS_FILENAME), '{"version":1,"level":"debug"}');
    initLogging(dir);
    getLogger('app').debug('beim Start');
    expect(getLogLevel()).toBe('debug');
    expect(entries().map((e) => e.msg)).toEqual(['beim Start']);
  });

  it('ein ungültiges gespeichertes Level führt zu info und einer Warnung', () => {
    writeFileSync(join(dir, LOG_SETTINGS_FILENAME), '{kaputt');
    initLogging(dir);
    expect(getLogLevel()).toBe('info');
    expect(entries()[0]).toMatchObject({ level: 'warn', component: 'app' });
  });

  it('verschiebt eine Logdatei im alten Textformat einmalig nach .1', () => {
    mkdirSync(join(dir, 'logs'));
    writeFileSync(logFile(), '2026-01-01T00:00:00.000Z INFO alt\n');
    initLogging(dir);
    getLogger('app').info('neu');
    expect(readFileSync(`${logFile()}.1`, 'utf8')).toContain('INFO alt');
    expect(entries().map((e) => e.msg)).toEqual(['neu']);
    // a JSON file is left alone at the next start
    initLogging(dir);
    expect(readdirSync(join(dir, 'logs')).sort()).toEqual(['swissbill.log', 'swissbill.log.1']);
    expect(readFileSync(`${logFile()}.1`, 'utf8')).toContain('INFO alt');
  });

  describe('Maskierung (FR-005, FR-006)', () => {
    it('registrierte Geheimnisse erscheinen in Meldung, Feldern und Stacktrace nur als ***', () => {
      initLogging(dir);
      redactFromLogs('s3cr3t-Wert');
      const error = new Error('Login mit s3cr3t-Wert abgelehnt', {
        cause: new Error('Passwort s3cr3t-Wert falsch'),
      });
      getLogger('db').error({ err: error, detail: 'x s3cr3t-Wert y' }, 'Zugang s3cr3t-Wert');
      const text = readFileSync(logFile(), 'utf8');
      expect(text).not.toContain('s3cr3t-Wert');
      expect(text).toContain('***');
    });

    it.each(['password', 'apiKey', 'token', 'authorization', 'secret'])(
      'Kontextfeld %s wird unabhängig vom Wert maskiert, auch verschachtelt',
      (field) => {
        initLogging(dir);
        getLogger('app').info({ [field]: 'KLARTEXT-1', nested: { [field]: 'KLARTEXT-2' } }, 'ctx');
        const text = readFileSync(logFile(), 'utf8');
        expect(text).not.toContain('KLARTEXT');
        expect(entries()[0]![field]).toBe('***');
      },
    );
  });
});
