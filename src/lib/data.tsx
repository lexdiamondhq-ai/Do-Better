import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import type { Suit } from '@/engine/cards';
import { newFaces, summarizeCourt, type FaceInfo } from '@/engine/court';
import { localDay, weekStart, type Day } from '@/engine/day';
import type { DayCard } from '@/engine/deal';
import { dealEvent, playLiveWeek, type DealEvent } from '@/engine/game';
import { indexCheckIns, type Level } from '@/engine/kept';
import type { HandKind } from '@/engine/poker';

import type { Backend, Loaded } from './backend';
import { courtHabits, gameInput } from './play';
import type { Habit, HabitDraft, RecoveryResponse } from './types';

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
  /** Writes the Never Twice prompt the first time it is shown, and again with the response. */
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

export function DataProvider({ backend, children }: PropsWithChildren<{ backend: Backend }>) {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [today, setToday] = useState(() => localDay(new Date(), deviceTimeZone()));
  const [events, setEvents] = useState<GameEvent[]>([]);
  // The newest loaded data, for mutations that need it after an await.
  const latest = useRef<DataState>(state);
  const nextEvent = useRef(1);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    backend.load(deviceTimeZone()).then(
      (data) => !cancelled && setState({ status: 'ready', ...data }),
      (e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : 'Could not load your deck.' }),
    );
    return () => {
      cancelled = true;
    };
  }, [backend, reloadKey]);

  // A new day starts when the app comes back to the foreground after midnight.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(localDay(new Date(), deviceTimeZone()));
    });
    return () => sub.remove();
  }, []);

  const patch = useCallback((fn: (d: Loaded) => Loaded) => {
    setState((s) => (s.status === 'ready' ? { status: 'ready', ...fn(s) } : s));
  }, []);

  /** Queues what a change did to today's card and the Court. */
  const announce = useCallback(
    (before: Loaded, after: Loaded) => {
      const was = playLiveWeek(gameInput(before, today, backend.seed));
      const now = playLiveWeek(gameInput(after, today, backend.seed));
      const fresh: GameEvent[] = [];
      const deal = dealEvent(was, now);
      const saved = now.slots.find((slot, i) => slot.card?.kind === 'card' && slot.card.rescued && !was.slots[i].card)?.card ?? null;
      if (deal) fresh.push({ id: nextEvent.current++, kind: 'deal', deal, saved });
      const joker = now.slots.find((s) => s.isToday)?.card?.kind === 'joker' && was.slots.find((s) => s.isToday)?.card?.kind !== 'joker';
      const court = (d: Loaded) => summarizeCourt(courtHabits(d.habits), indexCheckIns(d.days), today);
      for (const f of newFaces(court(before), court(after))) fresh.push({ id: nextEvent.current++, kind: 'face', suit: f.suit, face: f.face, identities: f.identities, joker });
      if (fresh.length) setEvents((e) => [...e, ...fresh]);
    },
    [backend, today],
  );

  const checkIn = useCallback(
    async (habitId: string, level: Level) => {
      const s = latest.current;
      if (s.status !== 'ready') return;
      const before: Loaded = s;
      const after: Loaded = { ...s, days: [...s.days.filter((d) => !(d.habitId === habitId && d.day === today)), { habitId, day: today, level }] };
      patch(() => after);
      announce(before, after);
      try {
        await backend.saveDay(habitId, today, level);
      } catch (e) {
        patch(() => before);
        throw e;
      }
    },
    [backend, patch, announce, today],
  );

  const undoCheckIn = useCallback(
    async (habitId: string) => {
      const s = latest.current;
      if (s.status !== 'ready') return;
      const before: Loaded = s;
      patch((d) => ({ ...d, days: d.days.filter((x) => !(x.habitId === habitId && x.day === today)) }));
      try {
        await backend.deleteDay(habitId, today);
      } catch (e) {
        patch(() => before);
        throw e;
      }
    },
    [backend, patch, today],
  );

  const createHabit = useCallback(
    async (draft: HabitDraft) => {
      const s = latest.current;
      const position = s.status === 'ready' ? s.habits.reduce((max, h) => Math.max(max, h.position + 1), 0) : 0;
      const habit = await backend.createHabit(draft, today, position);
      patch((d) => ({ ...d, habits: [...d.habits, habit] }));
      // Several cards can be made in a row (onboarding) before the next render catches up.
      if (s.status === 'ready') latest.current = { ...s, habits: [...s.habits, habit] };
      return habit;
    },
    [backend, patch, today],
  );

  const updateHabit = useCallback(
    async (id: string, draft: HabitDraft) => {
      const habit = await backend.updateHabit(id, draft);
      patch((d) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? habit : h)) }));
    },
    [backend, patch],
  );

  const archiveHabit = useCallback(
    async (id: string) => {
      const archivedAt = new Date().toISOString();
      await backend.archiveHabit(id, archivedAt);
      patch((d) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, archivedAt } : h)) }));
    },
    [backend, patch],
  );

  const recordPrompt = useCallback(
    async (habitId: string, missedDay: Day, response: RecoveryResponse | null) => {
      await backend.savePrompt({ habitId, missedDay, recoveryDay: today, response });
      patch((d) => {
        const rest = d.prompts.filter((p) => !(p.habitId === habitId && p.missedDay === missedDay));
        const existing = d.prompts.find((p) => p.habitId === habitId && p.missedDay === missedDay);
        return { ...d, prompts: [{ habitId, missedDay, recoveryDay: today, response: response ?? existing?.response ?? null }, ...rest] };
      });
    },
    [backend, patch, today],
  );

  const saveProfile = useCallback(
    async (p: { northStar?: string | null; onboarded?: boolean }) => {
      const northStar = p.northStar === undefined ? undefined : p.northStar?.trim() || null;
      const onboardedAt = p.onboarded ? new Date().toISOString() : undefined;
      await backend.saveProfile({ northStar, onboardedAt });
      patch((d) => ({
        ...d,
        profile: { ...d.profile, ...(northStar !== undefined ? { northStar } : {}), ...(onboardedAt ? { onboardedAt } : {}) },
      }));
    },
    [backend, patch],
  );

  const callHand = useCallback(
    async (hand: HandKind) => {
      const s = latest.current;
      if (s.status !== 'ready') return;
      const week = weekStart(today);
      const before: Loaded = s;
      patch((d) => ({ ...d, calls: [...d.calls.filter((c) => c.weekStart !== week), { weekStart: week, hand }] }));
      try {
        await backend.saveCall(week, hand);
      } catch (e) {
        patch(() => before);
        throw e;
      }
    },
    [backend, patch, today],
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
