import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { laterDay, type Day } from '@/engine/day';
import type { BackKey, TableKey } from '@/engine/game';

/** The card back and table a player picked. Unlocks come from the game; a look only says which unlocked one. */
export type Look = { back: BackKey; table: TableKey };

/** A time of day on the 24-hour clock, "HH:MM", such as "20:30". */
export type ClockTime = string;

/** Local reminders. Nothing is scheduled until the player says yes and the phone allows it. */
export type Reminders = {
  /** The reminder prompt has been answered, either way. It never asks twice. */
  asked: boolean;
  /** The player said yes and the phone allowed notifications. */
  on: boolean;
  /** The evening nudge while a card is still open, when a Floor still counts. */
  lastCall: ClockTime;
  /** The morning nudge after a quiet day, while yesterday can still be logged. */
  morning: boolean;
  /** "When it plays" reminders the player set for single cards, by habit id. */
  perHabit: Record<string, ClockTime>;
};

/**
 * Saved on this phone. Most of it is per player, keyed by deal seed, so one account's unlocks and
 * history never dress another's deck. Sound, music, haptics and reminders are phone-wide.
 */
export type Prefs = {
  looks: Record<string, Partial<Look>>;
  /** The Monday of the latest Showdown each player has watched. It only ever moves forward. */
  showdownSeen: Record<string, Day>;
  /** The table music. Phone-wide, not per player. On unless the player turns it off. */
  music: boolean;
  /** A sound for each action. */
  sounds: boolean;
  /** A tap you can feel for each action. */
  haptics: boolean;
  reminders: Reminders;
  /** One-time moments each player has seen (a coach mark, an intro line), by deal seed then key. */
  seen: Record<string, Record<string, true>>;
  /** When each player was last asked for an App Store review, as an ISO timestamp, by deal seed. */
  reviewAskedAt: Record<string, string>;
};

export const DEFAULT_REMINDERS: Reminders = { asked: false, on: false, lastCall: '20:30', morning: true, perHabit: {} };

const DEFAULTS: Prefs = { looks: {}, showdownSeen: {}, music: true, sounds: true, haptics: true, reminders: DEFAULT_REMINDERS, seen: {}, reviewAskedAt: {} };
// Music stays on by default, so the key keeps its version: existing installs keep their choices.
const KEY = 'do-better:prefs:v1';

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A clock time when `v` is one, otherwise null. */
export function clockTime(v: unknown): ClockTime | null {
  return typeof v === 'string' && CLOCK.test(v) ? v : null;
}

/** Keeps the entries of a saved record whose values pass `keep`. Anything else on disk is dropped. */
function recordOf<T>(v: unknown, keep: (x: unknown) => x is T): Record<string, T> {
  if (!isRecord(v)) return {};
  const out: Record<string, T> = {};
  for (const [k, x] of Object.entries(v)) if (keep(x)) out[k] = x;
  return out;
}

const isDay = (x: unknown): x is Day => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const isString = (x: unknown): x is string => typeof x === 'string';
const isClock = (x: unknown): x is ClockTime => clockTime(x) !== null;
const isSeenSet = (x: unknown): x is Record<string, true> => isRecord(x);

function remindersOf(v: unknown): Reminders {
  if (!isRecord(v)) return DEFAULT_REMINDERS;
  return {
    asked: bool(v.asked, DEFAULT_REMINDERS.asked),
    on: bool(v.on, DEFAULT_REMINDERS.on),
    lastCall: clockTime(v.lastCall) ?? DEFAULT_REMINDERS.lastCall,
    morning: bool(v.morning, DEFAULT_REMINDERS.morning),
    perHabit: recordOf(v.perHabit, isClock),
  };
}

/** Older saves kept one back and table for everyone on the phone. Nobody can say whose they were, so they go. */
function parse(raw: string): Prefs {
  const saved: unknown = JSON.parse(raw);
  if (!isRecord(saved)) return DEFAULTS;
  const seen: Prefs['seen'] = {};
  for (const [seed, keys] of Object.entries(recordOf(saved.seen, isSeenSet))) {
    seen[seed] = {};
    for (const [k, on] of Object.entries(keys)) if (on === true) seen[seed][k] = true;
  }
  return {
    looks: recordOf(saved.looks, isRecord) as Prefs['looks'],
    showdownSeen: recordOf(saved.showdownSeen, isDay),
    music: bool(saved.music, DEFAULTS.music),
    sounds: bool(saved.sounds, DEFAULTS.sounds),
    haptics: bool(saved.haptics, DEFAULTS.haptics),
    reminders: remindersOf(saved.reminders),
    seen,
    reviewAskedAt: recordOf(saved.reviewAskedAt, isString),
  };
}

/** A Showdown already watched never comes back, even if the clock moves back across a date line. */
function forwardOnly(before: Prefs['showdownSeen'], after: Prefs['showdownSeen']): Prefs['showdownSeen'] {
  if (before === after) return after;
  const out = { ...before };
  for (const [seed, day] of Object.entries(after)) out[seed] = laterDay(before[seed], day);
  return out;
}

/** Whether this player has seen the one-time moment `key`. */
export function hasSeen(prefs: Prefs, seed: string, key: string): boolean {
  return prefs.seen[seed]?.[key] === true;
}

type Patch = Partial<Prefs> | ((prefs: Prefs) => Partial<Prefs>);

type PrefsApi = {
  prefs: Prefs;
  ready: boolean;
  setPrefs: (patch: Patch) => void;
  /** Marks the Showdown for the week starting `start` as watched. Never moves back to an earlier week. */
  seeShowdown: (seed: string, start: Day) => void;
  /** Remembers that this player has seen the one-time moment `key`. */
  markSeen: (seed: string, key: string) => void;
};

const PrefsContext = createContext<PrefsApi>({ prefs: DEFAULTS, ready: false, setPrefs: () => {}, seeShowdown: () => {}, markSeen: () => {} });

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
      // Storage that can't be read (or holds something unreadable) falls back to the defaults rather than blocking the app.
      .catch(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const setPrefs = useCallback((patch: Patch) => {
    setState((p) => {
      const change = typeof patch === 'function' ? patch(p) : patch;
      const next = { ...p, ...change, showdownSeen: forwardOnly(p.showdownSeen, change.showdownSeen ?? p.showdownSeen) };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const seeShowdown = useCallback((seed: string, start: Day) => setPrefs((p) => ({ showdownSeen: { ...p.showdownSeen, [seed]: start } })), [setPrefs]);

  const markSeen = useCallback(
    (seed: string, key: string) => setPrefs((p) => (hasSeen(p, seed, key) ? {} : { seen: { ...p.seen, [seed]: { ...p.seen[seed], [key]: true } } })),
    [setPrefs],
  );

  const api = useMemo(() => ({ prefs, ready, setPrefs, seeShowdown, markSeen }), [prefs, ready, setPrefs, seeShowdown, markSeen]);
  return <PrefsContext.Provider value={api}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}
