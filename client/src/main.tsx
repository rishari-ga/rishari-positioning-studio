import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './App';
import './styles.css';

type Cfg = { authMode: 'clerk' | 'dev'; clerkPublishableKey: string };

async function boot() {
  const cfg: Cfg = await fetch('/api/config').then((r) => r.json());
  const tree = (
    <BrowserRouter>
      <App authMode={cfg.authMode} />
    </BrowserRouter>
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
