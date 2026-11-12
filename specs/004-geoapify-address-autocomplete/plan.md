# Implementation Plan: Adresseingabe mit Vorschlägen (Geoapify)

**Branch**: `004-geoapify-address-autocomplete` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-geoapify-address-autocomplete/spec.md`

## Summary

Die Strassen-Eingabe in `AddressFields` bekommt Adressvorschläge. Die Anfrage an Geoapify läuft
ausschliesslich im Main-Prozess (Node `fetch`); der Renderer bleibt weiterhin ohne Netzwerkzugriff
(`request-filter.ts` bleibt unverändert). Der API-Key ist eine neue, optionale Einstellung (leer =
Funktion aus). Ohne Key liefert der Main sofort «deaktiviert» zurück und sendet nichts. Bei jedem
Fehler fällt die Eingabe auf die bisherigen Einzelfelder zurück. Die Abbildung der Antwort auf
Adressfelder und die Auswahl der Vorschläge sind reine Funktionen im Shared-Teil und werden
test-first entwickelt.

## Technical Context

**Language/Version**: TypeScript 6.0, Node im Electron-45-Main, React 19

**Primary Dependencies**: bestehende (Electron, React, `@primereact/ui` 11.2.2, zod, better-sqlite3); keine neue Abhängigkeit (Node-`fetch`, PrimeReact `AutoComplete` ist bereits enthalten)

**Storage**: bestehende SQLite-Tabelle `settings`, neue Spalte per Migration 002

**Testing**: vitest (Unit, Integration mit In-Memory-DB), Playwright für E2E; Geoapify wird in Tests immer durch einen Fake ersetzt, kein Test spricht mit dem echten Dienst

**Target Platform**: Windows und Linux (Electron-Desktop)

**Project Type**: desktop-app

**Performance Goals**: Vorschläge erscheinen innerhalb 1 s nach Tippende bei normaler Verbindung (300 ms Entprellung, 5 s Zeitlimit); Tippen bleibt nie blockiert

**Constraints**: offline-fähig; ohne Key null Netzwerkanfragen; nur Host `api.geoapify.com` über HTTPS; nur Suchtext und Key verlassen das Gerät; Key taucht in keinem Log, keiner Fehlermeldung und keinem PDF auf

**Scale/Scope**: 1 neuer IPC-Namensraum (`addresses`, 2 Kanäle), 1 Migration, 1 Einstellungsfeld, 1 angepasste Komponente (`AddressFields`, an 4 Stellen genutzt)

## Constitution Check

*GATE: vor Phase 0 geprüft, nach Phase 1 erneut geprüft.*

| Prinzip | Bewertung |
|---------|-----------|
| I. QR-Bill-Konformität | OK. Vorschläge füllen nur Felder vor; die bestehende `validateAddress` läuft unverändert beim Ausstellen. Nichts wird stillschweigend korrigiert, überlange Werte werden nicht gekürzt. |
| II. Local-First / Offline | OK mit Ausnahme (Constitution v1.1.0): Zugriff nur mit Key, nur Host `api.geoapify.com`, nur Suchtext, Fallback bei jedem Fehler. Ohne Key kein Netzwerkverkehr. Der Renderer bleibt gesperrt; der Zugriff liegt allein im Main. |
| III. Datenintegrität | OK. Neue Spalte per vorwärts-gerichteter Migration 002, ausgestellte Rechnungen unberührt (der Key gehört nicht zur Rechnungs-Momentaufnahme). |
| IV. Test-First Domain | OK. Antwort-Mapping, Auswahl-/Mindestlängenregel und URL-Bau sind reine Funktionen und werden zuerst als Unit-Tests geschrieben. Ein E2E-Test deckt «Vorschlag wählen» und «ohne Key unverändert». |
| V. Einfachheit & Sicherheit | OK. Keine neue Abhängigkeit, `contextIsolation` bleibt, schmale typisierte IPC (2 Kanäle), Validierung mit zod. |

Keine Verstösse, daher keine Einträge unter Complexity Tracking.

**Erneute Prüfung nach Phase 1**: unverändert bestanden. Das Datenmodell enthält nur das Key-Feld, und der Vertrag sendet nur `text`.

## Project Structure

### Documentation (this feature)

```text
specs/004-geoapify-address-autocomplete/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ipc-addresses.md
└── tasks.md             # von /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── domain/
│   │   ├── settings.ts              # + geoapifyKeySet/-Status (Ausgabe), geoapifyApiKey? (Eingabe), Key-Regeln
│   │   └── address-suggestion.ts    # NEU: Typ, Mapping Geoapify-Antwort → Vorschlag, Mindestlänge
│   └── ipc/
│       ├── api.ts                   # + addresses.suggest / addresses.testKey, Kanäle
│       ├── settings.ts              # zod: + geoapifyApiKey (optional, nur Eingabe)
│       └── addresses.ts             # NEU: Eingabe-Schemas, Ergebnistypen
├── main/
│   ├── db/
│   │   ├── migrations/002_geoapify_key.sql   # NEU
│   │   └── settings-repository.ts   # + Spalte lesen/schreiben (verschlüsselter Wert)
│   ├── secret-store.ts              # NEU: Schnittstelle SecretStore (ohne electron-Import, in Tests ersetzbar)
│   ├── electron-secret-store.ts     # NEU: Umsetzung über safeStorage (bzw. Speicher-Store bei SWISSBILL_SECRET_STORE=memory, nur unverpackt)
│   ├── services/
│   │   ├── settings-service.ts      # + Key trimmen
│   │   ├── geoapify-client.ts       # NEU: URL-Bau, fetch mit Zeitlimit, Statusabbildung (fetch injizierbar)
│   │   └── address-service.ts       # NEU: Key lesen (Main), suggest/testKey, Fehlerabbildung
│   └── ipc/
│       ├── addresses.ts             # NEU: Handler
│       └── register.ts              # + registerAddressHandlers
├── preload/index.ts                 # + addresses
└── renderer/
    ├── lib/use-address-suggestions.ts # NEU: Hook, Entprellung 300 ms, Verwerfen veralteter Antworten
    ├── components/AddressFields.tsx # Strassenfeld als AutoComplete, Übernahme der Felder
    └── pages/Settings.tsx           # + Feld «Geoapify-API-Key», Hinweis, «Key prüfen»

tests/
├── fixtures/                        # geoapify-autocomplete.json, secret-store.ts (Fake)
├── unit/address-suggestion.test.ts  # Mapping, Mindestlänge, Übernahme + Adressprüfung
├── unit/use-address-suggestions.test.ts # Entprellung, veraltete Antworten
├── integration/address-service.test.ts  # Fake-fetch: aus, ok, 401, 429, Timeout, offline; Key nie im Fehlertext
├── integration/migrate.test.ts      # + Migration 002
└── e2e/address-suggest.e2e.ts       # mit lokalem Fake-Server
```

**Structure Decision**: bestehende Aufteilung `shared` / `main` / `preload` / `renderer` beibehalten, wie in Feature 001. Der Netzwerkzugriff liegt im Main-Service, damit der Key nie in der Renderer-Anfrage steht und die Netzwerksperre des Renderers unverändert bleibt.

## Complexity Tracking

Keine Verstösse.

## Folgearbeiten ausserhalb des Codes

- Kommentar in `src/main/request-filter.ts` und README (Zeilen 4 und 131) an die Opt-in-Ausnahme anpassen.
