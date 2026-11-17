import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { UserButton } from '@clerk/react';
import { api } from '../api';
import { useSession } from '../session';
import wordmarkWhite from '../assets/wordmark-white@2x.png';

// Minimal line icons, drawn to match the Creative Studio rail.
const PATHS: Record<string, string> = {
  projects: 'M3 6.5h6l1.5 2H21v10.5H3z',
  shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z',
  book: 'M4 5h6.5c1 0 1.5.6 1.5 1.5V20c0-.9-.5-1.5-1.5-1.5H4zM20 5h-6.5c-1 0-1.5.6-1.5 1.5V20c0-.9.5-1.5 1.5-1.5H20z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  note: 'M5 4h10l4 4v12H5zM15 4v4h4M8 13h8M8 17h5',
  brief: 'M4 7h16v13H4zM9 7V5h6v2M4 12h16',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.5 2.5L16 9.5',
  spark: 'M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  menu: 'M4 7h16M4 12h16M4 17h16',
};
export function Icon({ name }: { name: string }) {
  return <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[name]} /></svg>;
}

// Project views, grouped in the order the work happens.
export const PROJECT_NAV: [string, [string, string, string][]][] = [
  ['Discovery', [['', 'Overview', 'grid'], ['answers', 'Answers', 'list'], ['connections', 'Connections', 'link'], ['narrative', 'Coverage', 'target']]],
  ['Review', [['flags', 'Flags', 'flag'], ['notes', 'Notes', 'note'], ['briefing', 'Briefing', 'brief']]],
  ['Strategy', [['approval', 'Source approval', 'check'], ['strategy', 'Strategy', 'spark']]],
  ['Setup', [['offers', 'Offers and scope', 'tag'], ['activity', 'Activity', 'clock']]],
];
const WORKSPACE: [string, string, string][] = [['/admin', 'Projects', 'projects'], ['/admin/data-use', 'Data-use page', 'shield'], ['/admin/guidance', 'Guidance library', 'book']];
const two = (n: number) => String(n).padStart(2, '0');

// The Rishari team's workspace: black rail on the left, work on the right.
export function AdminShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, authMode, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const pid = loc.pathname.match(/^\/admin\/p\/([0-9a-f-]{36})/)?.[1] ?? null;
  const [project, setProject] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => {
    if (!pid) { setProject(null); return; }
    if (project?.id === pid) return;
    api<{ project: { name: string; company_name: string | null } }>(`/api/admin/projects/${pid}`)
      .then((o) => setProject({ id: pid, label: o.project.company_name || o.project.name })).catch(() => setProject(null));
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open]);

  let n = 0;
  const section = pid ? (loc.pathname.split('/')[4] ?? '') : null;
  const crumbs: [string, string | null][] = [['Workspace', '/admin']];
  if (pid) {
    crumbs.push([project?.label ?? 'Project', `/admin/p/${pid}`]);
    const item = PROJECT_NAV.flatMap(([, items]) => items).find(([p]) => p === section);
    if (item && section) crumbs.push([item[1], null]);
  } else {
    crumbs.push([WORKSPACE.find(([p]) => p === loc.pathname)?.[1] ?? 'Projects', null]);
  }

  const rail = (
    <>
      <Link to="/admin" className="rail-brand" aria-label="Rishari Positioning Studio, all projects">
        <img src={wordmarkWhite} alt="" width={150} height={26} />
        <span className="rail-sub">Positioning studio</span>
      </Link>
      <nav className="rail-nav" aria-label="Workspace">
        <p className="rail-label">Workspace</p>
        {WORKSPACE.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => (isActive || (to === '/admin' && !!pid) ? 'active' : '')}>
            <Icon name={icon} /><span>{label}</span><span className="rail-num">{two(++n)}</span>
          </NavLink>
        ))}
        {pid && (
          <>
            <div className="rail-rule" />
            <p className="rail-label">This project</p>
            <p className="rail-project" title={project?.label}>{project?.label ?? 'Loading...'}</p>
            {PROJECT_NAV.map(([group, items]) => (
              <div key={group} className="rail-group">
                <p className="rail-group-label">{group}</p>
                {items.map(([path, label, icon]) => (
                  <NavLink key={path} end={path === ''} to={path ? `/admin/p/${pid}/${path}` : `/admin/p/${pid}`} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <Icon name={icon} /><span>{label}</span><span className="rail-num">{two(++n)}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </>
        )}
      </nav>
      <div className="rail-foot">
        <p className="rail-note"><Icon name="lock" /><span>Built for the Rishari team. Clients never see this side.</span></p>
        <div className="rail-account">
          {authMode === 'clerk' ? <UserButton /> : <span className="rail-avatar" aria-hidden="true">{(user?.email ?? 'R')[0].toUpperCase()}</span>}
          <span className="rail-who"><strong>{user?.displayName || 'Rishari team'}</strong><span>{user?.email}</span></span>
          {authMode === 'dev' && import.meta.env.VITE_DEMO !== 'true' && (
            <button type="button" className="rail-signout" onClick={async () => { await api('/api/dev/logout', { method: 'POST' }); await refresh(); nav('/'); }}>Sign out</button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="admin-frame">
      <aside className="rail" aria-label="Rishari workspace">{rail}</aside>
      <div className="mobile-bar">
        <Link to="/admin" aria-label="All projects"><img src={wordmarkWhite} alt="Rishari" width={110} height={19} /></Link>
        <button type="button" className="mobile-menu" aria-expanded={open} aria-controls="rail-drawer" onClick={() => setOpen(true)}><Icon name="menu" />Menu</button>
      </div>
      {open && (
        <div className="drawer-wrap" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="rail rail-drawer" id="rail-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" className="rail-close" onClick={() => setOpen(false)}>Close</button>
            {rail}
          </div>
        </div>
      )}
      <div className="admin-main">
        <div className="crumbbar">
          <nav aria-label="Breadcrumb"><ol>
            {crumbs.map(([label, to], i) => <li key={i}>{to && i < crumbs.length - 1 ? <Link to={to}>{label}</Link> : <span aria-current="page">{label}</span>}</li>)}
          </ol></nav>
          <span className="crumb-tag">Internal use</span>
        </div>
        {children}
      </div>
    </div>
  );
}
