# Vertrag: CredentialStore (Main-Prozess)

Ablage des Datenbankpassworts im Schlüsselbund des Betriebssystems. Importiert nichts aus `electron`, damit er in Tests ersetzbar bleibt (wie `SecretStore`).

```ts
interface CredentialStore {
  /** Funktioniert ein Schlüsselbund auf diesem Gerät? (Probeeintrag schreiben, lesen, löschen) */
  isAvailable(): Promise<boolean>;
  /** Passwort oder null, wenn kein Eintrag existiert oder er nicht lesbar ist. */
  get(): Promise<string | null>;
  /** Wirft `KEYCHAIN_UNAVAILABLE`, wenn kein Schlüsselbund verfügbar ist; schreibt nie anderswohin. */
  set(password: string): Promise<void>;
  /** Idempotent: kein Eintrag ist kein Fehler. */
  delete(): Promise<void>;
}
```

- Produktion: `keyring-credential-store.ts` (`@napi-rs/keyring`, Dienst `swissbill`, Konto `db-connection`).
- Tests: Speicher-Ersatz, nur wenn `!app.isPackaged` und `SWISSBILL_CREDENTIAL_STORE=memory`.
- **Verbote**: kein Schreiben in Datei, Datenbank, Log oder Umgebungsvariable; `get()` wird nur in `connect.ts` aufgerufen.
- **Akzeptanztests**: nach `set` ist das Passwort in keiner Datei unter `userData` auffindbar (SC-004); ohne Verfügbarkeit lehnt `set` ab und es existiert keine Ersatzdatei; fehlender Eintrag beim Start → Aufforderung zur Neueingabe statt leerem Passwort (Story 2, Szenario 3).
