/**
 * Achievements are collectible cards. Each one belongs to a suit and has a rank, so the collection
 * reads like a deck you fill in over months. They are earned from totals only: kept days, Ceilings,
 * Floors that saved a day, bounce-backs after a miss, identity votes. Nothing here is a streak, so
 * no achievement can ever be lost, and a bad week never undoes one.
 *
 * Unlock dates are worked out by replaying history day by day, so they need no table of their own.
 */

import { addDays, daysBetween, type Day } from './day';
import { identityKey } from './identity';
import type { CheckIns } from './kept';

export type Suit = 'spades' | 'diamonds' | 'clubs' | 'hearts' | 'joker';

export const SUITS: Record<Suit, { glyph: string; name: string; about: string }> = {
  spades: { glyph: '♠', name: 'Showing up', about: 'Kept days, Floor or Ceiling.' },
  diamonds: { glyph: '♦', name: 'Reaching up', about: 'Days you hit the Ceiling.' },
  clubs: { glyph: '♣', name: 'Bouncing back', about: 'Coming back after a miss, and steady months.' },
  hearts: { glyph: '♥', name: 'Becoming', about: 'Votes for who you are becoming.' },
  joker: { glyph: '★', name: 'Wild cards', about: 'Whole days and a full deck.' },
};

export type Metric =
  | 'kept' // all kept days across habits
  | 'ceiling' // Ceiling days
  | 'floorSaves' // days kept with the Floor only
  | 'bounceBacks' // misses followed by a kept day
  | 'fullHouse' // days every habit in the deck was kept (2+ habits)
  | 'topIdentity' // votes for the most-voted identity
  | 'identities10' // identities with 10+ votes
  | 'best30' // most kept days in any 30-day stretch of one habit
  | 'deck'; // habits in the deck

export type Achievement = {
  id: string;
  suit: Suit;
  rank: string;
  title: string;
  description: string;
  metric: Metric;
  target: number;
};

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-card', suit: 'spades', rank: '2', title: 'First card', description: 'Keep your first day.', metric: 'kept', target: 1 },
  { id: 'kept-7', suit: 'spades', rank: '3', title: 'A week of yeses', description: 'Keep 7 days in total.', metric: 'kept', target: 7 },
  { id: 'kept-30', suit: 'spades', rank: '5', title: 'Thirty cards', description: 'Keep 30 days in total.', metric: 'kept', target: 30 },
  { id: 'kept-100', suit: 'spades', rank: '10', title: 'Hundred club', description: 'Keep 100 days in total.', metric: 'kept', target: 100 },
  { id: 'kept-250', suit: 'spades', rank: 'Q', title: 'Quarter thousand', description: 'Keep 250 days in total.', metric: 'kept', target: 250 },
  { id: 'kept-500', suit: 'spades', rank: 'K', title: 'Five hundred', description: 'Keep 500 days in total.', metric: 'kept', target: 500 },
  { id: 'kept-1000', suit: 'spades', rank: 'A', title: 'The thousand', description: 'Keep 1,000 days in total.', metric: 'kept', target: 1000 },
  { id: 'floor-1', suit: 'spades', rank: '4', title: 'Saved by the Floor', description: 'Keep a day with just the Floor.', metric: 'floorSaves', target: 1 },
  { id: 'floor-25', suit: 'spades', rank: '8', title: 'The Floor is the habit', description: 'Keep 25 days with the Floor.', metric: 'floorSaves', target: 25 },
  { id: 'floor-100', suit: 'spades', rank: 'J', title: 'Unbreakable minimum', description: 'Keep 100 days with the Floor.', metric: 'floorSaves', target: 100 },

  { id: 'ceiling-1', suit: 'diamonds', rank: '2', title: 'Touched the Ceiling', description: 'Hit the Ceiling once.', metric: 'ceiling', target: 1 },
  { id: 'ceiling-10', suit: 'diamonds', rank: '5', title: 'Ten great days', description: 'Hit the Ceiling 10 times.', metric: 'ceiling', target: 10 },
  { id: 'ceiling-50', suit: 'diamonds', rank: '10', title: 'Fifty highs', description: 'Hit the Ceiling 50 times.', metric: 'ceiling', target: 50 },
  { id: 'ceiling-150', suit: 'diamonds', rank: 'K', title: 'Living up there', description: 'Hit the Ceiling 150 times.', metric: 'ceiling', target: 150 },
  { id: 'ceiling-365', suit: 'diamonds', rank: 'A', title: 'A year of great days', description: 'Hit the Ceiling 365 times.', metric: 'ceiling', target: 365 },

  { id: 'bounce-1', suit: 'clubs', rank: '3', title: 'Never twice', description: 'Keep the day after a miss.', metric: 'bounceBacks', target: 1 },
  { id: 'bounce-5', suit: 'clubs', rank: '6', title: 'Comeback habit', description: 'Bounce back after a miss 5 times.', metric: 'bounceBacks', target: 5 },
  { id: 'bounce-25', suit: 'clubs', rank: 'J', title: 'Unshakeable', description: 'Bounce back after a miss 25 times.', metric: 'bounceBacks', target: 25 },
  { id: 'steady-20', suit: 'clubs', rank: '7', title: 'Steady month', description: 'Keep 20 of 30 days on one habit.', metric: 'best30', target: 20 },
  { id: 'steady-25', suit: 'clubs', rank: '9', title: 'Solid month', description: 'Keep 25 of 30 days on one habit.', metric: 'best30', target: 25 },
  { id: 'steady-30', suit: 'clubs', rank: 'Q', title: 'Perfect month', description: 'Keep all 30 of 30 days on one habit.', metric: 'best30', target: 30 },

  { id: 'vote-1', suit: 'hearts', rank: '2', title: 'First vote', description: 'Keep a day for a habit with an identity.', metric: 'topIdentity', target: 1 },
  { id: 'vote-10', suit: 'hearts', rank: '5', title: 'Showing up', description: 'Cast 10 votes for one identity.', metric: 'topIdentity', target: 10 },
  { id: 'vote-30', suit: 'hearts', rank: '9', title: 'Becoming', description: 'Cast 30 votes for one identity.', metric: 'topIdentity', target: 30 },
  { id: 'vote-100', suit: 'hearts', rank: 'K', title: 'This is who I am', description: 'Cast 100 votes for one identity.', metric: 'topIdentity', target: 100 },
  { id: 'vote-365', suit: 'hearts', rank: 'A', title: 'A year of being you', description: 'Cast 365 votes for one identity.', metric: 'topIdentity', target: 365 },
  { id: 'many-sides', suit: 'hearts', rank: 'Q', title: 'Many sides', description: 'Reach 10 votes for 3 different identities.', metric: 'identities10', target: 3 },

  { id: 'deck-3', suit: 'joker', rank: '★', title: 'Deck builder', description: 'Have 3 habits in your deck.', metric: 'deck', target: 3 },
  { id: 'full-house-1', suit: 'joker', rank: '★', title: 'Full house', description: 'Keep every habit in one day (2 or more habits).', metric: 'fullHouse', target: 1 },
  { id: 'full-house-10', suit: 'joker', rank: '★★', title: 'Ten full houses', description: 'Keep every habit on 10 days.', metric: 'fullHouse', target: 10 },
  { id: 'full-house-50', suit: 'joker', rank: '★★★', title: 'Royal flush', description: 'Keep every habit on 50 days.', metric: 'fullHouse', target: 50 },
];

export type AchievementHabit = { id: string; identity: string | null; startedOn: Day; archived?: boolean };

export type Metrics = Record<Metric, number>;

export type EarnedState = {
  achievement: Achievement;
  /** The metric's value today, capped at the target. */
  progress: number;
  unlockedOn: Day | null;
};

function emptyMetrics(): Metrics {
  return { kept: 0, ceiling: 0, floorSaves: 0, bounceBacks: 0, fullHouse: 0, topIdentity: 0, identities10: 0, best30: 0, deck: 0 };
}

/** Replays every day from the first habit's start to today and records when each achievement was first earned. */
export function evaluateAchievements(
  habits: readonly AchievementHabit[],
  checkInsByHabit: ReadonlyMap<string, CheckIns>,
  today: Day,
): { states: EarnedState[]; metrics: Metrics } {
  const metrics = emptyMetrics();
  const unlocked = new Map<string, Day>();
  const empty: CheckIns = new Map();
  const starts = habits.map((h) => h.startedOn).filter((d) => daysBetween(d, today) >= 0).sort();
  const votes = new Map<string, number>();
  const rolling = new Map<string, number>();

  if (starts.length) {
    for (let day = starts[0]; daysBetween(day, today) >= 0; day = addDays(day, 1)) {
      let active = 0;
      let activeKept = 0;
      for (const habit of habits) {
        if (daysBetween(habit.startedOn, day) < 0) continue;
        const checkIns = checkInsByHabit.get(habit.id) ?? empty;
        const level = checkIns.get(day);
        if (day === habit.startedOn) metrics.deck++;
        if (!habit.archived) {
          active++;
          if (level) activeKept++;
        }

        let inWindow = (rolling.get(habit.id) ?? 0) + (level ? 1 : 0);
        if (checkIns.has(addDays(day, -30)) && daysBetween(habit.startedOn, addDays(day, -30)) >= 0) inWindow--;
        rolling.set(habit.id, inWindow);
        if (daysBetween(habit.startedOn, day) >= 29) metrics.best30 = Math.max(metrics.best30, inWindow);

        if (!level) continue;
        metrics.kept++;
        if (level === 'ceiling') metrics.ceiling++;
        else metrics.floorSaves++;
        if (day !== habit.startedOn && !checkIns.has(addDays(day, -1))) metrics.bounceBacks++;
        if (habit.identity?.trim()) {
          const key = identityKey(habit.identity);
          const n = (votes.get(key) ?? 0) + 1;
          votes.set(key, n);
          metrics.topIdentity = Math.max(metrics.topIdentity, n);
          if (n === 10) metrics.identities10++;
        }
      }
      if (active >= 2 && activeKept === active) metrics.fullHouse++;

      for (const a of ACHIEVEMENTS) {
        if (!unlocked.has(a.id) && metrics[a.metric] >= a.target) unlocked.set(a.id, day);
      }
    }
  }

  const states = ACHIEVEMENTS.map((achievement) => ({
    achievement,
    progress: Math.min(metrics[achievement.metric], achievement.target),
    unlockedOn: unlocked.get(achievement.id) ?? null,
  }));
  return { states, metrics };
}

/** Achievements earned in `after` that weren't in `before`, for the celebration after a check-in. */
export function newlyUnlocked(before: readonly EarnedState[], after: readonly EarnedState[]): Achievement[] {
  const had = new Set(before.filter((s) => s.unlockedOn).map((s) => s.achievement.id));
  return after.filter((s) => s.unlockedOn && !had.has(s.achievement.id)).map((s) => s.achievement);
}

/** The locked achievements closest to being earned, as a fraction of their target. */
export function nextUp(states: readonly EarnedState[], count: number): EarnedState[] {
  return states
    .filter((s) => !s.unlockedOn)
    .sort((a, b) => b.progress / b.achievement.target - a.progress / a.achievement.target || a.achievement.target - b.achievement.target)
    .slice(0, count);
}
