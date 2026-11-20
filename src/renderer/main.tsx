import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from '@primereact/core';
import Aura from '@primeuix/themes/aura';
import { de } from 'primelocale/js/de.js';
import { App } from './App';
import { installErrorReporting } from './lib/report-errors';

// PrimeReact 11 requires a license key (Community License). It is in `.env.local`
// (VITE_PRIMEUI_LICENSE) and is not committed; the check runs offline.
const license = import.meta.env.VITE_PRIMEUI_LICENSE;

// `primelocale` does not know the entries `toggleSidebar` and `filter` yet, PrimeReact 11 requires them.
const deLocale = {
  ...de,
  aria: { ...de.aria, toggleSidebar: 'Seitenleiste umschalten', filter: 'Filter' },
};

const theme = {
  preset: Aura,
  options: { darkModeSelector: 'system', cssLayer: false },
};

// Unexpected errors of the interface end up in the log file (written by the main process)
installErrorReporting(window, window.swissbill.log);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrimeReactProvider theme={theme} locale="de" locales={{ de: deLocale }} license={license}>
      <App />
    </PrimeReactProvider>
  </StrictMode>,
);
