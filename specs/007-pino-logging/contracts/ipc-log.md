# Vertrag: IPC-Kanäle für das Logging

Ergänzt `SwissbillApi` (`src/shared/ipc/api.ts`) um den Namensraum `log`. Alle Kanäle sind vor der Datenbank registriert (funktionieren auch im Wiederherstellungsmodus), validieren die Eingabe mit zod und liefern `Result<T>`.

```ts
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface SwissbillApi {
  log: {
    /** Current level of this device */
    getLevel(): Promise<Result<{ level: LogLevel }>>;
    /** Stores the level in userData/log-settings.json and applies it immediately */
    setLevel(input: { level: LogLevel }): Promise<Result<{ level: LogLevel }>>;
    /** Unexpected renderer error; logged by the main process with component "ui" */
    report(input: { message: string; stack?: string; source?: string }): Promise<Result<void>>;
  };
}
```

| Kanal | Eingabe | Fehler |
|---|---|---|
| `log:getLevel` | – | – |
| `log:setLevel` | `level` ∈ vier Werte | `VALIDATION` bei anderem Wert; `IO` (deutsche Meldung) wenn die Datei nicht geschrieben werden kann; das Level gilt dann trotzdem bis zum Neustart |
| `log:report` | `message` 1–500 Zeichen, `stack` ≤ 4000, `source` ≤ 200 | `VALIDATION`; über 20 Meldungen pro Minute werden verworfen (Ergebnis bleibt `ok`) |

Der Renderer erhält keinen Dateizugriff und kein Level-unabhängiges Schreibrecht: `report` schreibt immer als `error`, Bereich `ui`.
