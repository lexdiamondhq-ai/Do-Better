import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { evaluateAchievements, newlyUnlocked, type Achievement } from '@/engine/achievements';
import { localDay, type Day } from '@/engine/day';
import { indexCheckIns, type Level } from '@/engine/kept';

import { supabase } from './supabase';
import { draftToRow, habitFromRow, type Habit, type HabitDay, type HabitDraft, type Profile, type RecoveryPrompt, type RecoveryResponse } from './types';

type Loaded = {
  profile: Profile;
  habits: Habit[];
  days: HabitDay[];
  prompts: RecoveryPrompt[];
};

type DataState = { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & Loaded);

type DataApi = {
  state: DataState;
  today: Day;
  reload: () => void;
  checkIn: (habitId: string, level: Level) => Promise<void>;
  undoCheckIn: (habitId: string) => Promise<void>;
  createHabit: (draft: HabitDraft) => Promise<Habit>;
  updateHabit: (id: string, draft: HabitDraft) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  /** Writes the comeback prompt the first time it is shown, and again with the response. */
  recordPrompt: (habitId: string, missedDay: Day, response: RecoveryResponse | null) => Promise<void>;
  saveProfile: (patch: { northStar?: string | null; onboarded?: boolean }) => Promise<void>;
  /** Achievements earned by the latest check-ins, waiting to be celebrated. */
  celebrations: Achievement[];
  dismissCelebration: () => void;
};

const DataContext = createContext<DataApi | null>(null);

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Supabase caps a select at 1,000 rows, so page through check-ins. */
async function fetchAllDays(userId: string): Promise<HabitDay[]> {
  const out: HabitDay[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('habit_days')
      .select('habit_id, day, level')
      .eq('owner_id', userId)
      .order('day', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    for (const r of data ?? []) out.push({ habitId: r.habit_id, day: r.day, level: r.level });
    if (!data || data.length < page) return out;
  }
}

async function load(userId: string): Promise<Loaded> {
  const [profileRes, habitsRes, days, promptsRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, timezone, north_star, onboarded_at').eq('id', userId).maybeSingle(),
    supabase.from('habits').select('*').eq('owner_id', userId).order('position').order('created_at'),
    fetchAllDays(userId),
    supabase.from('recovery_prompts').select('habit_id, missed_day, recovery_day, response').eq('owner_id', userId).order('missed_day', { ascending: false }).limit(200),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (habitsRes.error) throw habitsRes.error;
  if (promptsRes.error) throw promptsRes.error;

  const tz = deviceTimeZone();
  const p = profileRes.data;
  const profile: Profile = {
    id: userId,
    displayName: p?.display_name ?? null,
    timezone: tz,
    northStar: p?.north_star ?? null,
    onboardedAt: p?.onboarded_at ?? null,
  };
  // The views use the stored timezone to agree with the device about "today".
  if (!p || p.timezone !== tz) await supabase.from('profiles').upsert({ id: userId, timezone: tz });

  return {
    profile,
    habits: (habitsRes.data ?? []).map(habitFromRow),
    days,
    prompts: (promptsRes.data ?? []).map((r) => ({ habitId: r.habit_id, missedDay: r.missed_day, recoveryDay: r.recovery_day, response: r.response })),
  };
}

export function DataProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [today, setToday] = useState(() => localDay(new Date(), deviceTimeZone()));
  const [celebrations, setCelebrations] = useState<Achievement[]>([]);
  // The newest loaded data, for mutations that need it after an await.
  const latest = useRef<DataState>(state);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    load(userId).then(
      (data) => !cancelled && setState({ status: 'ready', ...data }),
      (e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : 'Could not load your deck.' }),
    );
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

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

  const celebrateChanges = useCallback(
    (before: Loaded, after: Loaded) => {
      const habits = (d: Loaded) => d.habits.map((h) => ({ id: h.id, identity: h.identity, startedOn: h.startedOn, archived: !!h.archivedAt }));
      const was = evaluateAchievements(habits(before), indexCheckIns(before.days), today).states;
      const now = evaluateAchievements(habits(after), indexCheckIns(after.days), today).states;
      const fresh = newlyUnlocked(was, now);
      if (fresh.length) setCelebrations((c) => [...c, ...fresh]);
    },
    [today],
  );

  const checkIn = useCallback(
    async (habitId: string, level: Level) => {
      const s = latest.current;
      if (s.status !== 'ready') return;
      const before: Loaded = s;
      const after: Loaded = { ...s, days: [...s.days.filter((d) => !(d.habitId === habitId && d.day === today)), { habitId, day: today, level }] };
      patch(() => after);
      celebrateChanges(before, after);
      const { error } = await supabase
        .from('habit_days')
        .upsert({ habit_id: habitId, owner_id: userId, day: today, level, logged_at: new Date().toISOString() }, { onConflict: 'habit_id,day' });
      if (error) {
        patch(() => before);
        throw error;
      }
    },
    [patch, celebrateChanges, today, userId],
  );

  const undoCheckIn = useCallback(
    async (habitId: string) => {
      const s = latest.current;
      if (s.status !== 'ready') return;
      const before: Loaded = s;
      patch((d) => ({ ...d, days: d.days.filter((x) => !(x.habitId === habitId && x.day === today)) }));
      const { error } = await supabase.from('habit_days').delete().eq('habit_id', habitId).eq('day', today);
      if (error) {
        patch(() => before);
        throw error;
      }
    },
    [patch, today],
  );

  const createHabit = useCallback(
    async (draft: HabitDraft) => {
      const s = latest.current;
      const position = s.status === 'ready' ? s.habits.reduce((max, h) => Math.max(max, h.position + 1), 0) : 0;
      const { data, error } = await supabase
        .from('habits')
        .insert({ ...draftToRow(draft), owner_id: userId, started_on: today, position })
        .select('*')
        .single();
      if (error) throw error;
      const habit = habitFromRow(data);
      patch((d) => ({ ...d, habits: [...d.habits, habit] }));
      if (s.status === 'ready') {
        const after: Loaded = { ...s, habits: [...s.habits, habit] };
        // Several cards can be made in a row (onboarding) before the next render catches up.
        latest.current = { status: 'ready', ...after };
        celebrateChanges(s, after);
      }
      return habit;
    },
    [patch, celebrateChanges, today, userId],
  );

  const updateHabit = useCallback(
    async (id: string, draft: HabitDraft) => {
      const { data, error } = await supabase.from('habits').update(draftToRow(draft)).eq('id', id).select('*').single();
      if (error) throw error;
      const habit = habitFromRow(data);
      patch((d) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? habit : h)) }));
    },
    [patch],
  );

  const archiveHabit = useCallback(
    async (id: string) => {
      const archivedAt = new Date().toISOString();
      const { error } = await supabase.from('habits').update({ archived_at: archivedAt }).eq('id', id);
      if (error) throw error;
      patch((d) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, archivedAt } : h)) }));
    },
    [patch],
  );

  const recordPrompt = useCallback(
    async (habitId: string, missedDay: Day, response: RecoveryResponse | null) => {
      const row = {
        habit_id: habitId,
        owner_id: userId,
        missed_day: missedDay,
        recovery_day: today,
        ...(response ? { response, responded_at: new Date().toISOString() } : {}),
      };
      // ignoreDuplicates keeps the first "shown" write from wiping a response.
      const { error } = await supabase.from('recovery_prompts').upsert(row, { onConflict: 'habit_id,missed_day', ignoreDuplicates: !response });
      if (error) throw error;
      patch((d) => {
        const rest = d.prompts.filter((p) => !(p.habitId === habitId && p.missedDay === missedDay));
        const existing = d.prompts.find((p) => p.habitId === habitId && p.missedDay === missedDay);
        return { ...d, prompts: [{ habitId, missedDay, recoveryDay: today, response: response ?? existing?.response ?? null }, ...rest] };
      });
    },
    [patch, today, userId],
  );

  const saveProfile = useCallback(
    async (p: { northStar?: string | null; onboarded?: boolean }) => {
      const row: Record<string, unknown> = { id: userId };
      if (p.northStar !== undefined) row.north_star = p.northStar?.trim() || null;
      if (p.onboarded) row.onboarded_at = new Date().toISOString();
      const { error } = await supabase.from('profiles').upsert(row);
      if (error) throw error;
      patch((d) => ({
        ...d,
        profile: {
          ...d.profile,
          ...(p.northStar !== undefined ? { northStar: p.northStar?.trim() || null } : {}),
          ...(p.onboarded ? { onboardedAt: String(row.onboarded_at) } : {}),
        },
      }));
    },
    [patch, userId],
  );

  const api = useMemo<DataApi>(
    () => ({
      state,
      today,
      reload: () => setReloadKey((k) => k + 1),
      checkIn,
      undoCheckIn,
      createHabit,
      updateHabit,
      archiveHabit,
      recordPrompt,
      saveProfile,
      celebrations,
      dismissCelebration: () => setCelebrations((c) => c.slice(1)),
    }),
    [state, today, checkIn, undoCheckIn, createHabit, updateHabit, archiveHabit, recordPrompt, saveProfile, celebrations],
  );

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const api = useContext(DataContext);
  if (!api) throw new Error('useData must be used inside DataProvider');
  return api;
}
