import type { CourtHabit } from '@/engine/court';
import { localDay, weekStart, type Day } from '@/engine/day';
import type { DealHabit } from '@/engine/deal';
import { playGame, playPastWeeks, type Game, type GameInput, type Week } from '@/engine/game';
import { indexCheckIns } from '@/engine/kept';
import type { HandKind } from '@/engine/poker';

import type { Loaded } from './backend';
import type { Habit } from './types';

/** Habits as the deal sees them. An archived habit leaves the deck on the local day it was archived. */
export function dealHabits(habits: readonly Habit[], timezone: string): DealHabit[] {
  return habits.map((h) => ({ id: h.id, suit: h.suit, startedOn: h.startedOn, archivedOn: h.archivedAt ? localDay(new Date(h.archivedAt), timezone) : null }));
}

export function courtHabits(habits: readonly Habit[]): CourtHabit[] {
  return habits.map((h) => ({ id: h.id, suit: h.suit, identity: h.identity }));
}

/** Everything the game engine needs from the loaded rows. */
export function gameInput(data: Loaded, today: Day, seed: string): GameInput {
  return {
    seed,
    today,
    habits: dealHabits(data.habits, data.profile.timezone),
    checkIns: indexCheckIns(data.days),
    calls: new Map<Day, HandKind>(data.calls.map((c) => [c.weekStart, c.hand])),
  };
}

// Finished weeks only change when past check-ins, habits or calls do, and check-ins are only ever
// written for today, so the deal of every finished week is kept from one render to the next.
let past: { key: string; weeks: Week[] } | null = null;

function pastKey(data: Loaded, input: GameInput): string {
  const thisWeek = weekStart(input.today);
  const habits = input.habits.map((h) => `${h.id}:${h.suit}:${h.startedOn}:${h.archivedOn}`).join(',');
  const days = data.days.filter((d) => d.day < thisWeek).length;
  const calls = data.calls
    .filter((c) => c.weekStart < thisWeek)
    .map((c) => `${c.weekStart}:${c.hand}`)
    .sort()
    .join(',');
  return `${input.seed}|${thisWeek}|${habits}|${days}|${calls}`;
}

/** The whole game, reusing finished weeks when nothing behind them changed. */
export function playGameFor(data: Loaded, today: Day, seed: string): Game {
  const input = gameInput(data, today, seed);
  const key = pastKey(data, input);
  if (past?.key !== key) past = { key, weeks: playPastWeeks(input) };
  return playGame(input, past.weeks);
}
