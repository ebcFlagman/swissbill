# Feature Specification: Release-Pipeline

**Feature Branch**: `003-release-pipeline`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Release-Pipeline: Ein Release wird manuell (mit Versionsangabe) oder durch einen Versions-Tag (v*) ausgelöst. Die Pipeline prüft die Qualität (Lint, Typecheck, Tests), baut je ein Artefakt für Windows (Installer) und Linux (AppImage), erstellt einen Git-Tag und legt ein GitHub-Release mit automatisch generierten Release Notes (alle Änderungen seit dem letzten Release) und den angehängten Artefakten (Download-Links) an. Bezug: bestehende CI-Pipeline und Paketierung (aktuell nur Windows, ohne Installer)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Release per Knopfdruck veröffentlichen (Priority: P1)

Als Maintainer möchte ich ein Release auslösen, indem ich nur eine Versionsnummer angebe (z. B. `1.2.0`). Die Pipeline prüft die Qualität, baut die Artefakte für Windows und Linux, legt den Versions-Tag an und veröffentlicht ein Release mit Änderungsübersicht und Download-Links. So entsteht ein Release ohne manuelle Zwischenschritte.

**Why this priority**: Das ist der Kern der Funktion: aus einem geprüften Stand wird mit einer Eingabe ein veröffentlichtes, herunterladbares Release.

**Independent Test**: Die Pipeline manuell mit einer Testversion starten und prüfen, dass Tag, Release, beide Artefakte und die Änderungsübersicht vorhanden sind.

**Acceptance Scenarios**:

1. **Given** ein Stand auf dem Hauptbranch, der alle Qualitätsprüfungen besteht, **When** ich das Release mit Version `1.2.0` auslöse, **Then** existiert danach der Tag `v1.2.0` auf genau diesem Stand und ein Release `v1.2.0` mit beiden Artefakten.
2. **Given** eine ungültige Versionsangabe (z. B. `abc` oder leer), **When** ich das Release auslöse, **Then** bricht die Pipeline sofort mit klarer Meldung ab, ohne Tag und Release anzulegen.
3. **Given** eine Version, zu der bereits ein Tag oder Release existiert, **When** ich das Release auslöse, **Then** bricht die Pipeline ab und verändert den bestehenden Tag und das bestehende Release nicht.
4. **Given** ein fehlschlagender Qualitätsschritt oder Build, **When** die Pipeline läuft, **Then** wird weder Tag noch Release angelegt.

---

### User Story 2 - Artefakte für Windows und Linux (Priority: P1)

Als Anwender möchte ich die App für mein Betriebssystem herunterladen und direkt verwenden können: unter Windows als Installer, unter Linux als eigenständig lauffähige Datei, ohne weitere Installation von Abhängigkeiten.

**Why this priority**: Ohne die Artefakte hat das Release keinen Nutzen; beide Plattformen sind ausdrücklich gefordert.

**Independent Test**: Das Release öffnen, beide Artefakte herunterladen und die App auf der jeweiligen Plattform starten.

**Acceptance Scenarios**:

1. **Given** ein veröffentlichtes Release, **When** ich die Dateiliste öffne, **Then** finde ich je ein Artefakt für Windows und für Linux, dessen Dateiname Produktname, Version und Plattform erkennen lässt.
2. **Given** das Windows-Artefakt, **When** ich es ausführe, **Then** lässt sich die App installieren und starten.
3. **Given** das Linux-Artefakt, **When** ich es ausführbar mache und starte, **Then** startet die App.
4. **Given** ein Release, **When** eines der beiden Artefakte nicht gebaut werden konnte, **Then** wird kein (Teil-)Release veröffentlicht.
5. **Given** die veröffentlichten Artefakte, **When** ich ihre Prüfsummen vergleiche, **Then** stehen diese im Release zur Verfügung, damit ich die Integrität des Downloads prüfen kann.

---

### User Story 3 - Nachvollziehbare Änderungsübersicht (Priority: P2)

Als Anwender oder Maintainer möchte ich im Release sehen, was sich seit dem letzten Release geändert hat, ohne Release Notes von Hand zu schreiben.

**Why this priority**: Macht das Release verständlich, ist aber ohne Story 1 und 2 nicht nutzbar.

**Independent Test**: Zwei Releases nacheinander erstellen und prüfen, dass das zweite genau die Änderungen dazwischen auflistet.

**Acceptance Scenarios**:

1. **Given** ein vorheriges Release, **When** ein neues Release erstellt wird, **Then** enthält dessen Beschreibung alle Änderungen (Commits bzw. zusammengeführte Pull Requests) seit dem vorherigen Release.
2. **Given** das erste Release überhaupt, **When** es erstellt wird, **Then** enthält die Beschreibung alle bisherigen Änderungen.
3. **Given** die Release-Beschreibung, **When** ich sie lese, **Then** sind die Änderungen nach Art gruppiert, soweit die Commit-Nachrichten dies zulassen (z. B. Features, Fehlerbehebungen).
4. **Given** die Release-Beschreibung, **When** ich sie öffne, **Then** enthält sie Links zu den Artefakten bzw. Verweise auf die angehängten Dateien.

---

### User Story 4 - Release über einen Versions-Tag auslösen (Priority: P3)

Als Maintainer möchte ich alternativ selbst einen Tag `v<Version>` pushen können und dennoch denselben geprüften Release-Ablauf erhalten.

**Why this priority**: Bequeme Alternative für Entwickler, die Tags lokal setzen; der manuelle Auslöser deckt den Hauptfall bereits ab.

**Independent Test**: Einen Tag `vX.Y.Z` pushen und prüfen, dass Prüfung, Build und Release entstehen.

**Acceptance Scenarios**:

1. **Given** ein gepushter Tag `v1.2.0`, **When** die Pipeline startet, **Then** werden Qualitätsprüfung, Build und Release für genau diesen Tag ausgeführt, ohne den Tag zu verändern.
2. **Given** ein manuell ausgelöstes Release, das den Tag selbst anlegt, **When** dieser Tag entsteht, **Then** löst er kein zweites Release für dieselbe Version aus.
3. **Given** ein Tag, der nicht dem Muster `v<Major>.<Minor>.<Patch>` entspricht, **When** er gepusht wird, **Then** startet keine Release-Pipeline.

---

### Edge Cases

- Was passiert bei Versionen mit Zusatz (z. B. `1.2.0-rc.1`)? Sie werden als Vorabversion veröffentlicht und nicht als neueste stabile Version markiert.
- Was passiert, wenn die Pipeline nach dem Anlegen des Tags, aber vor Veröffentlichung des Releases fehlschlägt? Es bleibt kein verwaister Tag zurück bzw. ein erneuter Lauf für dieselbe Version ist möglich, ohne den Tag manuell zu löschen.
- Was passiert, wenn die Version im Projekt von der angegebenen Release-Version abweicht? Die Artefakte tragen die Release-Version, nicht eine veraltete Projektversion.
- Was passiert bei einem Release von einem Nicht-Hauptbranch? Das manuelle Release ist nur vom Hauptbranch erlaubt.
- Was passiert, wenn der optionale Lizenzschlüssel fehlt? Das Release wird trotzdem gebaut; die App zeigt dann das Lizenz-Banner (wie in der CI-Pipeline).
- Was passiert bei gleichzeitig ausgelösten Releases? Sie laufen nacheinander, nie parallel.
- Was passiert, wenn das Windows-Artefakt nicht signiert ist? Windows zeigt beim Start eine Warnung; dies ist dokumentiert (Signierung ausser Umfang).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Die Pipeline MUSS manuell mit einer Versionsangabe gestartet werden können.
- **FR-002**: Die Pipeline MUSS zusätzlich automatisch starten, wenn ein Tag im Muster `v<Major>.<Minor>.<Patch>` (optional mit Vorabversions-Zusatz) gepusht wird.
- **FR-003**: Die Pipeline MUSS die Versionsangabe validieren (semantische Versionierung) und bei ungültiger Angabe vor jeder Veränderung abbrechen.
- **FR-004**: Die Pipeline MUSS abbrechen, wenn zur Version bereits ein Release existiert (oder bei manueller Auslösung bereits ein Tag), und bestehende Tags und Releases unverändert lassen.
- **FR-005**: Die Pipeline MUSS vor dem Bauen Lint, Typprüfung und Unit-Tests ausführen; bei einem Fehler darf weder Tag noch Release entstehen.
- **FR-006**: Die Pipeline MUSS ein Windows-Artefakt in Form eines Installers bauen.
- **FR-007**: Die Pipeline MUSS ein Linux-Artefakt in Form einer eigenständig lauffähigen Datei bauen.
- **FR-008**: Die Dateinamen der Artefakte MÜSSEN Produktname, Version und Plattform enthalten.
- **FR-009**: Die Artefakte MÜSSEN die Release-Version tragen (nicht eine davon abweichende Projektversion).
- **FR-010**: Die Pipeline MUSS bei manueller Auslösung einen Git-Tag `v<Version>` auf dem geprüften Commit anlegen; bei Tag-Auslösung MUSS sie den gepushten Tag unverändert verwenden.
- **FR-011**: Die Pipeline MUSS ein GitHub-Release zum Tag veröffentlichen, an das beide Artefakte angehängt sind, sodass die Download-Links im Release stehen.
- **FR-012**: Die Release-Beschreibung MUSS alle Änderungen seit dem vorherigen Release automatisch auflisten; beim ersten Release alle bisherigen Änderungen.
- **FR-013**: Die Pipeline MUSS ein Release erst veröffentlichen (und den Tag erst anlegen), wenn beide Artefakte erfolgreich gebaut sind (kein Teil-Release).
- **FR-014**: Die Pipeline MUSS Prüfsummen der Artefakte im Release bereitstellen.
- **FR-015**: Die Pipeline MUSS Versionen mit Vorabversions-Zusatz als Vorabversion kennzeichnen.
- **FR-016**: Das manuelle Release MUSS auf den Hauptbranch beschränkt sein.
- **FR-017**: Die Pipeline MUSS parallele Release-Läufe verhindern und darf einen laufenden Release-Lauf nicht abbrechen.
- **FR-018**: Die Pipeline MUSS mit den minimal nötigen Rechten arbeiten (Schreibzugriff auf Inhalte nur dort, wo Tag und Release entstehen), ohne Telemetrie und ohne echte Kundendaten; Artefakte DÜRFEN keine Datenbank, keine erzeugten Rechnungs-PDFs und keine realen Kundendaten enthalten.
- **FR-019**: Die Pipeline MUSS ohne den optionalen Lizenzschlüssel erfolgreich bauen können.
- **FR-020**: Die Pipeline MUSS eine Höchstlaufzeit pro Schritt haben.
- **FR-021**: Der Release-Ablauf (Auslösung, Versionsregeln, Artefakte, Hinweis auf fehlende Signierung) MUSS in der Projektdokumentation beschrieben sein.

### Key Entities

- **Release-Version**: Semantische Versionsnummer, die Tag, Release und Artefakt-Dateinamen bestimmt.
- **Versions-Tag**: Marke `v<Version>` auf dem freigegebenen Commit.
- **Release-Artefakt**: Herunterladbare Datei je Plattform (Windows-Installer, Linux-Datei) samt Prüfsumme.
- **Release**: Veröffentlichung zu einem Tag mit Änderungsübersicht und angehängten Artefakten; stabil oder Vorabversion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein Maintainer kann mit einer einzigen Eingabe (Versionsnummer) ein vollständiges Release veröffentlichen.
- **SC-002**: Von der Auslösung bis zum veröffentlichten Release vergehen höchstens 30 Minuten.
- **SC-003**: In 100 % der erfolgreichen Läufe enthält das Release genau ein Windows- und ein Linux-Artefakt samt Prüfsummen.
- **SC-004**: In 100 % der Läufe mit fehlgeschlagener Prüfung, fehlgeschlagenem Build oder ungültiger/doppelter Version entsteht weder Tag noch Release.
- **SC-005**: Die Änderungsübersicht enthält 100 % der Änderungen seit dem vorherigen Release und keine älteren.
- **SC-006**: Ein Anwender kann das passende Artefakt innerhalb von 2 Minuten finden, herunterladen und die App starten.

## Assumptions

- Das Repository liegt auf GitHub; Tag, Release und Artefakte werden mit dem dort integrierten Automatisierungsdienst erstellt.
- Unterstützte Zielplattformen sind Windows (x64) und Linux (x64); macOS ist ausser Umfang.
- Code-Signierung, automatische Updates und Paketquellen (z. B. winget, apt) sind ausser Umfang.
- Versionsnummern folgen der semantischen Versionierung; die Release-Version wird nicht zurück in die Projektdatei committet.
- Die Änderungsübersicht wird aus den Commits bzw. Pull Requests seit dem letzten Release erzeugt; Conventional Commits (laut Projektverfassung) verbessern die Gruppierung, sind aber keine Voraussetzung.
- Die bestehende CI-Pipeline bleibt unverändert; die Release-Pipeline ist eigenständig und wiederholt die nötigen Prüfungen.
- Die End-to-End-Tests sind keine Voraussetzung für ein Release (bleiben optional wie in der CI-Pipeline).
- Der optionale Lizenzschlüssel wird als Repository-Secret bereitgestellt; ohne ihn zeigt die App ein Lizenz-Banner.
- Native Module (eingebettete Datenbank) müssen für jede Zielplattform korrekt gebaut werden.
