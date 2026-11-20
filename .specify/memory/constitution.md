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
content and payment information MUST be stored by default in an embedded SQLite database in the
Electron `userData` directory. No cloud service, account, or telemetry MAY be required or added
without a constitution amendment.
Exception (opt-in address suggestions): the app MAY send address search text to the Geoapify
geocoding service, but only while the user has stored their own Geoapify API key in the settings.
Without a key the app MUST make no network requests and MUST behave exactly as before. Only the
typed address search text and the key MAY be sent; invoice content, amounts, IBANs, names, and
other stored data MUST NOT leave the device. Every failure of the service (offline, rejected key,
quota, timeout) MUST fall back to manual address entry without blocking invoicing. The network
block MUST stay in force for everything else and be opened only for this one service and only
while a key is set. Any further external service still requires a constitution amendment.
Exception (opt-in database server): the user MAY configure their own PostgreSQL, MySQL or MariaDB
server as the database instead of embedded SQLite. Local SQLite remains the default; without such a
configuration the app MUST make no database-server connection and MUST behave exactly as before. The
app MUST connect only to the server the user configured and MUST send only its own application data
there. The database password MUST be stored exclusively in the operating system's keychain: never in
the app database, configuration files, logs, error messages, backups or the renderer process. If no
keychain is available, the app MUST refuse password-based server connections and MUST NOT fall back to
plain text. The network block MUST stay in force for everything else and be opened for the configured
server only while that configuration is active. Provisioning, operation and backup of the server
database are the operator's responsibility.
Rationale: invoice data is financial and personal; the user keeps full control of it. Address
suggestions and a self-hosted database server are choices the user makes knowingly, never a
dependency.

### III. Data Integrity & Immutability of Issued Invoices
Schema changes MUST be made exclusively through versioned, forward-only TypeORM migrations; automatic
schema synchronization MUST NOT be used outside tests. Monetary amounts MUST be
stored and computed as integers (rappen) or a decimal type, never as binary floating point. Once
an invoice is issued (finalized with its number and reference; the PDF can be regenerated at any time), its content MUST NOT be altered; corrections are made via a
new or duplicated invoice. This guarantee is enforced by the application's persistence layer for every
write path of the app, with no bypass (status transitions, immutability, validation rules and gap-free
numbering live in code, not in database triggers or CHECK constraints, so they hold on any database
supported by the persistence layer). Manipulating the database file outside the app is not covered by
this guarantee; backups are the remedy. The database MUST be easy to back up (single file, documented
location) when using local SQLite; for a server database, backups are the operator's responsibility.
Gap-free, duplicate-free numbering and the immutability of issued invoices MUST also hold under
concurrent access from several devices to the same server database.

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
  Electron ABI) as default, accessed through TypeORM.
- Persistence: SQLite (default), PostgreSQL, MySQL and MariaDB are supported and MUST all be tested.
  Application code and migrations MUST stay database-portable; database-specific code (connection
  pragmas, integrity check, file copy, backup) MUST be confined to clearly delimited modules per
  database type.
- Secrets: credentials MUST be kept in the OS keychain only (see Principle II).
- Output: PDF invoices including the QR-bill payment part, printable on A4 with a perforated slip
  and exportable as a file.
- Language of the code base: all comments in source, test, configuration and pipeline files MUST be written in
  English. Project documentation (specs, `docs/`, README, this constitution) MAY stay German. User-facing text
  stays German (see Localization).
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

**Version**: 1.4.0 | **Ratified**: 2026-10-08 | **Last Amended**: 2026-11-20
