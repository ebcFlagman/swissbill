import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyError } from '../lib/notify';
import { InvoiceEditor } from './InvoiceEditor';
import { InvoiceList } from './InvoiceList';

interface InvoicesProps {
  /** The menu chose "New invoice" */
  pendingNew: boolean;
  onPendingHandled: () => void;
}

/** Invoices: list and editor. */
export function Invoices({ pendingNew, onPendingHandled }: InvoicesProps) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const back = useCallback(() => setOpenId(null), []);
  const started = useRef(false);

  const createInvoice = useCallback(async () => {
    setCreating(true);
    try {
      const result = await window.swissbill.invoices.createDraft();
      if (result.ok) setOpenId(result.value.id);
      else notifyError(result.error);
    } finally {
      setCreating(false);
    }
  }, []);

  // "New invoice" from the menu: create exactly one draft (also in Strict Mode)
  useEffect(() => {
    if (!pendingNew) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    onPendingHandled();
    void createInvoice();
  }, [pendingNew, onPendingHandled, createInvoice]);

  if (openId !== null) {
    return (
      <InvoiceEditor key={openId} invoiceId={openId} onBack={back} onOpenInvoice={setOpenId} />
    );
  }

  return (
    <InvoiceList onOpen={setOpenId} onCreate={() => void createInvoice()} creating={creating} />
  );
}
