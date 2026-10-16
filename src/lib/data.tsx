import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { canBackfill, localDay, msUntilNextDay, weekStart, type Day } from '@/engine/day';
import { playGame } from '@/engine/game';
import type { Level } from '@/engine/kept';
import { checkInLane, createLedger, levelIn, step, type Lane, type Outcome, type Step } from '@/engine/ledger';
import type { HandKind } from '@/engine/poker';

import type { Backend, Loaded } from './backend';
import { forgetMoments, gameInput, momentsOf, newMemory, type CheckInMade, type GameEvent, type Moment } from './play';
import type { Habit, HabitDraft, RecoveryPrompt, RecoveryResponse } from './types';

export type { GameEvent } from './play';

type DataState = { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & Loaded);

type DataApi = {
  state: DataState;
  today: Day;
  /** Seeds the deal for this player. */
  seed: string;
  reload: () => void;
  /**
   * Keeps a card at `level`. Leave `day` out for today: the write always goes to the real date, even
   * just after midnight. Pass yesterday to log it late ("Did it, forgot to log"); that only adds a
   * missing day and only where `canBackfill` allows it, and rejects otherwise.
   */
  checkIn: (habitId: string, level: Level, day?: Day) => Promise<void>;
  /** Takes back a check-in: today's unless `day` is a yesterday that `canBackfill` still allows changing. */
  undoCheckIn: (habitId: string, day?: Day) => Promise<void>;
  createHabit: (draft: HabitDraft) => Promise<Habit>;
  updateHabit: (id: string, draft: HabitDraft) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  /** Writes the Comeback prompt the first time it is shown, and again with the response. */
  recordPrompt: (habitId: string, missedDay: Day, response: RecoveryResponse | null) => Promise<void>;
  saveProfile: (patch: { northStar?: string | null; onboarded?: boolean }) => Promise<void>;
  /** Calls a hand for this week, while calls are open; the screen checks before offering it. */
  callHand: (hand: HandKind) => Promise<void>;
};

type EventsApi = {
  /** Moments from the latest check-ins, oldest first, waiting to be shown. */
  events: GameEvent[];
  dismissEvent: (id: number) => void;
  /** Tells the queue an event is on screen. Events never shown are dropped if their check-in fails to save. */
  markShown: (id: number) => void;
};

const DataContext = createContext<DataApi | null>(null);
const EventsContext = createContext<EventsApi | null>(null);

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
  // Events each check-in queued, so they can be dropped if its save fails before they're shown, and
  // what has been celebrated today, so an undo and redo can't replay it.
  const moments = useRef({
    nextId: 1,
    nextToken: 1,
    byToken: new Map<number, { today: Day; events: GameEvent[] }>(),
    cancelled: new Set<number>(),
    shown: new Set<number>(),
    memory: newMemory(),
  });
  // Comeback answers given in this session, by the card and the day they kept, so undoing that check-in
  // brings the Comeback back.
  const answered = useRef(new Map<string, Day>());

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
   * Queues what a check-in did (its card, face cards, milestones), worked out after the swipe has painted.
   * Returns a token for dropping those events if the check-in doesn't save.
   */
  const announce = useCallback(
    (before: Loaded, after: Loaded, today: Day, made: CheckInMade): number => {
      const m = moments.current;
      const token = m.nextToken++;
      setTimeout(() => {
        if (m.cancelled.delete(token)) return;
        const fresh = momentsOf(before, after, today, backend.seed, made, m.memory).map((x: Moment) => ({ ...x, id: m.nextId++ }) as GameEvent);
        if (!fresh.length) return;
        m.byToken.set(token, { today, events: fresh });
        setEvents((e) => [...e, ...fresh]);
      }, 0);
      return token;
    },
    [backend],
  );

  /** A check-in saved: its events can no longer be dropped. */
  const confirmed = useCallback((token: number) => {
    moments.current.byToken.delete(token);
  }, []);

  /** Drops the events a failed check-in queued that nobody has seen yet, so the next try can celebrate them. */
  const unannounce = useCallback((token: number) => {
    const m = moments.current;
    const queued = m.byToken.get(token);
    if (!queued) {
      m.cancelled.add(token);
      return;
    }
    m.byToken.delete(token);
    const unseen = queued.events.filter((e) => !m.shown.has(e.id));
    forgetMoments(unseen, queued.today, m.memory);
    const gone = new Set(unseen.map((e) => e.id));
    if (gone.size) setEvents((e) => e.filter((x) => !gone.has(x.id)));
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
    async (habitId: string, level: Level, day?: Day) => {
      const s = store.current;
      if (s.status !== 'ready') return;
      const today = syncToday();
      const target = day ?? today;
      const late = target !== today;
      if (late && (!canBackfill(target, today, s.habits.find((h) => h.id === habitId)) || levelIn(s.days, habitId, target))) {
        throw new Error('Only yesterday can be logged late, once, while its week is still being played.');
      }
      const started = begin(step(checkInLane<Loaded>(habitId, target), level), () => backend.saveDay(habitId, target, level));
      if (!started) return;
      const token = announce(started.before, started.after, today, { habitId, level, day: target });
      const saved = await settle(started.done, () => unannounce(token));
      if (!saved) return;
      confirmed(token);
      // A day logged late was never missed, so its Comeback prompt goes too. No answer is written for it.
      const loaded = store.current;
      const lane = promptLane(habitId, target);
      if (late && loaded.status === 'ready' && lane.read(loaded)) {
        const cleanup = begin(step(lane, null), () => backend.deletePrompt(habitId, target));
        if (cleanup) await settle(cleanup.done).catch(() => {});
      }
    },
    [backend, begin, settle, announce, unannounce, confirmed, syncToday],
  );

  const undoCheckIn = useCallback(
    async (habitId: string, day?: Day) => {
      const s = store.current;
      if (s.status !== 'ready') return;
      const today = syncToday();
      const target = day ?? today;
      if (target !== today && !canBackfill(target, today, s.habits.find((h) => h.id === habitId))) {
        throw new Error('That day is settled now, so it stays as it is.');
      }
      // Undo brings the Comeback back: an answer this session gave to the Comeback that this check-in kept is cleared too.
      const answerKey = `${habitId}:${target}`;
      const missed = answered.current.get(answerKey);
      const prompt = missed ? promptLane(habitId, missed).read(s) : null;
      const started = begin(step(checkInLane<Loaded>(habitId, target), null), () => backend.deleteDay(habitId, target));
      if (!started) return;
      let cleared: ReturnType<typeof begin> = null;
      if (missed && prompt?.response) {
        answered.current.delete(answerKey);
        cleared = begin(step(promptLane(habitId, missed), { ...prompt, response: null }), () => backend.clearPrompt(habitId, missed));
      }
      const restore = () => {
        // The check-in is back, so its answer goes back too.
        if (!missed || !prompt?.response) return;
        answered.current.set(answerKey, missed);
        const again = begin(step(promptLane(habitId, missed), prompt), () => backend.savePrompt(prompt));
        again?.done.catch(() => {});
      };
      await Promise.all([settle(started.done).catch((e: unknown) => {
        restore();
        throw e;
      }), cleared ? settle(cleared.done).catch(() => {}) : null]);
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
      if (response === 'floor_only' || response === 'two_minute') answered.current.set(`${habitId}:${recoveryDay}`, missedDay);
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
    }),
    [state, today, backend, checkIn, undoCheckIn, createHabit, updateHabit, archiveHabit, recordPrompt, saveProfile, callHand],
  );

  // Its own context, so a toast coming and going doesn't redraw every screen that reads the deck.
  const markShown = useCallback((id: number) => {
    moments.current.shown.add(id);
  }, []);
  const dismissEvent = useCallback((id: number) => {
    moments.current.shown.add(id);
    setEvents((e) => e.filter((x) => x.id !== id));
  }, []);
  const eventsApi = useMemo<EventsApi>(() => ({ events, dismissEvent, markShown }), [events, dismissEvent, markShown]);

  return (
    <DataContext.Provider value={api}>
      <EventsContext.Provider value={eventsApi}>{children}</EventsContext.Provider>
    </DataContext.Provider>
  );
}

export function useData(): DataApi {
  const api = useContext(DataContext);
  if (!api) throw new Error('useData must be used inside DataProvider');
  return api;
}

/** The moments waiting to be shown: deals, face cards, the first card, back-fills, milestones and rungs. */
export function useEvents(): EventsApi {
  const api = useContext(EventsContext);
  if (!api) throw new Error('useEvents must be used inside DataProvider');
  return api;
}
