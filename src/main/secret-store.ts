/**
 * Ablage kleiner Geheimnisse (hier: der Geoapify-API-Key) in verschlüsselter Form.
 * Die Schnittstelle importiert bewusst nichts aus `electron`, damit sie in Tests ersetzbar bleibt;
 * die Umsetzung über das Betriebssystem steht in `electron-secret-store.ts`.
 * Alle Operationen sind asynchron, weil die nicht veralteten Electron-Funktionen es sind.
 */
export interface SecretStore {
  /** Ist auf diesem Gerät eine Verschlüsselung verfügbar? */
  isAvailable(): Promise<boolean>;
  encrypt(text: string): Promise<Buffer>;
  /** Klartext oder `null`, wenn sich der Wert nicht entschlüsseln lässt (anderes Gerät/Benutzer, beschädigt). */
  decrypt(data: Buffer): Promise<string | null>;
}
