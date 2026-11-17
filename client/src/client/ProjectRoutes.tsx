import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Discovery } from '../api';
import { useSession } from '../session';
import { Welcome } from './Welcome';
import { ModulePage } from './ModulePage';
import { ReviewPage, DonePage } from './ReviewPage';

type Ctx = { d: Discovery; reload: () => Promise<void>; patchAnswer: (questionId: string, revision: number, value: unknown, status: string, contextNote: string | null) => void };
const DiscoveryCtx = createContext<Ctx | null>(null);
export const useDiscovery = () => {
  const c = useContext(DiscoveryCtx);
  if (!c) throw new Error('DiscoveryCtx missing');
  return c;
};

export function ProjectRoutes() {
  const { pid } = useParams();
  const { user } = useSession();
  const [d, setD] = useState<Discovery | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try { setD(await api<Discovery>(`/api/projects/${pid}/discovery`)); }
    catch (e) { setError((e as Error).message); }
  }, [pid]);
  useEffect(() => { reload(); }, [reload]);

  const patchAnswer = useCallback((questionId: string, revision: number, value: unknown, status: string, contextNote: string | null) => {
    setD((cur) => {
      if (!cur) return cur;
      const others = cur.answers.filter((a) => a.question_id !== questionId);
      return { ...cur, answers: [...others, { question_id: questionId, value, status: status as never, context_note: contextNote, revision }] };
    });
  }, []);

  if (user?.isAdmin) return <Navigate to={`/admin/p/${pid}`} replace />;
  if (error) return <main className="page" id="main"><h1>Not available</h1><p>{error}</p></main>;
  if (!d) return <p className="page muted">Loading...</p>;
  if (!d.acknowledged) return <DiscoveryCtx.Provider value={{ d, reload, patchAnswer }}><Welcome /></DiscoveryCtx.Provider>;

  return (
    <DiscoveryCtx.Provider value={{ d, reload, patchAnswer }}>
      <Routes>
        <Route index element={<Navigate to={`m/${firstOpenModule(d)}/0`} replace />} />
        <Route path="m/:moduleKey/:step" element={<ModulePage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="done" element={<DonePage />} />
      </Routes>
    </DiscoveryCtx.Provider>
  );
}

function firstOpenModule(d: Discovery): string {
  const answered = new Set(d.answers.filter((a) => a.status !== 'empty').map((a) => a.question_id));
  const m = d.modules.find((mod) => mod.questions.some((q) => q.kind === 'core' && !answered.has(q.id)));
  return (m ?? d.modules[0]).key;
}
