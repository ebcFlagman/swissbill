# Research: Swiss QR-Rechnungen erstellen

Alle Punkte aus dem Technical Context sind entschieden; es bleiben keine `NEEDS CLARIFICATION`.
Versionsangaben stammen vom npm-Register (Stand 2026-10-08).

## 1. Build- und App-Gerüst

- **Decision**: Electron 44 mit `electron-vite` (main/preload/renderer), Packaging mit `electron-builder`.
- **Rationale**: electron-vite liefert TypeScript, Hot-Reload und die übliche Dreiteilung ohne eigene Konfiguration.
- **Alternatives**: Electron Forge (ebenfalls gut, mehr Konfigurationsaufwand für Vite+TS); eigenes Webpack-Setup (unnötig komplex, Prinzip V).

## 2. Datenbank

- **Decision**: SQLite über `better-sqlite3` 13, Datei `swissbill.db` im `userData`-Ordner. Journal-Modus `DELETE` (keine `-wal`/`-shm`-Zusatzdateien), damit eine Sicherung wirklich nur eine Datei ist (FR-016). Zusätzlich ein Menüpunkt «Datenbank sichern» über die Backup-API von better-sqlite3.
- **Rationale**: Synchron, schnell, ausgereift. Ab Version 13 baut better-sqlite3 auf N-API; vorkompilierte Binaries sollten ohne Rebuild gegen Electron laufen. Das ist in der Recherche nur teilweise belegt und wird deshalb im ersten Task im verpackten Build geprüft; bei Problemen wird `@electron/rebuild` eingesetzt.
- **Alternatives**: `node:sqlite` (kein Native-Modul, aber API schmaler und Stabilität in Electron nicht bestätigt); `sql.js` (in Memory, Persistenz selbst bauen); ORMs wie Drizzle (für ca. fünf Tabellen unnötiger Ballast).
- **Migrationen**: Eigener, minimaler Runner. SQL-Dateien `NNN_name.sql`, Version in `PRAGMA user_version`, jede Migration in einer Transaktion, nur vorwärts (Prinzip III). Vor einer Migration wird automatisch eine Kopie der DB angelegt.

## 3. Geldbeträge und Mengen

- **Decision**: Beträge als ganze Rappen (`INTEGER`), Mengen in Tausendsteln (`INTEGER`, 3 Nachkommastellen). Positionsbetrag = `round_half_up(menge_milli * einzelpreis_rappen / 1000)`. Gesamtbetrag = Summe der Positionsbeträge, es gibt keine weitere Rundung.
- **Rationale**: Vermeidet Fliesskommafehler (Prinzip III); die Summe der angezeigten Positionen entspricht immer dem Total (Edge Case Rundung).
- **Alternatives**: Dezimalbibliothek (zusätzliche Abhängigkeit ohne Nutzen); `number` mit Rundung (fehleranfällig).

## 4. QR-Rechnung und PDF

- **Decision**: `pdfkit` für die Rechnung, `swissqrbill` 4 (MIT) zum Anhängen des Zahlteils (`SwissQRBill.attachTo`). Die Prüfung der Eingaben liegt in einem eigenen Domänenmodul und läuft **vor** dem Rendern.
- **Rationale**: `swissqrbill` erzeugt Layout, Schweizer Kreuz und Trennlinie nach SIX-Vorgabe und wird als pdfkit-Plugin genutzt; die README erwähnt aber keine eigene Prüfung von IBAN, Referenztypen und Feldlängen. Constitution Prinzip I verlangt harte Validierung, darum eigene getestete Regeln.
- **Alternatives**: Zahlteil selbst zeichnen (hohes Fehlerrisiko, Standard ist umfangreich); HTML nach PDF über Chromium-Druck (Seitenränder und Massgenauigkeit des Zahlteils schwieriger sicherzustellen).
- **Verifikation**: Test mit bekannten gültigen Beispiel-Payloads; manuell mit dem SIX-Validator und zwei Banking-Apps (SC-002, SC-003).

## 5. Validierungsregeln (Prinzip I)

- **IBAN**: Länge, Zeichenvorrat, ISO-7064-Mod-97-Prüfsumme; Länderkennung nur `CH` oder `LI`.
- **QR-IBAN**: IID (Stellen 5–9) im Bereich 30000–31999. Dann ist eine QR-Referenz Pflicht.
- **Referenztyp**: QR-IBAN → `QRR`; normale IBAN → `SCOR` (Creditor Reference). `NON` bleibt technisch möglich, wird aber nicht erzeugt, da die Referenz automatisch abgeleitet wird (FR-019).
- **QR-Referenz (QRR)**: 27 Ziffern, 26 Ziffern Nutzdaten plus Prüfziffer nach Modulo 10 rekursiv. Nutzdaten = Jahr und Zähler der Rechnungsnummer, links mit Nullen aufgefüllt (FR-020).
- **Creditor Reference (SCOR)**: `RF` + 2 Prüfziffern (ISO 11649, Mod 97) + Nutzdaten (Jahr und Zähler als Ziffern), maximal 25 Zeichen.
- **Adressen**: Strukturierte Adresse; Feldlängen laut Standard (Name 70, Strasse 70, Hausnummer 16, PLZ 16, Ort 35); Zeichenvorrat des Standards (lateinischer Zeichensatz); zu lange oder ungültige Felder werden mit feldgenauer Meldung abgelehnt.
- **Betrag**: > 0 und höchstens 999'999'999.99; Währung fest `CHF`.

## 6. Rechnungsnummer und Ausstellung

- **Decision**: Nummer `PRÄFIX-JAHR-ZÄHLER` (z. B. `RE-2026-0001`). Eine Tabelle `number_counters(year, last_seq)` wird beim Ausstellen in derselben Transaktion erhöht, die den Status auf `issued` setzt und die Momentaufnahme festschreibt. Dadurch gibt es keine Lücken und keine Duplikate (`UNIQUE(number)`).
- **Rationale**: Die Nummer wird erst bei der Ausstellung vergeben (Klarstellung der Spec). Die PDF-Ausgabe ist von der Ausstellung getrennt: Schlägt das Speichern der Datei fehl, bleibt die Rechnung ausgestellt und das PDF lässt sich jederzeit erneut erzeugen (FR-010).
- **Alternatives**: Nummer schon im Entwurf vergeben (erzeugt Lücken beim Löschen von Entwürfen, verworfen).

## 7. Unveränderlichkeit

- **Decision**: Eine ausgestellte Rechnung speichert alle relevanten Daten als Momentaufnahme in den eigenen Spalten und Positionen (Absender, Schuldner, Schlusstext, Referenz, Layout-Version). Zusätzlich sperren SQLite-Trigger `UPDATE`/`DELETE` auf ausgestellten Rechnungen und deren Positionen, ausser für Statuswechsel (`issued → paid`, `issued → cancelled`, `paid → issued` zur Korrektur einer Fehlbuchung).
- **Rationale**: Doppelte Absicherung (Service-Logik und Datenbank) für Prinzip III; das PDF wird bei Bedarf aus der Momentaufnahme neu erzeugt und enthält dasselbe Ausstellungsdatum.
- **Alternatives**: PDF als Blob speichern (Datenbank wächst, Layout-Verbesserungen wären nicht anwendbar; bei Bedarf später ergänzbar).

## 8. UI

- **Decision**: React 19 mit PrimeReact 11 (Tabellen, Formulare, Dialoge), deutsche Texte direkt im Code (nur Deutsch, keine i18n-Infrastruktur).
- **Rationale**: Tabellen mit Filter und Formulare mit Validierungsanzeige werden von PrimeReact fertig geliefert; für die gewünschte «einfache Desktop-Anwendung» spart das Aufwand. Hinweis: In dieser Umgebung steht bereits ein PrimeReact-MCP für Komponentendokumentation zur Verfügung.
- **Alternatives**: React mit eigenem CSS (mehr Handarbeit bei Tabellen/Dialogen); Vue/Svelte (keine Vorteile für dieses Projekt). **Annahme**: Die UI-Bibliothek ist nicht von dir vorgegeben worden und kann vor `/speckit-tasks` noch geändert werden.

## 9. Sicherheit (Prinzip V)

- `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, Navigation und neue Fenster blockiert.
- Content-Security-Policy ohne externe Quellen (`default-src 'self'`).
- Renderer erhält nur Funktionen aus dem Preload-Skript; jeder IPC-Aufruf wird im Main mit zod validiert. Dateisystemzugriff nur über Main-Dialoge (Speichern-Dialog für PDF und Sicherung).

## 10. Tests

- **Decision**: Vitest für Unit und Integration (DB `:memory:`), Playwright mit Electron-Support für den E2E-Hauptablauf. Domäne wird test-first entwickelt.
- **Alternatives**: Jest (mehr Konfiguration bei TypeScript/ESM); Spectron (eingestellt).
