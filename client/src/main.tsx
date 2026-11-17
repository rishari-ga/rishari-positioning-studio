import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import './styles.css';
import { App } from './App';
import { installMockApi } from './demo/mockApi';

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
        ? <ClerkProvider publishableKey={cfg.clerkPublishableKey} afterSignOutUrl="/">{tree}</ClerkProvider>
        : tree}
    </React.StrictMode>,
  );
}
boot();
