import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

// Self-hosted fonts (bundled by Vite, with Vietnamese subsets) — no request ever goes to Google.
// Notebook theme: Be Vietnam Pro + Playpen Sans (handwriting). Darkroom: Bricolage Grotesque + IBM Plex Mono.
// The browser only downloads the files of the fonts the current theme actually uses.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/400-italic.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import '@fontsource-variable/playpen-sans/index.css';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/notebook.css';
import './styles/darkroom.css';

import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { SketchFilter } from './components/Icon.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { I18nProvider } from './i18n/index.jsx';
import { ThemeProvider } from './theme.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <AuthProvider>
              <SketchFilter />
              <App />
            </AuthProvider>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
