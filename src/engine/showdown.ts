/**
 * What made this hand: the Showdown's credit for the Floor days, a comeback's saved card or the river
 * when they changed the kind of hand, the ↓ and ↑ stamps under the played cards, the hand naming
 * itself as the cards turn, a caption for each card, and the payout as pieces of one total.
 *
 * Stream 3 writes the bodies. Until then the Showdown and the Hands tab show what they show today.
 */

import type { Day } from './day';
import type { DayCard } from './deal';
import type { Week } from './game';
import { HANDS, type Hand, type HandKind } from './poker';

/** The mark at a played card's foot: ↓ for a Floor day, ↑ for a Ceiling day. */
export type Stamp = 'floor' | 'ceiling';

/** A dealt day with no Ceiling kept that wasn't saved and isn't the river. A Joker counts by its own day. */
export function isFloorDay(card: DayCard): boolean {
  return false;
}

/** How many of the hand's cards are Floor days, and the hand without them when that changed its kind. */
export type FloorCredit = { inHand: number; of: number; without: Hand | null; made: boolean };

export function floorCredit(week: Week): FloorCredit {
  return { inHand: 0, of: week.hand?.cards.length ?? 0, without: week.hand, made: false };
}

/** The saved card that changed the hand's kind, and the kind without it. */
export function comebackCredit(week: Week): { day: Day; lifted: HandKind; without: HandKind | null } | null {
  return null;
}

/** The river card that changed the hand's kind, and the kind without it. */
export function riverCredit(week: Week): { lifted: HandKind; without: HandKind | null } | null {
  return null;
}

/** The one credit line under the hand, or null. */
export function madeThisLine(week: Week): string | null {
  return null;
}

/** The stamp for each played day. */
export function stampsFor(week: Week): Readonly<Record<Day, Stamp>> {
  return {};
}

/** The best hand of the cards turned so far, and its name. */
export function handSoFar(cards: readonly DayCard[]): { kind: HandKind; title: string } | null {
  return null;
}

/** What a caption knows about a day beyond its card: whose habits were kept, a Ceiling, a late log. */
export type CaptionFacts = { names: (day: Day) => string[]; ceiling: (day: Day) => boolean; late: (day: Day) => boolean };

/** One line per played day, for reading a card by holding it. */
export function captionsFor(week: Week, facts: CaptionFacts): Readonly<Record<Day, string>> {
  return {};
}

/** The payout as pieces that sum to `weekTotal`: the hand, then Suited (only while it pays), then the call. */
export function payoutPieces(week: Week): { label: string; chips: number }[] {
  if (!week.hand) return [];
  const pieces = [{ label: HANDS[week.hand.kind].name, chips: week.chips }];
  if (week.suitedBonus > 0) pieces.push({ label: 'Suited', chips: week.suitedBonus });
  if (week.bonus > 0) pieces.push({ label: 'Call', chips: week.bonus });
  return pieces;
}
