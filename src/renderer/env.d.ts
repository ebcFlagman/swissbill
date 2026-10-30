/// <reference types="vite/client" />
import type { SwissbillApi } from '../shared/ipc/api';

declare global {
  interface ImportMetaEnv {
    /** PrimeUI-Lizenzschlüssel (Community License), aus `.env.local` – wird nie committet. */
    readonly VITE_PRIMEUI_LICENSE?: string;
  }

  interface Window {
    swissbill: SwissbillApi;
  }
}
