import { useSyncExternalStore } from 'react';

// Tracks every answer save across screens, so a save that fails after the client has moved on is never silent.
type Failure = { key: string; message: string; retry: () => Promise<void> };
const flushers = new Map<string, () => Promise<void>>();   // fields on screen with possibly unsaved typing
const inFlight = new Map<string, Promise<void>>();
const failures = new Map<string, Failure>();
const listeners = new Set<() => void>();
let snapshot = { saving: 0, failed: [] as Failure[] };
const emit = () => { snapshot = { saving: inFlight.size, failed: [...failures.values()] }; listeners.forEach((l) => l()); };

export const saveTracker = {
  register(key: string, flush: () => Promise<void>) { flushers.set(key, flush); return () => { if (flushers.get(key) === flush) flushers.delete(key); }; },
  track(key: string, p: Promise<void>) { inFlight.set(key, p); emit(); void p.finally(() => { if (inFlight.get(key) === p) inFlight.delete(key); emit(); }); },
  fail(key: string, message: string, retry: () => Promise<void>) { failures.set(key, { key, message, retry }); emit(); },
  ok(key: string) { if (failures.delete(key)) emit(); },
  // Save everything on screen and wait for every save in progress. Returns true when nothing is left unsaved.
  async settle(): Promise<boolean> {
    await Promise.all([...flushers.values()].map((f) => f().catch(() => undefined)));
    await Promise.all([...inFlight.values()].map((p) => p.catch(() => undefined)));
    return failures.size === 0;
  },
  async retryAll() { await Promise.all([...failures.values()].map((f) => f.retry().catch(() => undefined))); },
  get unsaved() { return inFlight.size > 0 || failures.size > 0; },
};

export function useSaveState() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot);
}

// Warn before closing the tab while anything is saving or failed to save.
window.addEventListener('beforeunload', (e) => { if (saveTracker.unsaved) { e.preventDefault(); e.returnValue = ''; } });
