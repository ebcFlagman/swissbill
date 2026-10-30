import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrimeReactProvider } from '@primereact/core';
import Aura from '@primeuix/themes/aura';
import { de } from 'primelocale/js/de.js';
import { App } from './App';

// PrimeReact 11 verlangt einen Lizenzschlüssel (Community License). Er steht in `.env.local`
// (VITE_PRIMEUI_LICENSE) und wird nicht committet; die Prüfung läuft offline.
const license = import.meta.env.VITE_PRIMEUI_LICENSE;

// `primelocale` kennt die Einträge `toggleSidebar` und `filter` noch nicht, PrimeReact 11 verlangt sie.
const deLocale = {
  ...de,
  aria: { ...de.aria, toggleSidebar: 'Seitenleiste umschalten', filter: 'Filter' },
};

const theme = {
  preset: Aura,
  options: { darkModeSelector: 'system', cssLayer: false },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrimeReactProvider theme={theme} locale="de" locales={{ de: deLocale }} license={license}>
      <App />
    </PrimeReactProvider>
  </StrictMode>,
);
