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

## Manuell geprüft (Angaben des Benutzers, 2026-10-30)

Geprüft wurde die Musterrechnung `docs/muster-rechnung.pdf` (fiktive Daten, SIX-Beispieldaten: QR-IBAN
`CH44 3199 9123 0008 8901 2`, QR-Referenz `21 00000 00003 13947 14300 09017`, Betrag CHF 1949.75, Zahlungspflichtiger mit
vollständiger Adresse).

| Prüfung | Datum | Werkzeug / App | Ergebnis |
|---------|-------|----------------|----------|
| QR-Code im SIX-Validator (Variante QR-IBAN + QRR) | 2026-10-30 | GEFEG.FX Check, Standard `QR;2.3;CH` | **bestanden**, «The file contains no errors» |
| QR-Code scannen, Banking-App 1 | bis 2026-10-30 | Raiffeisen-App | **bestanden** (Variante nicht festgehalten) |
| QR-Code scannen, Banking-App 2 | bis 2026-10-30 | PostFinance-App | **bestanden** (Variante nicht festgehalten) |

Hinweise zum SIX-Validator:

- Das Formular nimmt **keine PDF-Dateien** an, nur `txt`, `xml` und Bilddateien. Geprüft wurde deshalb der aus dem PDF
  ausgeschnittene QR-Code als Bild (`docs/muster-qr-code.png`). Der Textinhalt dazu liegt als
  `docs/muster-qr-payload.txt` bei (31 Zeilen, LF).
- Der geprüfte QR-Code stammt aus dem PDF, das die Anwendung erzeugt hat (Ausgabe von `swissqrbill`), nicht aus einer
  Testdatei. Damit ist der tatsächlich erzeugte Inhalt gegen den offiziellen Standard validiert.

## Bewertung der Erfolgskriterien

- **SC-002** (Prüfung mit einem Validierungswerkzeug für Swiss QR-Bills): erfüllt für die Variante QR-IBAN + QRR mit
  vollständigem Zahlungspflichtigen.
- **SC-003** (QR-Code im E-Banking korrekt, mindestens zwei Apps): erfüllt, Raiffeisen und PostFinance.

## Nicht manuell geprüfte Varianten (Empfehlung)

Der SIX-Validator wurde nur für eine Variante verwendet. Folgende Fälle sind durch die automatischen Tests abgedeckt,
aber nicht im Validator geprüft:

- normale IBAN mit Creditor Reference (SCOR)
- Rechnung **ohne Zahlungspflichtigen im QR-Code** (Empfänger ohne PLZ oder Ort, 7 leere Zeilen im Payload)
- Empfänger ohne Strasse und Hausnummer, Empfänger im Ausland

Die Fixture `tests/fixtures/six-example-payload.txt` wurde nach dem SIX-Beispiel nachgebaut und nicht mit dem Original
verglichen. Sie ist durch die Validierung des tatsächlich erzeugten QR-Codes weniger wichtig geworden.
