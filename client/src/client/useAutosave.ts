import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';

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

  const flush = useCallback(async (attempt = 0): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current || !pending.current) return;
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
      onSaved(r.revision, d);
    } catch (e) {
      const err = e as ApiError;
      const retryable = !(err instanceof ApiError) || err.status >= 500 || err.status === 429;
      if (retryable && attempt < 2) {
        inFlight.current = false;
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        return flush(attempt + 1);
      }
      setStatus('failed'); setError(err.message);
    } finally {
      inFlight.current = false;
    }
    if (pending.current) void flush();
  }, [projectId, questionKey, offerId, personaId, onSaved]);

  const setDraft = useCallback((d: Draft, immediate = false) => {
    setDraftState(d);
    pending.current = d;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), immediate ? 0 : 900);
  }, [flush]);

  // Save anything outstanding when the question leaves the screen.
  useEffect(() => () => { if (pending.current) void flush(); }, [flush]);

  return { draft, setDraft, status, error, flush: () => flush(), retry: () => flush() };
}
