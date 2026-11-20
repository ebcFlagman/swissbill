/// <reference types="vite/client" />
import type { SwissbillApi } from '@shared/ipc/api';

declare global {
  interface ImportMetaEnv {
    /** PrimeUI license key (Community License), from `.env.local` – never committed. */
    readonly VITE_PRIMEUI_LICENSE?: string;
  }

  interface Window {
    swissbill: SwissbillApi;
  }
}
