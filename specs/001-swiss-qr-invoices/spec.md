# Feature Specification: Swiss QR-Rechnungen erstellen

**Feature Branch**: `001-swiss-qr-invoices`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Einfache Desktop-Applikation, mit der Rechnungen mit Zahlteil inkl. QR-Code für die Schweiz erstellt werden können. Die Zahlungsinformationen und der Inhalt pro Rechnung werden lokal gespeichert."

## Clarifications

### Session 2026-10-08

- Q: Wie wird der Absender festgelegt? → A: Global definiert, kann aber pro Rechnung überschrieben werden.
- Q: Muss die MwSt ausgewiesen werden? → A: Nein, keine MwSt-Ausweisung.
- Q: Sind Freitexte auf der Rechnung vorgesehen? → A: Ja, ein globaler Standard-Schlusstext, der pro Rechnung überschrieben werden kann; kein Einleitungstext.
- Q: Welche Positionsfelder werden unterstützt? → A: Nur Beschreibung, Menge und Einzelpreis; keine Einheit und kein Rabattfeld.
- Q: Was passiert mit fehlerhaften oder ungültigen ausgestellten Rechnungen? → A: Zusätzlicher Status «storniert», die Rechnung bleibt sichtbar und ihre Nummer vergeben. Nicht ausgestellte Entwürfe dürfen gelöscht werden; die Nummer wird erst bei der Ausstellung vergeben.
- Q: Wie ist die Rechnungsnummer aufgebaut? → A: Konfigurierbarer Präfix, Jahr und Zähler, der pro Jahr bei 1 beginnt (z. B. RE-2026-0001).
- Q: Wie entsteht die Zahlungsreferenz? → A: Automatisch aus der Rechnungsnummer (QR-Referenz bei QR-IBAN, Creditor Reference bei normaler IBAN).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rechnung mit QR-Zahlteil als PDF erstellen (Priority: P1)

Als Rechnungssteller erfasse ich eine Rechnung (Empfänger, Positionen, Betrag in CHF) und erhalte ein PDF
mit korrektem Schweizer QR-Zahlteil, das ich ausdrucken oder per E-Mail versenden kann und das sich
im E-Banking per QR-Code-Scan bezahlen lässt.

**Why this priority**: Das ist der Kern des Produkts. Ohne gültigen Zahlteil hat die Anwendung keinen Nutzen.

**Independent Test**: Eine Rechnung mit fiktiven Daten erfassen, PDF erzeugen und den QR-Code mit einem
Validierungswerkzeug für Swiss QR-Bills prüfen. Der Test liefert für sich bereits eine versandfähige Rechnung.

**Acceptance Scenarios**:

1. **Given** eine vollständige Rechnung mit gültigen Zahlungsinformationen, **When** ich das PDF erzeuge, **Then** enthält die A4-Seite Rechnungsinhalt und unten den Zahlteil mit Empfangsschein, Zahlteil, QR-Code mit Schweizer Kreuz und Trennlinie.
2. **Given** eine Rechnung mit QR-IBAN und QR-Referenz, **When** ich das PDF erzeuge, **Then** stimmen Betrag, Währung CHF, Gläubiger, Schuldner und Referenz im QR-Code mit den erfassten Daten überein.
3. **Given** ungültige Zahlungsdaten (z. B. normale IBAN mit QR-Referenz), **When** ich das PDF erzeugen will, **Then** wird die Erzeugung mit einer verständlichen Fehlermeldung verhindert.
4. **Given** eine Rechnung mit mehreren Positionen, **When** ich das PDF erzeuge, **Then** entspricht der Rechnungsbetrag der Summe der Positionen.

---

### User Story 2 - Rechnungen lokal speichern, wiederfinden und bearbeiten (Priority: P2)

Als Rechnungssteller sind meine Rechnungen automatisch lokal gespeichert. Ich sehe eine Liste aller Rechnungen,
kann Entwürfe bearbeiten und jederzeit das PDF einer bereits ausgestellten Rechnung erneut erzeugen.

**Why this priority**: Ohne Speicherung muss jede Rechnung neu erfasst werden. Zusammen mit Story 1 ergibt sich das Minimalprodukt.

**Independent Test**: Rechnung erfassen, App schliessen und neu starten. Die Rechnung ist in der Liste vorhanden und das PDF ist reproduzierbar.

**Acceptance Scenarios**:

1. **Given** eine gespeicherte Rechnung, **When** ich die App neu starte, **Then** erscheint sie unverändert in der Rechnungsliste.
2. **Given** ein Entwurf, **When** ich ihn ändere und speichere, **Then** werden die Änderungen übernommen.
3. **Given** eine bereits ausgestellte Rechnung (PDF erzeugt), **When** ich sie öffne, **Then** sehe ich sie schreibgeschützt und das erneut erzeugte PDF ist inhaltlich identisch.
4. **Given** eine ausgestellte Rechnung, **When** ich sie ändern möchte, **Then** kann ich sie nur als neue Rechnung duplizieren oder stornieren.

---

### User Story 3 - Eigene Zahlungsinformationen und Kunden verwalten (Priority: P3)

Als Rechnungssteller hinterlege ich meine Absender- und Zahlungsangaben (Name, Adresse, IBAN/QR-IBAN) einmalig
und pflege Kunden, damit ich sie bei neuen Rechnungen nur noch auswähle.

**Why this priority**: Spart Zeit und verhindert Tippfehler, ist aber für eine erste Rechnung nicht zwingend.

**Independent Test**: Absender und Kunde einmal erfassen und in zwei Rechnungen wiederverwenden, ohne die Daten erneut einzugeben.

**Acceptance Scenarios**:

1. **Given** hinterlegte Absender- und Zahlungsangaben, **When** ich eine neue Rechnung beginne, **Then** sind diese vorausgefüllt.
2. **Given** gespeicherte Kunden, **When** ich eine Rechnung erstelle, **Then** kann ich einen Kunden auswählen und seine Adresse wird übernommen.
3. **Given** ein Kunde, dessen Adresse sich später ändert, **When** ich die Adresse anpasse, **Then** bleiben bereits ausgestellte Rechnungen mit der damaligen Adresse unverändert.
4. **Given** ein global definierter Absender, **When** ich in einer einzelnen Rechnung den Absender überschreibe, **Then** gelten die abweichenden Angaben nur für diese Rechnung und der globale Absender bleibt unverändert.
5. **Given** ein globaler Absender, der später geändert wird, **When** ich eine bereits ausgestellte Rechnung öffne, **Then** zeigt sie weiterhin den damaligen Absender.

---

### User Story 4 - Rechnungsnummern und Status (Priority: P3)

Als Rechnungssteller erhalte ich bei der Ausstellung fortlaufende, eindeutige Rechnungsnummern und kann den Status einer Rechnung (Entwurf, ausgestellt, bezahlt, storniert) nachführen.

**Why this priority**: Verbessert Übersicht und Nachvollziehbarkeit, gehört aber nicht zum Minimalumfang.

**Independent Test**: Drei Rechnungen erstellen. Nummern sind fortlaufend und eindeutig, und der Status lässt sich in der Liste filtern.

**Acceptance Scenarios**:

1. **Given** bestehende Rechnungen, **When** ich eine neue ausstelle, **Then** erhält sie die nächste freie Nummer ohne Duplikat.
2. **Given** eine ausgestellte Rechnung, **When** ich sie als bezahlt markiere, **Then** wird der Status in der Liste angezeigt, ohne dass sich der Rechnungsinhalt ändert.
3. **Given** eine fehlerhafte ausgestellte Rechnung, **When** ich sie storniere, **Then** bleibt sie mit ihrer Nummer sichtbar als «storniert» und die Nummer wird nicht erneut vergeben.
4. **Given** ein Entwurf, **When** ich ihn lösche, **Then** verschwindet er aus der Liste und es entsteht keine Lücke in der Nummernfolge.

---

### Edge Cases

- Betrag von 0 oder negativ: Die Erzeugung wird verhindert.
- Rundung bei Mengen mal Einzelpreis: Positionsbeträge werden auf Rappen gerundet, die Summen stimmen immer mit der Summe der Positionen überein.
- Sehr lange Namen, Adressen oder Positionstexte, Umlaute und Sonderzeichen: Text wird korrekt dargestellt. Felder, die der Standard begrenzt, werden mit klarer Meldung abgelehnt.
- Viele Positionen: Der Rechnungsinhalt läuft auf eine Folgeseite, der Zahlteil bleibt am Seitenende an seinem Standardplatz.
- Ungültige IBAN (Prüfsumme), nicht-schweizerische IBAN: klare Fehlermeldung. IBAN aus Liechtenstein wird korrekt akzeptiert.
- Ungültige QR-Referenz (Prüfziffer) oder ungültige Creditor Reference: Die Erzeugung wird verhindert.
- Datenbank fehlt oder ist beschädigt beim Start: Die Anwendung meldet das Problem verständlich und überschreibt keine Daten stillschweigend.
- PDF kann nicht gespeichert werden (Datei geöffnet, kein Schreibrecht): verständliche Fehlermeldung, die Rechnung bleibt unverändert.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Das System MUSS es erlauben, eine Rechnung mit Datum, Zahlungsfrist, Absender, Empfänger und einer oder mehreren Positionen zu erfassen. Eine Position besteht ausschliesslich aus Beschreibung, Menge und Einzelpreis (nicht negativ); Einheiten und Rabatte sind nicht vorgesehen.
- **FR-002**: Das System MUSS Positions- und Gesamtbeträge ausschliesslich in CHF berechnen und anzeigen.
- **FR-003**: Das System MUSS ein PDF im A4-Format mit Rechnungsinhalt und einem Schweizer QR-Zahlteil (Empfangsschein, Zahlteil, QR-Code mit Schweizer Kreuz, Trennlinie) gemäss den aktuellen SIX-Richtlinien erzeugen.
- **FR-004**: Das System MUSS IBAN bzw. QR-IBAN inklusive Prüfsumme validieren und die Kombination mit dem Referenztyp (QR-Referenz, Creditor Reference, ohne Referenz) prüfen.
- **FR-005**: Das System MUSS bei ungültigen oder unvollständigen Zahlungsdaten die Erzeugung des Zahlteils verhindern und die Fehlerursache feldgenau und verständlich anzeigen.
- **FR-006**: Das System MUSS Rechnungsinhalt und Zahlungsinformationen jeder Rechnung dauerhaft lokal speichern, ohne Internetverbindung und ohne Benutzerkonto.
- **FR-007**: Das System MUSS eine durchsuchbare und filterbare Liste aller Rechnungen mit Nummer, Kunde, Datum, Betrag und Status anzeigen.
- **FR-008**: Das System MUSS Entwürfe bearbeitbar halten, aber eine Rechnung nach der PDF-Erzeugung als ausgestellt kennzeichnen und deren Inhalt unveränderlich machen.
- **FR-009**: Das System MUSS das Duplizieren einer ausgestellten Rechnung als neuen Entwurf erlauben.
- **FR-010**: Das System MUSS das erneute Erzeugen des PDFs einer ausgestellten Rechnung mit inhaltlich identischem Ergebnis erlauben.
- **FR-011**: Das System MUSS einen globalen Absender (inkl. Zahlungsangaben) sowie Kunden einmalig speichern, den globalen Absender bei neuen Rechnungen vorausfüllen und Kunden zur Auswahl anbieten, wobei bei ausgestellten Rechnungen die damaligen Angaben erhalten bleiben.
- **FR-012**: Das System MUSS eindeutige Rechnungsnummern im Format Präfix-Jahr-Zähler (z. B. RE-2026-0001) vergeben, wobei der Präfix vom Benutzer konfigurierbar ist, der Zähler pro Jahr bei 1 beginnt, lückenlos hochzählt und mindestens vierstellig angezeigt wird. Duplikate MÜSSEN verhindert werden. Die Nummer wird erst bei der Ausstellung (PDF-Erzeugung) vergeben; Entwürfe haben noch keine Nummer.
- **FR-013**: Das System MUSS den Status einer Rechnung (Entwurf, ausgestellt, bezahlt, storniert) verwalten. Eine stornierte Rechnung bleibt in der Liste sichtbar, ihre Nummer bleibt vergeben und wird nicht wiederverwendet.
- **FR-014**: Das System MUSS das PDF an einem vom Benutzer gewählten Ort speichern und zum Drucken bereitstellen können.
- **FR-015**: Die gesamte Benutzeroberfläche und der Zahlteil MÜSSEN auf Deutsch sein.
- **FR-016**: Das System MUSS die Daten so ablegen, dass sich eine Sicherung durch Kopieren einer einzelnen Datei erstellen lässt, und den Speicherort dem Benutzer anzeigen.
- **FR-017**: Das System MUSS erlauben, den Absender pro Rechnung zu überschreiben, ohne den globalen Absender zu verändern. Überschriebene Angaben unterliegen derselben Validierung wie der globale Absender.
- **FR-018**: Das System MUSS Rechnungsbeträge ohne MwSt-Ausweisung darstellen (Positionen und Gesamtbetrag als Endbeträge).
- **FR-019**: Das System MUSS die Zahlungsreferenz automatisch aus der Rechnungsnummer ableiten: eine QR-Referenz (27 Stellen mit Prüfziffer) bei QR-IBAN bzw. eine Creditor Reference (ISO 11649) bei normaler IBAN. Der Benutzer gibt keine Referenz manuell ein, und die Referenz ist pro Rechnung eindeutig und reproduzierbar.
- **FR-020**: Das System MUSS die Zahlungsreferenz aus den Ziffern von Jahr und Zähler der Rechnungsnummer ableiten; der Präfix fliesst nicht in die Referenz ein.
- **FR-021**: Das System MUSS das Löschen von Entwürfen erlauben, nicht aber das Löschen ausgestellter, bezahlter oder stornierter Rechnungen.
- **FR-022**: Das System MUSS einen global hinterlegten Standard-Schlusstext (z. B. Zahlungsbedingungen) bei neuen Rechnungen vorausfüllen und das Überschreiben pro Rechnung erlauben, ohne den globalen Text zu verändern. Bei ausgestellten Rechnungen bleibt der damalige Text erhalten.

### Key Entities *(include if feature involves data)*

- **Rechnung**: Nummer, Datum, Zahlungsfrist, Status, Absender- und Empfängerangaben als Momentaufnahme, automatisch abgeleitete Referenz, Schlusstext (Momentaufnahme des globalen Standardtexts, pro Rechnung überschreibbar), Zusatzinformationen, Gesamtbetrag in CHF.
- **Rechnungsposition**: Beschreibung, Menge, Einzelpreis, Positionsbetrag; gehört zu genau einer Rechnung.
- **Absender / Zahlungsinformation**: Name, Adresse, IBAN oder QR-IBAN, bevorzugter Referenztyp. Es gibt einen globalen Absender als Vorgabe; jede Rechnung speichert ihre eigene Momentaufnahme, die vom globalen Absender abweichen darf.
- **Kunde**: Name, Adresse, optionale Notizen; kann in mehreren Rechnungen verwendet werden.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein Benutzer erstellt eine Rechnung mit drei Positionen inklusive PDF in unter 3 Minuten, sofern Absender und Kunde bereits hinterlegt sind.
- **SC-002**: 100 % der erzeugten Zahlteile bestehen die Prüfung mit einem Validierungswerkzeug für Swiss QR-Bills.
- **SC-003**: Beim Scannen des QR-Codes im E-Banking werden Betrag, Empfänger und Referenz zu 100 % korrekt übernommen (Stichprobe mit mindestens zwei verschiedenen Banking-Apps).
- **SC-004**: 95 % der Erstbenutzer erzeugen ohne Anleitung ihre erste gültige Rechnung.
- **SC-005**: Nach Neustart der Anwendung sind 100 % der gespeicherten Rechnungen unverändert vorhanden.
- **SC-006**: Eine ausgestellte Rechnung kann nach Ausstellung nicht mehr verändert werden, und ihr erneut erzeugtes PDF ist inhaltlich identisch.
- **SC-007**: Fehleingaben bei IBAN, Referenz und Pflichtfeldern werden vor der PDF-Erzeugung in 100 % der Testfälle erkannt.

## Assumptions

- Es gibt einen einzelnen Benutzer pro Installation, ohne Anmeldung und Rollenverwaltung.
- Es gibt einen globalen Absender (Rechnungssteller) pro Installation, der pro Rechnung überschrieben werden kann; mehrere gespeicherte Absenderprofile sind nicht Teil dieser Version.
- Währung ist immer CHF, Sprache ausschliesslich Deutsch (gemäss Constitution).
- Ausgestellt bedeutet: Das PDF wurde erzeugt. Danach ist der Inhalt unveränderlich, nur der Status (z. B. bezahlt) darf geändert werden.
- MwSt wird nicht ausgewiesen, Beträge sind Endbeträge (bestätigt).
- Rechnungen ohne Betrag (offener Betrag im Zahlteil) und ohne Schuldner sind nicht Teil dieser Version.
- Einheiten, Rabatte und Positionen mit negativen Beträgen sind nicht Teil dieser Version.
- Mahnwesen, E-Mail-Versand, Import/Export, Mehrbenutzerbetrieb und Buchhaltungsanbindung sind ausser Scope.
- Es gilt die jeweils aktuelle Version der SIX Swiss Implementation Guidelines für QR-Rechnungen.
- Ein Logo im Rechnungskopf ist wünschenswert, aber kein Muss der ersten Version.
