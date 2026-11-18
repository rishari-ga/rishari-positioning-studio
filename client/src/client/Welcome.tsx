import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WELCOME, ACK, DICTATION } from '@shared/content';
import { api } from '../api';
import { useDiscovery } from './ProjectRoutes';
import { Hero } from './Hero';

export function Welcome() {
  const { d, reload } = useDiscovery();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <>
    <Hero eyebrow="Positioning studio · Discovery" line1="Tell us what you know." line2="We'll find the true story your customers connect with." steps={WELCOME.whatHappensNext}>
      <p>{WELCOME.body[0]}</p>
    </Hero>
    <main className="page" id="main">
      <h2 className="intro-h">{WELCOME.heading}</h2>
      {WELCOME.body.slice(1).map((p, i) => <p key={i}>{p}</p>)}

      <h2>Before you begin</h2>
      <ul className="squares">{WELCOME.beforeYouBegin.map((t) => <li key={t}>{t}</li>)}</ul>

      <aside className="dictate-card" aria-labelledby="dictate-h">
        <span className="dictate-icon" aria-hidden="true" />
        <div>
          <h2 id="dictate-h">{DICTATION.heading}</h2>
          <p>{DICTATION.bodyBefore} <a href={DICTATION.url} target="_blank" rel="noopener noreferrer">{DICTATION.app}<span className="sr-only"> (opens in a new tab)</span></a> {DICTATION.bodyAfter}</p>
        </div>
      </aside>

      <p className="small"><Link to="/data-use">How we use your information</Link> &middot; <Link to="/contact">Contact Rishari</Link></p>

      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        try { await api(`/api/projects/${d.project.id}/acknowledgment`, { method: 'POST', json: { version: ACK.version } }); await reload(); }
        catch (x) { setErr((x as Error).message); setBusy(false); }
      }}>
        <div className="field" style={{ background: 'var(--grey)', padding: '1.25rem', marginTop: '2rem', borderRadius: 'var(--radius-md)' }}>
          <label className="choice" htmlFor="ack">
            <input id="ack" type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>{ACK.text}</span>
          </label>
        </div>
        {err && <p className="notice" role="alert">{err}</p>}
        <button type="submit" disabled={!checked || busy}>{WELCOME.button}</button>
      </form>
    </main>
    </>
  );
}
