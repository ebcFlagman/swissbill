# Feature Specification: Adresseingabe mit Vorschlägen (Geoapify)

**Feature Branch**: `004-geoapify-address-autocomplete`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Ich möchte die Adresseingabe vereinfachen mit dem Einsatz von Geoapify. Der API-Key soll als Einstellung gespeichert werden können. Falls keiner vorhanden ist, soll die bisherige Lösung als Fallback genommen werden."

## Clarifications

### Session 2026-11-12

- Q: Soll der API-Key verschlüsselt gespeichert werden? → A: Ja, verschlüsselt mit der Verschlüsselung des Betriebssystems; der verschlüsselte Wert liegt in den Einstellungen der Datenbank.
- Q: Was passiert, wenn auf dem Gerät keine Verschlüsselung verfügbar ist? → A: Der Key wird nicht gespeichert, die Einstellungen zeigen den Hinweis «Verschlüsselung auf diesem Gerät nicht verfügbar», und die Vorschläge bleiben aus (manuelle Eingabe wie bisher).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adresse per Vorschlag übernehmen (Priority: P1)

Wer eine Adresse erfasst (Absender, Rechnungsempfänger oder Kunde), tippt Strasse und Hausnummer (gegebenenfalls mit Ort) in das Strassenfeld der Adresseingabe und erhält während des Tippens passende Adressvorschläge. Wählt die Person einen Vorschlag, werden Strasse, Nr., PLZ, Ort und Land in einem Schritt korrekt ausgefüllt. Der Name bleibt unverändert, und alle Felder bleiben danach von Hand änderbar.

**Why this priority**: Das ist der eigentliche Nutzen der Funktion: weniger Tippen, weniger Tippfehler in Adressen, die später im QR-Zahlteil stehen.

**Independent Test**: Einen gültigen Geoapify-Schlüssel hinterlegen, in einem Adressformular «Bahnhofstr 1 Zür» eintippen, einen Vorschlag wählen und prüfen, dass Strasse, Nr., PLZ, Ort und Land gefüllt sind.

**Acceptance Scenarios**:

1. **Given** ein gültiger API-Key ist gespeichert, **When** die Person im Adressformular mindestens drei Zeichen einer Adresse eintippt, **Then** erscheint nach kurzer Zeit eine Liste mit passenden Vorschlägen.
2. **Given** die Vorschlagsliste ist sichtbar, **When** die Person einen Vorschlag wählt, **Then** werden Strasse, Nr., PLZ, Ort und Land ausgefüllt und der Name bleibt unverändert.
3. **Given** ein Vorschlag wurde übernommen, **When** die Person ein Feld von Hand ändert, **Then** wird die Änderung übernommen, und es wird nichts automatisch zurückgesetzt.
4. **Given** die Vorschlagsliste ist sichtbar, **When** die Person mit Tastatur navigiert (Pfeiltasten, Enter, Escape), **Then** lässt sich ein Vorschlag wählen oder die Liste schliessen, ohne die Maus zu benutzen.
5. **Given** die Person tippt eine Adresse, die kein Vorschlag trifft, **When** sie weiter von Hand ausfüllt, **Then** kann sie das Formular wie bisher vollständig manuell ausfüllen.

---

### User Story 2 - API-Key in den Einstellungen hinterlegen (Priority: P1)

In den Einstellungen kann die Person einen Geoapify-API-Key eingeben, speichern, ändern und entfernen. Das Feld erklärt kurz, wofür der Schlüssel dient und dass bei fehlendem Schlüssel die Adressen weiterhin von Hand erfasst werden. Der Schlüssel bleibt zwischen Programmstarts erhalten.

**Why this priority**: Ohne Möglichkeit, den Schlüssel zu hinterlegen, ist Story 1 nicht nutzbar. Beide zusammen bilden das Minimum.

**Independent Test**: In den Einstellungen einen Schlüssel eingeben und speichern, die Anwendung neu starten und prüfen, dass der Schlüssel noch gesetzt ist und die Vorschläge funktionieren. Danach den Schlüssel entfernen und prüfen, dass die Vorschläge verschwinden.

**Acceptance Scenarios**:

1. **Given** die Einstellungen sind geöffnet, **When** die Person einen API-Key einträgt und speichert, **Then** ist er nach einem Neustart weiterhin hinterlegt.
2. **Given** ein Schlüssel ist gespeichert, **When** die Person das Feld leert und speichert, **Then** gilt die Funktion als nicht eingerichtet, und die Adresseingabe verhält sich wie bisher.
3. **Given** ein Schlüssel ist gespeichert, **When** die Datenbankdatei oder eine Sicherung untersucht wird, **Then** ist der Schlüssel dort nicht im Klartext zu finden; er ist auch nicht in Vorschau, Export oder Protokollen sichtbar, und nach dem Speichern zeigen die Einstellungen nur «Key gespeichert» statt des Keys.
4. **Given** auf dem Gerät ist keine Verschlüsselung verfügbar, **When** die Person einen Schlüssel speichern will, **Then** wird er nicht gespeichert, und es erscheint der Hinweis «Verschlüsselung auf diesem Gerät nicht verfügbar».
5. **Given** die Person hat einen Schlüssel eingegeben, **When** sie ihn speichern will, **Then** kann sie optional prüfen lassen, ob der Schlüssel funktioniert, und erhält eine verständliche Rückmeldung (gültig, ungültig, Kontingent erschöpft, keine Verbindung oder Zeitüberschreitung).

---

### User Story 3 - Fallback auf die bisherige Eingabe (Priority: P1)

Ist kein API-Key hinterlegt, oder ist der Dienst nicht erreichbar (keine Internetverbindung, ungültiger Schlüssel, Kontingent erschöpft), funktioniert die Adresseingabe unverändert mit den bisherigen Einzelfeldern. Die Person wird dabei nie blockiert, und es erscheint keine störende Fehlermeldung beim normalen Tippen.

**Why this priority**: Die Anwendung ist laut Constitution offline-fähig; die Funktion darf nichts verschlechtern. Ohne zuverlässigen Fallback wäre Rechnungsstellung ohne Internet nicht mehr möglich.

**Independent Test**: Ohne gespeicherten Schlüssel ein Adressformular öffnen und prüfen, dass es identisch zu heute funktioniert und keine Netzwerkanfrage erfolgt. Dann mit Schlüssel und getrennter Verbindung tippen und prüfen, dass die Eingabe weiter funktioniert.

**Acceptance Scenarios**:

1. **Given** kein API-Key ist gespeichert, **When** die Person ein Adressformular nutzt, **Then** gibt es keine Vorschläge und keine Netzwerkanfragen, und alle Felder funktionieren wie bisher.
2. **Given** ein API-Key ist gespeichert, aber es besteht keine Internetverbindung, **When** die Person tippt, **Then** erscheinen keine Vorschläge, die Eingabe von Hand bleibt möglich, und höchstens ein dezenter Hinweis («Vorschläge momentan nicht verfügbar») wird gezeigt.
3. **Given** der Dienst lehnt den Schlüssel ab (ungültig oder Kontingent erschöpft), **When** die Person tippt, **Then** verhält sich die Eingabe wie ohne Schlüssel, und ein dezenter Hinweis nennt die Ursache.
4. **Given** der Dienst antwortet langsam, **When** die Person weitertippt oder den Vorschlag ignoriert, **Then** wird sie nicht aufgehalten und kann speichern bzw. die Rechnung ausstellen.

---

### Edge Cases

- Der Vorschlag enthält keine Hausnummer: Das Feld «Nr.» bleibt leer und kann von Hand ergänzt werden.
- Der Vorschlag liegt im Ausland: Das Land-Feld wird mit dem passenden Ländercode gefüllt. Die bestehende Validierung der Adressfelder (Constitution Prinzip I: nichts stillschweigend korrigieren) bleibt unverändert wirksam.
- Der Vorschlag enthält Felder, die länger sind als die zulässigen Feldlängen der Adresse: Es wird nichts abgeschnitten, sondern die bestehende Validierung meldet es beim Ausstellen.
- Die Person wählt einen Vorschlag, obwohl bereits Werte in PLZ, Ort oder Land stehen: Die Felder werden mit dem Vorschlag überschrieben, da die Person aktiv gewählt hat.
- Schnelles Tippen löst viele Anfragen aus: Nur das Ergebnis der jeweils letzten Eingabe wird angezeigt, und veraltete Antworten überschreiben keine neuere Liste.
- Das Adressformular ist gesperrt (z. B. bei bereits ausgestellter Rechnung): Es werden keine Vorschläge angeboten und keine Anfragen gesendet.
- Der API-Key enthält führende oder nachfolgende Leerzeichen (z. B. durch Einfügen): Diese werden vor dem Speichern entfernt.
- Die Person sichert die Datenbank oder exportiert Daten: Der API-Key gehört zu den Einstellungen, ist darin nur verschlüsselt enthalten und wird nicht in Rechnungs-PDFs oder QR-Daten übernommen.
- Der gespeicherte Key lässt sich nicht entschlüsseln (andere Maschine oder anderer Benutzer nach Wiederherstellung einer Sicherung): Die Funktion gilt als nicht eingerichtet, die Adresseingabe läuft wie bisher, und die Einstellungen weisen darauf hin, dass der Key neu eingegeben werden muss.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Das System MUSS in allen Adressformularen (Absender in den Einstellungen, Rechnungsempfänger in der Rechnung, Kunde) bei hinterlegtem API-Key Adressvorschläge im Strassenfeld anbieten, sobald die Person mindestens drei Zeichen eingegeben hat und 0,3 Sekunden nicht weitergetippt hat. Es werden höchstens 5 Vorschläge angezeigt.
- **FR-002**: Das System MUSS beim Wählen eines Vorschlags Strasse, Hausnummer, PLZ, Ort und Land ausfüllen und den Namen sowie die IBAN unverändert lassen.
- **FR-003**: Alle Adressfelder MÜSSEN nach dem Übernehmen eines Vorschlags von Hand änderbar bleiben; die Person MUSS jede Adresse auch ohne Vorschläge vollständig manuell erfassen können.
- **FR-004**: Das System MUSS die Vorschläge vollständig per Tastatur bedienbar machen (Auswahl, Bestätigen, Schliessen).
- **FR-005**: Die Person MUSS in den Einstellungen einen Geoapify-API-Key eingeben, ändern und entfernen können.
- **FR-006**: Das System MUSS den API-Key dauerhaft und ausschliesslich verschlüsselt (mit der Verschlüsselung des Betriebssystems) zusammen mit den übrigen Einstellungen speichern, sodass er nach einem Neustart weiter gilt. Der Key DARF an keiner Stelle im Klartext gespeichert werden.
- **FR-006a**: Ist auf dem Gerät keine Verschlüsselung verfügbar, MUSS das System den Key nicht speichern, in den Einstellungen den Hinweis «Verschlüsselung auf diesem Gerät nicht verfügbar» zeigen und die Adresseingabe wie ohne Key belassen.
- **FR-007**: Das System MUSS führende und nachfolgende Leerzeichen des API-Keys vor dem Speichern entfernen.
- **FR-008**: Ohne gespeicherten API-Key MUSS sich die Adresseingabe exakt wie bisher verhalten, und das System DARF keine Netzwerkanfragen für Adressvorschläge senden.
- **FR-009**: Bei Fehlern des Dienstes (keine Verbindung, ungültiger Schlüssel, Kontingent erschöpft, Zeitüberschreitung) MUSS das System auf die bisherige manuelle Eingabe zurückfallen, die Eingabe nicht blockieren und höchstens einen dezenten Hinweis zeigen (einzeilige Meldung unter dem Strassenfeld in verständlichem Deutsch, kein Dialog, keine Unterbrechung der Eingabe). Eine einzelne Anfrage wird nach 5 Sekunden abgebrochen.
- **FR-010**: Das System MUSS die Person in den Einstellungen verständlich darauf hinweisen, dass die getippten Adressangaben zur Vorschlagssuche an einen externen Dienst (Geoapify) gesendet werden, und dass dies nur geschieht, wenn ein Schlüssel hinterlegt ist.
- **FR-011**: Das System MUSS an den externen Dienst nur den getippten Suchtext der Adresse senden, keine Rechnungsdaten, Beträge, IBAN, Namen oder anderen gespeicherten Daten.
- **FR-012**: Das System DARF den API-Key nicht in Rechnungs-PDFs, QR-Daten, Protokollausgaben oder Fehlermeldungen ausgeben. Nach dem Speichern DARF der Key nicht mehr angezeigt werden; die Einstellungen zeigen nur «Key gespeichert», und er wird nur durch Neueingabe ersetzt oder entfernt. Auch die übrigen Seiten (z. B. die Rechnungsmaske) erhalten den Key nicht.
- **FR-013**: Das System MUSS sicherstellen, dass nur die Antwort auf die jeweils letzte Eingabe angezeigt wird und höchstens eine Anfrage pro Tipppause von 0,3 Sekunden gesendet wird.
- **FR-014**: Das System SOLL optional eine Prüfung des eingegebenen Schlüssels anbieten, mit den Ergebnissen gültig, ungültig, Kontingent erschöpft, keine Verbindung oder Zeitüberschreitung.
- **FR-017**: Das System MUSS das Entfernen eines gespeicherten Keys immer erlauben, auch wenn der Key nicht entschlüsselbar ist oder auf dem Gerät keine Verschlüsselung verfügbar ist; nur das Setzen eines Keys setzt die Verschlüsselung voraus.
- **FR-015**: Die Vorschläge MÜSSEN die Schweiz bevorzugen, ohne Adressen anderer Länder auszuschliessen.
- **FR-016**: Das System MUSS bei gesperrten (nicht bearbeitbaren) Adressformularen keine Vorschläge anbieten.

### Key Entities *(include if feature involves data)*

- **Geoapify-API-Key**: Eine optionale Einstellung der Anwendung, nur verschlüsselt gespeichert. Ist sie leer oder nicht entschlüsselbar, ist die Funktion nicht eingerichtet. Gehört zu den Einstellungen des Programms, nicht zu einer Rechnung.
- **Adressvorschlag**: Ein vorübergehendes Suchergebnis mit Strasse, Hausnummer, PLZ, Ort und Land. Wird nicht gespeichert, sondern nur beim Wählen in die Adressfelder übernommen.
- **Adresse**: Die bestehende Adresse (Name, Strasse, Nr., PLZ, Ort, Land) mit unveränderter Bedeutung und Validierung.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Mit hinterlegtem Schlüssel kann eine vollständige Adresse (Strasse, Nr., PLZ, Ort, Land) in unter 10 Sekunden erfasst werden (manuelle Prüfung mit den Testadressen aus `quickstart.md`, Zeit vom Antippen des Strassenfelds bis zu den gefüllten Feldern).
- **SC-002**: Bei einer üblichen Schweizer Adresse sind nach Eingabe von höchstens 10 Zeichen passende Vorschläge sichtbar, und mindestens 90 % der 10 Testadressen aus `quickstart.md` werden unter den ersten 5 Vorschlägen gefunden (manuelle Prüfung mit echtem Key).
- **SC-003**: Ohne Schlüssel oder ohne Internetverbindung lässt sich eine Rechnung zu 100 % wie bisher erfassen und ausstellen; es treten keine Verzögerungen oder Fehlermeldungen beim Tippen auf.
- **SC-004**: Der Schlüssel ist nach einem Neustart weiterhin gesetzt, und das Entfernen schaltet die Vorschläge sofort ab.
- **SC-005**: Ohne hinterlegten Schlüssel werden bei normaler Nutzung null Netzwerkanfragen gesendet.
- **SC-006**: Eine übernommene Adresse besteht die bestehende Adressprüfung für den QR-Zahlteil bei mindestens 95 % der Testadressen (Fixture `tests/fixtures/geoapify-autocomplete.json` und die Testadressen aus `quickstart.md`) ohne manuelle Nachbesserung.

## Assumptions

- Die Funktion ist **optional und ausdrücklich eingeschaltet** durch das Hinterlegen eines eigenen API-Keys. Es gibt keinen mitgelieferten Standardschlüssel.
- Die Person beschafft den Geoapify-Schlüssel selbst (kostenloses Kontingent genügt für den typischen Einsatz). Registrierung und Abrechnung bei Geoapify liegen ausserhalb dieser Anwendung.
- **Governance**: Die Constitution (Prinzip II: lokal, offline, keine Cloud-Dienste «ohne Amendment») und die bestehende Netzwerksperre der Anwendung stehen einem externen Dienst entgegen. Da der Zugriff rein optional ist und die Anwendung ohne Schlüssel vollständig offline bleibt, beschreibt die Constitution seit Version 1.1.0 diese Opt-in-Ausnahme mit eng begrenztem Zugriff. Die Änderung ist mit dem ersten Commit dieser Funktion zu committen.
- **Datenschutz**: Mit Schlüssel verlassen getippte Adressfragmente das Gerät in Richtung Geoapify. Das ist durch den Hinweis in den Einstellungen (FR-010) transparent zu machen. Rechnungs- und Zahlungsdaten bleiben lokal (Prinzip II).
- Der API-Key wird verschlüsselt zusammen mit den übrigen Programmeinstellungen gespeichert. Der Schutz ist an den Benutzer und das Gerät gebunden. Nach dem Zurückspielen einer Datenbank-Sicherung auf einem anderen Gerät oder unter einem anderen Benutzer ist der Key nicht lesbar und muss neu eingegeben werden; die Einstellungen zeigen ihn dann als nicht hinterlegt.
- Die Benutzeroberfläche bleibt ausschliesslich Deutsch (Constitution).
- Nicht im Umfang: Kartenanzeige, Geokoordinaten, Adressprüfung bereits gespeicherter Rechnungen oder Kunden, automatische Nachbesserung bestehender Adressen, Unterstützung weiterer Anbieter.
- Das Ausfüllen eines Vorschlags ersetzt nicht die bestehende Validierung der Adresse für den QR-Zahlteil; diese bleibt unverändert.
