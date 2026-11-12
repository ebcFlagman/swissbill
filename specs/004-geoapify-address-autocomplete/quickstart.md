# Quickstart: Adresseingabe mit Vorschlägen (Geoapify)

Validierungsleitfaden. Die Automatisierung nutzt immer einen lokalen Fake-Dienst, nie das echte Geoapify.

## Voraussetzungen

```bash
npm install
npm run typecheck && npm run lint
```

## Automatische Prüfung

```bash
npm test                 # Unit + Integration (Mapping, Service mit Fake-fetch, Migration 002)
npm run test:e2e         # inkl. address-suggest.e2e.ts
```

Erwartet:

1. Ohne Key: `addresses:suggest` liefert `disabled`, der Fake-Dienst erhält null Anfragen (SC-005).
2. Mit Key und Fake-Antwort: Vorschlag wählen füllt Strasse, Nr., PLZ, Ort, Land; Name und IBAN bleiben (FR-002).
3. Fake antwortet 401, 429, Timeout oder ist nicht erreichbar: Eingabe bleibt von Hand möglich, nur ein dezenter Hinweis erscheint (FR-009).
4. Neustart: Key bleibt erhalten; Leeren schaltet die Vorschläge ab (SC-004).
5. Migration 002 auf einer bestehenden DB erhält alle Daten, der Key ist leer.

## Testadressen (SC-001, SC-002, SC-006)

Als Suchtext verwendet (öffentliche Strassen, keine Personendaten):

1. Bahnhofstr 1 Zürich
2. Bundesplatz 3 Bern
3. Rue du Lac 1268 Biel
4. Marktgasse 10 Winterthur
5. Rathausplatz 2 Luzern
6. Freie Strasse 5 Basel
7. Via Nassa 20 Lugano
8. Rue du Rhône 30 Genève
9. Poststrasse 12 Zug
10. Bahnhofplatz 1 St. Gallen

## Manuelle Prüfung mit echtem Key (optional)

1. Kostenlosen Key bei Geoapify anlegen.
2. `npm run dev`, Einstellungen öffnen, Key eintragen, «Key prüfen», speichern.
3. In der Rechnung beim Empfänger «Bahnhofstr 1 Zür» in «Strasse» tippen, Vorschlag mit Pfeiltasten und Enter wählen.
4. Netzwerk trennen und erneut tippen: Eingabe funktioniert weiter von Hand.
5. Key entfernen: kein Vorschlag mehr, Verhalten wie vorher.

Verträge: [contracts/ipc-addresses.md](contracts/ipc-addresses.md). Datenmodell: [data-model.md](data-model.md).
