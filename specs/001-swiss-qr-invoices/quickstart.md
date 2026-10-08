# Quickstart: Validierung der Funktion

Dieser Leitfaden zeigt, wie nach der Umsetzung geprüft wird, dass die Funktion von Anfang bis Ende arbeitet.
Er enthält keinen Implementierungscode. Details: [data-model.md](data-model.md), [contracts/ipc-api.md](contracts/ipc-api.md), [research.md](research.md).

## Voraussetzungen

- Node.js 24 und npm
- Windows 11 (primäre Zielplattform)
- Nur fiktive Testdaten verwenden (Constitution: keine echten Kundendaten)

## Setup

```bash
npm install
npm run dev        # Entwicklungsmodus mit Hot-Reload
```

Zusätzlich einmalig prüfen, dass `better-sqlite3` im verpackten Build lädt:

```bash
npm run build && npm run package
```

## Automatische Prüfungen

```bash
npm run typecheck
npm run lint
npm test            # Vitest: Unit und Integration
npm run test:e2e    # Playwright gegen die gebaute Electron-App
```

Erwartet: alles grün. Insbesondere müssen die Domänentests für IBAN, QR-IBAN, QR-Referenz (Modulo 10),
Creditor Reference (Mod 97), Rappen-Rundung und Statusübergänge bestehen.

## Manuelle Abnahme (entspricht den Erfolgskriterien)

1. **Einstellungen**: Absender mit fiktiver QR-IBAN `CH44 3199 9123 0008 8901 2` erfassen, Präfix `RE`, Schlusstext «Zahlbar innert 30 Tagen».
2. **Kunde** anlegen (fiktiv).
3. **Neue Rechnung**: Kunde wählen, drei Positionen erfassen (SC-001: unter 3 Minuten).
4. **Ausstellen**: Rechnung erhält Nummer `RE-<Jahr>-0001`, Status «ausgestellt», Felder sind schreibgeschützt.
5. **PDF speichern**: Zahlteil unten auf der A4-Seite, Betrag und Referenz stimmen.
6. **Prüfen** (SC-002/SC-003): PDF im SIX-Validator für QR-Rechnungen prüfen und den QR-Code mit mindestens zwei Banking-Apps scannen.
7. **Neustart** der App: Rechnung ist unverändert vorhanden (SC-005); PDF erneut erzeugen, Inhalt identisch (SC-006).
8. **Fehlerfälle**: normale IBAN statt QR-IBAN mit erzwungener QR-Referenz, ungültige IBAN-Prüfsumme, Betrag 0, zu langer Name: Ausstellen wird mit feldgenauer Meldung verhindert (SC-007).
9. **Storno/Löschen**: Entwurf löschen (keine Nummernlücke), ausgestellte Rechnung stornieren (Nummer bleibt vergeben), ausgestellte Rechnung lässt sich nicht löschen.
10. **Sicherung**: «Datenbank sichern» ausführen und prüfen, dass die Kopie eine einzelne Datei ist (FR-016).
11. **Absender überschreiben**: In einer Rechnung einen anderen Absender setzen; globaler Absender bleibt unverändert (FR-017).

## Erwartetes Ergebnis

Alle Schritte gelingen ohne Netzwerkverbindung. Ein Blick in den `userData`-Ordner zeigt genau eine Datei `swissbill.db` (ohne `-wal`/`-shm`).
