import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SignIn, UserButton, useAuth } from '@clerk/react';
import { SessionProvider, useSession } from './session';
import { api } from './api';
import wordmark from './assets/wordmark-black@2x.png';
import { DemoBar } from './demo/DemoBar';
import { ProjectRoutes } from './client/ProjectRoutes';
import { AdminRoutes } from './admin/AdminRoutes';

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <p className="page muted">Loading...</p>;
  return <SessionProvider authMode="clerk" signedInKey={isSignedIn ? userId ?? 'in' : 'out'}>{children}</SessionProvider>;
}

export function App({ authMode }: { authMode: 'clerk' | 'dev' }) {
  const routes = (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      {import.meta.env.VITE_DEMO === 'true' && <DemoBar />}
      <TopBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/data-use" element={<DataUsePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/p/:pid/*" element={<RequireUser><ProjectRoutes /></RequireUser>} />
        <Route path="/admin/*" element={<RequireUser admin><AdminRoutes /></RequireUser>} />
        <Route path="*" element={<div className="page" id="main"><h1>Page not found</h1><Link to="/">Go to the start</Link></div>} />
      </Routes>
    </>
  );
  return authMode === 'clerk' ? <ClerkBridge>{routes}</ClerkBridge> : <SessionProvider authMode="dev" signedInKey="dev">{routes}</SessionProvider>;
}

function TopBar() {
  const { user, authMode, refresh } = useSession();
  const nav = useNavigate();
  return (
    <header className="topbar">
      <div className="topbar-inner">
      <Link to="/" className="wordmark"><img src={wordmark} alt="Rishari" width={129} height={22} /></Link>
      <nav aria-label="Account">
        {user?.isAdmin && <Link to="/admin">Projects</Link>}
        {user && authMode === 'clerk' && <UserButton />}
        {user && authMode === 'dev' && import.meta.env.VITE_DEMO !== 'true' && (
          <>
            <span className="small muted">{user.email} (dev sign-in)</span>
            <button className="quiet" onClick={async () => { await api('/api/dev/logout', { method: 'POST' }); await refresh(); nav('/'); }}>Sign out</button>
          </>
        )}
      </nav>
      </div>
    </header>
  );
}

function RequireUser({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const { loading, user } = useSession();
  const loc = useLocation();
  if (loading) return <p className="page muted">Loading...</p>;
  if (!user) return <Navigate to={`/sign-in?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (admin && !user.isAdmin) return <div className="page" id="main"><h1>Not available</h1><p>This area is for Rishari reviewers.</p></div>;
  return <>{children}</>;
}

function Home() {
  const { loading, user, projects } = useSession();
  if (loading) return <p className="page muted">Loading...</p>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.isAdmin) return <Navigate to="/admin" replace />;
  if (projects.length === 1) return <Navigate to={`/p/${projects[0].id}`} replace />;
  return (
    <main className="page" id="main">
      {projects.length === 0 ? (
        <>
          <h1>You're signed in.</h1>
          <p>There's no project linked to this account yet. If Rishari sent you an invitation link, open it while signed in with the same email address.</p>
          <p className="muted small">Signed in as {user.email}</p>
        </>
      ) : (
        <>
          <h1>Your projects</h1>
          <ul className="plain">{projects.map((p) => <li key={p.id}><Link to={`/p/${p.id}`}>{p.company_name || p.name}</Link></li>)}</ul>
        </>
      )}
    </main>
  );
}

function SignInPage() {
  const { authMode, user, refresh } = useSession();
  const loc = useLocation();
  const next = new URLSearchParams(loc.search).get('next') || '/';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();
  if (user) return <Navigate to={safeNext} replace />;
  if (authMode === 'clerk') {
    return <main className="page" id="main"><SignIn routing="path" path="/sign-in" forceRedirectUrl={safeNext} signUpForceRedirectUrl={safeNext} /></main>;
  }
  return (
    <main className="page" id="main">
      <h1>Sign in</h1>
      <p className="notice">Development sign-in. This screen only exists in local testing and is disabled in production.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setErr('');
        try { await api('/api/dev/login', { method: 'POST', json: { email } }); await refresh(); nav(safeNext); }
        catch (x) { setErr((x as Error).message); }
      }}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err} aria-describedby={err ? 'email-err' : undefined} />
          {err && <p id="email-err" className="small" style={{ color: 'var(--brand-warn)' }}>{err}</p>}
        </div>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}

function InvitePage() {
  const { token } = useParams();
  const { loading, user, refresh } = useSession();
  const [state, setState] = useState<{ error?: string }>({});
  const nav = useNavigate();
  useEffect(() => {
    if (loading || !user || !token) return;
    api<{ projectId: string }>('/api/invitations/accept', { method: 'POST', json: { token } })
      .then(async (r) => { await refresh(); nav(`/p/${r.projectId}`, { replace: true }); })
      .catch((e) => setState({ error: e.message }));
  }, [loading, user, token, refresh, nav]);
  if (loading) return <p className="page muted">Loading...</p>;
  if (!user) return <Navigate to={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`} replace />;
  return (
    <main className="page" id="main">
      <h1>Your invitation</h1>
      {state.error ? <><p className="notice">{state.error}</p><p className="small muted">Signed in as {user.email}</p></> : <p className="muted">Opening your project...</p>}
    </main>
  );
}

export function DataUsePage() {
  const [d, setD] = useState<{ value: { reviewed: boolean; sections: { heading: string; body: string }[] } } | null>(null);
  useEffect(() => { api<typeof d>('/api/data-use').then(setD); }, []);
  if (!d) return <p className="page muted">Loading...</p>;
  return (
    <main className="page" id="main">
      <h1>How we use your information</h1>
      {!d.value.reviewed && <p className="notice">This page has not been finalized by Rishari yet.</p>}
      {d.value.sections.map((s, i) => (
        <section key={i}><h2>{s.heading}</h2>{s.body.split(/\n{2,}/).map((p, j) => <p key={j}>{p}</p>)}</section>
      ))}
    </main>
  );
}

function ContactPage() {
  const [d, setD] = useState<{ value: { sections: { heading: string; body: string }[] } } | null>(null);
  useEffect(() => { api<typeof d>('/api/data-use').then(setD); }, []);
  const contact = d?.value.sections.find((s) => /contact/i.test(s.heading));
  return (
    <main className="page" id="main">
      <h1>Contact Rishari</h1>
      <p>{contact?.body ?? 'Contact details have not been added yet.'}</p>
    </main>
  );
}
