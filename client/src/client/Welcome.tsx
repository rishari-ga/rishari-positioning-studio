import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WELCOME, ACK } from '@shared/content';
import { api } from '../api';
import { useDiscovery } from './ProjectRoutes';

export function Welcome() {
  const { d, reload } = useDiscovery();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <main className="page" id="main">
      <p className="eyebrow">Discovery</p>
      <h1 className="display">{WELCOME.heading}</h1>
      {WELCOME.body.map((p, i) => <p key={i} className={i === 0 ? 'lede' : undefined}>{p}</p>)}

      <h2>Before you begin</h2>
      <ul className="squares">{WELCOME.beforeYouBegin.map((t) => <li key={t}>{t}</li>)}</ul>

      <h2>What happens next</h2>
      <ol className="rows">{WELCOME.whatHappensNext.map((t) => <li key={t}>{t}</li>)}</ol>

      <p className="small"><Link to="/data-use">How we use your information</Link> &middot; <Link to="/contact">Contact Rishari</Link></p>

      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        try { await api(`/api/projects/${d.project.id}/acknowledgment`, { method: 'POST', json: { version: ACK.version } }); await reload(); }
        catch (x) { setErr((x as Error).message); setBusy(false); }
      }}>
        <div className="field" style={{ background: 'var(--grey)', padding: '1.25rem', marginTop: '2rem' }}>
          <label className="choice" htmlFor="ack">
            <input id="ack" type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>{ACK.text}</span>
          </label>
        </div>
        {err && <p className="notice" role="alert">{err}</p>}
        <button type="submit" disabled={!checked || busy}>{WELCOME.button}</button>
      </form>
    </main>
  );
}
