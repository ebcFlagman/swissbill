# Contract: IPC-Namensraum `addresses`

Ergänzt den IPC-Vertrag aus `specs/001-swiss-qr-invoices/contracts/ipc-api.md`. Alle Antworten sind `Result<T>`; Eingaben werden im Main mit zod validiert.

## `addresses:suggest`

- **Aufruf**: `window.swissbill.addresses.suggest({ text })`
- **Eingabe**: `text`: String, 3 bis 200 Zeichen nach Trimmen (kürzer → `VALIDATION`).
- **Ausgabe**: `SuggestResult` (siehe [data-model.md](../data-model.md)).
- **Verhalten**:
  - Kein Key gespeichert → `{ status: 'disabled' }`, **keine** Netzwerkanfrage.
  - Key gespeichert → eine HTTPS-Anfrage an `api.geoapify.com`, höchstens 5 Vorschläge, Zeitlimit 5 s.
  - Fehler → `{ status: 'error', reason }`; der `Result` selbst bleibt `ok: true`, damit der Renderer sauber zurückfällt.
- **Gesendet wird**: nur `text` (plus feste Parameter `lang`, `limit`, `format`, `bias`) und der Key. Nie Name, IBAN, Beträge oder Rechnungsdaten.

## `addresses:testKey`

- **Aufruf**: `window.swissbill.addresses.testKey({ apiKey })`
- **Eingabe**: `apiKey`: String, 1 bis 200 Zeichen nach Trimmen.
- **Ausgabe**: `KeyCheckResult`.
- **Verhalten**: eine Probeanfrage mit dem übergebenen Key (ungespeichert). Der Key wird nicht gespeichert und nicht geloggt.

## Änderung an `settings:get` / `settings:save`

- **`settings:get`** liefert den Key **nie** an den Renderer, sondern `geoapifyKeySet: boolean` und `geoapifyKeyStatus` (`none | ok | undecryptable | encryption-unavailable`). Die Einstellungen zeigen «Key gespeichert», wenn `geoapifyKeySet` wahr ist.
- **`settings:save`** erhält `geoapifyApiKey?: string`: nicht angegeben (`undefined`) = Key unverändert lassen, `''` = Key entfernen (immer erlaubt, auch bei `undecryptable` und `encryption-unavailable`, FR-017), sonst Key setzen: getrimmt, im Main verschlüsselt. Ist dafür keine Verschlüsselung verfügbar, wird der Key nicht gespeichert, und die Antwort enthält den Status `encryption-unavailable`.
- **`addresses:suggest`** liest den Key im Main aus der Datenbank; der Renderer kennt ihn nicht.
- Der Key erscheint nirgends in PDFs, QR-Daten, Logs oder anderen Kanälen (z. B. `invoices:*`).

## Fehler- und Logregeln

- Fehlertexte an den Renderer sind feste deutsche Texte pro `reason`; sie enthalten nie URL, Key oder Antwortkörper.
- Logeinträge dürfen den `reason` nennen, nie `apiKey` oder die vollständige URL.
