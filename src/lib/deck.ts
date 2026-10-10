import { useMemo } from 'react';

import { evaluateAchievements, nextUp, type EarnedState, type Metrics } from '@/engine/achievements';
import { addDays, type Day } from '@/engine/day';
import { summarizeIdentities, type IdentitySummary } from '@/engine/identity';
import { indexCheckIns, neverTwiceDay, summarizeWindow, totals, type CheckIns, type Level } from '@/engine/kept';
import { ideaOfTheDay, recommend, type Recommendation, type RecommendationContext } from '@/engine/playbook';

import { useData } from './data';
import type { Habit, Profile, RecoveryPrompt } from './types';

export type HabitView = {
  habit: Habit;
  checkIns: CheckIns;
  today: Level | null;
  /** The missed day to show the Never Twice card for, unless the user already answered it. */
  neverTwice: Day | null;
  window30: ReturnType<typeof summarizeWindow>;
  allTime: { kept: number; ceiling: number };
};

export type Deck = {
  today: Day;
  profile: Profile;
  /** Active cards in deck order. */
  cards: HabitView[];
  archived: Habit[];
  identities: IdentitySummary[];
  achievements: EarnedState[];
  metrics: Metrics;
  closest: EarnedState[];
  recommendations: Recommendation[];
  idea: Recommendation;
  keptToday: number;
  prompts: RecoveryPrompt[];
};

const EMPTY: CheckIns = new Map();

/** Everything the screens show, derived from the loaded rows. Null until the data has loaded. */
export function useDeck(): Deck | null {
  const { state, today } = useData();
  return useMemo(() => {
    if (state.status !== 'ready') return null;
    const byHabit = indexCheckIns(state.days);
    const active = state.habits.filter((h) => !h.archivedAt).sort((a, b) => a.position - b.position);
    const answered = new Set(state.prompts.filter((p) => p.response).map((p) => `${p.habitId}:${p.missedDay}`));

    const cards = active.map<HabitView>((habit) => {
      const checkIns = byHabit.get(habit.id) ?? EMPTY;
      const missed = neverTwiceDay(habit.startedOn, today, checkIns);
      return {
        habit,
        checkIns,
        today: checkIns.get(today) ?? null,
        neverTwice: missed && !answered.has(`${habit.id}:${missed}`) ? missed : null,
        window30: summarizeWindow(today, 30, habit.startedOn, checkIns),
        allTime: totals(checkIns, today),
      };
    });

    const forEngine = state.habits.map((h) => ({ id: h.id, identity: h.identity, startedOn: h.startedOn, archived: !!h.archivedAt }));
    const { states, metrics } = evaluateAchievements(forEngine, byHabit, today);

    // Rates over the last 30 days, ignoring today because it isn't over yet.
    const yesterday = addDays(today, -1);
    let inWindow = 0;
    let kept = 0;
    let ceiling = 0;
    for (const c of cards) {
      const w = summarizeWindow(yesterday, 30, c.habit.startedOn, c.checkIns);
      inWindow += w.daysInWindow;
      kept += w.keptDays;
      ceiling += w.ceilingDays;
    }
    const ctx: RecommendationContext = {
      today,
      habitCount: active.length,
      habitsWithoutTwoMinute: active.filter((h) => !h.twoMinuteLabel).length,
      habitsWithoutAnchor: active.filter((h) => !h.anchor).length,
      habitsWithoutWhenWhere: active.filter((h) => !h.whenWhere).length,
      habitsWithoutIdentity: active.filter((h) => !h.identity).length,
      neverTwiceCount: cards.filter((c) => c.neverTwice).length,
      keptRate30: inWindow >= 7 ? kept / inWindow : null,
      ceilingShare30: kept > 0 ? ceiling / kept : null,
    };

    return {
      today,
      profile: state.profile,
      cards,
      archived: state.habits.filter((h) => h.archivedAt),
      identities: summarizeIdentities(active, byHabit, today),
      achievements: states,
      metrics,
      closest: nextUp(states, 3),
      recommendations: recommend(ctx),
      idea: ideaOfTheDay(ctx),
      keptToday: cards.filter((c) => c.today).length,
      prompts: state.prompts,
    };
  }, [state, today]);
}
