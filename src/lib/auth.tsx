import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { ask } from '@/components/Ask';
import { localDay } from '@/engine/day';

import type { Backend } from './backend';
import { createDemoBackend } from './demo';
import { dealMeIn, friendlyAuthError } from './signIn';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read from storage. */
  ready: boolean;
  /** The in-memory demo deck, while someone is trying the app without an account. */
  demo: Backend | null;
};

type AuthApi = AuthState & {
  /**
   * Playing a guest deck: started with "Deal me in", not yet saved to Sign in with Apple or an email.
   * The deck lives with this phone's guest user, so signing out or deleting the app loses it.
   */
  guest: boolean;
  startDemo: () => void;
  endDemo: () => void;
  /**
   * Leaves the demo and starts the player's own deck as a guest, straight into the first-run tour. If
   * a guest deck can't start (anonymous sign-ins switched off, no connection), it says so and offers
   * to sign in instead, keeping the demo open meanwhile. Never rejects.
   */
  startOwnDeck: () => Promise<void>;
};

/** Who just left: the account that signed out (or was switched away from), or the demo deck. */
export type SignedOut = { userId: string | null; demo: boolean };

const leaving = new Set<(who: SignedOut) => void>();

/**
 * Runs `cb` whenever a player leaves: a sign-out, a switch to another account, or the end of the demo.
 * For clearing what belongs to that player, such as cached rows or scheduled reminders. Returns an
 * unsubscribe function.
 */
export function onSignOut(cb: (who: SignedOut) => void): () => void {
  leaving.add(cb);
  return () => {
    leaving.delete(cb);
  };
}

function signedOut(who: SignedOut) {
  for (const cb of [...leaving]) {
    try {
      cb(who);
    } catch {
      // One listener failing must not stop the others from clearing up.
    }
  }
}

const AuthContext = createContext<AuthApi>({ session: null, user: null, ready: false, demo: null, guest: false, startDemo: () => {}, endDemo: () => {}, startOwnDeck: async () => {} });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<Omit<AuthState, 'demo'>>({ session: null, user: null, ready: false });
  const [demo, setDemo] = useState<Backend | null>(null);
  // The account signed in a moment ago, to notice when it leaves.
  const current = useRef<string | null>(null);

  useEffect(() => {
    const seen = (session: Session | null) => {
      const id = session?.user?.id ?? null;
      if (current.current && current.current !== id) signedOut({ userId: current.current, demo: false });
      current.current = id;
      setState({ session, user: session?.user ?? null, ready: true });
    };
    supabase.auth.getSession().then(({ data }) => seen(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => seen(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const api = useMemo<AuthApi>(() => {
    const endDemo = () => {
      signedOut({ userId: null, demo: true });
      setDemo(null);
    };
    return {
      ...state,
      demo,
      guest: state.user?.is_anonymous === true,
      startDemo: () => setDemo(createDemoBackend(localDay(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'))),
      endDemo,
      startOwnDeck: async () => {
        try {
          // The guest deck starts first and the demo closes after, so a failure leaves the visitor where they were.
          if (!state.session) await dealMeIn();
          if (demo) endDemo();
        } catch (e) {
          const problem = friendlyAuthError(e, 'guest');
          ask(problem.problem === 'guest-off' ? 'Sign in to start your deck' : 'Your deck didn’t start', problem.message, [
            { text: 'Keep exploring', style: 'cancel' },
            { text: 'Sign in instead', onPress: endDemo },
          ]);
        }
      },
    };
  }, [state, demo]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
