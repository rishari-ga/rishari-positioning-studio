import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { saveTracker } from './saveTracker';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';
export type Draft = { value: unknown; status: 'answered' | 'not_sure' | 'discuss' | 'empty' | 'not_applicable'; contextNote: string | null; evidenceStatus?: string | null; reusedFromKey?: string | null };

// Debounced autosave with retry and a visible failure state. Saves never call AI.
export function useAutosave(projectId: string, questionKey: string, offerId: string | null, personaId: string | null, initial: Draft, initialRevision: number, onSaved: (rev: number, d: Draft) => void) {
  const [draft, setDraftState] = useState<Draft>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');
  const rev = useRef(initialRevision);
  const pending = useRef<Draft | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const inFlightPromise = useRef<Promise<void>>(Promise.resolve());

  const key = `${questionKey}|${offerId ?? ''}|${personaId ?? ''}`;
  const flush = useCallback(async (attempt = 0): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!pending.current) return;
    if (inFlight.current) { await inFlightPromise.current; return flush(attempt); }
    let done!: () => void;
    inFlightPromise.current = new Promise<void>((r) => { done = r; });
    if (attempt === 0) saveTracker.track(key, inFlightPromise.current);
    const d = pending.current;
    inFlight.current = true;
    setStatus('saving');
    try {
      const qs = new URLSearchParams([...(offerId ? [['offerId', offerId]] : []), ...(personaId ? [['personaId', personaId]] : [])]).toString();
      const r = await api<{ revision: number }>(`/api/projects/${projectId}/answers/${questionKey}${qs ? `?${qs}` : ''}`, {
        method: 'PUT', json: { value: d.value, status: d.status, contextNote: d.contextNote, evidenceStatus: d.evidenceStatus ?? null, reusedFromKey: d.reusedFromKey ?? null, baseRevision: rev.current },
      });
      rev.current = r.revision;
      if (pending.current === d) pending.current = null;
      setStatus('saved'); setError('');
      saveTracker.ok(key);
      onSaved(r.revision, d);
    } catch (e) {
      const err = e as ApiError;
      const retryable = !(err instanceof ApiError) || err.status >= 500 || err.status === 429;
      if (retryable && attempt < 2) {
        inFlight.current = false;
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        try { return await flush(attempt + 1); } finally { done(); }
      }
      setStatus('failed'); setError(err.message);
      saveTracker.fail(key, err.message, () => flush());
    } finally {
      inFlight.current = false;
      done();
    }
    // Only go again for newer typing. A failed save waits for "Try again", Continue, or the next keystroke,
    // so one rejected answer can never loop and trip the server's rate limit for every other answer.
    if (pending.current && pending.current !== d) void flush();
  }, [projectId, questionKey, offerId, personaId, onSaved]);

  const setDraft = useCallback((d: Draft, immediate = false) => {
    setDraftState(d);
    pending.current = d;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), immediate ? 0 : 900);
  }, [flush]);

  // Continue waits on this; anything outstanding also saves when the question leaves the screen.
  useEffect(() => saveTracker.register(key, () => flush()), [key, flush]);
  useEffect(() => () => { if (pending.current) void flush(); }, [flush]);

  return { draft, setDraft, status, error, flush: () => flush(), retry: () => flush() };
}
