# Feature Specification: CI-Build-Pipeline

**Feature Branch**: `002-ci-build-pipeline`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Das Projekt (Electron-App mit electron-vite, Tests) soll automatisch in einer CI/CD-Pipeline gebaut werden: bei jedem Push und Pull Request werden Abhängigkeiten installiert, Lint/Typecheck und Tests ausgeführt und die Anwendung gebaut; Build-Artefakte werden bereitgestellt."

## Clarifications

### Session 2026-10-30

- Q: Müssen die E2E-Tests in der Pipeline laufen, obwohl sie eine Desktop-Sitzung brauchen? → A: Nein, sie sind optional. Sie laufen nur, wenn das ohne eigene Desktop-Einrichtung (headless, auf dem Standard-Windows-Runner) funktioniert; andernfalls entfallen sie in der Pipeline und werden lokal ausgeführt. Sie dürfen Qualitätsprüfung und Artefakt nie blockieren.
- Q: Soll ein fehlgeschlagener E2E-Lauf den Gesamtstatus rot färben? → A: Ja, er bleibt sichtbar rot, ist aber kein Pflicht-Check.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatische Qualitätsprüfung bei Änderungen (Priority: P1)

Als Entwickler möchte ich, dass jede Änderung (Push auf einen Branch oder Pull Request) automatisch geprüft wird: Abhängigkeiten werden installiert, Lint, Typprüfung und Unit-Tests laufen, und die Anwendung wird gebaut. So erfahre ich ohne manuellen Aufwand, ob die Änderung die Qualitätsvorgaben des Projekts erfüllt.

**Why this priority**: Das ist der Kern der Pipeline und entspricht dem Qualitäts-Gate der Projektverfassung (Lint, Typprüfung und Tests müssen vor dem Merge bestehen). Ohne dieses Gate ist die Pipeline wertlos.

**Independent Test**: Einen Branch mit einer kleinen Änderung pushen und prüfen, dass die Pipeline automatisch startet und ein Gesamtergebnis (bestanden/fehlgeschlagen) mit Ergebnis pro Schritt liefert.

**Acceptance Scenarios**:

1. **Given** ein Branch mit gültigem Code, **When** ich ihn pushe, **Then** startet die Pipeline automatisch und alle Schritte (Installation, Lint, Typprüfung, Tests, Build) enden erfolgreich.
2. **Given** eine Änderung mit einem Lint-Fehler, Typfehler oder fehlschlagenden Test, **When** die Pipeline läuft, **Then** wird sie als fehlgeschlagen markiert und der fehlerhafte Schritt ist mit seiner Ausgabe klar erkennbar.
3. **Given** ein geöffneter Pull Request, **When** die Pipeline läuft, **Then** ist ihr Ergebnis direkt am Pull Request sichtbar.
4. **Given** ein neuer Push auf einen Branch, während für denselben Branch noch ein älterer Lauf aktiv ist, **When** der neue Lauf startet, **Then** wird der veraltete Lauf abgebrochen, damit keine Ressourcen verschwendet werden.

---

### User Story 2 - Build-Artefakte bereitstellen (Priority: P2)

Als Entwickler oder Tester möchte ich nach einem erfolgreichen Lauf die gebaute Anwendung (Programmpaket für Windows) herunterladen können, um eine Änderung ohne lokalen Build auszuprobieren.

**Why this priority**: Macht die Ergebnisse jeder Änderung direkt testbar, ist aber ohne die Prüfungen aus Story 1 nicht sinnvoll.

**Independent Test**: Einen erfolgreichen Lauf öffnen, das Artefakt herunterladen, entpacken und die Anwendung starten.

**Acceptance Scenarios**:

1. **Given** ein erfolgreicher Pipeline-Lauf, **When** ich die Lauf-Übersicht öffne, **Then** finde ich das Build-Artefakt zum Download.
2. **Given** ein heruntergeladenes Artefakt, **When** ich die Anwendung starte, **Then** startet sie und ist funktionsfähig.
3. **Given** ein fehlgeschlagener Lauf, **When** ich die Übersicht öffne, **Then** wird kein Artefakt als gültiges Ergebnis angeboten.

---

### User Story 3 - Optionale End-to-End-Prüfung (Priority: P3)

Als Entwickler möchte ich, dass die End-to-End-Tests (Erstellen → Speichern → PDF erzeugen) in der Pipeline laufen, sofern das ohne Desktop-Sitzung (headless) möglich ist, damit die kritischen Abläufe laut Projektverfassung bei jeder Änderung abgesichert sind. Ist das nicht zuverlässig möglich, entfallen sie in der Pipeline und werden lokal ausgeführt.

**Why this priority**: Wertvoll, aber aufwändiger und langsamer; Story 1 und 2 liefern auch ohne sie bereits Nutzen.

**Independent Test**: Die Pipeline auf einem Branch laufen lassen und prüfen, dass das Ergebnis der End-to-End-Tests separat ausgewiesen wird.

**Acceptance Scenarios**:

1. **Given** eine Änderung, **When** die Pipeline läuft, **Then** werden die End-to-End-Tests ausgeführt und ihr Ergebnis ist getrennt von den Unit-Tests sichtbar.
2. **Given** ein fehlschlagender End-to-End-Test, **When** der Lauf endet, **Then** stehen Berichte bzw. Screenshots zur Fehleranalyse bereit.

---

### Edge Cases

- Was passiert, wenn die Installation der Abhängigkeiten fehlschlägt (z. B. Netzwerkproblem oder native Module)? Der Lauf schlägt mit klarer Meldung im Installationsschritt fehl; die übrigen Schritte laufen nicht.
- Was passiert bei Änderungen, die nur Dokumentation betreffen? Die Pipeline darf laufen oder übersprungen werden; das Verhalten ist dokumentiert.
- Was passiert bei Pull Requests aus Forks? Die Pipeline läuft ohne Zugriff auf Geheimnisse.
- Was passiert bei instabilen (flackernden) Tests? Ein Lauf kann manuell wiederholt werden.
- Was passiert, wenn ein Lauf ungewöhnlich lange dauert? Er wird nach einer festgelegten Höchstdauer abgebrochen und als fehlgeschlagen markiert.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Die Pipeline MUSS bei jedem Push auf einen Branch und bei jedem Pull Request gegen den Hauptbranch automatisch starten.
- **FR-002**: Die Pipeline MUSS die Abhängigkeiten reproduzierbar aus den festgeschriebenen Versionen installieren.
- **FR-003**: Die Pipeline MUSS die Lint-Prüfung ausführen und bei Verstössen fehlschlagen.
- **FR-004**: Die Pipeline MUSS die Typprüfung ausführen und bei Fehlern fehlschlagen.
- **FR-005**: Die Pipeline MUSS die Unit-Tests ausführen und bei fehlschlagenden Tests fehlschlagen.
- **FR-006**: Die Pipeline MUSS die Anwendung bauen und bei Build-Fehlern fehlschlagen.
- **FR-007**: Die Pipeline MUSS nach erfolgreichem Lauf das Build-Artefakt (Windows-Paket) zum Download bereitstellen.
- **FR-008**: Die Pipeline MUSS das Gesamtergebnis sowie das Ergebnis pro Schritt am Commit bzw. Pull Request sichtbar machen.
- **FR-009**: Die Pipeline SOLL die End-to-End-Tests headless ausführen und deren Ergebnis getrennt ausweisen; bei Fehlern MÜSSEN Berichte zur Analyse bereitstehen. Die End-to-End-Tests DÜRFEN weder die Qualitätsprüfung noch die Bereitstellung des Artefakts blockieren (kein Pflicht-Check für den Merge) oder eine eigens eingerichtete Desktop-Sitzung voraussetzen. Ein fehlgeschlagener E2E-Lauf färbt den Gesamtstatus des Laufs bewusst rot, damit er sichtbar bleibt.
- **FR-010**: Die Pipeline SOLL Zwischenergebnisse (z. B. heruntergeladene Abhängigkeiten) wiederverwenden, um Laufzeiten zu verkürzen.
- **FR-011**: Die Pipeline SOLL veraltete Läufe desselben Branches bei neuem Push abbrechen.
- **FR-012**: Die Pipeline MUSS ohne Telemetrie und ohne echte Kundendaten auskommen und DARF ausser einem optionalen Lizenzschlüssel für die UI-Bibliothek keine Geheimnisse benötigen; fehlt dieser Schlüssel (z. B. bei Forks), MUSS sie trotzdem erfolgreich bauen. Artefakte DÜRFEN keine Datenbank, keine erzeugten Rechnungs-PDFs und keine realen Kundendaten enthalten.
- **FR-013**: Die Pipeline MUSS eine Höchstlaufzeit haben, nach deren Überschreitung der Lauf abgebrochen wird.
- **FR-014**: Die Pipeline-Schritte und ihre lokale Entsprechung MÜSSEN in der Projektdokumentation beschrieben sein, damit Entwickler Fehler lokal reproduzieren können.

### Key Entities

- **Pipeline-Lauf**: Eine automatische Ausführung für einen bestimmten Commit; hat Auslöser (Push/Pull Request), Schritte und ein Gesamtergebnis.
- **Pipeline-Schritt**: Einzelne Stufe (Installation, Lint, Typprüfung, Tests, Build, End-to-End) mit eigenem Ergebnis und Ausgabe.
- **Build-Artefakt**: Herunterladbares Ergebnis eines erfolgreichen Laufs, zugeordnet zum Commit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % der Pushes und Pull Requests lösen automatisch einen Lauf aus, ohne manuellen Eingriff.
- **SC-002**: Ein Entwickler sieht das Ergebnis eines typischen Laufs (ohne End-to-End-Tests) innerhalb von 10 Minuten nach dem Push.
- **SC-003**: Eine Änderung mit absichtlichem Lint-, Typ- oder Testfehler wird in 100 % der Fälle als fehlgeschlagen gemeldet, mit Angabe des fehlerhaften Schritts.
- **SC-004**: Aus einem erfolgreichen Lauf kann in unter 2 Minuten ein startfähiges Artefakt heruntergeladen werden.
- **SC-005**: Ein Lauf mit unveränderten Abhängigkeiten ist mindestens 30 % schneller als der erste Lauf ohne Zwischenspeicher.
- **SC-006**: Neue Teammitglieder können anhand der Dokumentation in unter 15 Minuten die lokalen Entsprechungen der Pipeline-Schritte ausführen.

## Assumptions

- Das Repository liegt auf GitHub; die Pipeline läuft mit dem dort integrierten Automatisierungsdienst.
- Zielplattform des Artefakts ist Windows (entspricht dem bestehenden Paketierungsziel); weitere Plattformen sind vorerst ausser Umfang.
- «Bereitstellen» bedeutet Download am Pipeline-Lauf; Veröffentlichung als Release, Code-Signierung und automatische Updates sind ausser Umfang.
- Die vorhandenen Befehle für Lint, Typprüfung, Unit-Tests, Build, Paketierung und End-to-End-Tests werden unverändert genutzt.
- Die Pipeline orientiert sich an der Projektverfassung (Lint/Typprüfung/Tests vor Merge, keine Telemetrie, keine echten Daten).
- Die End-to-End-Tests sind langsamer als die übrigen Schritte und werden daher eigenständig ausgewiesen. Der Standard-Windows-Runner stellt bereits eine Sitzung für Fenster-Apps bereit, daher wird erwartet, dass sie ohne zusätzliche Einrichtung laufen; bestätigt sich das nicht, entfallen sie in der Pipeline (siehe Clarifications).
- Der optionale Lizenzschlüssel wird als Repository-Secret hinterlegt und beim Build in die Anwendung eingebettet (die Prüfung läuft offline). Das Artefakt kann ihn daher enthalten und ist nur für Personen mit Repository-Zugriff gedacht; ohne Schlüssel zeigt die App ein Lizenz-Banner.
- Native Module (eingebettete Datenbank) müssen für die Zielumgebung korrekt gebaut werden.
