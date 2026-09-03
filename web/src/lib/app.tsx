import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, getToken, RequestFailed } from './api.ts';

export type User = {
  id: string; username: string; fullName: string; designation: string; rankLevel: number;
  unit: string; district: string; station: string | null; isWomanOfficer: boolean;
  clearanceLevel: number; role: string; keyFingerprint: string;
};

type Toast = { id: number; tone: 'info' | 'ok' | 'danger'; title: string; body?: string };

type AppState = {
  user: User | null;
  assignments: Record<string, string>;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  toast: (tone: Toast['tone'], title: string, body?: string) => void;
  /** Purpose codes are mandatory on every content read; the console keeps one selected. */
  purpose: string;
  setPurpose: (code: string) => void;
  purposeCodes: Record<string, string>;
};

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const value = useContext(Ctx);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [purpose, setPurpose] = useState(localStorage.getItem('pramana.purpose') ?? 'INVESTIGATION');
  const [purposeCodes, setPurposeCodes] = useState<Record<string, string>>({});

  const toast = useCallback((tone: Toast['tone'], title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, tone, title, body }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6500);
  }, []);

  useEffect(() => {
    api.get<{ purposeCodes: Record<string, string> }>('/auth/purpose-codes')
      .then((r) => setPurposeCodes(r.purposeCodes))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.get<{ user: User; assignments: Record<string, string> }>('/auth/me')
      .then((r) => { setUser(r.user); setAssignments(r.assignments); })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
    setToken(result.token);
    const me = await api.get<{ user: User; assignments: Record<string, string> }>('/auth/me');
    setUser(me.user);
    setAssignments(me.assignments);
  }, []);

  const signOut = useCallback(() => { setToken(null); setUser(null); setAssignments({}); }, []);

  const changePurpose = useCallback((code: string) => {
    setPurpose(code);
    localStorage.setItem('pramana.purpose', code);
  }, []);

  const value = useMemo<AppState>(
    () => ({ user, assignments, loading, signIn, signOut, toast, purpose, setPurpose: changePurpose, purposeCodes }),
    [user, assignments, loading, signIn, signOut, toast, purpose, changePurpose, purposeCodes],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-host">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <div className="t">{t.title}</div>
            {t.body && <div className="muted small">{t.body}</div>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Turns a policy denial into the explanation the officer actually needs. */
export function denialMessage(error: unknown): { title: string; body: string; ruleId?: string } | null {
  if (!(error instanceof RequestFailed)) return null;
  const { payload } = error;
  if (error.status === 403) {
    return {
      title: payload.error === 'statutory_role_required' ? 'Blocked by statute' : 'Access denied by policy',
      body: `${payload.message ?? payload.reason ?? ''}${payload.basis ? ` (${payload.basis})` : ''}`,
      ruleId: payload.ruleId,
    };
  }
  return { title: 'Request failed', body: payload.message ?? payload.error };
}
