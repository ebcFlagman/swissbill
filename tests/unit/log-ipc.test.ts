import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLogLevel, initLogging, setLogLevel } from '../../src/main/logging';
import { LOG_SETTINGS_FILENAME } from '../../src/main/logging/log-settings';
import { createLogService } from '../../src/main/logging/log-service';
import { AppException } from '@shared/ipc/errors';
import { reportSchema, setLevelSchema } from '@shared/ipc/log';

let dir: string;
const entries = () =>
  readFileSync(join(dir, 'logs', 'swissbill.log'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-logipc-'));
  initLogging(dir);
});
afterEach(() => {
  setLogLevel('info');
  rmSync(dir, { recursive: true, force: true });
});

describe('log:getLevel / log:setLevel (FR-008)', () => {
  it('liefert das aktuelle Level, Standard info', () => {
    expect(createLogService().getLevel()).toEqual({ level: 'info' });
  });

  it('speichert das Level nur in log-settings.json und wendet es sofort an', () => {
    const state = createLogService().setLevel({ level: 'debug' });
    expect(state).toEqual({ level: 'debug' });
    expect(getLogLevel()).toBe('debug');
    expect(JSON.parse(readFileSync(join(dir, LOG_SETTINGS_FILENAME), 'utf8'))).toEqual({
      version: 1,
      level: 'debug',
    });
  });

  it('lehnt andere Werte ab', () => {
    expect(setLevelSchema.safeParse({ level: 'trace' }).success).toBe(false);
    expect(setLevelSchema.safeParse({}).success).toBe(false);
    expect(setLevelSchema.safeParse({ level: 'warn' }).success).toBe(true);
  });

  it('bei nicht schreibbarer Datei: IO-Fehler mit deutscher Meldung, das Level gilt trotzdem', () => {
    const service = createLogService();
    // block the temporary file name with a directory
    // (mkdir on the path makes writeFileSync fail with EISDIR)
    mkdirSync(join(dir, `${LOG_SETTINGS_FILENAME}.tmp`));
    try {
      service.setLevel({ level: 'debug' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).error).toMatchObject({ code: 'IO' });
      expect((error as AppException).error.message).toMatch(/Neustart/);
    }
    expect(getLogLevel()).toBe('debug');
  });
});

describe('log:report (FR-013)', () => {
  it('validiert die Längen', () => {
    expect(reportSchema.safeParse({ message: '' }).success).toBe(false);
    expect(reportSchema.safeParse({ message: 'x'.repeat(501) }).success).toBe(false);
    expect(reportSchema.safeParse({ message: 'x', stack: 'y'.repeat(4001) }).success).toBe(false);
    expect(reportSchema.safeParse({ message: 'x', source: 'z'.repeat(201) }).success).toBe(false);
    expect(reportSchema.safeParse({ message: 'x', stack: 's', source: 'z' }).success).toBe(true);
  });

  it('schreibt einen Fehler mit Bereich ui', () => {
    createLogService().report({ message: 'Etwas ging schief', stack: 'at x', source: 'App.tsx' });
    expect(entries().at(-1)).toMatchObject({
      level: 'error',
      component: 'ui',
      msg: 'Etwas ging schief',
      stack: 'at x',
      source: 'App.tsx',
    });
  });

  it('verwirft nach 20 Meldungen pro Minute und zählt die verworfenen', () => {
    let now = 1_000_000;
    const service = createLogService({ now: () => now });
    for (let i = 0; i < 25; i++) service.report({ message: `m${i}` });
    expect(entries().filter((e) => e.component === 'ui')).toHaveLength(20);
    now += 61_000;
    service.report({ message: 'danach' });
    const last = entries().at(-1)!;
    expect(last).toMatchObject({ msg: 'danach', dropped: 5 });
  });
});
