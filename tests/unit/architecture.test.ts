import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const src = join(root, 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const rel = (path: string) => relative(root, path).replaceAll('\\', '/');
const all = files(src);
const outsideDb = all.filter((f) => !rel(f).startsWith('src/main/db/'));

describe('Architektur der Persistenz (Verfassung III/V, FR-012, FR-015)', () => {
  it('TypeORM und die Entitäten werden nur innerhalb von src/main/db/ importiert (ausser Typen)', () => {
    const offenders = outsideDb.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return /from 'typeorm'/.test(text.replace(/import type [^;]*from 'typeorm';/g, '')) || /entities\//.test(text);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('der Renderer und der Shared-Teil kennen keine Datenbank', () => {
    const offenders = all
      .filter((f) => /^src\/(renderer|shared|preload)\//.test(rel(f)))
      .filter((f) => /typeorm|better-sqlite3/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('SQLite-spezifisches steht nur im Adapter (und im geschützten Trigger-Aufräumen)', () => {
    const allowed = new Set([
      'src/main/db/sqlite-adapter.ts',
      'src/main/db/migrations/1700000000003-DropLegacyTriggers.ts',
    ]);
    const sqliteOnly = /PRAGMA|sqlite_|RETURNING|ON CONFLICT|DROP TRIGGER|better-sqlite3|AUTOINCREMENT|unicode_lower|strftime/;
    const offenders = all
      .filter((f) => !allowed.has(rel(f)))
      .filter((f) => {
        // ignore comments
        const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        return sqliteOnly.test(code);
      });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nur Repositories und Startcode des Datenbankmoduls werden ausserhalb benutzt', () => {
    const allowedImports = /db\/(customer-repository|invoice-repository|settings-repository|startup|data-source|sqlite-adapter)/;
    const offenders = outsideDb.filter((f) =>
      [...readFileSync(f, 'utf8').matchAll(/from '(\.\.?\/[^']*db\/[^']*)'/g)].some((m) => !allowedImports.test(m[1] ?? '')),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});
