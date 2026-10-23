/**
 * Outs: the ranks that would lift the week's hand. Only ranks a fully kept day can deal (5 and up) are
 * named, never which day deals them, never a percentage, and the live river is never worked out early.
 *
 * Stream 5 writes the bodies. Until then the hand names no outs and every screen says what it says today.
 */

import type { Rank } from './cards';
import type { Day } from './day';
import type { DayCard } from './deal';
import type { Week } from './game';
import { makesCall, type HandKind } from './poker';

/** Ranks that would make a hand of `makes`, best kind first. */
export type OutGroup = { makes: HandKind; ranks: Rank[] };

/** Every rank from `minRank` (default 5) up that would lift the hand these cards make, grouped by the hand it makes. */
export function outs(cards: readonly DayCard[], opts?: { minRank?: Rank }): OutGroup[] {
  return [];
}

/** Draws still to come this week: days left (today counts while it has no card) and whether the river is still to come. */
export function drawsLeft(week: Week, today: Day): { days: number; river: boolean } {
  return { days: 0, river: false };
}

/** How far the week is from its call: 0 cards when made, 1 or 2 when that many outs would make it, else null. */
export type CallGap = { made: boolean; cards: 0 | 1 | 2 | null; ranks: Rank[]; days: number };

export function callGap(week: Week, call: HandKind, today: Day): CallGap {
  const made = makesCall(week.hand, call);
  return { made, cards: made ? 0 : null, ranks: [], days: 0 };
}

/** The river's outs, once the river is earned or one kept day away. Never reads the live river's card. */
export function riverOuts(week: Week): { band: Rank; groups: OutGroup[]; stands: boolean; ifToday: boolean } | null {
  return null;
}

/** The outs in words: "Drawing to a Straight: any Nine makes it." Null when there is nothing worth saying. */
export function outsLine(groups: readonly OutGroup[], o?: { call?: HandKind | null }): string | null {
  return null;
}

/** Whether the week has enough cards for its outs to be worth saying. */
export function outsWorthSaying(week: Week): boolean {
  return false;
}
