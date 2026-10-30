import { useEffect, useState } from 'react';
import { Button } from '@primereact/ui/button';
import { Dialog } from '@primereact/ui/dialog';
import { notifyError } from '../lib/notify';

interface PdfPreviewDialogProps {
  invoiceId: number;
  open: boolean;
  onClose: () => void;
}

function base64ToBlobUrl(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

/** PDF-Vorschau (Entwürfe mit Wasserzeichen, ohne Zahlteil; ausgestellte Rechnungen wie das Endergebnis). */
export function PdfPreviewDialog({ invoiceId, open, onClose }: PdfPreviewDialogProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void window.swissbill.pdf.preview({ invoiceId }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        notifyError(result.error);
        onClose();
        return;
      }
      objectUrl = base64ToBlobUrl(result.value.base64);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [open, invoiceId, onClose]);

  return (
    <Dialog.Root open={open} onOpenChange={(event: { value?: boolean | undefined }) => !event.value && onClose()}>
      <Dialog.Portal>
        <Dialog.Positioner>
          <Dialog.Popup style={{ width: 'min(900px, 92vw)' }}>
            <Dialog.Header>
              <Dialog.Title>Vorschau</Dialog.Title>
              <Dialog.HeaderActions>
                <Dialog.Close as={Button} variant="text" severity="secondary">
                  Schliessen
                </Dialog.Close>
              </Dialog.HeaderActions>
            </Dialog.Header>
            <Dialog.Content>
              {url ? (
                <iframe title="PDF-Vorschau" src={url} className="pdf-frame" />
              ) : (
                <p>PDF wird erzeugt …</p>
              )}
            </Dialog.Content>
          </Dialog.Popup>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
