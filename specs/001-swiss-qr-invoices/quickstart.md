# Quickstart: Validierung der Funktion

Dieser Leitfaden zeigt, wie geprüft wird, dass die Funktion von Anfang bis Ende arbeitet.
Er enthält keinen Implementierungscode. Details: [data-model.md](data-model.md), [contracts/ipc-api.md](contracts/ipc-api.md), [research.md](research.md).

## Voraussetzungen

- Node.js 24 und npm, Windows 11 (primäre Zielplattform)
- Ein PrimeUI-Lizenzschlüssel (Community License) in `.env.local` (`VITE_PRIMEUI_LICENSE=…`, Vorlage `.env.example`);
  ohne Schlüssel zeigt PrimeReact 11 das Banner «Invalid PrimeUI License»
- Nur fiktive Testdaten verwenden (Constitution: keine echten Kundendaten)

## Setup

```bash
npm install
npm run dev        # Entwicklungsmodus mit Hot-Reload
```

Falls die Electron-Binärdatei fehlt: `node node_modules/electron/install.js`.

Paket prüfen (`better-sqlite3` lädt ohne Rebuild, siehe research.md Abschnitt 2):

```bash
npm run package    # baut und paketiert nach release/win-unpacked/
```

## Automatische Prüfungen

```bash
npm run typecheck
npm run lint
npm test            # Vitest: Unit und Integration (173 Tests)
npm run test:e2e    # Playwright gegen die gebaute Electron-App (inkl. verpackter App, falls vorhanden)
```

Erwartet: alles grün. Die Domänentests decken IBAN, QR-IBAN, QR-Referenz (Modulo 10), Creditor Reference (Mod 97),
Rappen-Rundung, QR-Payload, Rechnungsnummern und Statusübergänge ab.

### Abdeckung der manuellen Abnahmeschritte durch automatische Tests

| Schritt | Automatisch geprüft in |
|---------|------------------------|
| 1 Einstellungen, 2 Kunde, 11 Absender überschreiben | `tests/e2e/settings-customers.e2e.ts`, `tests/integration/customers-settings.test.ts` |
| 3 Rechnung erfassen, 4 Ausstellen und Schreibschutz | `tests/e2e/create-invoice.e2e.ts`, `tests/integration/issue.test.ts`, `tests/integration/immutability.test.ts` |
| 5 PDF speichern (Zahlteil, Betrag, Referenz) | `tests/integration/pdf.test.ts` (QR-Code des PDFs wird dekodiert und mit dem Payload verglichen) |
| 7 Neustart, PDF erneut erzeugen | `tests/e2e/persistence.e2e.ts`, `tests/integration/persistence.test.ts` |
| 8 Fehlerfälle | `tests/unit/invoice-validation.test.ts`, `tests/unit/iban.test.ts`, `tests/unit/reference.test.ts`, `tests/e2e/create-invoice.e2e.ts` |
| 9 Storno und Löschen | `tests/e2e/status.e2e.ts`, `tests/integration/status.test.ts` |
| 10 Sicherung (eine Datei) | `tests/integration/backup.test.ts` |
| Fehlerfall Datenbank beim Start | `tests/integration/corrupt-db.test.ts` |
| Leistung (5'000 Rechnungen, 50 Positionen) | `tests/integration/perf.test.ts` |

## Sicherheitsprüfung (automatisiert in `tests/e2e/security.e2e.ts`)

- `nodeIntegration` aus, `contextIsolation` an, Sandbox an, `webSecurity` an
- Im Renderer weder `require`, `process`, `module` noch `ipcRenderer`; `window.swissbill` enthält nur `app`, `customers`, `db`, `invoices`, `pdf`, `settings`
- Content-Security-Policy ohne externe Quellen und ohne `unsafe-eval`; eingeschleuste Inline-Skripte laufen nicht
- Externe Netzwerkzugriffe (z. B. `fetch('https://…')`) und Navigation weg von der App sind blockiert, neue Fenster werden verweigert
- Ein typischer Ablauf löst keine Anfragen ausserhalb von `file:`, `blob:` und `data:` aus

## Manuelle Abnahme (teilweise erledigt, siehe docs/validation-log.md)

1. In der Anwendung eine Rechnung mit fiktiven Daten ausstellen und das PDF speichern.
2. PDF im SIX-Validator für QR-Rechnungen prüfen (SC-002). **Offen.**
3. QR-Code mit mindestens zwei Banking-Apps scannen, Betrag, Empfänger und Referenz kontrollieren (SC-003). **Erledigt:** Raiffeisen- und PostFinance-App, beide bestanden.
4. Fixture `tests/fixtures/six-example-payload.txt` mit dem Beispiel in den offiziellen SIX-Richtlinien vergleichen.
5. Benutzbarkeit (SC-001, SC-004): Rechnung mit drei Positionen in unter 3 Minuten erstellen; Erstbenutzer ohne Anleitung.

## Erwartetes Ergebnis

Alle Schritte gelingen ohne Netzwerkverbindung. Ein Blick in den `userData`-Ordner (`%APPDATA%\swissbill\`) zeigt genau
eine Datenbankdatei `swissbill.db` (ohne `-wal`/`-shm`).

## Abweichungen gegenüber dem ersten Entwurf dieses Leitfadens

- Der Lizenzschlüssel für PrimeReact 11 wird benötigt (neu).
- «PDF öffnen / drucken» (FR-014) und der Status «storniert» sind umgesetzt; stornierte Rechnungen erhalten im PDF das
  Wasserzeichen «STORNIERT» und keinen Zahlteil.
- Der IPC-Kanal `invoices.validate` entfällt; der Renderer prüft lokal mit denselben Regeln aus `src/shared/domain`.
