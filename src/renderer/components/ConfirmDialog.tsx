import type { ReactNode } from 'react';
import { Button } from '@primereact/ui/button';
import { Dialog } from '@primereact/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Allgemeine Rückfrage vor einer nicht umkehrbaren Aktion. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(event: { value?: boolean | undefined }) => !event.value && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Positioner>
          <Dialog.Popup style={{ width: '30rem' }}>
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content>
              <div>{children}</div>
              <div className="dialog-actions">
                <Button severity="secondary" variant="outlined" onClick={onCancel} disabled={busy}>
                  Abbrechen
                </Button>
                <Button severity={danger ? 'danger' : undefined} onClick={onConfirm} disabled={busy}>
                  {confirmLabel}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Popup>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
