# SwissBill

Einfache Desktop-Anwendung (Electron) zum Erstellen von Schweizer Rechnungen mit QR-Zahlteil als PDF.
Alle Daten bleiben lokal in einer eingebetteten SQLite-Datenbank; die Anwendung läuft vollständig offline,
ohne Konto und ohne Telemetrie.

## Funktionen

- Rechnungen mit Positionen in **CHF** erfassen und als A4-PDF mit **Swiss-QR-Zahlteil** ausgeben (SIX Swiss Implementation Guidelines).
- Prüfung von IBAN und QR-IBAN, automatische Zahlungsreferenz (QR-Referenz bei QR-IBAN, Creditor Reference bei normaler IBAN).
- Rechnungsnummern `PRÄFIX-JAHR-ZÄHLER` (z. B. `RE-2026-0001`), lückenlos, Nummer wird erst beim Ausstellen vergeben.
- Ausgestellte Rechnungen sind **unveränderlich** (auch auf Datenbankebene); Korrektur über Duplizieren oder Stornieren.
- Rechnungsliste mit Suche und Statusfilter, Status: Entwurf, ausgestellt, bezahlt, storniert.
- Globaler Absender und Schlusstext, pro Rechnung überschreibbar; Kundenverwaltung.
- Sicherung der Datenbank als einzelne Datei.
- Deutsches Anwendungsmenü mit Tastenkürzeln. Die Navigation läuft nur über das Menü: Ansicht → Rechnungen/Kunden/Einstellungen (`Strg+1/2/3`); Neue Rechnung `Strg+N`, Datenbank sichern `Strg+Umschalt+S`.

Benutzeroberfläche und Zahlteil sind auf Deutsch, Währung ist immer CHF, MwSt wird nicht ausgewiesen.

## Voraussetzungen

- Node.js 24 und npm
- Windows 11 (primäre Zielplattform)
- Ein PrimeUI-Lizenzschlüssel (Community License, für Einzelpersonen kostenlos), siehe unten

## Einrichten und starten

```bash
npm install
```

Die Oberfläche nutzt PrimeReact 11, das einen Lizenzschlüssel verlangt (Prüfung offline). Ohne Schlüssel
erscheint unten rechts das Banner «Invalid PrimeUI License». Schlüssel bei <https://primeui.dev/pricing> beziehen und eintragen:

```bash
copy .env.example .env.local
```

Danach in `.env.local` den Wert `VITE_PRIMEUI_LICENSE=` ergänzen. Die Datei wird nicht versioniert.

```bash
npm run dev
```

Falls die Electron-Binärdatei fehlt (npm blockiert Install-Skripte), einmalig `node node_modules/electron/install.js` ausführen.

## Prüfen und testen

| Befehl | Zweck |
|--------|-------|
| `npm run typecheck` | TypeScript (strict) für Main, Renderer und Tests |
| `npm run lint` | ESLint |
| `npm test` | Unit- und Integrationstests (Vitest, SQLite in Memory) |
| `npm run test:e2e` | End-to-End-Tests der gebauten App (Playwright mit Electron) |

Tests verwenden ausschliesslich fiktive Daten und einen eigenen temporären Datenordner.

## Paketieren

```bash
npm run package
```

Erzeugt eine entpackte Windows-Anwendung in `release/win-unpacked/`. `better-sqlite3` liefert vorkompilierte
N-API-Binaries mit; ein Rebuild ist nicht nötig.

## Daten und Sicherung

Die Datenbank liegt als **einzelne Datei** `swissbill.db` im Electron-Datenordner
(Windows: `%APPDATA%\swissbill\`). Der genaue Pfad steht unter *Einstellungen → Datenbank und Sicherung*.

- **Sichern:** Dort «Datenbank sichern» wählen (oder die Datei bei geschlossener Anwendung kopieren).
- **Wiederherstellen:** Anwendung schliessen und die Sicherung als `swissbill.db` in den Datenordner kopieren.
- Vor jeder Schema-Aktualisierung entsteht automatisch eine Kopie `swissbill.db.bak-<Version>`.
- Eine beschädigte oder zu neue Datenbankdatei wird nie überschrieben; die Anwendung meldet das beim Start.

Die Datenbank enthält echte Rechnungs- und Bankdaten und gehört nicht ins Repository (`*.db` ist in `.gitignore`).

## Projektstruktur

```text
src/shared/    reine Domänenlogik (Geld, IBAN, Referenzen, Validierung, Zustände) und IPC-Schemas
src/main/      Electron Main-Prozess: Datenbank, Services, PDF, IPC-Handler
src/preload/   schmale, typisierte API für den Renderer
src/renderer/  React-Oberfläche (PrimeReact)
tests/         unit, integration, e2e, fixtures
specs/         Spezifikation, Plan und Aufgaben (Spec Kit)
```

Sicherheit: `contextIsolation` an, `nodeIntegration` aus, Sandbox an, strenge Content-Security-Policy, keine
Netzwerkzugriffe; der Renderer erreicht Datenbank und Dateisystem nur über validierte IPC-Aufrufe.

## Entwicklung mit Spec Kit

Das Projekt wird mit [GitHub Spec Kit](https://github.com/github/spec-kit) entwickelt. Verfassung:
`.specify/memory/constitution.md`. Feature-Spezifikation: `specs/001-swiss-qr-invoices/`
(`spec.md`, `plan.md`, `data-model.md`, `contracts/`, `tasks.md`, `quickstart.md`).

## Bekannte Einschränkungen

- Der PDF-Zahlteil nutzt die Standardschrift Helvetica; sehr seltene Zeichen aus Latin Extended-A werden evtl. nicht korrekt dargestellt.
- Nur ein Absender pro Installation (überschreibbar pro Rechnung), keine MwSt-Ausweisung, keine Rabatte oder Einheiten, nur Deutsch.
- Der Zahlteil wurde im SIX-Validator (Standard QR 2.3 CH) ohne Fehler geprüft und mit der Raiffeisen- und der PostFinance-App erfolgreich gescannt, siehe `docs/validation-log.md` (geprüft: QR-IBAN mit QR-Referenz).
