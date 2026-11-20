# Vertrag: Verbindungs-IPC (Renderer ↔ Main)

Alle Kanäle sind **vor** dem Datenbankstart registriert und brauchen keine `DataSource`. Eingaben werden im Main mit `zod` validiert (wie die übrigen Kanäle). Das Passwort wird nur **vom** Renderer **zum** Main gesendet, nie zurück.

## Typen (`src/shared/ipc/db-connection.ts`)

```ts
type DbType = 'sqlite' | 'postgres' | 'mysql' | 'mariadb';

interface DbConnectionSettings {            // entspricht db-connection.json (ohne Passwort)
  type: DbType;
  host: string; port: number; database: string; user: string;
  tls: { enabled: boolean; caPath: string | null };
}

interface DbConnectionState {
  settings: DbConnectionSettings | null;     // null = lokal (Standard)
  passwordStored: boolean;
  keychainAvailable: boolean;
  active: 'local' | 'server' | 'recovery';   // womit die App gerade läuft
}

interface DbConnectionInput {
  settings: DbConnectionSettings;
  password: { action: 'keep' } | { action: 'set'; value: string } | { action: 'remove' };
}

interface DbConnectionTestResult {
  ok: boolean;
  failedStage: 'reachable' | 'authentication' | 'database' | 'permissions' | 'schema' | null;
  message: string;                            // deutsch, ohne Passwort
  schema: 'empty' | 'current' | 'older' | 'newer' | 'foreign' | 'unknown';
}
```

## Kanäle

| Kanal | Eingabe | Ausgabe | Verhalten |
|---|---|---|---|
| `dbConnection:get` | – | `DbConnectionState` | liest Datei und prüft, ob ein Passwort im Schlüsselbund liegt |
| `dbConnection:test` | `DbConnectionInput` | `DbConnectionTestResult` | verbindet probeweise (10 s Timeout), verändert nichts, schliesst wieder; bei `keep` wird das gespeicherte Passwort verwendet |
| `dbConnection:save` | `DbConnectionInput` | `{ restartRequired: true }` | validiert, speichert Datei und Passwort (`set`/`remove`), lehnt `set` ohne Schlüsselbund ab (`KEYCHAIN_UNAVAILABLE`); wirkt erst nach Neustart |
| `dbConnection:useLocalOnce` | – | – | nur im Wiederherstellungsmodus: startet diese Sitzung mit lokalem SQLite, ohne die Konfiguration zu ändern |
| `dbConnection:retry` | – | – | nur im Wiederherstellungsmodus: erneuter Verbindungsversuch |
| `app:relaunch` | – | – | startet die App neu (nach Speichern) |

## Fehlercodes (`AppException`)

`VALIDATION` (Feldfehler), `KEYCHAIN_UNAVAILABLE`, `CONNECTION` (mit `failedStage`), `SCHEMA_NEWER`, `SCHEMA_FOREIGN`, `LOCK_LOST`, `LOCKED` (von anderem Gerät gesperrt; Daten: `ownerLabel`).

## Sperren-Kanäle (nur Serververbindung)

| Kanal | Eingabe | Ausgabe |
|---|---|---|
| `locks:acquire` | `{ entityType: 'customer' \| 'invoice'; entityId: number }` | `{ ok: true } \| { ok: false; ownerLabel: string }` |
| `locks:heartbeat` | `{ entityType; entityId }` | `{ ok: boolean }` (false = Sperre verloren) |
| `locks:release` | `{ entityType; entityId }` | – |

Bei lokalem SQLite antworten die Kanäle immer `{ ok: true }` ohne Datenbankzugriff.

## Garantien

- Kein Kanal gibt Passwort, Verbindungsfehlertexte mit Zugangsdaten oder Treiber-Rohnachrichten zurück; Meldungen werden im Main zusammengestellt.
- `dbConnection:*` und `app:relaunch` sind die einzigen Kanäle im Wiederherstellungsmodus.
