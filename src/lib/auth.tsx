import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { localDay } from '@/engine/day';

import type { Backend } from './backend';
import { createDemoBackend } from './demo';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read from storage. */
  ready: boolean;
  /** The in-memory demo deck, while someone is trying the app without an account. */
  demo: Backend | null;
};

type AuthApi = AuthState & { startDemo: () => void; endDemo: () => void };

const AuthContext = createContext<AuthApi>({ session: null, user: null, ready: false, demo: null, startDemo: () => {}, endDemo: () => {} });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<Omit<AuthState, 'demo'>>({ session: null, user: null, ready: false });
  const [demo, setDemo] = useState<Backend | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, user: data.session?.user ?? null, ready: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, user: session?.user ?? null, ready: true });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const api = useMemo<AuthApi>(
    () => ({
      ...state,
      demo,
      startDemo: () => setDemo(createDemoBackend(localDay(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'))),
      endDemo: () => setDemo(null),
    }),
    [state, demo],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
