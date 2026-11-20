import { notifyError, notifySuccess } from './notify';

/** Backs up the database via the save dialog in main (menu and settings). */
export async function backupDatabase(): Promise<void> {
  const result = await window.swissbill.db.backup();
  if (!result.ok) notifyError(result.error);
  else if ('path' in result.value) notifySuccess(`Datenbank gesichert: ${result.value.path}`);
}
