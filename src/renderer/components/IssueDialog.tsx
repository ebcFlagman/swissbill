import { Button } from '@primereact/ui/button';
import { Dialog } from '@primereact/ui/dialog';
import { formatChf } from '../../shared/domain/money';

interface ConfirmIssueDialogProps {
  open: boolean;
  totalRappen: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Bestätigung vor dem Ausstellen: danach ist die Rechnung unveränderlich. */
export function ConfirmIssueDialog({ open, totalRappen, busy, onConfirm, onCancel }: ConfirmIssueDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(event: { value?: boolean | undefined }) => !event.value && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Positioner>
          <Dialog.Popup style={{ width: '30rem' }}>
            <Dialog.Header>
              <Dialog.Title>Rechnung ausstellen?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content>
              <p>
                Beim Ausstellen erhält die Rechnung ihre Nummer und die Zahlungsreferenz (Total CHF{' '}
                {formatChf(totalRappen)}). <strong>Danach ist die Rechnung unveränderlich.</strong> Korrekturen sind nur über
                Duplizieren oder Stornieren möglich.
              </p>
              <div className="dialog-actions">
                <Button severity="secondary" variant="outlined" onClick={onCancel} disabled={busy}>
                  Abbrechen
                </Button>
                <Button onClick={onConfirm} disabled={busy}>
                  Ausstellen
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Popup>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface IssuedDialogProps {
  open: boolean;
  number: string;
  onSave: () => void;
  onOpen: () => void;
  onClose: () => void;
}

/** Nach dem Ausstellen: Nummer anzeigen und PDF speichern oder öffnen. */
export function IssuedDialog({ open, number, onSave, onOpen, onClose }: IssuedDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(event: { value?: boolean | undefined }) => !event.value && onClose()}>
      <Dialog.Portal>
        <Dialog.Positioner>
          <Dialog.Popup style={{ width: '30rem' }}>
            <Dialog.Header>
              <Dialog.Title>Rechnung ausgestellt</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content>
              <p>
                Die Rechnung hat die Nummer <strong data-testid="issued-number">{number}</strong>.
              </p>
              <div className="dialog-actions">
                <Button severity="secondary" variant="outlined" onClick={onClose}>
                  Schliessen
                </Button>
                <Button severity="secondary" onClick={onOpen}>
                  PDF öffnen / drucken
                </Button>
                <Button onClick={onSave}>PDF speichern</Button>
              </div>
            </Dialog.Content>
          </Dialog.Popup>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
