# Quickstart: Validierung der TypeORM-Persistenz

Voraussetzungen: `npm ci`; Verfassung angepasst (`/speckit-constitution`).

1. **Abhängigkeits-Gate (R1)** nach `npm i typeorm reflect-metadata`:
   ```bash
   npm ls typeorm better-sqlite3
   npm run typecheck
   ```
   Erwartung: keine ungelösten Peer-Fehler (ggf. `overrides`/Rückstufung).
2. **Tests**:
   ```bash
   npm test
   ```
   Erwartung: bestehende Fachtests unverändert grün; umgeschriebene Immutability-/Status-/Migrations-Tests grün; neu grün: `baseline` (Version-2-Datei), `concurrency` (100 parallele Ausstellvorgänge), `rule-parity` (frisch und Bestand), `schema-parity` (Entität ↔ Tabelle), `architecture` (kein `typeorm`-Import ausserhalb `db/`).
3. **Bestandsdatei (SC-002)**: DB mit dem Stand von `main` erzeugen (Kunde, Rechnung ausstellen), Datei kopieren, mit neuem Build öffnen → alle Daten vorhanden, `swissbill.db.bak-2` angelegt, nächste Rechnungsnummer setzt fort, zweiter Start ohne erneute Baseline.
4. **Zu neu/beschädigt**: Datei mit unbekannter Migration bzw. Müll öffnen → Meldung wie bisher, Datei unverändert.
5. **E2E und Paket**:
   ```bash
   npm run test:e2e
   npm run package
   ```
6. **Performance (SC-005)**: `tests/integration/perf.test.ts` grün (10 000 Rechnungen < 1 s inkl. JS-Textsuche).
