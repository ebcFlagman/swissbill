# Research: Adresseingabe mit Vorschlägen (Geoapify)

Es blieben keine `NEEDS CLARIFICATION`. Entscheidungen:

## 1. Wo läuft die Anfrage?

- **Decision**: Im Main-Prozess mit Node-`fetch`, ausgelöst über einen neuen IPC-Kanal.
- **Rationale**: Der Renderer bleibt vollständig vom Netz getrennt (`isAllowedRequest` unverändert, Constitution II/V). Der Key wird im Main aus der DB gelesen und nie in Renderer-Anfragen oder im Netzwerk-Tab der DevTools sichtbar. Der Main kann Zeitlimit, Host-Festlegung und Fehlerabbildung zentral erzwingen.
- **Alternatives**: Renderer-`fetch` mit gelockertem Request-Filter (öffnet das Netz für den Renderer, Key sichtbar) und `net.fetch` über die Default-Session (unterliegt dem Request-Filter und müsste ausgenommen werden) wurden verworfen.

## 2. Dienst und Endpunkt

- **Decision**: Geoapify Geocoding «Address Autocomplete» (`GET https://api.geoapify.com/v1/geocode/autocomplete`) mit `text`, `lang=de`, `limit=5`, `format=json`, `bias=countrycode:ch`, `apiKey`.
- **Rationale**: `bias=countrycode:ch` bevorzugt die Schweiz, ohne andere Länder auszuschliessen (FR-015). Die Antwort liefert strukturierte Felder (`street`, `housenumber`, `postcode`, `city`, `country_code`), die direkt auf die Adressfelder passen.
- **Geprüft (Umsetzung, T001)**: Endpunkt, `text`, `apiKey`, `format=json`, `lang`, `limit`, `bias` und die Antwortfelder `street`, `housenumber`, `postcode`, `city`, `country_code`, `formatted` stimmen mit der Geoapify-Dokumentation überein. Die Dokumentation nennt keine HTTP-Statuscodes für ungültigen Key oder erschöpftes Kontingent; angenommen sind 401/403 → `invalid_key` und 429 → `quota` (üblich bei Geoapify), alles andere → `unavailable`. Das ist mit echtem Key beim manuellen Test (T041) zu bestätigen.
- **Alternatives**: Forward-Geocoding (`/geocode/search`) ist nicht für Teileingaben gedacht.

## 3. Fehlerabbildung

- **Decision**: Der Service liefert ein diskriminiertes Ergebnis: `disabled` (kein Key), `ok` (Liste), `error` mit Grund `offline | invalid_key | quota | timeout | unavailable`. Der Renderer zeigt bei `error` nur einen dezenten Hinweis und lässt die Eingabe unberührt.
- **Rationale**: Erfüllt FR-008/FR-009. HTTP 401/403 → `invalid_key`, 429 → `quota`, Netzwerkfehler → `offline`, Abbruch nach 5 s → `timeout`, sonst `unavailable`.
- **Sicherheit**: Fehlermeldungen und Logs enthalten nie die URL oder den Key; die Anfrage-URL wird nur lokal gebaut und nicht in Ausnahmen weitergereicht.

## 4. Key-Speicherung

- **Decision** (geändert durch Clarify 2026-11-12): Der Key wird mit Electron `safeStorage` (Windows DPAPI, macOS Keychain, Linux Schlüsselbund) und dessen asynchronen Funktionen (`isAsyncEncryptionAvailable`, `encryptStringAsync`, `decryptStringAsync`; die synchronen sind veraltet) verschlüsselt, getrimmt vor dem Verschlüsseln. Der verschlüsselte Wert liegt in der neuen Spalte `geoapify_api_key BLOB` (NULL = nicht gesetzt) der Tabelle `settings` (Migration 002). Die Ver- und Entschlüsselung geschieht nur im Main.
- **Rationale**: Kein Klartext in Datenbank, Sicherungen oder Dateien (FR-006). Der Schlüssel zur Verschlüsselung liegt beim Betriebssystembenutzer, nicht in der Datenbankdatei. Keine neue Abhängigkeit (`safeStorage` ist Teil von Electron).
- **Nicht verfügbar** (`safeStorage.isEncryptionAvailable()` ist falsch, z. B. Linux ohne Schlüsselbund): Speichern wird abgelehnt, die Einstellungen melden «Verschlüsselung auf diesem Gerät nicht verfügbar», Vorschläge bleiben aus (FR-006a). Kein Klartext-Ersatz, kein Linux-Backend `basic_text`.
- **Key nie im Renderer**: `settings:get` liefert nur `geoapifyKeySet` und den Status; der Klartext wird nur im Main für die Anfragen entschlüsselt. Entfernen ist immer möglich (FR-017).
- **Nicht entschlüsselbar** (Sicherung auf anderem Gerät/Benutzer wiederhergestellt): Entschlüsselung schlägt fehl, der Key gilt als nicht gesetzt, die Einstellungen weisen auf die Neueingabe hin.
- **Alternatives**: Eingebauter Schlüssel im Programmcode (nur Verschleierung, auslesbar) und Master-Passwort beim Start (zu viel Aufwand, YAGNI) wurden verworfen.

## 5. Entprellen und veraltete Antworten

- **Decision**: Renderer entprellt 300 ms, fragt ab 3 Zeichen und verwirft Antworten, deren Anfrage-Zähler nicht mehr dem letzten entspricht. Der Main hat zusätzlich ein Zeitlimit von 5 s.
- **Rationale**: FR-013, schont das Gratis-Kontingent.

## 6. UI-Baustein

- **Decision**: PrimeReact `AutoComplete` (in `@primereact/ui` 11.2.2 vorhanden) am Strassenfeld. Eingabe in «Strasse» fragt ab; die Auswahl füllt Strasse, Nr., PLZ, Ort, Land. Tastaturbedienung (FR-004) kommt vom Baustein und wird im E2E-Test geprüft.
- **Rationale**: Bestehender Komponentenstil, keine eigene Listenlogik. Gesucht wird nur mit dem Strassenfeld; Name, IBAN und Hausnummer sind nicht Teil der Suche (FR-011).
- **Umsetzung (T003)**: `AutoComplete.Root` (`options`, `optionLabel`, gesteuertes `inputValue`, `onInputValueChange`, `onValueChange` mit `event.option`, `onComplete`, `delay={300}`, `minLength={3}`, `disabled`, `invalid`) mit `AutoComplete.Input as={InputText}` und Portal/Positioner/Popup/List/Option. Nach einer Auswahl meldet der Baustein die Anzeigezeile als Eingabe; die übernommene Strasse hat Vorrang. Die Tipppause liefert der Baustein, der Schutz vor veralteten Antworten `createSuggestionSearch`. Ohne Key bleibt die Liste leer, und das Feld verhält sich wie ein `InputText` (E2E-Test).

## 7. Key prüfen (FR-014)

- **Decision**: Zweiter Kanal `addresses:testKey` nimmt den noch ungespeicherten Key aus dem Formular und führt eine Probeanfrage («Bahnhofstrasse») aus; Ergebnis `valid | invalid_key | quota | offline | timeout`.
- **Rationale**: Prüfung vor dem Speichern, ohne dass der Key im Renderer irgendwo anders landet.
