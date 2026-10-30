import { toast } from '@primereact/ui/toaster';
import type { AppError } from '../../shared/ipc/errors';

export const TOAST_GROUP = 'app';

export function notifyError(error: AppError): void {
  toast({ title: 'Fehler', description: error.message, group: TOAST_GROUP, severity: 'error' });
}

export function notifySuccess(message: string): void {
  toast({ title: 'Erledigt', description: message, group: TOAST_GROUP, severity: 'success' });
}
