# Data Model: Adresseingabe mit Vorschlägen (Geoapify)

## Settings (erweitert)

| Feld | Typ | Regel |
|------|-----|-------|
| `geoapifyApiKey` | Text, nur als **Eingabe** an `settings:save` (optional) | `undefined` = unverändert, `''` = entfernen, sonst setzen. Beim Speichern getrimmt. Höchstens 200 Zeichen, keine Leerzeichen oder Steuerzeichen im Inneren. Wird nie an den Renderer zurückgegeben. |
| `geoapifyKeySet` | Boolean, nur lesbar | Wahr, wenn ein entschlüsselbarer Key gespeichert ist. |

Persistenz: Spalte `settings.geoapify_api_key BLOB` (NULL = nicht gesetzt), enthält ausschliesslich den mit `safeStorage` verschlüsselten Wert (Migration `002_geoapify_key.sql`, vorwärts-gerichtet). Das gewöhnliche `getSettings` (genutzt von `InvoiceService`) liest die Spalte nicht. Eine eigene Funktion im Repository entschlüsselt den Key nur im Main für `addresses:suggest` und `addresses:testKey`; schlägt das fehl, gilt der Key als nicht gesetzt (`undecryptable`). Ein zusätzliches, nicht persistiertes Feld `geoapifyKeyStatus` (`'none' | 'ok' | 'undecryptable' | 'encryption-unavailable'`) zeigt den Zustand in den Einstellungen an. Bestehende Datenbanken erhalten NULL, das Verhalten bleibt wie bisher.

## AddressSuggestion (nur im Speicher, nie persistiert)

| Feld | Typ | Bemerkung |
|------|-----|-----------|
| `label` | Text | Anzeigezeile, z. B. «Bahnhofstrasse 1, 8001 Zürich» |
| `street` | Text | kann leer sein |
| `houseNo` | Text | kann leer sein |
| `zip` | Text | |
| `city` | Text | |
| `country` | 2 Buchstaben, gross | aus `country_code` |

Übernahme: überschreibt `street`, `houseNo`, `zip`, `city`, `country` der Adresse; `name` und `iban` bleiben. Werte werden nie gekürzt oder korrigiert (Prinzip I).

## Ergebnistypen

- `SuggestResult` = `{ status: 'disabled' }` | `{ status: 'ok', suggestions: AddressSuggestion[] }` | `{ status: 'error', reason: 'offline' | 'invalid_key' | 'quota' | 'timeout' | 'unavailable' }`
- `KeyCheckResult` = `'valid' | 'invalid_key' | 'quota' | 'offline' | 'timeout'`

## Beziehungen

Keine. Der Key hängt nicht an Rechnungen, Kunden oder Momentaufnahmen.
