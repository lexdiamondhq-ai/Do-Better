import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import type { Day } from '@/engine/day';
import type { BackKey, TableKey } from '@/engine/game';

/** The card back and table a player picked. Unlocks come from the game; a look only says which unlocked one. */
export type Look = { back: BackKey; table: TableKey };

/** Saved on this phone, per player by deal seed, so one account's unlocks never dress another's deck. */
export type Prefs = {
  looks: Record<string, Partial<Look>>;
  /** The Monday of the last Showdown each player has watched. */
  showdownSeen: Record<string, Day>;
};

const DEFAULTS: Prefs = { looks: {}, showdownSeen: {} };
const KEY = 'do-better:prefs:v1';

/** Older saves kept one back and table for everyone on the phone. Nobody can say whose they were, so they go. */
function parse(raw: string): Prefs {
  const saved = JSON.parse(raw) as Partial<Prefs>;
  return { looks: saved.looks ?? {}, showdownSeen: saved.showdownSeen ?? {} };
}

type Patch = Partial<Prefs> | ((prefs: Prefs) => Partial<Prefs>);

type PrefsApi = { prefs: Prefs; ready: boolean; setPrefs: (patch: Patch) => void };

const PrefsContext = createContext<PrefsApi>({ prefs: DEFAULTS, ready: false, setPrefs: () => {} });

export function PrefsProvider({ children }: PropsWithChildren) {
  const [prefs, setState] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) setState(parse(raw));
        setReady(true);
      })
      // Storage that can't be read falls back to the defaults rather than blocking the app.
      .catch(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const setPrefs = useCallback((patch: Patch) => {
    setState((p) => {
      const next = { ...p, ...(typeof patch === 'function' ? patch(p) : patch) };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const api = useMemo(() => ({ prefs, ready, setPrefs }), [prefs, ready, setPrefs]);
  return <PrefsContext.Provider value={api}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}
