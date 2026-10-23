import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { cleanPlanWords, PLAN_WORDS_MAX, type Plan } from '@/engine/comeback';
import { addDays, laterDay, type Day } from '@/engine/day';
import type { BackKey, TableKey } from '@/engine/game';
import { blendGrip, type Grip, type HeldGrip } from '@/engine/wear';

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
  /** Where each card's thumb mark sits, from real swipes, by deal seed then habit id. Only on this phone. */
  grips: Record<string, Record<string, HeldGrip>>;
  /** Your plan for each card's next Comeback, by deal seed then habit id. One per card. Only on this phone. */
  plans: Record<string, Record<string, Plan>>;
};

export const DEFAULT_REMINDERS: Reminders = { asked: false, on: false, lastCall: '20:30', morning: true, perHabit: {} };

const DEFAULTS: Prefs = { looks: {}, showdownSeen: {}, music: true, sounds: true, haptics: true, reminders: DEFAULT_REMINDERS, seen: {}, reviewAskedAt: {}, grips: {}, plans: {} };
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
/** A real calendar date: "2026-02-30" has the right shape but no such day. */
const isRealDay = (x: unknown): x is Day => isDay(x) && addDays(x, 0) === x;
const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** A saved thumb position, when it is one: inside the card, from 1 to 50 swipes. */
function gripOf(x: unknown): HeldGrip | null {
  if (!isRecord(x) || !isUnit(x.x) || !isUnit(x.y)) return null;
  const n = x.n;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 50) return null;
  return { x: x.x, y: x.y, n };
}

/** A saved plan, when it is one: a keep for "then", a real day it was made, and words that fit. */
function planOf(x: unknown): Plan | null {
  if (!isRecord(x)) return null;
  const { when, then, made } = x;
  if (then !== 'first' && then !== 'floor') return null;
  if (!isRealDay(made)) return null;
  if (typeof when !== 'string' || !when.trim() || Array.from(when).length > PLAN_WORDS_MAX) return null;
  return { when, then, made };
}

/** A record of records, by deal seed then habit id, keeping only the entries `read` accepts. */
function bySeed<T>(v: unknown, read: (x: unknown) => T | null): Record<string, Record<string, T>> {
  const out: Record<string, Record<string, T>> = {};
  for (const [seed, entries] of Object.entries(recordOf(v, isRecord))) {
    const kept: Record<string, T> = {};
    for (const [id, x] of Object.entries(entries)) {
      const value = read(x);
      if (value) kept[id] = value;
    }
    out[seed] = kept;
  }
  return out;
}

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
export function parse(raw: string): Prefs {
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
    grips: bySeed(saved.grips, gripOf),
    plans: bySeed(saved.plans, planOf),
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

export type Patch = Partial<Prefs> | ((prefs: Prefs) => Partial<Prefs>);

/** One more swipe folded into a card's thumb position. A point that isn't a number changes nothing. */
export function gripNoted(prefs: Prefs, seed: string, habitId: string, point: Grip): Partial<Prefs> {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return {};
  const mine = prefs.grips[seed] ?? {};
  return { grips: { ...prefs.grips, [seed]: { ...mine, [habitId]: blendGrip(mine[habitId] ?? null, point) } } };
}

/**
 * A card's plan, replacing the one before. Its own words are kept as typed (`cleanPlanWords`). A plan that
 * wouldn't load again (no words left, a "then" that isn't a keep, a day that doesn't exist) changes nothing.
 */
export function planSet(prefs: Prefs, seed: string, habitId: string, plan: Plan): Partial<Prefs> {
  const tidy = planOf({ ...plan, when: cleanPlanWords(plan.when) });
  if (!tidy) return {};
  return { plans: { ...prefs.plans, [seed]: { ...prefs.plans[seed], [habitId]: tidy } } };
}

/** A card's plan, gone. */
export function planCleared(prefs: Prefs, seed: string, habitId: string): Partial<Prefs> {
  if (!prefs.plans[seed]?.[habitId]) return {};
  const { [habitId]: _gone, ...rest } = prefs.plans[seed];
  return { plans: { ...prefs.plans, [seed]: rest } };
}

/** Everything this phone noted about one player's cards (thumb marks and plans), gone. Other players' stay. */
export function deckNotesForgotten(prefs: Prefs, seed: string): Partial<Prefs> {
  const { [seed]: _grips, ...grips } = prefs.grips;
  const { [seed]: _plans, ...plans } = prefs.plans;
  return { grips, plans };
}

/** `prefs` with `patch` applied. The Showdown watched only ever moves forward. */
export function applyPatch(prefs: Prefs, patch: Patch): Prefs {
  const change = typeof patch === 'function' ? patch(prefs) : patch;
  return { ...prefs, ...change, showdownSeen: forwardOnly(prefs.showdownSeen, change.showdownSeen ?? prefs.showdownSeen) };
}

type PrefsApi = {
  prefs: Prefs;
  ready: boolean;
  setPrefs: (patch: Patch) => void;
  /** Marks the Showdown for the week starting `start` as watched. Never moves back to an earlier week. */
  seeShowdown: (seed: string, start: Day) => void;
  /** Remembers that this player has seen the one-time moment `key`. */
  markSeen: (seed: string, key: string) => void;
  /** Folds a real swipe's starting point into the card's thumb position (`blendGrip`). */
  noteGrip: (seed: string, habitId: string, point: Grip) => void;
  /** Saves a card's plan, replacing any before it. */
  setPlan: (seed: string, habitId: string, plan: Plan) => void;
  clearPlan: (seed: string, habitId: string) => void;
  /** Drops this player's thumb marks and plans, for Delete my deck. */
  forgetDeckNotes: (seed: string) => void;
};

const PrefsContext = createContext<PrefsApi>({
  prefs: DEFAULTS,
  ready: false,
  setPrefs: () => {},
  seeShowdown: () => {},
  markSeen: () => {},
  noteGrip: () => {},
  setPlan: () => {},
  clearPlan: () => {},
  forgetDeckNotes: () => {},
});

export function PrefsProvider({ children }: PropsWithChildren) {
  const [prefs, setState] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);
  // Changes made before the saved prefs have been read. They are applied on top of the saved prefs when
  // those arrive, so an early change is neither lost nor saved over everything else as defaults.
  const early = useRef<Patch[] | null>([]);

  useEffect(() => {
    let cancelled = false;
    const arrive = (saved: Prefs) => {
      if (cancelled) return;
      const patches = early.current ?? [];
      early.current = null;
      const next = patches.reduce(applyPatch, saved);
      if (patches.length) AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      setState(next);
      setReady(true);
    };
    AsyncStorage.getItem(KEY)
      .then((raw) => arrive(raw ? parse(raw) : DEFAULTS))
      // Storage that can't be read (or holds something unreadable) falls back to the defaults rather than blocking the app.
      .catch(() => arrive(DEFAULTS));
    return () => {
      cancelled = true;
    };
  }, []);

  const setPrefs = useCallback((patch: Patch) => {
    const waiting = early.current;
    if (waiting) {
      // Shown now, saved once the saved prefs are in.
      waiting.push(patch);
      setState((p) => applyPatch(p, patch));
      return;
    }
    setState((p) => {
      const next = applyPatch(p, patch);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const seeShowdown = useCallback((seed: string, start: Day) => setPrefs((p) => ({ showdownSeen: { ...p.showdownSeen, [seed]: start } })), [setPrefs]);

  const markSeen = useCallback(
    (seed: string, key: string) => setPrefs((p) => (hasSeen(p, seed, key) ? {} : { seen: { ...p.seen, [seed]: { ...p.seen[seed], [key]: true } } })),
    [setPrefs],
  );

  const noteGrip = useCallback((seed: string, habitId: string, point: Grip) => setPrefs((p) => gripNoted(p, seed, habitId, point)), [setPrefs]);
  const setPlan = useCallback((seed: string, habitId: string, plan: Plan) => setPrefs((p) => planSet(p, seed, habitId, plan)), [setPrefs]);
  const clearPlan = useCallback((seed: string, habitId: string) => setPrefs((p) => planCleared(p, seed, habitId)), [setPrefs]);
  const forgetDeckNotes = useCallback((seed: string) => setPrefs((p) => deckNotesForgotten(p, seed)), [setPrefs]);

  const api = useMemo(
    () => ({ prefs, ready, setPrefs, seeShowdown, markSeen, noteGrip, setPlan, clearPlan, forgetDeckNotes }),
    [prefs, ready, setPrefs, seeShowdown, markSeen, noteGrip, setPlan, clearPlan, forgetDeckNotes],
  );
  return <PrefsContext.Provider value={api}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}
