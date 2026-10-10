import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read from storage. */
  ready: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, user: null, ready: false });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, user: null, ready: false });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, user: data.session?.user ?? null, ready: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, user: session?.user ?? null, ready: true });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
