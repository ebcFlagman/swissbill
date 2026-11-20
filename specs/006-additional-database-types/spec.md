# Feature Specification: Weitere Datenbanktypen (PostgreSQL, MySQL/MariaDB)

**Feature Branch**: `claude/additional-database-types-faf303`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "Ich möchte auch weitere datenbanktypen unterstützen wie postgre oder mysql/mariadb. Die Credentials sollen in den einstellungen eingegeben werden können, sollen aber dann im schlüsselmanagement des os gespeichert werden."

## Kontext

Heute speichert die App alle Daten (Kunden, Rechnungen, Einstellungen) in einer eingebetteten Datei-Datenbank auf dem eigenen Gerät. Anwender, die die App auf mehreren Geräten oder in einem kleinen Team nutzen, oder die bereits einen Datenbankserver betreiben, möchten stattdessen eine **eigene Datenbank auf einem Server** (PostgreSQL, MySQL oder MariaDB) verwenden. Die Zugangsdaten werden in den Einstellungen eingegeben und danach **nicht in der App-Datenbank oder in Klartext-Dateien**, sondern im **Schlüsselbund/Passwortspeicher des Betriebssystems** abgelegt. Die lokale Datenbank bleibt die Standardeinstellung; ohne Konfiguration verhält sich die App exakt wie bisher.

## Clarifications

### Session 2026-11-20

- Q: Wo liegen die App-Einstellungen bei einer Serverdatenbank? → A: Alle Einstellungen (Absenderdaten, IBAN, Nummernkreis, Geoapify-Schlüssel) liegen auf dem Server und werden von allen Geräten geteilt. Der Geoapify-Schlüssel darf dort unverschlüsselt liegen; nur die Zugangsdaten zur Datenbank selbst gehören in den OS-Schlüsselbund.
- Q: Was passiert bei gleichzeitiger Bearbeitung desselben Entwurfs/Kunden von zwei Geräten? → A: Der Datensatz wird gesperrt, solange ihn ein Gerät bearbeitet; andere Geräte sehen ihn schreibgeschützt.
- Q: Wie wird mit unterschiedlichen App-Versionen auf einer Serverdatenbank umgegangen? → A: Jedes Gerät migriert automatisch auf seine Version; Geräte mit älterer App-Version öffnen ein neueres Schema nicht und fordern zum Update auf.
- Q: Wie wird TLS bei der Serververbindung gehandhabt? → A: Bei aktiviertem TLS wird das Zertifikat immer geprüft; optional kann ein eigenes CA-Zertifikat hinterlegt werden. Zusätzlich ist eine unverschlüsselte Verbindung (TLS aus) möglich.
- Q: Wie werden Verbindungsangaben auf mehrere Geräte verteilt? → A: Jedes Gerät wird manuell in den Einstellungen eingerichtet; keine Vorgabe per Konfigurationsdatei.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mit einem Datenbankserver verbinden (Priority: P1)

Als Anwender öffne ich die Einstellungen, wähle als Datenbanktyp PostgreSQL, MySQL oder MariaDB, gebe Server, Port, Datenbankname, Benutzer und Passwort ein, prüfe die Verbindung und speichere. Nach einem Neustart der App arbeite ich mit Kunden und Rechnungen in dieser Datenbank – mit demselben Funktionsumfang wie lokal.

**Why this priority**: Das ist der Kern der Funktion; ohne ihn gibt es keinen Mehrwert.

**Independent Test**: Gegen je einen PostgreSQL-, MySQL- und MariaDB-Server Verbindung einrichten, einen Kunden anlegen, eine Rechnung ausstellen und als PDF erzeugen; die Daten sind nach Neustart noch vorhanden.

**Acceptance Scenarios**:

1. **Given** ein erreichbarer, leerer Datenbankserver mit gültigen Zugangsdaten, **When** ich die Verbindung in den Einstellungen speichere und die App neu starte, **Then** wird das Datenbankschema automatisch angelegt und ich kann Kunden und Rechnungen erfassen.
2. **Given** eine konfigurierte Serververbindung, **When** ich eine Rechnung ausstelle, **Then** gelten dieselben Regeln wie lokal (fortlaufende Nummer ohne Lücken und Duplikate, Unveränderlichkeit, gültige Statuswechsel, Umlaut-unabhängige Suche).
3. **Given** zwei Geräte mit derselben Serverdatenbank, **When** beide gleichzeitig Rechnungen ausstellen, **Then** entstehen weder doppelte noch fehlende Rechnungsnummern.

---

### User Story 2 - Zugangsdaten sicher im Betriebssystem ablegen (Priority: P1)

Als Anwender gebe ich das Datenbankpasswort einmal in den Einstellungen ein. Die App legt es im Schlüsselbund meines Betriebssystems ab und zeigt es danach nie wieder im Klartext an. Das Passwort steht weder in der App-Datenbank noch in einer Konfigurationsdatei, noch in Logs oder Sicherungen.

**Why this priority**: Datenbankzugänge geben Zugriff auf Finanz- und Personendaten; ein unsicheres Ablegen wäre ein Ausschlusskriterium.

**Independent Test**: Nach dem Speichern ist das Passwort in keiner Datei im App-Datenverzeichnis auffindbar, wohl aber im Schlüsselbund des Betriebssystems; die App verbindet sich weiterhin ohne erneute Eingabe.

**Acceptance Scenarios**:

1. **Given** ich habe Zugangsdaten gespeichert, **When** ich die Einstellungen erneut öffne, **Then** sehe ich Server, Port, Datenbank und Benutzer, das Passwortfeld ist leer mit dem Hinweis «gespeichert»; ich kann es ersetzen oder entfernen.
2. **Given** ein Betriebssystem ohne verfügbaren Schlüsselbund, **When** ich Zugangsdaten speichern will, **Then** lehnt die App das Speichern mit einer verständlichen Meldung ab und legt das Passwort nirgends unverschlüsselt ab.
3. **Given** das Passwort fehlt im Schlüsselbund (z. B. anderer Benutzer, Eintrag gelöscht), **When** die App startet, **Then** fordert sie zur erneuten Eingabe in den Einstellungen auf, statt mit leerem Passwort zu verbinden.

---

### User Story 3 - Verbindungsprobleme verständlich behandeln (Priority: P2)

Als Anwender erhalte ich bei Fehlern (Server nicht erreichbar, falsches Passwort, Datenbank existiert nicht, fehlende Rechte, Zeitüberschreitung) eine verständliche deutsche Meldung und kann die Verbindung korrigieren oder zur lokalen Datenbank zurückwechseln – ohne dass Daten verloren gehen oder halb geschrieben werden.

**Why this priority**: Serververbindungen fallen aus; die App darf dann nicht in einem unklaren Zustand enden.

**Independent Test**: Verbindungstest mit falschem Passwort, falschem Host und abgeschaltetem Server durchführen; jeweils erscheint eine passende Meldung, und die zuvor gültige Konfiguration bleibt erhalten.

**Acceptance Scenarios**:

1. **Given** falsche Zugangsdaten, **When** ich «Verbindung testen» wähle, **Then** sehe ich eine Meldung, die Ursache (Erreichbarkeit, Anmeldung, Datenbank, Rechte) unterscheidet, ohne das Passwort anzuzeigen.
2. **Given** die Verbindung bricht während der Nutzung ab, **When** ich speichere, **Then** erhalte ich eine Fehlermeldung und es wird nichts teilweise gespeichert.
3. **Given** der Server ist beim Start nicht erreichbar, **When** die App startet, **Then** bietet sie an, es erneut zu versuchen, die Einstellungen zu öffnen oder vorübergehend die lokale Datenbank zu verwenden.

---

### User Story 4 - Zwischen lokal und Server wechseln (Priority: P3)

Als Anwender wechsle ich in den Einstellungen zwischen der lokalen Datenbank und einer Serverdatenbank. Der Wechsel betrifft nur, womit ich künftig arbeite; vorhandene Daten werden dabei weder gelöscht noch automatisch kopiert, und ich werde vor dem Wechsel darauf hingewiesen.

**Why this priority**: Nützlich, aber nach dem Kernablauf; ein Datenumzug ist bewusst nicht enthalten.

**Independent Test**: Von lokal auf Server und zurück wechseln; die lokale Datei bleibt unverändert, die Serverdaten bleiben erhalten.

**Acceptance Scenarios**:

1. **Given** eine lokale Datenbank mit Rechnungen, **When** ich auf einen leeren Server wechsle, **Then** warnt die App, dass vorhandene lokale Daten nicht übernommen werden, und die lokale Datei bleibt unangetastet.
2. **Given** ich wechsle zurück auf lokal, **When** die App neu startet, **Then** sehe ich wieder meine lokalen Daten.

---

### Edge Cases

- Server-Datenbank enthält ein Schema einer **neueren** App-Version: App öffnet sie nicht, ändert nichts und erklärt dies verständlich (wie bei lokaler Datei).
- Server-Datenbank ist **nicht leer** und enthält fremde Tabellen: App legt ihre Tabellen nur an, wenn sie eindeutig von der App stammen oder die Datenbank leer ist; sonst Abbruch mit Meldung.
- Benutzer hat nur Leserechte: Verbindungstest meldet fehlende Schreib-/Anlegerechte.
- Sonderzeichen in Passwort, Benutzername oder Datenbankname (Leerzeichen, `@`, `:`, `/`, Umlaute) werden korrekt verarbeitet.
- Verschlüsselte Verbindung (TLS) wird vom Server verlangt oder abgelehnt; Zertifikat ungültig, abgelaufen oder von unbekannter Stelle: Verbindung wird abgelehnt mit verständlichem Hinweis (inkl. Möglichkeit, ein eigenes CA-Zertifikat zu hinterlegen).
- Zeitzonen- und Zeichensatzunterschiede der Server dürfen weder Beträge, Daten noch Umlaute verändern.
- Sicherung: Die Ein-Datei-Sicherung der lokalen Datenbank gilt nur für lokal; bei Serverdatenbanken wird auf die Sicherung durch den Server-Betreiber hingewiesen.
- Mehrere Geräte arbeiten gleichzeitig an derselben Rechnung im Entwurf oder demselben Kunden: Nur ein Gerät darf bearbeiten, andere sehen den Datensatz schreibgeschützt mit Hinweis, wer/welches Gerät ihn bearbeitet.
- Ein Gerät stürzt ab oder verliert die Verbindung, während es einen Datensatz sperrt: Die Sperre läuft automatisch ab und blockiert den Datensatz nicht dauerhaft.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Die App MUSS neben der lokalen Datenbank die Datenbanktypen PostgreSQL, MySQL und MariaDB als Speicherort unterstützen; die lokale Datenbank bleibt Standard.
- **FR-002**: Ohne ausdrückliche Konfiguration einer Serverdatenbank MUSS die App sich exakt wie bisher verhalten und keine Netzwerkverbindung zu einem Datenbankserver aufbauen.
- **FR-003**: Anwender MÜSSEN in den Einstellungen Datenbanktyp, Server, Port, Datenbankname, Benutzer, Passwort und (wählbar) TLS-Nutzung eingeben können; sinnvolle Standardports je Typ werden vorbelegt.
- **FR-003a**: Bei aktiviertem TLS MUSS das Serverzertifikat immer geprüft werden; es gibt keine Option, die Prüfung abzuschalten. Für Server mit eigenem Zertifikat kann der Anwender optional ein CA-Zertifikat auswählen. Ist TLS ausgeschaltet, ist eine unverschlüsselte Verbindung erlaubt; die App MUSS dann in den Einstellungen deutlich darauf hinweisen, dass Daten und Passwort unverschlüsselt übertragen werden.
- **FR-004**: Die App MUSS einen Verbindungstest anbieten, der Erreichbarkeit, Anmeldung, Existenz der Datenbank und ausreichende Rechte prüft und das Ergebnis verständlich auf Deutsch meldet.
- **FR-005**: Das Passwort MUSS ausschliesslich im Schlüsselbund/Passwortspeicher des Betriebssystems gespeichert werden und DARF NICHT in der App-Datenbank, in Konfigurationsdateien, Sicherungen, Logs, Fehlermeldungen oder im Renderer-Prozess nach dem Speichern auftauchen.
- **FR-006**: Nicht geheime Verbindungsangaben (Typ, Server, Port, Datenbankname, Benutzer, TLS) DÜRFEN in den lokalen App-Einstellungen gespeichert werden; sie werden nicht in einer Serverdatenbank abgelegt, damit die App vor dem Verbinden weiss, wohin.
- **FR-006a**: Bei einer Serverdatenbank MÜSSEN alle App-Einstellungen (Absenderdaten, IBAN, Nummernkreis, Geoapify-Schlüssel) in der Serverdatenbank liegen und für alle Geräte gelten. Der Geoapify-Schlüssel darf dort unverschlüsselt gespeichert werden (gerätegebundene Verschlüsselung würde das Teilen verhindern); er DARF weiterhin nur an den Geoapify-Dienst gesendet werden. Ausgenommen sind einzig die Verbindungsangaben zur Datenbank selbst (FR-005, FR-006).
- **FR-007**: Ist kein Schlüsselbund verfügbar, MUSS die App das Speichern von Zugangsdaten ablehnen und darf kein Ersatzverfahren mit Klartext verwenden.
- **FR-008**: Gespeicherte Zugangsdaten MÜSSEN änderbar und entfernbar sein; beim Entfernen wird auch der Schlüsselbund-Eintrag gelöscht. Das Passwort wird nach dem Speichern nie wieder angezeigt.
- **FR-009**: Auf jeder unterstützten Datenbank MÜSSEN dieselben fachlichen Garantien gelten: Unveränderlichkeit ausgestellter Rechnungen, gültige Statuswechsel, Prüfregeln, lückenlose und duplikatfreie Nummernvergabe (auch bei gleichzeitigem Zugriff mehrerer Geräte), Beträge ohne Rundungsfehler und Suche unabhängig von Gross-/Kleinschreibung und Umlauten.
- **FR-009a**: Bei einer Serverdatenbank MUSS ein Kunde oder Rechnungsentwurf für die Dauer der Bearbeitung durch ein Gerät gesperrt sein; andere Geräte sehen ihn schreibgeschützt mit verständlichem Hinweis. Die Sperre wird beim Schliessen/Speichern freigegeben und läuft nach Ausfall des Geräts (Absturz, Verbindungsverlust) nach 5 Minuten ohne Lebenszeichen automatisch ab. Ein Gerät mit abgelaufener Sperre darf nicht mehr unbemerkt speichern.
- **FR-010**: Das Datenbankschema MUSS beim ersten Verbinden mit einer leeren Serverdatenbank automatisch angelegt und bei App-Updates versioniert und vorwärts fortgeschrieben werden; eine fehlgeschlagene Schemaänderung darf keinen halben Zustand hinterlassen.
- **FR-010a**: Beim Start einer neueren App-Version MUSS ein älteres Serverschema automatisch (mit Schutz gegen gleichzeitiges Migrieren durch mehrere Geräte) fortgeschrieben werden; eine App mit älterem Stand als das Schema MUSS die Datenbank unverändert lassen und zum App-Update auffordern.
- **FR-011**: Die App MUSS ein Schema einer neueren App-Version oder eine fremde, nicht leere Datenbank erkennen und unverändert lassen, mit verständlicher Meldung.
- **FR-012**: Bei Verbindungsfehlern (beim Start oder im Betrieb) MUSS die App eine verständliche Meldung zeigen, nichts teilweise speichern und anbieten, Einstellungen zu öffnen, erneut zu versuchen oder auf die lokale Datenbank auszuweichen.
- **FR-013**: Der Wechsel zwischen lokaler und Serverdatenbank MUSS ausdrücklich bestätigt werden, weist darauf hin, dass Daten nicht automatisch übernommen werden, und verändert oder löscht keine bestehenden Daten.
- **FR-014**: Die Änderung der Datenbankverbindung MUSS erst nach Neustart der App oder einem klar angezeigten Neuverbinden wirksam werden; bis dahin arbeitet die App konsistent mit der bisherigen Datenbank.
- **FR-015**: Die Bedienoberfläche und Fehlermeldungen MÜSSEN auf Deutsch (und in den übrigen vorhandenen Sprachen der App) verfügbar sein und DÜRFEN keine Zugangsdaten enthalten.

### Key Entities

- **Datenbankverbindung**: Beschreibt, wo die App ihre Daten ablegt: Typ (lokal, PostgreSQL, MySQL, MariaDB), Server, Port, Datenbankname, Benutzer, TLS-Nutzung. Genau eine ist aktiv.
- **Zugangsdaten (Passwort)**: Geheimer Teil der Verbindung; gehört zu genau einer Datenbankverbindung, liegt ausschliesslich im Schlüsselbund des Betriebssystems.
- **Bearbeitungssperre**: Kennzeichnet, dass ein Gerät einen Kunden oder Rechnungsentwurf gerade bearbeitet; hat Besitzer (Gerät/Benutzer) und Ablaufzeit.
- **App-Einstellungen**: Absenderdaten, IBAN, Nummernkreis und Geoapify-Schlüssel; liegen in der jeweils aktiven Datenbank (lokal oder Server) und sind bei einer Serverdatenbank für alle Geräte gemeinsam.
- **Verbindungstest-Ergebnis**: Ergebnis der Prüfung (erreichbar, angemeldet, Datenbank vorhanden, Rechte ausreichend, Schemastand kompatibel) mit verständlicher Meldung.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein Anwender mit vorbereitetem Server richtet die Verbindung in unter 3 Minuten ein und stellt danach seine erste Rechnung aus.
- **SC-002**: Der gesamte bestehende Funktionsumfang (Kunden, Rechnungen, Ausstellen, Statuswechsel, Suche, PDF) liefert auf PostgreSQL, MySQL und MariaDB dieselben Ergebnisse wie lokal; 100 % der fachlichen Tests laufen auf allen vier Datenbanktypen grün.
- **SC-003**: In 100 gleichzeitigen Ausstellvorgängen von mindestens zwei Geräten entstehen 0 doppelte und 0 fehlende Rechnungsnummern.
- **SC-004**: In keiner Datei im App-Datenverzeichnis, keiner Sicherung und keinem Log ist ein gespeichertes Datenbankpasswort auffindbar (0 Fundstellen).
- **SC-005**: 100 % der geprüften Fehlerfälle (falscher Host, falsches Passwort, fehlende Datenbank, fehlende Rechte, Server aus) führen zu einer verständlichen Meldung ohne Datenverlust.
- **SC-006**: Anwender ohne Serverkonfiguration bemerken keine Änderung gegenüber der bisherigen Version, und es erfolgt keine Netzwerkverbindung zu einem Datenbankserver.

## Assumptions

- Unterstützt werden PostgreSQL, MySQL und MariaDB in aktuell gepflegten Versionen; weitere Typen (z. B. SQL Server, Oracle) sind nicht Teil dieser Änderung.
- Der Datenbankserver wird vom Anwender selbst bereitgestellt und betrieben; die App legt weder Server noch Datenbank an, nur die Tabellen in einer vorhandenen Datenbank.
- Verbindungsangaben werden pro Gerät manuell eingegeben; eine zentrale Verteilung (z. B. per Konfigurationsdatei) ist nicht enthalten.
- Ein automatischer Datenumzug zwischen lokaler Datenbank und Server (Export/Import) ist nicht enthalten; er kann später separat spezifiziert werden.
- Sicherung und Wiederherstellung von Serverdatenbanken liegen in der Verantwortung des Server-Betreibers; die bestehende Ein-Datei-Sicherung gilt weiter für die lokale Datenbank.
- Das Verhalten der lokalen Datenbank bei der Speicherung des Geoapify-Schlüssels bleibt unverändert; die Lockerung gilt nur für Serverdatenbanken.
- Mehrgeräte-Nutzung wird für die fachlichen Garantien (Nummernvergabe, Unveränderlichkeit) berücksichtigt, ein Echtzeit-Abgleich offener Bildschirme zwischen Geräten ist nicht enthalten. Sperren werden beim Öffnen/Aktualisieren sichtbar; die Ablaufzeit von 5 Minuten ist ein Standardwert.
- Der Schlüsselbund des Betriebssystems (Windows, macOS, Linux) ist die einzige Ablage für Passwörter; ohne verfügbaren Schlüsselbund ist keine Serververbindung mit Passwort einrichtbar.
- Die Datenbankverbindung zu einem Server ist eine neue Netzwerkverbindung. Das widerspricht dem heutigen Verfassungsprinzip II («lokal, eingebettete SQLite, keine Netzwerkdienste») und erfordert vor der Umsetzung eine **Verfassungsänderung**: Serverdatenbank nur als opt-in durch den Anwender, ausschliesslich zum selbst konfigurierten Server, nur die App-Daten, Netzwerksperre für alles andere bleibt bestehen.
- Aufbauend auf der Persistenz über TypeORM (Feature 005), bei der die fachlichen Garantien bereits im Anwendungscode statt in Datenbank-Triggern liegen.
