import { Check } from '@primeicons/react/check';
import { ExclamationTriangle } from '@primeicons/react/exclamation-triangle';
import { InfoCircle } from '@primeicons/react/info-circle';
import { Times } from '@primeicons/react/times';
import { Toast } from '@primereact/ui/toast';
import { Toaster, type ToasterRegionInstance, type ToastType } from '@primereact/ui/toaster';
import { TOAST_GROUP } from '../lib/notify';

/** Globale Meldungen (Fehler und Erfolg), gesteuert über `notifyError` / `notifySuccess`. */
export function AppToaster() {
  return (
    <Toaster.Root group={TOAST_GROUP}>
      <Toaster.Portal>
        <Toaster.Region>
          {({ toaster }: ToasterRegionInstance) =>
            toaster?.toasts.map((item: ToastType) => (
              <Toast.Root key={item.id} toast={item}>
                <Toast.Content>
                  <Toast.Icon match="success">
                    <Check />
                  </Toast.Icon>
                  <Toast.Icon match="error">
                    <Times />
                  </Toast.Icon>
                  <Toast.Icon match="warn">
                    <ExclamationTriangle />
                  </Toast.Icon>
                  <Toast.Icon match="info">
                    <InfoCircle />
                  </Toast.Icon>
                  <Toast.Message>
                    <Toast.Title />
                    <Toast.Description />
                  </Toast.Message>
                  <Toast.Close>
                    <Times />
                  </Toast.Close>
                </Toast.Content>
              </Toast.Root>
            ))
          }
        </Toaster.Region>
      </Toaster.Portal>
    </Toaster.Root>
  );
}
