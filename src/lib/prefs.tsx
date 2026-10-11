import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import type { Day } from '@/engine/day';
import type { BackKey, TableKey } from '@/engine/game';

/** Looks, chosen on this phone. Unlocks come from the game; these only say which unlocked one you picked. */
export type Prefs = {
  back: BackKey;
  table: TableKey;
  /** The Monday of the last Showdown each player has watched, by deal seed. */
  showdownSeen: Record<string, Day>;
};

const DEFAULTS: Prefs = { back: 'classic', table: 'kitchen', showdownSeen: {} };
const KEY = 'do-better:prefs:v1';

type PrefsApi = { prefs: Prefs; ready: boolean; setPrefs: (patch: Partial<Prefs>) => void };

const PrefsContext = createContext<PrefsApi>({ prefs: DEFAULTS, ready: false, setPrefs: () => {} });

export function PrefsProvider({ children }: PropsWithChildren) {
  const [prefs, setState] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) setState({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) });
        setReady(true);
      })
      // Storage that can't be read falls back to the defaults rather than blocking the app.
      .catch(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setState((p) => {
      const next = { ...p, ...patch };
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
