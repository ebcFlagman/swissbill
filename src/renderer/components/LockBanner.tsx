import { Button } from '@primereact/ui/button';
import { Message } from '@primereact/ui/message';
import type { LockSnapshot } from '../lib/use-edit-lock';

interface LockBannerProps extends LockSnapshot {
  onRetry: () => void;
}

/**
 * Tells the user why a record is read-only on a server database: another device edits it, or this device's
 * lock was lost. Nothing is shown while the record is editable.
 */
export function LockBanner({ status, ownerLabel, onRetry }: LockBannerProps) {
  if (status !== 'readonly' && status !== 'lost') return null;
  const text =
    status === 'lost'
      ? 'Die Bearbeitung ist nicht mehr gesperrt (die Sperre ist abgelaufen oder ein anderes Gerät hat den Datensatz übernommen). Weitere Änderungen können nicht gespeichert werden. Bitte neu laden.'
      : ownerLabel
        ? `Dieser Datensatz wird gerade von «${ownerLabel}» bearbeitet. Sie sehen ihn nur zur Ansicht.`
        : 'Dieser Datensatz konnte nicht gesperrt werden (keine Verbindung zum Datenbankserver?). Sie sehen ihn nur zur Ansicht.';
  return (
    <Message.Root severity="warn" role="status" data-testid="lock-banner">
      <Message.Content>
        <Message.Text>{text}</Message.Text>
        <div className="actions">
          <Button variant="outlined" onClick={onRetry}>
            {status === 'lost' ? 'Neu laden' : 'Erneut versuchen'}
          </Button>
        </div>
      </Message.Content>
    </Message.Root>
  );
}
