import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { archivedAtFor, archivedDay, localDay, msUntilNextDay, weekStart, type Day } from '@/engine/day';
import { playGame } from '@/engine/game';
import type { Level } from '@/engine/kept';
import { checkInLane, createLedger, levelIn, step, type Lane, type Outcome, type Step } from '@/engine/ledger';
import type { HandKind } from '@/engine/poker';

import type { Backend, Loaded } from './backend';
import { cancelCacheWrite, readCache, writeCache } from './cache';
import { emptyDeck, forgetMoments, gameInput, lateKey, lateRefusal, momentsOf, newMemory, type CheckInMade, type GameEvent, type Moment } from './play';
import { draftFromHabit, type Habit, type HabitDraft, type RecoveryPrompt, type RecoveryResponse } from './types';

export type { GameEvent } from './play';

type DataState = { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & Loaded);

type DataApi = {
  state: DataState;
  today: Day;
  /** Seeds the deal for this player. */
  seed: string;
  /** Loads the deck again after an error, showing the loading screen meanwhile. */
  reload: () => void;
  /**
   * Fetches the deck again in the background, keeping what's on screen if that fails. For pull to
   * refresh. Changes still saving are kept on top of what arrives. Never rejects.
   */
  refresh: () => Promise<void>;
  /**
   * Keeps a card at `level`. Leave `day` out for today: the write always goes to the real date, even
   * just after midnight. Pass yesterday to log it late ("Did it, forgot to log"); that only adds a
   * missing day and only where `canBackfill` allows it, and rejects otherwise. Logging the same level
   * again is a no-op, so a double tap never shows an error.
   */
  checkIn: (habitId: string, level: Level, day?: Day) => Promise<void>;
  /**
   * Takes back a check-in: today's, or with `day`, a back-fill of yesterday made on this phone today
   * (the undo right after "Did it, forgot to log"). A day kept yesterday itself stays as it is.
   */
  undoCheckIn: (habitId: string, day?: Day) => Promise<void>;
  /** Makes one card, starting today, at the end of the deck. */
  createHabit: (draft: HabitDraft) => Promise<Habit>;
  /**
   * Makes several cards in one write (onboarding). A card from a recipe already in the deck is skipped,
   * so a retry after a failure never doubles a card. Resolves to the cards actually made.
   */
  createHabits: (drafts: readonly HabitDraft[]) => Promise<Habit[]>;
  updateHabit: (id: string, draft: HabitDraft) => Promise<void>;
  /** Takes a card out of the deck from today. Its kept days still count. */
  archiveHabit: (id: string) => Promise<void>;
  /**
   * Puts an archived card back. One archived today simply returns. One archived earlier comes back as
   * a new card starting today, so its old weeks and hands never change; the old card stays archived.
   */
  restoreHabit: (id: string) => Promise<Habit>;
  /** Puts the deck in this order: `ids` first to last. */
  updatePositions: (ids: readonly string[]) => Promise<void>;
  /** Writes the Comeback prompt the first time it is shown, and again with the response. */
  recordPrompt: (habitId: string, missedDay: Day, response: RecoveryResponse | null) => Promise<void>;
  saveProfile: (patch: { northStar?: string | null; onboarded?: boolean }) => Promise<void>;
  /** Calls a hand for this week, while calls are open; the screen checks before offering it. */
  callHand: (hand: HandKind) => Promise<void>;
  /**
   * Deletes the whole deck on the server: cards, check-ins, prompts, calls, the North Star and the
   * onboarding mark ("Delete my deck"). On success the app shows an empty account, which goes to
   * onboarding. Rejects, changing nothing on screen, when the server refuses.
   */
  deleteDeck: () => Promise<void>;
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

/** Where one card sits in the deck. */
const positionLane = (id: string): Lane<Loaded, number> => ({
  key: `position:${id}`,
  read: (d) => d.habits.find((h) => h.id === id)?.position ?? 0,
  write: (d, position) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, position } : h)) }),
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
    // Tokens whose moments are still being worked out, and which of those already saved or failed.
    waiting: new Set<number>(),
    saved: new Set<number>(),
    cancelled: new Set<number>(),
    shown: new Set<number>(),
    memory: newMemory(),
  });
  // Comeback answers given in this session, by the card and the day they kept, so undoing that check-in
  // brings the Comeback back.
  const answered = useRef(new Map<string, Day>());
  // Yesterdays logged late on this phone today, by `lateKey`: only these can be taken back.
  const loggedLate = useRef(new Set<string>());
  // When the rows last came from the server, for refreshing after a long time away or a new day.
  const loadedAt = useRef({ at: 0, day: '' });
  const refreshing = useRef<Promise<void> | null>(null);
  // False once this player's deck has closed (sign-out), so a late save can't write their rows back.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelCacheWrite();
    };
  }, []);

  /**
   * Keeps this player's rows on the phone as the server holds them. Changes still saving are left out,
   * so a swipe that never reached the server can't open as kept after a restart.
   */
  const persist = useCallback(() => {
    const s = store.current;
    if (alive.current && s.status === 'ready' && backend.kind === 'remote') writeCache(backend.seed, ledger.held(s));
  }, [backend, ledger]);

  const commit = useCallback(
    (next: DataState) => {
      if (!alive.current) return;
      store.current = next;
      setState(next);
      persist();
    },
    [persist],
  );

  /** Fresh rows from the server, with every change still saving (or saved since `since`) kept on top. */
  const arrived = useCallback(
    (data: Loaded, since: number) => {
      loadedAt.current = { at: Date.now(), day: currentDay() };
      commit({ ...ledger.replay(data, since), status: 'ready' });
    },
    [ledger, commit],
  );

  /** A change to the loaded rows, made to the newest copy. */
  const update = useCallback(
    (fn: (d: Loaded) => Loaded) => {
      const s = store.current;
      if (s.status === 'ready') commit({ ...fn(s), status: 'ready' });
    },
    [commit],
  );

  // Open on the rows this phone kept last time, if any, while the server is asked for the latest. With no
  // connection the kept rows stay on screen; only a phone with nothing kept shows the error.
  useEffect(() => {
    let cancelled = false;
    const since = ledger.mark();
    const kept = backend.kind === 'remote' ? readCache(backend.seed) : Promise.resolve(null);
    kept.then((rows) => {
      if (!cancelled && rows && store.current.status === 'loading') commit({ ...ledger.replay(rows, 0), status: 'ready' });
    });
    backend.load(deviceTimeZone()).then(
      (data) => !cancelled && arrived(data, since),
      async (e: unknown) => {
        const rows = await kept;
        if (cancelled || store.current.status === 'ready') return;
        if (rows) commit({ ...ledger.replay(rows, 0), status: 'ready' });
        else commit({ status: 'error', message: e instanceof Error ? e.message : 'Couldn’t load your deck.' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [backend, reloadKey, ledger, commit, arrived]);

  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const since = ledger.mark();
    const run = backend
      .load(deviceTimeZone())
      .then(
        (data) => {
          if (alive.current) arrived(data, since);
        },
        () => {
          // Keep what's on screen. The next time the app opens, it tries again.
        },
      )
      .finally(() => {
        refreshing.current = null;
      });
    refreshing.current = run;
    return run;
  }, [backend, ledger, arrived]);

  // Coming back to the app: a new day may have started, and after a new day or ten minutes away the rows
  // are fetched again quietly, in case another device changed them.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const now = currentDay();
      setToday(now);
      const last = loadedAt.current;
      if (store.current.status === 'ready' && (now !== last.day || Date.now() - last.at > 10 * 60_000)) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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
      m.waiting.add(token);
      setTimeout(() => {
        m.waiting.delete(token);
        if (m.cancelled.delete(token)) return;
        // A check-in that saved before this ran has nothing left to drop, so it isn't tracked.
        const done = m.saved.delete(token);
        const fresh = momentsOf(before, after, today, backend.seed, made, m.memory).map((x: Moment) => ({ ...x, id: m.nextId++ }) as GameEvent);
        if (!fresh.length) return;
        if (!done) m.byToken.set(token, { today, events: fresh });
        setEvents((e) => [...e, ...fresh]);
      }, 0);
      return token;
    },
    [backend],
  );

  /** A check-in saved: its events can no longer be dropped. */
  const confirmed = useCallback((token: number) => {
    const m = moments.current;
    if (m.waiting.has(token)) m.saved.add(token);
    else m.byToken.delete(token);
  }, []);

  /** Drops the events a failed check-in queued that nobody has seen yet, so the next try can celebrate them. */
  const unannounce = useCallback((token: number) => {
    const m = moments.current;
    if (m.waiting.has(token)) {
      m.cancelled.add(token);
      return;
    }
    const queued = m.byToken.get(token);
    if (!queued) return;
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
      if (out.ok) {
        // The server has it now, so the copy on the phone can too.
        persist();
        return true;
      }
      onFail?.();
      if (out.revert) {
        update(out.revert);
        throw out.error;
      }
      return false;
    },
    [update, persist],
  );

  const checkIn = useCallback(
    async (habitId: string, level: Level, day?: Day) => {
      const s = store.current;
      if (s.status !== 'ready') return;
      const today = syncToday();
      const target = day ?? today;
      const late = target !== today;
      // Already kept at this level (a double tap, or a back-fill tapped twice): nothing to change.
      if (late && levelIn(s.days, habitId, target) === level) return;
      const refusal = lateRefusal(s, habitId, target, today, 'add', loggedLate.current);
      if (refusal) throw new Error(refusal);
      // A day logged late remembers the day it was logged, so a Joker already dealt never moves to it.
      const loggedOn = late ? today : undefined;
      const started = begin(step(checkInLane<Loaded>(habitId, target, loggedOn), level), () => backend.saveDay(habitId, target, level, loggedOn));
      if (!started) return;
      if (late) loggedLate.current.add(lateKey(habitId, target));
      const token = announce(started.before, started.after, today, { habitId, level, day: target });
      const saved = await settle(started.done, () => {
        unannounce(token);
        if (late) loggedLate.current.delete(lateKey(habitId, target));
      });
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
      const refusal = lateRefusal(s, habitId, target, today, 'undo', loggedLate.current);
      if (refusal) throw new Error(refusal);
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
      const [undone] = await Promise.all([
        settle(started.done).catch((e: unknown) => {
          restore();
          throw e;
        }),
        cleared ? settle(cleared.done).catch(() => {}) : null,
      ]);
      // A back-fill taken back leaves yesterday empty, so it can be logged late again but not undone twice.
      if (undone && target !== today) loggedLate.current.delete(lateKey(habitId, target));
    },
    [backend, begin, settle, syncToday],
  );

  /** Makes cards at the end of the deck, starting today, in one write. */
  const insertHabits = useCallback(
    async (drafts: readonly HabitDraft[]): Promise<Habit[]> => {
      const s = store.current;
      const position = s.status === 'ready' ? s.habits.reduce((max, h) => Math.max(max, h.position + 1), 0) : 0;
      const made = await backend.createHabits(drafts, syncToday(), position);
      const ids = new Set(made.map((h) => h.id));
      const add = (d: Loaded): Loaded => ({ ...d, habits: [...d.habits.filter((h) => !ids.has(h.id)), ...made] });
      ledger.note(add);
      update(add);
      return made;
    },
    [backend, ledger, update, syncToday],
  );

  const createHabit = useCallback(
    async (draft: HabitDraft) => {
      const [habit] = await insertHabits([draft]);
      if (!habit) throw new Error('That card didn’t save. Try again.');
      return habit;
    },
    [insertHabits],
  );

  const createHabits = useCallback(
    async (drafts: readonly HabitDraft[]) => {
      const s = store.current;
      const taken = new Set(s.status === 'ready' ? s.habits.filter((h) => !h.archivedAt && h.recipeKey).map((h) => h.recipeKey) : []);
      const fresh = drafts.filter((d) => {
        if (!d.recipeKey) return true;
        if (taken.has(d.recipeKey)) return false;
        taken.add(d.recipeKey);
        return true;
      });
      return fresh.length ? insertHabits(fresh) : [];
    },
    [insertHabits],
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
      // The local day it left the deck, encoded so a change of time zone can never move it.
      const archivedAt = archivedAtFor(syncToday());
      await backend.archiveHabit(id, archivedAt);
      const put = (d: Loaded): Loaded => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, archivedAt } : h)) });
      ledger.note(put);
      update(put);
    },
    [backend, ledger, update, syncToday],
  );

  const restoreHabit = useCallback(
    async (id: string) => {
      const s = store.current;
      const habit = s.status === 'ready' ? s.habits.find((h) => h.id === id) : undefined;
      if (!habit) throw new Error('That card isn’t in your deck any more.');
      if (!habit.archivedAt) return habit;
      const today = syncToday();
      if (archivedDay(habit.archivedAt, s.status === 'ready' ? s.profile.timezone : 'UTC') === today) {
        // Nothing has been dealt since it left, so it can simply come back.
        await backend.archiveHabit(id, null);
        const back = { ...habit, archivedAt: null };
        const put = (d: Loaded): Loaded => ({ ...d, habits: d.habits.map((h) => (h.id === id ? back : h)) });
        ledger.note(put);
        update(put);
        return back;
      }
      // Clearing an older archive would deal it into every day since it left and change finished hands.
      return createHabit(draftFromHabit(habit));
    },
    [backend, ledger, update, syncToday, createHabit],
  );

  const updatePositions = useCallback(
    async (ids: readonly string[]) => {
      const s = store.current;
      if (s.status !== 'ready') return;
      const moves = ids.map((id, position) => ({ id, position })).filter(({ id, position }) => s.habits.find((h) => h.id === id)?.position !== position);
      if (!moves.length) return;
      const started = begin(
        moves.map(({ id, position }) => step(positionLane(id), position)),
        () => backend.updatePositions(moves),
      );
      if (started) await settle(started.done);
    },
    [backend, begin, settle],
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

  const deleteDeck = useCallback(async () => {
    await backend.deleteDeck();
    ledger.note(emptyDeck);
    update(emptyDeck);
  }, [backend, ledger, update]);

  const reload = useCallback(() => {
    // Offered after an error: the loading screen shows while the deck is fetched again.
    if (store.current.status === 'error') commit({ status: 'loading' });
    setReloadKey((k) => k + 1);
  }, [commit]);

  const api = useMemo<DataApi>(
    () => ({
      state,
      today,
      seed: backend.seed,
      reload,
      refresh,
      checkIn,
      undoCheckIn,
      createHabit,
      createHabits,
      updateHabit,
      archiveHabit,
      restoreHabit,
      updatePositions,
      recordPrompt,
      saveProfile,
      callHand,
      deleteDeck,
    }),
    [state, today, backend, reload, refresh, checkIn, undoCheckIn, createHabit, createHabits, updateHabit, archiveHabit, restoreHabit, updatePositions, recordPrompt, saveProfile, callHand, deleteDeck],
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
