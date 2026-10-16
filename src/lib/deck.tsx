import { createContext, useCallback, useContext, useMemo, type PropsWithChildren } from 'react';

import { summarizeCourt, type CourtSuit } from '@/engine/court';
import { addDays, type Day } from '@/engine/day';
import { bandOf, tallyDay, tierOf, type Band, type DayCard, type Tier } from '@/engine/deal';
import type { BackKey, Game, TableKey } from '@/engine/game';
import { indexCheckIns, neverTwiceDay, summarizeWindow, totals, type CheckIns, type Level } from '@/engine/kept';
import { ideaOfTheDay, recommend, type Recommendation, type RecommendationContext } from '@/engine/playbook';

import { useData } from './data';
import { courtHabits, dealHabits, playGameFor } from './play';
import { usePrefs, type Look } from './prefs';
import type { Habit, Profile, RecoveryPrompt } from './types';

export type HabitView = {
  habit: Habit;
  checkIns: CheckIns;
  today: Level | null;
  /** The missed day to show the Comeback card for, unless the user already answered it. */
  neverTwice: Day | null;
  window30: ReturnType<typeof summarizeWindow>;
  allTime: { kept: number; ceiling: number };
  /** When in the day this card usually plays, from When it plays or the recipe. Stub until workstream B. */
  partOfDay: 'morning' | 'midday' | 'evening' | 'any';
  /** Kept nearly every day for a month with plenty of Ceilings. Stub until workstream B. */
  mastered: boolean;
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
  /** The band today's card deals from so far, or null before anything is kept. */
  todayBand: Band | null;
  /** Three or more days since the last check-in on any card. Only a trigger for the Welcome back card. Stub until B. */
  away: boolean;
  /** What a returning player still has, for the Welcome back card. Null unless away. */
  welcome: { kept: number; faces: number; chips: number } | null;
  /** Every suit, in deck order, with its kept days and face card. */
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
        partOfDay: 'any',
        mastered: false,
      };
    });

    const game = playGameFor(state, today, seed);
    const todayCard = game.current.slots.find((s) => s.isToday)?.card ?? null;
    const todayTally = tallyDay(today, dealHabits(state.habits, state.profile.timezone), byHabit);
    const todayTier = tierOf(todayTally);
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
      todayBand: bandOf(todayTally),
      away: false,
      welcome: null,
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

/** The card back and table this player picked. Until a pick is unlocked, the classic back and the kitchen table. */
export function useLook(): Look & { setLook: (patch: Partial<Look>) => void } {
  const deck = useDeck();
  const { seed } = useData();
  const { prefs, setPrefs } = usePrefs();
  const picked = prefs.looks[seed];
  const back: BackKey = picked?.back && deck?.game.backs.has(picked.back) ? picked.back : 'classic';
  const table: TableKey = picked?.table && deck?.game.tables.has(picked.table) ? picked.table : 'kitchen';
  const setLook = useCallback((patch: Partial<Look>) => setPrefs((p) => ({ looks: { ...p.looks, [seed]: { ...p.looks[seed], ...patch } } })), [seed, setPrefs]);
  return { back, table, setLook };
}
