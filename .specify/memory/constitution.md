# SwissBill Constitution

## Core Principles

### I. Swiss QR-Bill Compliance (NON-NEGOTIABLE)
Every generated payment part MUST conform to the current SIX Swiss Implementation Guidelines for
the QR-bill (QR code content, layout, dimensions, scissors/separation line, Swiss cross). IBAN vs.
QR-IBAN and the matching reference type (QRR, SCOR, NON) MUST be validated before an invoice can be
issued. Invalid payment data MUST be rejected with a clear message, never silently corrected.
Rationale: an invoice whose payment part is rejected by e-banking or the post office is useless.

### II. Local-First, Offline Desktop App
The app MUST be a standalone Electron desktop application that works fully offline. All invoice
content and payment information MUST be stored in an embedded SQLite database in the Electron
`userData` directory. No cloud service, account, or telemetry MAY be required or added without a
constitution amendment.
Exception (opt-in address suggestions): the app MAY send address search text to the Geoapify
geocoding service, but only while the user has stored their own Geoapify API key in the settings.
Without a key the app MUST make no network requests and MUST behave exactly as before. Only the
typed address search text and the key MAY be sent; invoice content, amounts, IBANs, names, and
other stored data MUST NOT leave the device. Every failure of the service (offline, rejected key,
quota, timeout) MUST fall back to manual address entry without blocking invoicing. The network
block MUST stay in force for everything else and be opened only for this one service and only
while a key is set. Any further external service still requires a constitution amendment.
Rationale: invoice data is financial and personal; the user keeps full control of it. Address
suggestions are a convenience the user switches on knowingly, never a dependency.

### III. Data Integrity & Immutability of Issued Invoices
Schema changes MUST be made through versioned, forward-only migrations. Monetary amounts MUST be
stored and computed as integers (rappen) or a decimal type, never as binary floating point. Once
an invoice is issued (finalized with its number and reference; the PDF can be regenerated at any time), its content MUST NOT be altered; corrections are made via a
new or duplicated invoice. The database MUST be easy to back up (single file, documented location).

### IV. Test-First for Domain Logic
Domain logic (QR payload generation, reference/IBAN validation, totals and VAT calculation,
numbering) MUST be developed test-first: tests are written and fail before the implementation.
Generated QR payloads MUST be covered by tests against known-valid examples. UI code is tested
proportionally; critical flows (create → save → generate PDF) MUST have at least one end-to-end test.

### V. Simplicity & Electron Security
Start with the simplest solution that works (YAGNI); every added dependency or abstraction MUST be
justified. The renderer process MUST run with `contextIsolation` enabled and `nodeIntegration`
disabled; database and file-system access MUST live in the main process and be exposed to the UI
only through a narrow, typed IPC API.

## Technology & Compliance Constraints

- Platform: Electron (desktop) with TypeScript; embedded SQLite (native driver, rebuilt for the
  Electron ABI).
- Output: PDF invoices including the QR-bill payment part, printable on A4 with a perforated slip
  and exportable as a file.
- Localization: user-facing text and the payment part are German only for now; additional languages
  are out of scope until the constitution is amended. Currency is always CHF; EUR is not supported.
- Privacy: the database, generated PDFs, and any real customer data MUST NOT be committed to the
  repository; sample data MUST be fictional.
- Dependencies: prefer maintained libraries for QR-bill generation over a custom implementation, but
  their output MUST be verified against Principle I.

## Development Workflow & Quality Gates

- Work follows Spec Kit: constitution → specify → (clarify) → plan → tasks → implement.
- Commits follow Conventional Commits (`feat`, `fix`, `docs`, `chore`, …).
- Before merging: lint and type-check pass, all tests pass, and the change is checked against this
  constitution (plan.md contains a Constitution Check).
- Any complexity that violates Principle V MUST be justified in the plan's complexity table.

## Governance

This constitution supersedes other practices. Amendments MUST be made via `/speckit-constitution`,
documented with a rationale, and increment the version using semantic versioning: MAJOR for
backward-incompatible principle removals or redefinitions, MINOR for added or materially expanded
principles or sections, PATCH for clarifications and wording. Every plan and review MUST verify
compliance with the principles above; unavoidable deviations MUST be recorded and justified.

**Version**: 1.1.0 | **Ratified**: 2026-10-08 | **Last Amended**: 2026-11-12
