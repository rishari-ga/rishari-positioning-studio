import { useNavigate } from 'react-router-dom';
import { useSession } from '../session';
import { demoRole, resetDemo, setDemoRole } from './mockApi';

// Shown only in the Claude-hosted preview. Lets a viewer switch between the client and reviewer sides.
export function DemoBar() {
  const { refresh } = useSession();
  const nav = useNavigate();
  const role = demoRole();
  const go = async (r: 'client' | 'admin') => { setDemoRole(r); await refresh(); nav(r === 'admin' ? '/admin' : '/', { replace: true }); };
  return (
    <div className="demo-bar" role="region" aria-label="Preview controls">
      <span><span className="label">Preview</span>&nbsp;&nbsp;Fictional data. Everything stays in this browser.</span>
      <span style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" aria-pressed={role === 'client'} onClick={() => go('client')}>Client view</button>
        <button type="button" aria-pressed={role === 'admin'} onClick={() => go('admin')}>Rishari view</button>
        <button type="button" onClick={async () => { resetDemo(); await go('client'); }}>Start over</button>
      </span>
    </div>
  );
}
