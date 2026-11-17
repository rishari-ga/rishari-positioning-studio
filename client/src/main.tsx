import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import './styles.css';
import { App } from './App';
import { installMockApi } from './demo/mockApi';

// Rishari brand for Clerk's sign-in and account screens: black, white, cyan accent, Inter, 4px and 8px corners.
const clerkAppearance = {
  variables: {
    colorPrimary: '#000000', colorPrimaryForeground: '#ffffff', colorForeground: '#000000', colorMutedForeground: '#555555',
    colorBackground: '#ffffff', colorInput: '#ffffff', colorInputForeground: '#000000', colorBorder: '#e2e4e6',
    colorNeutral: '#000000', colorRing: '#00ccff', colorDanger: '#b3261e',
    fontFamily: 'Inter, system-ui, sans-serif', fontFamilyButtons: 'Inter, system-ui, sans-serif', fontSize: '15px', borderRadius: '4px',
  },
  elements: {
    card: { borderRadius: '8px', boxShadow: 'none', border: '1px solid #e2e4e6' },
    cardBox: { borderRadius: '8px', boxShadow: 'none' },
    footer: { background: '#f4f5f6' },
    formButtonPrimary: { fontWeight: 600, letterSpacing: '0.01em', textTransform: 'none', boxShadow: 'none' },
    footerActionLink: { color: '#0077a3', fontWeight: 600 },
    headerTitle: { fontWeight: 700, letterSpacing: '-0.01em' },
  },
};

type Cfg = { authMode: 'clerk' | 'dev'; clerkPublishableKey: string };
const DEMO = import.meta.env.VITE_DEMO === 'true';

async function boot() {
  if (DEMO) installMockApi();
  const cfg: Cfg = await fetch('/api/config').then((r) => r.json());
  const Router = DEMO ? MemoryRouter : BrowserRouter;
  const tree = (
    <Router>
      <App authMode={cfg.authMode} />
    </Router>
  );
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {cfg.authMode === 'clerk'
        ? <ClerkProvider publishableKey={cfg.clerkPublishableKey} afterSignOutUrl="/" appearance={clerkAppearance}>{tree}</ClerkProvider>
        : tree}
    </React.StrictMode>,
  );
}
boot();
