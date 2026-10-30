# Abnahmeprotokoll Zahlteil (T066)

Zweck: Nachweis, dass der erzeugte Swiss-QR-Zahlteil gültig ist (Erfolgskriterien SC-002 und SC-003).

## Automatisch geprüft (Stand 2026-10-08)

Diese Prüfungen laufen in `npm test` und sind grün:

- Der QR-Code wird aus dem erzeugten PDF gerastert, mit jsQR dekodiert und **Zeichen für Zeichen** mit dem
  Payload des eigenen Builders verglichen (`tests/integration/pdf.test.ts`). Der Builder wiederum entspricht einem
  Beispiel aus den SIX-Richtlinien (`tests/unit/qr-payload.test.ts`, Fixture `tests/fixtures/six-example-payload.txt`).
- IBAN-Prüfsumme, QR-IBAN-IID-Bereich, QR-Referenz (Modulo 10 rekursiv) und Creditor Reference (ISO 11649) sind gegen
  bekannte Beispiele getestet.
- Seitengrösse A4, Zahlteil auf der letzten Seite, auch bei mehrseitigen Rechnungen.

## Manuelle Prüfung durch den Benutzer

Die folgenden Schritte kann nur ein Mensch mit Zugang zu den Werkzeugen durchführen.

1. Eine Rechnung mit **fiktiven** Daten in der Anwendung ausstellen und das PDF speichern
   (oder das mitgelieferte Muster-PDF `docs/muster-rechnung.pdf` verwenden: SIX-Beispieldaten, QR-IBAN, QR-Referenz, Betrag 1949.75).
2. Das PDF im SIX-Validator für QR-Rechnungen prüfen
   (Werkzeug «QR-bill validation» auf <https://www.paymentstandards.ch>). **Nicht durchgeführt.**
3. Den QR-Code mit **mindestens zwei Banking-Apps** scannen und prüfen, dass Betrag, Empfänger und Referenz stimmen.
   **Durchgeführt:** Raiffeisen- und PostFinance-App, beide bestanden (Angabe des Benutzers, Stand 2026-10-30).
4. Die Fixture `tests/fixtures/six-example-payload.txt` mit dem Beispiel in den offiziellen SIX-Richtlinien vergleichen
   (sie wurde nachgebaut, nicht kopiert). **Nicht durchgeführt.**

| Prüfung | Datum | Werkzeug / App | Ergebnis |
|---------|-------|----------------|----------|
| SIX-Validator, QR-IBAN + QRR | | | offen (nicht durchgeführt) |
| SIX-Validator, normale IBAN + SCOR | | | offen (nicht durchgeführt) |
| Banking-App 1 | bis 2026-10-30 | Raiffeisen-App | bestanden (Variante nicht festgehalten) |
| Banking-App 2 | bis 2026-10-30 | PostFinance-App | bestanden (Variante nicht festgehalten) |
| Fixture gegen SIX-Richtlinien | | | offen (nicht durchgeführt) |

## Bewertung der Erfolgskriterien

- **SC-003** (QR-Code im E-Banking korrekt, mindestens zwei Apps): erfüllt, Raiffeisen und PostFinance.
- **SC-002** (Prüfung mit einem Validierungswerkzeug für Swiss QR-Bills): **noch offen**. Der SIX-Validator wurde nicht
  verwendet. Solange er fehlt, belegt nur der automatische Test (Payload entspricht dem nachgebauten SIX-Beispiel) und die
  Annahme der beiden Banking-Apps die Gültigkeit.
