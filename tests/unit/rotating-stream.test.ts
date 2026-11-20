import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RotatingFileStream } from '../../src/main/logging/rotating-stream';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-rot-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('RotatingFileStream', () => {
  it('schreibt eine Zeile pro write in die Datei', () => {
    const file = join(dir, 'logs', 'swissbill.log');
    const stream = new RotatingFileStream({ file });
    stream.write('{"a":1}\n');
    stream.write('{"a":2}\n');
    expect(readFileSync(file, 'utf8')).toBe('{"a":1}\n{"a":2}\n');
  });

  it('gibt bei nicht beschreibbarem Ziel auf stderr aus und wirft nie (FR-010)', () => {
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'x'); // a file where the directory should be
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const stream = new RotatingFileStream({ file: join(blocker, 'logs', 'swissbill.log') });
    expect(() => stream.write('zeile\n')).not.toThrow();
    expect(spy).toHaveBeenCalledWith('zeile\n');
  });

  it('ohne Datei geht alles auf stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    new RotatingFileStream({ file: null }).write('früh\n');
    expect(spy).toHaveBeenCalledWith('früh\n');
  });

  it('rotiert bei Überschreiten der Grösse und behält höchstens maxFiles Dateien', () => {
    const file = join(dir, 'swissbill.log');
    const stream = new RotatingFileStream({ file, maxBytes: 100, maxFiles: 3 });
    const lines = Array.from({ length: 50 }, (_, i) => `{"n":${String(i).padStart(3, '0')}}\n`);
    for (const line of lines) stream.write(line);
    const names = readdirSync(dir).sort();
    expect(names).toEqual(['swissbill.log', 'swissbill.log.1', 'swissbill.log.2']);
    // the newest line is in the active file, nothing was lost between the retained files
    const all = ['swissbill.log.2', 'swissbill.log.1', 'swissbill.log']
      .map((n) => readFileSync(join(dir, n), 'utf8'))
      .join('');
    expect(all.endsWith(lines.at(-1)!)).toBe(true);
    expect(all.split('\n').filter(Boolean).length).toBeGreaterThan(5);
  });

  it('beschränkt den Speicherbedarf auch bei sehr vielen Einträgen (SC-003)', () => {
    // few, small files instead of 100 000 entries: every write is a synchronous file operation,
    // which is slow on Windows; the bound that is checked does not depend on the amount
    const file = join(dir, 'swissbill.log');
    const stream = new RotatingFileStream({ file, maxBytes: 5_000, maxFiles: 5 });
    const line = `{"time":"2026-11-20T10:00:00.000Z","level":"info","msg":"${'x'.repeat(120)}"}\n`;
    for (let i = 0; i < 1_500; i++) stream.write(line);
    const total = readdirSync(dir)
      .map((n) => readFileSync(join(dir, n)).length)
      .reduce((a, b) => a + b, 0);
    expect(readdirSync(dir).length).toBeLessThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(5 * (5_000 + line.length));
  }, 30_000);

  it('setzt die Rotation mit einer bereits vorhandenen grossen Datei fort', () => {
    const file = join(dir, 'swissbill.log');
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, 'x'.repeat(150));
    const stream = new RotatingFileStream({ file, maxBytes: 100, maxFiles: 2 });
    stream.write('neu\n');
    expect(existsSync(`${file}.1`)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('neu\n');
  });
});
