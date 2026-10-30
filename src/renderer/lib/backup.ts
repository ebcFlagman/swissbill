import { notifyError, notifySuccess } from './notify';

/** Sichert die Datenbank über den Speichern-Dialog im Main (Menü und Einstellungen). */
export async function backupDatabase(): Promise<void> {
  const result = await window.swissbill.db.backup();
  if (!result.ok) notifyError(result.error);
  else if ('path' in result.value) notifySuccess(`Datenbank gesichert: ${result.value.path}`);
}
