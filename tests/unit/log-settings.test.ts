import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOG_SETTINGS_FILENAME,
  readLogSettings,
  writeLogSettings,
} from '../../src/main/logging/log-settings';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-logset-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('log-settings.json', () => {
  it('ohne Datei gilt info', () => {
    expect(readLogSettings(dir)).toEqual({ level: 'info' });
  });

  it('liest ein gültiges Level', () => {
    writeFileSync(join(dir, LOG_SETTINGS_FILENAME), '{"version":1,"level":"debug"}');
    expect(readLogSettings(dir)).toEqual({ level: 'debug' });
  });

  it.each([
    ['kaputtes JSON', '{nope'],
    ['unbekanntes Level', '{"version":1,"level":"trace"}'],
    ['andere Version', '{"version":2,"level":"debug"}'],
    ['falscher Typ', '[]'],
  ])('%s → info mit Hinweis', (_name, content) => {
    writeFileSync(join(dir, LOG_SETTINGS_FILENAME), content);
    const result = readLogSettings(dir);
    expect(result.level).toBe('info');
    expect(result.problem).toBeTruthy();
  });

  it('schreibt atomar und nur version und level', () => {
    writeLogSettings(dir, 'warn');
    expect(JSON.parse(readFileSync(join(dir, LOG_SETTINGS_FILENAME), 'utf8'))).toEqual({
      version: 1,
      level: 'warn',
    });
    expect(readdirSync(dir)).toEqual([LOG_SETTINGS_FILENAME]);
    expect(existsSync(join(dir, `${LOG_SETTINGS_FILENAME}.tmp`))).toBe(false);
  });
});
