# Quickstart: Validierung der CI-Pipeline

Zeigt, wie geprüft wird, dass die Pipeline wie spezifiziert arbeitet. Siehe [contracts/ci-workflow.md](contracts/ci-workflow.md) und [data-model.md](data-model.md).

## Voraussetzungen

- Schreibzugriff auf das GitHub-Repository, `gh` CLI oder Weboberfläche
- Optional: Repository-Secret `PRIMEUI_LICENSE` (Community-Lizenzschlüssel); ohne Schlüssel läuft die Pipeline mit Lizenz-Banner in der App
- Lokal Node.js 24

## Lokale Entsprechung der Schritte (FR-014)

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run package        # baut und paketiert nach release/win-unpacked/
npm run test:e2e
```

## Szenarien

1. **Grüner Lauf (US1)**: Branch pushen. Erwartet: Workflow `CI` startet automatisch, `verify` wird grün (`e2e` ebenfalls, falls vorhanden), Status erscheint am Commit.
2. **Pull Request (US1)**: PR gegen `main` öffnen. Erwartet: Prüfung `CI / verify` erscheint im PR (`CI / e2e` optional, falls der Job beibehalten wurde, siehe Tasks T014); ein Push- und ein PR-Lauf können parallel laufen.
3. **Fehlererkennung (US1, SC-003)**: In Wegwerf-Branches nacheinander einen Lint-Fehler, einen Typfehler und einen kaputten Test einbauen und pushen.
   Erwartet: Lauf rot, jeweils der passende Schritt ist als fehlgeschlagen markiert, `e2e` startet nicht.
4. **Abbruch veralteter Läufe (FR-011)**: Zwei Pushes kurz nacheinander auf denselben Branch. Erwartet: der erste Lauf ist «cancelled».
5. **Artefakt (US2)**: Aus einem grünen Lauf `swissbill-win-unpacked-<sha>` herunterladen, entpacken, `SwissBill.exe` starten.
   Erwartet: App startet, Fenster «Rechnungen» sichtbar; ohne Secret erscheint das Lizenz-Banner. Archiv enthält keine `*.db`, `*.pdf`, `.env*`.
6. **E2E-Berichte (US3)**: Einen E2E-Test absichtlich brechen. Erwartet: `e2e` rot, Artefakte `playwright-report`/`test-results` vorhanden.
7. **Cache (SC-005)**: Zwei Läufe ohne Änderung an `package-lock.json`. Erwartet: der zweite Installationsschritt ist deutlich schneller (≥ 30 % Gesamtlaufzeit).
8. **Fork/ohne Secret (FR-012)**: Lauf ohne `PRIMEUI_LICENSE`. Erwartet: Pipeline baut trotzdem, keine Secrets in den Logs.
9. **Timeout (FR-013)**: Im Workflow ist `timeout-minutes` gesetzt (Sichtprüfung der Datei).
