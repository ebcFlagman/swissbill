# Feature Specification: Strukturiertes Logging mit pino

**Feature Branch**: `claude/pino-logging-framework-09f842`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "Ich möchte das logging framework pino einführen um ein sauberes logging zu haben."

## Clarifications

### Session 2026-11-20

- Q: Wie wird das Log-Level gesetzt? → A: Über die Einstellungen der Anwendung (Oberfläche).
- Q: Gilt das Log-Level pro Gerät oder gemeinsam für alle Geräte einer Datenbank? → A: Pro Gerät, lokal gespeichert (nicht in der Datenbank).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fehler anhand der Logdatei nachvollziehen (Priority: P1)

Wenn etwas schiefgeht (Datenbankverbindung, PDF-Erzeugung, Speichern einer Rechnung), kann die Benutzerin bzw. der Support die lokale Logdatei öffnen und sieht pro Eintrag Zeitpunkt, Schweregrad, den betroffenen Bereich der Anwendung (z. B. Datenbank, PDF, Adresssuche) und eine technische Meldung. Fehler enthalten Ursache und Stacktrace, damit das Problem ohne Rückfrage eingegrenzt werden kann.

**Why this priority**: Das ist der Kernnutzen von „sauberem Logging": Probleme beim Kunden diagnostizierbar machen, ohne dass Rechnungsdaten preisgegeben werden.

**Independent Test**: Einen Fehler provozieren (z. B. ungültige Datenbankverbindung) und prüfen, dass die Logdatei einen eindeutig dem Bereich „Datenbank" zugeordneten Fehlereintrag mit Ursache enthält.

**Acceptance Scenarios**:

1. **Given** die App läuft, **When** ein Fehler in einem IPC-Aufruf auftritt, **Then** steht in der Logdatei ein Eintrag mit Zeitstempel, Level ERROR, Bereich, Meldung und Fehlerursache inklusive Stacktrace.
2. **Given** die App startet, **When** die Initialisierung abgeschlossen ist, **Then** enthält die Logdatei Einträge zu Start, Version und verwendeter Datenbankart (ohne Zugangsdaten).
3. **Given** ein Fehlereintrag, **When** eine Person die Datei liest, **Then** kann sie den Eintrag sowohl maschinell filtern (ein Eintrag pro Zeile, einheitliches Format) als auch ohne Zusatzwerkzeug verstehen.

---

### User Story 2 - Sensible Daten gelangen nie ins Log (Priority: P1)

Passwörter, Geoapify-API-Schlüssel sowie Rechnungsinhalte (Namen, Adressen, IBANs, Beträge) tauchen in keiner Logzeile auf – auch nicht, wenn sie versehentlich als Teil einer Fehlermeldung oder eines Objekts weitergereicht werden.

**Why this priority**: Die Verfassung (Prinzip II) verbietet Geheimnisse und Kundendaten in Logs. Der bisherige Schutz (Registrierung bekannter Geheimnisse) muss mindestens gleich stark erhalten bleiben.

**Independent Test**: Ein bekanntes Passwort bzw. einen API-Schlüssel registrieren, danach Meldungen und Fehlerobjekte loggen, die diese Werte enthalten, und prüfen, dass sie in der Logdatei als maskiert erscheinen.

**Acceptance Scenarios**:

1. **Given** ein Datenbankpasswort ist registriert, **When** eine Fehlermeldung des Datenbanktreibers das Passwort enthält, **Then** erscheint es in der Logdatei nur als `***`.
2. **Given** ein Logeintrag mit Zusatzdaten (Kontextfeldern), **When** ein Feld als geheim bekannt ist (Passwort, API-Schlüssel, Token), **Then** wird dessen Wert maskiert.
3. **Given** eine Rechnung wird gespeichert oder ausgestellt, **When** der Vorgang geloggt wird, **Then** enthält der Eintrag höchstens technische Kennzahlen (z. B. interne ID, Dauer), keine Namen, Adressen, IBANs oder Beträge.

---

### User Story 3 - Log-Detailgrad steuerbar und Datei begrenzt (Priority: P2)

Standardmässig werden Informationen, Warnungen und Fehler protokolliert. Für die Fehlersuche kann der Detailgrad in den Einstellungen der Anwendung erhöht werden (Debug), ohne die App neu zu bauen. Die Logdatei wächst nicht unbegrenzt: Sie wird ab einer Maximalgrösse rotiert, und nur eine begrenzte Zahl älterer Dateien bleibt erhalten.

**Why this priority**: Bringt Komfort und Betriebssicherheit, ist aber ohne Story 1 und 2 nicht nötig.

**Independent Test**: Detailgrad in den Einstellungen auf Debug stellen und prüfen, dass zusätzliche Einträge erscheinen; die Datei künstlich über die Maximalgrösse füllen und prüfen, dass rotiert wird und die Gesamtgrösse begrenzt bleibt.

**Acceptance Scenarios**:

1. **Given** der Standard-Detailgrad, **When** die App Debug-Meldungen erzeugt, **Then** erscheinen diese nicht in der Logdatei.
2. **Given** der Detailgrad wurde in den Einstellungen auf Debug gesetzt, **When** er gespeichert ist, **Then** erscheinen auch Debug-Meldungen.
3. **Given** ein Detailgrad wurde gespeichert, **When** die App neu gestartet wird (auch bei nicht erreichbarer Datenbank), **Then** gilt dieser Detailgrad schon für die Startmeldungen.
4. **Given** zwei Geräte nutzen dieselbe Serverdatenbank, **When** auf einem Gerät das Level geändert wird, **Then** bleibt das andere Gerät unverändert.
5. **Given** die Logdatei überschreitet die Maximalgrösse, **When** weiter geloggt wird, **Then** wird rotiert, es gehen keine neuen Einträge verloren und die Zahl der aufbewahrten Dateien bleibt begrenzt.

---

### User Story 4 - Einheitliches Logging im gesamten Programm (Priority: P3)

Alle Bereiche der Anwendung (Hauptprozess, Datenbank, PDF-Erzeugung, Adresssuche, IPC) nutzen dieselbe Logging-Einrichtung statt verstreuter Einzellösungen. Meldungen aus der Oberfläche (Renderer), die geloggt werden sollen, laufen über den Hauptprozess in dieselbe Datei.

**Why this priority**: Konsistenz und Wartbarkeit; der Nutzen entsteht erst, wenn Story 1–3 stehen.

**Independent Test**: Im Quellcode existiert keine zweite Logging-Lösung und keine direkte Konsolenausgabe für Diagnosezwecke; Einträge aus Renderer und Hauptprozess landen in derselben Datei.

**Acceptance Scenarios**:

1. **Given** der Code der Anwendung, **When** er nach direkten Konsolenausgaben und eigenen Log-Hilfen durchsucht wird, **Then** gibt es ausser der zentralen Logging-Einrichtung keine Treffer.
2. **Given** die Oberfläche meldet einen unerwarteten Fehler, **When** er zum Hauptprozess weitergeleitet wird, **Then** erscheint er in der Logdatei mit dem Bereich „Oberfläche".

---

### Edge Cases

- Logverzeichnis nicht beschreibbar oder Datenträger voll: Die App darf deswegen nicht abstürzen oder Rechnungsvorgänge blockieren; Einträge gehen dann an die Standardfehlerausgabe.
- Logging vor Initialisierung (sehr früher Start): Einträge dürfen nicht verloren gehen, sondern werden zumindest auf der Standardfehlerausgabe ausgegeben.
- Fehlerobjekte mit Verweis auf eine Ursache (verschachtelte Fehler) oder mit zirkulären Referenzen: Ausgabe bleibt gültig und lesbar.
- Geheimnis wird erst nach dem Start bekannt (Passwort wird neu eingegeben): Es wird ab diesem Zeitpunkt maskiert.
- Sehr kurze Geheimnisse (weniger als 3 Zeichen) werden – wie bisher – nicht maskiert, um Logzeilen nicht unleserlich zu machen.
- Mehrere App-Instanzen auf demselben Gerät: Die Einzelinstanz-Sperre der App verhindert parallele Schreiber; die Logdatei darf in keinem Fall beschädigt werden.
- Bestehende Logdatei im alten Zeilenformat liegt noch im Benutzerverzeichnis: Sie wird nicht gelöscht und blockiert die Rotation nicht.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Das System MUSS alle Diagnosemeldungen über eine einzige zentrale Logging-Einrichtung ausgeben (Framework: pino); direkte Konsolenausgaben und die bisherige Eigenlösung entfallen.
- **FR-002**: Jeder Logeintrag MUSS Zeitstempel, Schweregrad (debug, info, warn, error), Bereich der Anwendung und Meldung enthalten und als genau eine Zeile in einem maschinenlesbaren, einheitlichen Format in die lokale Logdatei geschrieben werden.
- **FR-003**: Fehlereinträge MÜSSEN die Fehlerursache inklusive Stacktrace und eventueller verschachtelter Ursachen enthalten.
- **FR-004**: Das System MUSS Bereiche unterscheiden können (mindestens: Start/Lebenszyklus, Datenbank, PDF, Adresssuche, IPC, Oberfläche) und diese pro Eintrag ausweisen.
- **FR-005**: Das System MUSS registrierte Geheimnisse (Datenbankpasswort, Geoapify-API-Schlüssel) in Meldungen, Kontextfeldern und Fehlerdetails durch `***` ersetzen; die bestehende Funktion zur Registrierung von Geheimnissen bleibt erhalten.
- **FR-006**: Das System MUSS Kontextfelder mit bekannt sensiblen Namen (z. B. Passwort, Schlüssel, Token) unabhängig vom Wert maskieren.
- **FR-007**: Rechnungsinhalte (Namen, Adressen, IBANs, Beträge, Referenznummern) DÜRFEN NICHT geloggt werden; geloggt werden nur technische Angaben.
- **FR-008**: Der Standard-Detailgrad MUSS „info“ sein. Das Log-Level (error, warn, info, debug) MUSS in den Einstellungen der Anwendung gewählt und gespeichert werden können; ohne gespeicherte Wahl gilt der Standard. Das Level MUSS pro Gerät lokal gespeichert werden (nicht in der Datenbank), sofort nach dem Speichern wirken und bereits beim Start gelten, auch wenn die Datenbank nicht erreichbar ist; im Wiederherstellungsmodus MUSS das Level ebenfalls einstellbar sein.
- **FR-009**: Die Logdatei MUSS bei Erreichen einer Maximalgrösse rotieren und höchstens eine begrenzte Anzahl älterer Dateien aufbewahren, sodass der Speicherbedarf nach oben beschränkt bleibt.
- **FR-010**: Logging MUSS fehlertolerant sein: Ist die Datei nicht schreibbar, geht der Eintrag an die Standardfehlerausgabe und die Anwendung läuft weiter.
- **FR-011**: Der Hauptprozess MUSS beim Start Version, Plattform und gewählte Datenbankart sowie beim Beenden einen Abschluss-Eintrag protokollieren (ohne Zugangsdaten).
- **FR-012**: Unbehandelte Fehler und abgelehnte Promises im Hauptprozess MÜSSEN als Fehler protokolliert werden.
- **FR-013**: Die Oberfläche MUSS unerwartete Fehler über die schmale, typisierte IPC-Schnittstelle an den Hauptprozess melden können; der Renderer schreibt nie selbst in Dateien.
- **FR-014**: Logging MUSS ausschliesslich lokal bleiben: kein Versand von Logs an externe Dienste und keine Telemetrie.
- **FR-015**: Die Logdatei MUSS weiterhin im dokumentierten Benutzerverzeichnis der App liegen; Ort und Format MÜSSEN in der Dokumentation beschrieben sein.

### Key Entities

- **Logeintrag**: Eine Zeile mit Zeitstempel, Schweregrad, Bereich, Meldung, optionalen technischen Kontextfeldern und optionaler Fehlerursache.
- **Bereich (Komponente)**: Benannte Zuordnung eines Eintrags zu einem Teil der Anwendung (z. B. Datenbank, PDF, Adresssuche, IPC, Oberfläche).
- **Geheimnis**: Wert (z. B. Datenbankpasswort, API-Schlüssel), der zur Laufzeit registriert wird und in keiner Ausgabe im Klartext erscheinen darf.
- **Logdatei**: Lokale, begrenzte, rotierte Datei im Benutzerverzeichnis der App.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bei 100 % der in den Tests provozierten Fehlerfälle (Datenbankverbindung, PDF, IPC) enthält die Logdatei einen Eintrag mit Bereich und Ursache.
- **SC-002**: In einem Test mit registrierten Geheimnissen und Rechnungsdaten findet sich in der gesamten Logdatei kein einziger Klartext-Treffer (0 Vorkommen), auch nicht in Stacktraces.
- **SC-003**: Der Speicherbedarf aller Logdateien zusammen überschreitet auch nach 100 000 Einträgen eine festgelegte Obergrenze (Standard: 10 MB) nicht.
- **SC-004**: Eine Supportperson kann anhand einer Logdatei in unter 5 Minuten die Komponente und den Zeitpunkt eines gemeldeten Fehlers bestimmen.
- **SC-005**: Der Start der Anwendung verlangsamt sich durch das Logging für Anwender nicht spürbar (Startzeit höchstens 5 % länger als bisher).
- **SC-006**: Alle bestehenden Tests laufen grün (nur Tests, die die alte Logger-API verwenden, werden angepasst); die Verfügbarkeit von Rechnungsfunktionen ist von Logging-Problemen unabhängig (0 Abstürze bei nicht schreibbarem Logverzeichnis).

## Assumptions

- Nur lokale Dateiausgabe; ein Versand der Logs an Dritte bleibt nach Verfassung Prinzip II ausgeschlossen. Zusätzliche Ausgaben (z. B. farbige Konsole) sind höchstens für die Entwicklung gedacht.
- Das Logformat wechselt von einer menschenlesbaren Textzeile zu einer JSON-Zeile pro Eintrag; bestehende Logdateien müssen nicht migriert werden.
- Standard-Rotation: ca. 1 MB pro Datei mit wenigen (z. B. 5) aufbewahrten Vorgängerdateien, damit die Gesamtgrösse beschränkt bleibt; die genauen Werte legt der Plan fest.
- «Log-Level» (technisch) und «Detailgrad» (Oberfläche) bezeichnen dasselbe.
- Das Log-Level ist eine Auswahl auf der bestehenden Einstellungsseite (Texte deutsch), gespeichert in einer lokalen Konfiguration des Geräts; eine Umgebungsvariable ist höchstens ein Entwickler-Zusatz.
- Die Bereitstellung der Logdatei an den Support (z. B. „Logdatei öffnen"-Menüeintrag) ist nicht Teil dieses Features, sofern nicht bereits vorhanden.
- Die Einführung von pino ist eine zusätzliche Abhängigkeit und wird im Plan gemäss Prinzip V begründet (rotierende Dateiausgabe, strukturierte Felder, Masking).
- Code-Kommentare bleiben englisch, Dokumentation darf deutsch bleiben, sichtbare Oberflächentexte bleiben deutsch (Verfassung).
