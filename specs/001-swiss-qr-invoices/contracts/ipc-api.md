# Vertrag: IPC-Schnittstelle Renderer ↔ Main

Der Renderer erhält über `contextBridge` genau ein Objekt `window.swissbill`. Jede Methode ruft einen
`ipcMain.handle`-Kanal auf. Eingaben werden im Main mit zod validiert (Schemas in `src/shared/ipc`);
Ausgaben sind reine, serialisierbare Daten. Fehler kommen als `{ ok: false, error }` zurück, nie als Exception.

## Gemeinsame Typen

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

type AppError = {
  code: 'VALIDATION' | 'NOT_FOUND' | 'IMMUTABLE' | 'IO' | 'DB';
  message: string;                       // deutsch, benutzerverständlich
  fields?: { field: string; message: string }[];   // feldgenaue Meldungen (FR-005)
};

type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled';
type Rappen = number;                    // ganze Zahl
type Milli = number;                     // Menge in Tausendsteln
```

## Kanäle

### Rechnungen (`invoices:*`)

| Methode | Eingabe | Ausgabe | Hinweise |
|---------|---------|---------|----------|
| `invoices.list` | `{ search?: string; status?: InvoiceStatus[] }` | `InvoiceSummary[]` | Nummer, Kunde, Datum, Total, Status (FR-007) |
| `invoices.get` | `{ id }` | `Invoice` | inkl. Positionen |
| `invoices.createDraft` | `{ customerId? }` | `Invoice` | Absender und Schlusstext aus Einstellungen vorausgefüllt |
| `invoices.saveDraft` | `Invoice` (ohne Nummer/Status) | `Invoice` | `IMMUTABLE`, wenn nicht Entwurf |
| `invoices.deleteDraft` | `{ id }` | `void` | nur Entwurf (FR-021) |
| `invoices.issue` | `{ id }` | `Invoice` | vergibt Nummer, leitet Referenz ab, validiert vollständig (FR-003..005, FR-012, FR-019) |
| `invoices.markPaid` | `{ id }` | `Invoice` | `issued → paid` |
| `invoices.reopen` | `{ id }` | `Invoice` | `paid → issued` |
| `invoices.cancel` | `{ id }` | `Invoice` | `issued/paid → cancelled` |
| `invoices.duplicate` | `{ id }` | `Invoice` | neuer Entwurf (FR-009) |
| `invoices.validate` | `Invoice` | `Result<void>` mit `fields` | Vorab-Prüfung für Sofort-Feedback |

### PDF (`pdf:*`)

| Methode | Eingabe | Ausgabe | Hinweise |
|---------|---------|---------|----------|
| `pdf.save` | `{ invoiceId }` | `{ path: string } \| { cancelled: true }` | zeigt Speichern-Dialog im Main, schreibt PDF aus der Momentaufnahme (FR-010, FR-014); nur für Rechnungen mit Nummer |
| `pdf.preview` | `{ invoiceId }` | `{ base64: string }` | für Vorschau im Renderer; Entwürfe erhalten ein Wasserzeichen «ENTWURF» ohne gültigen Zahlteil |

### Kunden (`customers:*`)

| Methode | Eingabe | Ausgabe |
|---------|---------|---------|
| `customers.list` | `{ search?: string }` | `Customer[]` |
| `customers.save` | `Customer` (ohne `id` = anlegen) | `Customer` |
| `customers.delete` | `{ id }` | `void` (bestehende Rechnungen bleiben unverändert) |

### Einstellungen (`settings:*`)

| Methode | Eingabe | Ausgabe |
|---------|---------|---------|
| `settings.get` | – | `Settings` (Absender, Präfix, Schlusstext, Zahlungsfrist) |
| `settings.save` | `Settings` | `Settings` (validiert IBAN und Adresse) |

### Datenbank (`db:*`)

| Methode | Eingabe | Ausgabe | Hinweise |
|---------|---------|---------|----------|
| `db.info` | – | `{ path: string; sizeBytes: number; schemaVersion: number }` | zeigt den Speicherort (FR-016) |
| `db.backup` | – | `{ path } \| { cancelled: true }` | Speichern-Dialog, konsistente Kopie |

## Garantien

- Kein Kanal liefert oder erwartet Dateipfade vom Renderer; Pfade entstehen nur durch Dialoge im Main.
- Jeder Kanal, der Daten ändert, läuft in einer Transaktion.
- Verstösse gegen die Unveränderlichkeit liefern `IMMUTABLE`, unabhängig von der UI.
- Änderungen am Vertrag erfolgen zuerst in `src/shared/ipc` (Schemas) und danach hier.
