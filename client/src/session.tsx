import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import type { User } from './api';

type Session = {
  loading: boolean;
  user: User | null;
  projects: { id: string; name: string; company_name: string | null; status: string }[];
  refresh: () => Promise<void>;
  authMode: 'clerk' | 'dev';
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ authMode, signedInKey, children }: { authMode: 'clerk' | 'dev'; signedInKey: string; children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; user: User | null; projects: Session['projects'] }>({ loading: true, user: null, projects: [] });
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User | null; projects?: Session['projects'] }>('/api/me');
      setState({ loading: false, user: r.user, projects: r.projects ?? [] });
    } catch {
      setState({ loading: false, user: null, projects: [] });
    }
  }, []);
  // signedInKey changes when Clerk's sign-in state changes, so the session reloads.
  useEffect(() => { refresh(); }, [refresh, signedInKey]);
  return <Ctx.Provider value={{ ...state, refresh, authMode }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}
