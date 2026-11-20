# Feature Specification: Persistenz über TypeORM

**Feature Branch**: `claude/typeorm-persistenz-3662b6`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "Ich möchte für die Persistenz TypeORM verwenden. Falls gewisse Funktionalitäten nicht damit umgesetzt werden können, muss eine Alternative erarbeitet werden."

## Kontext

Heute greift der Datenzugriff (Kunden, Rechnungen, Einstellungen) direkt per handgeschriebenem SQL auf die eingebettete SQLite-Datenbank zu. Gewünscht ist, dass die Persistenz künftig über das ORM **TypeORM** läuft (Entitäten statt verstreuter SQL-Strings). Für Anwender der App ändert sich nichts Sichtbares; die Umstellung ist eine Wartbarkeits-Verbesserung. Wo TypeORM eine bestehende Garantie der App nicht abbilden kann, muss dafür eine dokumentierte Alternative gefunden werden – die Garantie selbst darf nicht verloren gehen.

## Clarifications

### Session 2026-11-20

- Q: Datenbank-Garantien (Unveränderlichkeit, Statuswechsel, Prüfregeln, Nummernvergabe, Suche) → A: Sie werden aus der Datenbank (Trigger, CHECK-Constraints, SQLite-Funktionen) in den Anwendungscode verschoben, damit die Persistenz nicht an SQLite gebunden ist.
- Q: Migrationen → A: Es werden die Migrationen von TypeORM verwendet; der bisherige eigene Migrations-Mechanismus entfällt.
- Q: Soll die App auch mit einer anderen Datenbank lauffähig und getestet sein? → A: Option A – nur SQLite wird ausgeliefert und getestet; der Code ist portabel gebaut (kein SQLite-spezifisches SQL im Anwendungscode), ein Wechsel ist später möglich, aber nicht Teil dieser Änderung.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Alltag unverändert nach der Umstellung (Priority: P1)

Als Anwender erstelle, bearbeite, suche und lösche ich Kunden und Rechnungsentwürfe, stelle Rechnungen aus, markiere sie als bezahlt/storniert und erzeuge PDFs – genau wie vorher, mit denselben Ergebnissen und Fehlermeldungen.

**Why this priority**: Die Umstellung ist nur erfolgreich, wenn kein bestehendes Verhalten bricht.

**Independent Test**: Der bestehende Funktionsumfang (Unit-, Integrations- und E2E-Tests) läuft unverändert grün gegen die neue Persistenz.

**Acceptance Scenarios**:

1. **Given** eine leere Datenbank, **When** ich einen Kunden anlege, eine Rechnung erstelle, ausstelle und als PDF erzeuge, **Then** entspricht das Ergebnis (Nummer, Referenz, Betrag, QR-Teil) dem bisherigen Verhalten.
2. **Given** Kunden mit Umlauten (z. B. «Müller», «Zürich»), **When** ich in der Kundenliste nach «müller» oder «ZÜRICH» suche, **Then** werden sie gefunden.
3. **Given** ungültige Eingaben (zu lange Felder, leerer Name), **When** ich speichere, **Then** erhalte ich dieselben verständlichen deutschen Fehlermeldungen wie bisher.

---

### User Story 2 - Bestehende Datenbank bleibt nutzbar (Priority: P1)

Als Anwender mit bereits gespeicherten Rechnungen öffne ich die App nach dem Update und finde alle Kunden, Rechnungen, Nummern und Einstellungen unverändert vor. Es muss nichts exportiert, importiert oder neu eingegeben werden.

**Why this priority**: Datenverlust oder erzwungene Neuerfassung bei Rechnungsdaten wäre inakzeptabel.

**Independent Test**: Eine mit der aktuellen Version erzeugte Datenbankdatei wird mit der neuen Version geöffnet; alle Daten sind vorhanden und weiter bearbeitbar; fortlaufende Rechnungsnummern setzen korrekt fort; ab dann verwaltet TypeORM den Schemastand.

**Acceptance Scenarios**:

1. **Given** eine Datenbank im bisherigen Schema (Version 2), **When** die neue App startet, **Then** sind alle Daten vollständig vorhanden, die Datenbank wird als aktueller Schemastand der TypeORM-Migrationen erkannt, und vor etwaigen Änderungen wird eine Sicherheitskopie angelegt.
2. **Given** eine beschädigte oder zu neue Datenbankdatei, **When** die App startet, **Then** wird sie nicht verändert und der Anwender erhält dieselbe verständliche Meldung wie bisher.

---

### User Story 3 - Unveränderlichkeit ausgestellter Rechnungen bleibt garantiert (Priority: P1)

Als Anwender kann ich sicher sein, dass eine ausgestellte Rechnung (Inhalt, Positionen, Nummer, Referenz) in der App nicht mehr verändert oder gelöscht werden kann. Die Regeln werden von der Persistenzschicht der Anwendung durchgesetzt, nicht von der Datenbank, damit sie mit jeder von TypeORM unterstützten Datenbank gleich gelten.

**Why this priority**: Verfassungsprinzip III: Dies ist die kritischste Garantie; sie verlässt sich künftig nicht mehr auf Datenbank-Trigger.

**Independent Test**: Jeder Schreibzugriff auf Rechnungen und Positionen läuft durch die Persistenzschicht; Versuche, eine ausgestellte Rechnung oder ihre Positionen zu ändern/löschen, ungültige Statuswechsel auszuführen oder die Nummernvergabe zu umgehen, werden dort abgelehnt, und es gibt keinen Schreibpfad, der diese Prüfung umgeht.

**Acceptance Scenarios**:

1. **Given** eine ausgestellte Rechnung, **When** ein Änderungs- oder Löschversuch an Rechnung oder Positionen erfolgt, **Then** wird er von der Persistenzschicht abgelehnt und die Daten bleiben unverändert.
2. **Given** eine ausgestellte Rechnung, **When** ein unzulässiger Statuswechsel versucht wird (z. B. storniert → bezahlt), **Then** wird er abgelehnt.
3. **Given** gleichzeitige Ausstellvorgänge, **When** Nummern vergeben werden, **Then** entstehen weder Lücken noch Duplikate.

---

### User Story 4 - Sicherung und Schemaentwicklung funktionieren weiter (Priority: P2)

Als Anwender kann ich weiterhin eine konsistente Ein-Datei-Sicherung erstellen. Als Entwickler ändere ich das Schema ausschliesslich über die Migrationen von TypeORM (nur vorwärts, versioniert); vor jeder Migration entsteht automatisch eine Kopie, und eine fehlgeschlagene Migration wird vollständig zurückgerollt.

**Why this priority**: Wichtig für Datensicherheit und Wartbarkeit, aber nach den Kerngarantien.

**Independent Test**: Backup-Datei lässt sich öffnen und enthält den vollständigen Stand; eine absichtlich fehlerhafte Migration hinterlässt die Datenbank unverändert.

**Acceptance Scenarios**:

1. **Given** laufende App mit Daten, **When** ich eine Sicherung erstelle, **Then** ist die Zieldatei eine einzelne, vollständige und konsistente Kopie (keine Zusatzdateien nötig).
2. **Given** eine ausstehende Migration, **When** sie fehlschlägt, **Then** bleibt der alte Stand unverändert und der Anwender erhält eine verständliche Meldung.

---

### User Story 5 - Nachvollziehbare Alternativen bei ORM-Grenzen (Priority: P2)

Als Entwickler sehe ich dokumentiert, welche bisherigen Fähigkeiten TypeORM nicht (oder nicht sauber) abdeckt und wie sie stattdessen im Anwendungscode erhalten bleiben, damit keine stillschweigende Lücke entsteht.

**Why this priority**: Direkter Auftrag aus der Anforderung; ohne diese Dokumentation bleibt unklar, ob Garantien verloren gingen.

**Independent Test**: Für jede der aufgelisteten Fähigkeiten (siehe FR-009) existiert eine dokumentierte Entscheidung (TypeORM-Weg oder Alternative) und ein Test, der die Garantie belegt.

**Acceptance Scenarios**:

1. **Given** die Liste der heutigen Datenbankgarantien, **When** ich die Dokumentation lese, **Then** ist für jede Garantie festgehalten, wie sie nach der Umstellung erfüllt wird.

---

### Edge Cases

- Datenbank der Version 2 (inkl. gespeichertem Geoapify-Schlüssel) wird mit der neuen Version geöffnet: Schlüssel und alle Daten bleiben erhalten.
- Ein Kunde wird gelöscht, der auf ausgestellten Rechnungen als Herkunftshinweis steht: Die Rechnungen bleiben unverändert, nur der Verweis wird geleert.
- Das Löschen eines Rechnungsentwurfs entfernt dessen Positionen mit; bei ausgestellten Rechnungen ist es unmöglich.
- Ein Fehler mitten im Speichern (z. B. Position 3 ungültig): Rechnung und Positionen werden als Ganzes gespeichert oder gar nicht.
- Stromausfall während des Ausstellens: Eine Rechnung ist danach entweder vollständig ausgestellt oder weiterhin Entwurf.
- Datenbankdatei fehlt (Erstinstallation): Eine neue Datenbank wird angelegt.
- Jemand verändert die Datenbankdatei ausserhalb der App (z. B. mit einem SQLite-Werkzeug): Das ist nicht durch die App geschützt (bewusster Kompromiss der Portabilität); die Sicherung ist das Mittel dagegen.
- Zwei Vorgänge greifen gleichzeitig auf dieselbe Rechnung zu (z. B. Ausstellen und Speichern): Die Prüfung und die Änderung erfolgen atomar, es gewinnt genau ein Vorgang.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Das System MUSS sämtlichen Lese- und Schreibzugriff auf Kunden, Rechnungen, Positionen, Einstellungen und Nummernzähler über TypeORM abwickeln; SQL, das nur auf SQLite läuft, ist im Anwendungscode nicht zulässig (FR-015).
- **FR-002**: Das System MUSS das bestehende Verhalten der Anwendung unverändert erhalten (Funktionsumfang, Berechnungen, Fehlermeldungen, Sortierung, Suche).
- **FR-003**: Das System MUSS bestehende Datenbankdateien der aktuellen Schemaversion (Version 2) ohne Datenverlust und ohne manuelle Schritte weiterverwenden und als Ausgangsstand der TypeORM-Migrationen übernehmen.
- **FR-004**: Das System MUSS die Datenbank weiterhin als einzelne Datei im Benutzerdatenordner ohne Zusatzdateien speichern und offline betreiben.
- **FR-005**: Das System MUSS Beträge weiterhin als ganze Rappen und Mengen als Tausendstel speichern (keine Fliesskommazahlen).
- **FR-006**: Das System MUSS ausgestellte Rechnungen und ihre Positionen in der Persistenzschicht (Anwendungscode) vor Änderung und Löschung schützen und nur die erlaubten Statuswechsel zulassen (Entwurf → ausgestellt → bezahlt ⇄ ausgestellt, ausgestellt/bezahlt → storniert). Es DARF keinen Schreibpfad geben, der diese Prüfung umgeht.
- **FR-007**: Das System MUSS Rechnungsnummern pro Jahr lückenlos und ohne Duplikate vergeben, auch bei gleichzeitigen Vorgängen und Abbrüchen.
- **FR-008**: Das System MUSS die bestehenden Gültigkeitsregeln der Daten (Feldlängen, Wertebereiche, Pflichtfelder je Status, Eindeutigkeit der Rechnungsnummer, Positionsreihenfolge) im Anwendungscode durchsetzen, nicht über datenbankspezifische Prüfregeln; portable Eindeutigkeits-Indizes und Fremdschlüssel sind als zusätzlicher Rückhalt zulässig.
- **FR-009**: Für jede der folgenden bisher datenbankseitigen Fähigkeiten MUSS geprüft und dokumentiert werden, wie sie nach der Umstellung im Anwendungscode oder mit TypeORM-Mitteln erfüllt wird:
  1. Unveränderlichkeit ausgestellter Rechnungen und Statusübergangsregeln (bisher Trigger)
  2. Prüfregeln (Längen, Wertebereiche, Status-Konsistenz; bisher CHECK-Constraints)
  3. Umlaut-fähige, gross-/kleinschreibungsunabhängige Suche (bisher SQLite-Funktion)
  4. Integritätsprüfung einer bestehenden Datei vor jeder Änderung (beschädigt/nicht lesbar/zu neu → nie überschreiben)
  5. Konsistente Ein-Datei-Sicherung im laufenden Betrieb
  6. Übernahme des bestehenden Schemas als Ausgangsstand (kein Neuaufbau, keine automatische Schema-Synchronisation, die Daten gefährden könnte)
  7. Unveränderte Speicherformate: Zeitstempel und Datumswerte als ISO-Text, Beträge in Rappen und Mengen in Tausendsteln als Ganzzahlen
  8. Lückenlose, atomare Nummernvergabe ohne datenbankspezifische Spezialsyntax
- **FR-010**: Das System MUSS Datenbankfehler (z. B. Verstoss gegen Unveränderlichkeit, Eindeutigkeit, Prüfregeln) weiterhin in dieselben verständlichen Anwendungsfehler übersetzen wie bisher.
- **FR-011**: Das System MUSS Schemaänderungen ausschliesslich über die Migrationen von TypeORM durchführen (nur vorwärts, versioniert, jede Migration atomar, vor der ersten ausstehenden Migration eine Sicherheitskopie, Erkennung einer zu neuen Datenbank). Der bisherige eigene Migrations-Mechanismus entfällt; eine automatische Schema-Synchronisation im Betrieb ist ausgeschlossen.
- **FR-012**: Das System MUSS die Datenbank- und Dateizugriffe weiterhin ausschliesslich im Hauptprozess halten und der Oberfläche nur über die bestehende, schmale, typisierte Schnittstelle zugänglich machen.
- **FR-013**: Das System MUSS in der Installations- und Paketierungsprozesskette (Windows, Linux, Tests, CI) weiterhin ohne zusätzliche manuelle Schritte baubar und lauffähig sein.
- **FR-014**: Das System MUSS die getroffenen Entscheidungen (TypeORM-Weg vs. Anwendungscode je Fähigkeit aus FR-009) nachvollziehbar dokumentieren.
- **FR-015**: Das System MUSS die Persistenz portabel halten: Anwendungscode und Migrationen verwenden nur Funktionen, die TypeORM datenbankübergreifend bietet; datenbankspezifische Teile sind auf eine klar abgegrenzte Stelle (Verbindung/Treiber-Konfiguration, Sicherung) beschränkt. Ausgeliefert und getestet wird nur SQLite; ein Wechsel auf eine andere Datenbank ist nicht Teil dieser Änderung.

### Key Entities

- **Kunde**: Name und Adresse eines Rechnungsempfängers inkl. Notizen und Zeitstempeln; kann von Rechnungen referenziert werden.
- **Rechnung**: Status (Entwurf, ausgestellt, bezahlt, storniert), Nummer, Daten, Momentaufnahme von Absender und Schuldner, Schlusstext, Referenz, Gesamtbetrag; unveränderlich ab Ausstellung (bis auf Status und zugehörige Zeitpunkte).
- **Rechnungsposition**: Beschreibung, Menge, Einzelpreis, Betrag, Reihenfolge; gehört zu genau einer Rechnung.
- **Einstellungen**: Genau ein Datensatz mit Absenderdaten, Nummernpräfix, Standardtexten, Zahlungsfrist, optionalem Adressdienst-Schlüssel.
- **Nummernzähler**: Letzte vergebene Folgenummer je Kalenderjahr.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % der bestehenden automatisierten Tests (Unit, Integration, E2E) bestehen nach der Umstellung ohne Abschwächung der Erwartungen.
- **SC-002**: Eine Datenbank, die mit der letzten Version vor der Umstellung erzeugt wurde, wird ohne Datenverlust und ohne manuelle Schritte geöffnet (0 verlorene oder veränderte Datensätze im Vergleichstest).
- **SC-003**: 100 % der definierten Versuche, ausgestellte Rechnungen oder deren Positionen über irgendeinen Funktionsaufruf der Anwendung zu ändern oder zu löschen sowie ungültige Statuswechsel auszuführen, werden abgelehnt und lassen die Daten unverändert.
- **SC-004**: In je einem Test mit mindestens 100 aufeinanderfolgenden und mit mindestens 100 parallelen Ausstellvorgängen entstehen 0 Lücken und 0 doppelte Rechnungsnummern.
- **SC-005**: Anwender bemerken keinen Unterschied: Rechnungsliste mit 10 000 Rechnungen öffnet und filtert in unter 1 Sekunde, Ausstellen einer Rechnung dauert unter 1 Sekunde.
- **SC-006**: Für 100 % der in FR-009 genannten Fähigkeiten liegt eine dokumentierte Entscheidung samt belegendem Test vor; im Anwendungscode kommt kein SQLite-spezifisches SQL ausserhalb der abgegrenzten Stelle aus FR-015 vor.
- **SC-007**: Die Sicherungsdatei einer Datenbank mit Testdaten lässt sich öffnen und enthält 100 % der Datensätze.

## Assumptions

- TypeORM wird mit dem bereits eingesetzten eingebetteten SQLite-Treiber betrieben; ein Wechsel der Datenbank-Engine ist nicht gewünscht und ausserhalb des Umfangs (Verfassung Prinzip II/V bleibt gültig).
- Das bestehende Schema (Version 2) bleibt inhaltlich unverändert (Tabellen, Spalten, Fremdschlüssel, Indizes); TypeORM-Entitäten bilden es ab. Trigger und CHECK-Constraints werden nicht mehr benötigt und fallen im Zuge der Umstellung weg; ihre Regeln gelten im Anwendungscode. Neue Fachfunktionen sind nicht Teil dieser Änderung.
- Wo TypeORM eine Garantie nicht abbildet, wird sie im Anwendungscode umgesetzt; ausgenommen sind unvermeidbar datenbankspezifische Teile (Verbindung, Sicherung), die auf eine Stelle beschränkt werden. Die genaue Wahl erfolgt im Plan.
- Die Verfassung (Prinzip III, Technologie-Abschnitt) muss angepasst werden: Unveränderlichkeit wird von der Persistenzschicht statt der Datenbank garantiert, Migrationen laufen über TypeORM. Das geschieht per `/speckit-constitution` vor oder mit der Umsetzung.
- Der Schutz vor Änderungen an der Datenbankdatei ausserhalb der App entfällt bewusst zugunsten der Portabilität.
- Neu angelegte Datenbanken enthalten keine Trigger und keine CHECK-Constraints. Bestehende Dateien behalten ihre Alt-CHECK-Constraints (deren Entfernung bräuchte einen Tabellen-Neuaufbau mit Datenrisiko); die Alt-Trigger werden entfernt. Die Alt-CHECKs decken sich mit den Code-Regeln und ändern das sichtbare Verhalten nicht.
- Die Verfassung verlangt, dass jede neue Abhängigkeit begründet wird (Prinzip V); diese Begründung gehört in den Plan. Ob die Verfassungstechnologie-Zeile «embedded SQLite (native driver)» ergänzt werden muss, wird im Plan geprüft.
- Anwenderoberfläche, Texte und PDF-Ausgabe bleiben unverändert; Performance darf sich nicht spürbar verschlechtern.
- Es gibt keine Mehrbenutzer- oder Netzwerkdatenbank; gleichzeitige Vorgänge betreffen nur Aufrufe innerhalb derselben App.
