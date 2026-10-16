import type { Day } from '@/engine/day';
import type { Level } from '@/engine/kept';
import type { HandKind } from '@/engine/poker';

import { supabase } from './supabase';
import { draftToRow, habitFromRow, type Habit, type HandCall, type HabitDay, type HabitDraft, type Profile, type RecoveryPrompt } from './types';

export type Loaded = {
  profile: Profile;
  habits: Habit[];
  days: HabitDay[];
  prompts: RecoveryPrompt[];
  calls: HandCall[];
};

/** Where the deck lives: Supabase for real accounts, memory for the demo deck. */
export interface Backend {
  /** Seeds the deal, so the same person always gets the same cards. */
  seed: string;
  load(timezone: string): Promise<Loaded>;
  saveDay(habitId: string, day: Day, level: Level): Promise<void>;
  deleteDay(habitId: string, day: Day): Promise<void>;
  /** Makes every card in one write, so a retry after a failure can't leave half a deck behind. Positions count up from `position`. */
  createHabits(drafts: readonly HabitDraft[], startedOn: Day, position: number): Promise<Habit[]>;
  updateHabit(id: string, draft: HabitDraft): Promise<Habit>;
  /** Sets or clears `archived_at`. The app writes the local day encoded by `archivedAtFor`. */
  archiveHabit(id: string, archivedAt: string | null): Promise<void>;
  /** Moves cards to new places in the deck. */
  updatePositions(moves: readonly { id: string; position: number }[]): Promise<void>;
  savePrompt(prompt: RecoveryPrompt): Promise<void>;
  /** Takes back the answer to a Comeback prompt, so the Comeback shows again. The prompt itself stays. */
  clearPrompt(habitId: string, missedDay: Day): Promise<void>;
  /** Removes a Comeback prompt, for a missed day that was logged late after all. */
  deletePrompt(habitId: string, missedDay: Day): Promise<void>;
  saveProfile(patch: { northStar?: string | null; onboardedAt?: string }): Promise<void>;
  saveCall(weekStart: Day, hand: HandKind): Promise<void>;
}

const OUTDATED = new Set(['PGRST204', 'PGRST205', '42P01', '42703']);

/** A missing column or table means the database is behind the app. Say what to do instead of quoting Postgres. */
function friendly(error: { code?: string; message: string }): Error {
  if (error.code && OUTDATED.has(error.code)) {
    return new Error('Your Do Better database needs its latest update. Run the newest migration in Supabase (see the README), then try again.');
  }
  return new Error(error.message);
}

/** Supabase caps a select at 1,000 rows, so page through check-ins, in an order with no ties so no row is skipped or repeated. */
async function fetchAllDays(userId: string): Promise<HabitDay[]> {
  const out: HabitDay[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('habit_days')
      .select('habit_id, day, level')
      .eq('owner_id', userId)
      .order('day', { ascending: true })
      .order('habit_id', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw friendly(error);
    for (const r of data ?? []) out.push({ habitId: r.habit_id, day: r.day, level: r.level });
    if (!data || data.length < page) return out;
  }
}

export function supabaseBackend(userId: string): Backend {
  return {
    seed: userId,

    async load(timezone) {
      const [profileRes, habitsRes, days, promptsRes, callsRes] = await Promise.all([
        supabase.from('profiles').select('id, display_name, timezone, north_star, onboarded_at').eq('id', userId).maybeSingle(),
        supabase.from('habits').select('*').eq('owner_id', userId).order('position').order('created_at'),
        fetchAllDays(userId),
        supabase.from('recovery_prompts').select('habit_id, missed_day, recovery_day, response').eq('owner_id', userId).order('missed_day', { ascending: false }).limit(200),
        supabase.from('hand_calls').select('week_start, hand').eq('owner_id', userId).order('week_start', { ascending: false }).limit(520),
      ]);
      if (profileRes.error) throw friendly(profileRes.error);
      if (habitsRes.error) throw friendly(habitsRes.error);
      if (promptsRes.error) throw friendly(promptsRes.error);
      // Before the calls migration runs there is no table yet. The game still works, just without calls.
      if (callsRes.error && !OUTDATED.has(callsRes.error.code)) throw friendly(callsRes.error);

      const p = profileRes.data;
      // The views use the stored timezone to agree with the device about "today".
      if (!p || p.timezone !== timezone) await supabase.from('profiles').upsert({ id: userId, timezone });
      return {
        profile: { id: userId, displayName: p?.display_name ?? null, timezone, northStar: p?.north_star ?? null, onboardedAt: p?.onboarded_at ?? null },
        habits: (habitsRes.data ?? []).map(habitFromRow),
        days,
        prompts: (promptsRes.data ?? []).map((r) => ({ habitId: r.habit_id, missedDay: r.missed_day, recoveryDay: r.recovery_day, response: r.response })),
        calls: (callsRes.data ?? []).map((r) => ({ weekStart: r.week_start, hand: r.hand })),
      };
    },

    async saveDay(habitId, day, level) {
      const { error } = await supabase
        .from('habit_days')
        .upsert({ habit_id: habitId, owner_id: userId, day, level, logged_at: new Date().toISOString() }, { onConflict: 'habit_id,day' });
      if (error) throw friendly(error);
    },

    async deleteDay(habitId, day) {
      const { error } = await supabase.from('habit_days').delete().eq('habit_id', habitId).eq('day', day);
      if (error) throw friendly(error);
    },

    async createHabits(drafts, startedOn, position) {
      if (!drafts.length) return [];
      const rows = drafts.map((d, i) => ({ ...draftToRow(d), owner_id: userId, started_on: startedOn, position: position + i }));
      const { data, error } = await supabase.from('habits').insert(rows).select('*');
      if (error) throw friendly(error);
      return (data ?? []).map(habitFromRow).sort((a, b) => a.position - b.position);
    },

    async updateHabit(id, draft) {
      const { data, error } = await supabase.from('habits').update(draftToRow(draft)).eq('id', id).select('*').single();
      if (error) throw friendly(error);
      return habitFromRow(data);
    },

    async archiveHabit(id, archivedAt) {
      const { error } = await supabase.from('habits').update({ archived_at: archivedAt }).eq('id', id);
      if (error) throw friendly(error);
    },

    async updatePositions(moves) {
      // One small update per card: an upsert would need every required column.
      const results = await Promise.all(moves.map(({ id, position }) => supabase.from('habits').update({ position }).eq('id', id)));
      const failed = results.find((r) => r.error)?.error;
      if (failed) throw friendly(failed);
    },

    async savePrompt({ habitId, missedDay, recoveryDay, response }) {
      const row = { habit_id: habitId, owner_id: userId, missed_day: missedDay, recovery_day: recoveryDay, ...(response ? { response, responded_at: new Date().toISOString() } : {}) };
      // ignoreDuplicates keeps the first "shown" write from wiping a response.
      const { error } = await supabase.from('recovery_prompts').upsert(row, { onConflict: 'habit_id,missed_day', ignoreDuplicates: !response });
      if (error) throw friendly(error);
    },

    async clearPrompt(habitId, missedDay) {
      // The table's check keeps response and responded_at empty together.
      const { error } = await supabase.from('recovery_prompts').update({ response: null, responded_at: null }).eq('habit_id', habitId).eq('missed_day', missedDay);
      if (error) throw friendly(error);
    },

    async deletePrompt(habitId, missedDay) {
      const { error } = await supabase.from('recovery_prompts').delete().eq('habit_id', habitId).eq('missed_day', missedDay);
      if (error) throw friendly(error);
    },

    async saveProfile({ northStar, onboardedAt }) {
      const row: Record<string, unknown> = { id: userId };
      if (northStar !== undefined) row.north_star = northStar;
      if (onboardedAt) row.onboarded_at = onboardedAt;
      const { error } = await supabase.from('profiles').upsert(row);
      if (error) throw friendly(error);
    },

    async saveCall(weekStart, hand) {
      const { error } = await supabase
        .from('hand_calls')
        .upsert({ owner_id: userId, week_start: weekStart, hand, called_at: new Date().toISOString() }, { onConflict: 'owner_id,week_start' });
      if (error) throw friendly(error);
    },
  };
}
