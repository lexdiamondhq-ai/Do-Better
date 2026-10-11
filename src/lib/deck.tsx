import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

import { summarizeCourt, type CourtSuit } from '@/engine/court';
import { addDays, type Day } from '@/engine/day';
import { tallyDay, tierOf, type DayCard, type Tier } from '@/engine/deal';
import type { Game } from '@/engine/game';
import { indexCheckIns, neverTwiceDay, summarizeWindow, totals, type CheckIns, type Level } from '@/engine/kept';
import { ideaOfTheDay, recommend, type Recommendation, type RecommendationContext } from '@/engine/playbook';

import { useData } from './data';
import { courtHabits, dealHabits, playGameFor } from './play';
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
  /** Active habits in deck order. */
  cards: HabitView[];
  archived: Habit[];
  game: Game;
  /** Today's card so far, and the tier it was dealt from. */
  todayCard: DayCard | null;
  todayTier: Tier | null;
  /** Every suit, in deck order, with its votes and face card. */
  court: CourtSuit[];
  recommendations: Recommendation[];
  idea: Recommendation;
  keptToday: number;
  prompts: RecoveryPrompt[];
  totals: { kept: number; ceilings: number; rescues: number; jokers: number };
};

const EMPTY: CheckIns = new Map();

/** Everything the screens show, derived from the loaded rows. Null until the data has loaded. */
function useComputedDeck(): Deck | null {
  const { state, today, seed } = useData();
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

    const game = playGameFor(state, today, seed);
    const todayCard = game.current.slots.find((s) => s.isToday)?.card ?? null;
    const todayTier = tierOf(tallyDay(today, dealHabits(state.habits, state.profile.timezone), byHabit));
    const allWeeks = [...game.weeks, game.current];
    const cardsDealt = allWeeks.flatMap((w) => w.slots.flatMap((s) => (s.card ? [s.card] : [])));
    let kept = 0;
    let ceilings = 0;
    for (const days of byHabit.values()) {
      const t = totals(days, today);
      kept += t.kept;
      ceilings += t.ceiling;
    }

    // Rates over the last 30 days, ignoring today because it isn't over yet.
    const yesterday = addDays(today, -1);
    let inWindow = 0;
    let kept30 = 0;
    let ceiling30 = 0;
    for (const c of cards) {
      const w = summarizeWindow(yesterday, 30, c.habit.startedOn, c.checkIns);
      inWindow += w.daysInWindow;
      kept30 += w.keptDays;
      ceiling30 += w.ceilingDays;
    }
    const ctx: RecommendationContext = {
      today,
      habitCount: active.length,
      habitsWithoutTwoMinute: active.filter((h) => !h.twoMinuteLabel).length,
      habitsWithoutAnchor: active.filter((h) => !h.anchor).length,
      habitsWithoutWhenWhere: active.filter((h) => !h.whenWhere).length,
      habitsWithoutIdentity: active.filter((h) => !h.identity).length,
      neverTwiceCount: cards.filter((c) => c.neverTwice).length,
      keptRate30: inWindow >= 7 ? kept30 / inWindow : null,
      ceilingShare30: kept30 > 0 ? ceiling30 / kept30 : null,
      callPending: game.callOpen && !game.current.call && active.length > 0,
    };

    return {
      today,
      profile: state.profile,
      cards,
      archived: state.habits.filter((h) => h.archivedAt),
      game,
      todayCard,
      todayTier,
      court: summarizeCourt(courtHabits(state.habits), byHabit, today),
      recommendations: recommend(ctx),
      idea: ideaOfTheDay(ctx),
      keptToday: cards.filter((c) => c.today).length,
      prompts: state.prompts,
      totals: {
        kept,
        ceilings,
        rescues: cardsDealt.filter((c) => c.kind === 'card' && c.rescued).length,
        jokers: cardsDealt.filter((c) => c.kind === 'joker').length,
      },
    };
  }, [state, today, seed]);
}

const DeckContext = createContext<Deck | null>(null);

/** Works the deck out once per change, for every screen under it. */
export function DeckProvider({ children }: PropsWithChildren) {
  const deck = useComputedDeck();
  return <DeckContext.Provider value={deck}>{children}</DeckContext.Provider>;
}

export function useDeck(): Deck | null {
  return useContext(DeckContext);
}
