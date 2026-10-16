import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import type { Suit } from '@/engine/cards';
import { newFaces, summarizeCourt, type FaceInfo } from '@/engine/court';
import { localDay, msUntilNextDay, weekStart, type Day } from '@/engine/day';
import type { DayCard } from '@/engine/deal';
import { dealEvent, playGame, playLiveWeek, type DealEvent } from '@/engine/game';
import { indexCheckIns, type Level } from '@/engine/kept';
import { checkInLane, createLedger, step, type Lane, type Outcome, type Step } from '@/engine/ledger';
import type { HandKind } from '@/engine/poker';

import type { Backend, Loaded } from './backend';
import { courtHabits, gameInput } from './play';
import type { Habit, HabitDraft, RecoveryPrompt, RecoveryResponse } from './types';

type DataState = { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & Loaded);

/** Something a check-in caused that's worth a moment on screen. */
export type GameEvent =
  /** Today's card got better. `saved` is yesterday's card when the same check-in rescued it. */
  | { id: number; kind: 'deal'; deal: DealEvent; saved: DayCard | null }
  | { id: number; kind: 'face'; suit: Suit; face: FaceInfo; identities: string[]; joker: boolean };

type DataApi = {
  state: DataState;
  today: Day;
  /** Seeds the deal for this player. */
  seed: string;
  reload: () => void;
  checkIn: (habitId: string, level: Level) => Promise<void>;
  undoCheckIn: (habitId: string) => Promise<void>;
  createHabit: (draft: HabitDraft) => Promise<Habit>;
  updateHabit: (id: string, draft: HabitDraft) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  /** Writes the Comeback prompt the first time it is shown, and again with the response. */
  recordPrompt: (habitId: string, missedDay: Day, response: RecoveryResponse | null) => Promise<void>;
  saveProfile: (patch: { northStar?: string | null; onboarded?: boolean }) => Promise<void>;
  /** Calls a hand for this week. Only on Monday; the screen checks before offering it. */
  callHand: (hand: HandKind) => Promise<void>;
  /** Deals and face cards from the latest check-ins, oldest first, waiting to be shown. */
  events: GameEvent[];
  dismissEvent: (id: number) => void;
};

const DataContext = createContext<DataApi | null>(null);

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** The user's local date right now. Read again at every write, so a swipe after midnight lands on the new day. */
const currentDay = () => localDay(new Date(), deviceTimeZone());

/** The hand called for the week starting `week`. */
const callLane = (week: Day): Lane<Loaded, HandKind | null> => ({
  key: `call:${week}`,
  read: (d) => d.calls.find((c) => c.weekStart === week)?.hand ?? null,
  write: (d, hand) => ({ ...d, calls: [...d.calls.filter((c) => c.weekStart !== week), ...(hand ? [{ weekStart: week, hand }] : [])] }),
});

/** The Comeback prompt for one habit's missed day. */
const promptLane = (habitId: string, missedDay: Day): Lane<Loaded, RecoveryPrompt | null> => ({
  key: `prompt:${habitId}:${missedDay}`,
  read: (d) => d.prompts.find((p) => p.habitId === habitId && p.missedDay === missedDay) ?? null,
  write: (d, prompt) => {
    const rest = d.prompts.filter((p) => !(p.habitId === habitId && p.missedDay === missedDay));
    return { ...d, prompts: prompt ? [prompt, ...rest] : rest };
  },
});

export function DataProvider({ backend, children }: PropsWithChildren<{ backend: Backend }>) {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [today, setToday] = useState(currentDay);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [ledger] = useState(() => createLedger<Loaded>());
  // The newest data, updated in the same moment as every change, so two quick check-ins never read a stale copy.
  const store = useRef<DataState>(state);
  // Events a check-in queued, so they can be dropped if its save fails before they're shown.
  const moments = useRef({ nextId: 1, nextToken: 1, byToken: new Map<number, number[]>(), cancelled: new Set<number>() });

  const commit = useCallback((next: DataState) => {
    store.current = next;
    setState(next);
  }, []);

  /** A change to the loaded rows, made to the newest copy. */
  const update = useCallback(
    (fn: (d: Loaded) => Loaded) => {
      const s = store.current;
      if (s.status === 'ready') commit({ ...fn(s), status: 'ready' });
    },
    [commit],
  );

  useEffect(() => {
    let cancelled = false;
    const since = ledger.mark();
    backend.load(deviceTimeZone()).then(
      (data) => !cancelled && commit({ ...ledger.replay(data, since), status: 'ready' }),
      (e: unknown) => !cancelled && commit({ status: 'error', message: e instanceof Error ? e.message : 'Could not load your deck.' }),
    );
    return () => {
      cancelled = true;
    };
  }, [backend, reloadKey, ledger, commit]);

  // A new day starts when the app comes back to the foreground after midnight.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(currentDay());
    });
    return () => sub.remove();
  }, []);

  // And at midnight while the app stays open: a timer to the next local day, with a check every minute in
  // case the timer is late or the phone changes time zone.
  useEffect(() => {
    const tick = () => setToday(currentDay());
    const midnight = setTimeout(tick, msUntilNextDay(new Date(), deviceTimeZone()) + 50);
    const minute = setInterval(tick, 60_000);
    return () => {
      clearTimeout(midnight);
      clearInterval(minute);
    };
  }, [today]);

  /** The real date at the moment of a write. Moves the screen to a new day if midnight has passed. */
  const syncToday = useCallback(() => {
    const now = currentDay();
    setToday(now);
    return now;
  }, []);

  /**
   * Queues what a change did to today's card and the Court, after the swipe has painted. Returns a token
   * for dropping those events again if the change doesn't save.
   */
  const announce = useCallback(
    (before: Loaded, after: Loaded, today: Day): number => {
      const m = moments.current;
      const token = m.nextToken++;
      setTimeout(() => {
        if (m.cancelled.delete(token)) return;
        const was = playLiveWeek(gameInput(before, today, backend.seed));
        const now = playLiveWeek(gameInput(after, today, backend.seed));
        const fresh: GameEvent[] = [];
        const deal = dealEvent(was, now);
        const saved = now.slots.find((slot, i) => slot.card?.kind === 'card' && slot.card.rescued && !was.slots[i].card)?.card ?? null;
        if (deal) fresh.push({ id: m.nextId++, kind: 'deal', deal, saved });
        const joker = now.slots.find((s) => s.isToday)?.card?.kind === 'joker' && was.slots.find((s) => s.isToday)?.card?.kind !== 'joker';
        const court = (d: Loaded) => summarizeCourt(courtHabits(d.habits), indexCheckIns(d.days), today);
        for (const f of newFaces(court(before), court(after))) fresh.push({ id: m.nextId++, kind: 'face', suit: f.suit, face: f.face, identities: f.identities, joker });
        if (!fresh.length) return;
        m.byToken.set(token, fresh.map((e) => e.id));
        setEvents((e) => [...e, ...fresh]);
      }, 0);
      return token;
    },
    [backend],
  );

  /** Drops the events a failed change queued. */
  const unannounce = useCallback((token: number) => {
    const m = moments.current;
    const ids = m.byToken.get(token);
    if (!ids) {
      m.cancelled.add(token);
      return;
    }
    m.byToken.delete(token);
    setEvents((e) => e.filter((x) => !ids.includes(x.id)));
  }, []);

  /** Shows a change at once and starts saving it. Null when there is nothing loaded to change. */
  const begin = useCallback(
    (steps: Step<Loaded> | Step<Loaded>[], save: () => Promise<void>) => {
      const s = store.current;
      if (s.status !== 'ready') return null;
      const { next, done } = ledger.change(s, steps, save);
      commit({ ...next, status: 'ready' });
      return { before: s as Loaded, after: next, done };
    },
    [ledger, commit],
  );

  /**
   * Waits for a save. When it fails, takes back only what that change still owns, and rejects with the
   * error when the screen had to change back. A failure a newer change already replaced stays quiet.
   */
  const settle = useCallback(
    async (done: Promise<Outcome<Loaded>>, onFail?: () => void): Promise<boolean> => {
      const out = await done;
      if (out.ok) return true;
      onFail?.();
      if (out.revert) {
        update(out.revert);
        throw out.error;
      }
      return false;
    },
    [update],
  );

  const checkIn = useCallback(
    async (habitId: string, level: Level) => {
      const day = syncToday();
      const started = begin(step(checkInLane<Loaded>(habitId, day), level), () => backend.saveDay(habitId, day, level));
      if (!started) return;
      const token = announce(started.before, started.after, day);
      await settle(started.done, () => unannounce(token));
    },
    [backend, begin, settle, announce, unannounce, syncToday],
  );

  const undoCheckIn = useCallback(
    async (habitId: string) => {
      const day = syncToday();
      const started = begin(step(checkInLane<Loaded>(habitId, day), null), () => backend.deleteDay(habitId, day));
      if (started) await settle(started.done);
    },
    [backend, begin, settle, syncToday],
  );

  const createHabit = useCallback(
    async (draft: HabitDraft) => {
      const s = store.current;
      const position = s.status === 'ready' ? s.habits.reduce((max, h) => Math.max(max, h.position + 1), 0) : 0;
      const habit = await backend.createHabit(draft, syncToday(), position);
      const add = (d: Loaded): Loaded => ({ ...d, habits: [...d.habits.filter((h) => h.id !== habit.id), habit] });
      ledger.note(add);
      update(add);
      return habit;
    },
    [backend, ledger, update, syncToday],
  );

  const updateHabit = useCallback(
    async (id: string, draft: HabitDraft) => {
      const habit = await backend.updateHabit(id, draft);
      const put = (d: Loaded): Loaded => ({ ...d, habits: d.habits.map((h) => (h.id === id ? habit : h)) });
      ledger.note(put);
      update(put);
    },
    [backend, ledger, update],
  );

  const archiveHabit = useCallback(
    async (id: string) => {
      const archivedAt = new Date().toISOString();
      await backend.archiveHabit(id, archivedAt);
      const put = (d: Loaded): Loaded => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, archivedAt } : h)) });
      ledger.note(put);
      update(put);
    },
    [backend, ledger, update],
  );

  const recordPrompt = useCallback(
    async (habitId: string, missedDay: Day, response: RecoveryResponse | null) => {
      const s = store.current;
      if (s.status !== 'ready') return;
      const recoveryDay = syncToday();
      const lane = promptLane(habitId, missedDay);
      // The first "shown" write never replaces an answer already given.
      const prompt: RecoveryPrompt = { habitId, missedDay, recoveryDay, response: response ?? lane.read(s)?.response ?? null };
      const started = begin(step(lane, prompt), () => backend.savePrompt({ habitId, missedDay, recoveryDay, response }));
      if (started) await settle(started.done);
    },
    [backend, begin, settle, syncToday],
  );

  const saveProfile = useCallback(
    async (p: { northStar?: string | null; onboarded?: boolean }) => {
      const northStar = p.northStar === undefined ? undefined : p.northStar?.trim() || null;
      const onboardedAt = p.onboarded ? new Date().toISOString() : undefined;
      await backend.saveProfile({ northStar, onboardedAt });
      const put = (d: Loaded): Loaded => ({
        ...d,
        profile: { ...d.profile, ...(northStar !== undefined ? { northStar } : {}), ...(onboardedAt ? { onboardedAt } : {}) },
      });
      ledger.note(put);
      update(put);
    },
    [backend, ledger, update],
  );

  const callHand = useCallback(
    async (hand: HandKind) => {
      const s = store.current;
      if (s.status !== 'ready') return;
      const now = syncToday();
      // The screen only offers a call while calls are open. If midnight passed since, check again.
      if (now !== today && !playGame(gameInput(s, now, backend.seed)).callOpen) throw new Error('Calls for this week have closed.');
      const week = weekStart(now);
      const started = begin(step(callLane(week), hand), () => backend.saveCall(week, hand));
      if (started) await settle(started.done);
    },
    [backend, begin, settle, today, syncToday],
  );

  const api = useMemo<DataApi>(
    () => ({
      state,
      today,
      seed: backend.seed,
      reload: () => setReloadKey((k) => k + 1),
      checkIn,
      undoCheckIn,
      createHabit,
      updateHabit,
      archiveHabit,
      recordPrompt,
      saveProfile,
      callHand,
      events,
      dismissEvent: (id: number) => setEvents((e) => e.filter((x) => x.id !== id)),
    }),
    [state, today, backend, checkIn, undoCheckIn, createHabit, updateHabit, archiveHabit, recordPrompt, saveProfile, callHand, events],
  );

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const api = useContext(DataContext);
  if (!api) throw new Error('useData must be used inside DataProvider');
  return api;
}
