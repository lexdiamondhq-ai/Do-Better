/**
 * What made this hand: the Showdown's credit for the Floor days, a comeback's saved card or the river
 * when they changed the kind of hand, the ↓ and ↑ stamps under the played cards, the hand naming
 * itself as the cards turn, a caption for each card, and the payout as pieces of one total.
 *
 * Credit is only ever credit. "Without them" is worked out from the same cards with some taken away, so
 * it can never beat the real hand: the river stays only while the days left still earn it, and it is
 * never dealt again. Nothing here is stored; it is all read off the week.
 */

import { cardName, rankName, type Rank } from './cards';
import { addDays, weekday, type Day } from './day';
import { RIVER_DAYS, type DayCard } from './deal';
import type { Week } from './game';
import { bestHand, handIndex, HANDS, type Hand, type HandKind, type PlayedCard } from './poker';

/** The mark at a played card's foot: ↓ for a Floor day, ↑ for a Ceiling day. */
export type Stamp = 'floor' | 'ceiling';

/** Monday to Sunday, the way a caption or a credit line names a day. */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const dayName = (day: Day) => WEEKDAYS[weekday(day)];

const saved = (card: DayCard) => card.kind === 'card' && card.rescued;

/** A dealt day with no Ceiling kept that wasn't saved and isn't the river. A Joker counts by its own day. */
export function isFloorDay(card: DayCard): boolean {
  if (card.kind === 'card' && (card.rescued || card.river)) return false;
  return card.ceilingSuits.length === 0;
}

/** The week's dealt days, in order, without the river. */
function dealtOf(week: Pick<Week, 'slots'>): DayCard[] {
  return week.slots.flatMap((s) => (s.card ? [s.card] : []));
}

/** The day card a played card came from: its day's card, or the river. */
function sourceOf(week: Pick<Week, 'slots' | 'river'>, played: PlayedCard): DayCard | null {
  if (played.river) return week.river.card;
  return week.slots.find((s) => s.day === played.day)?.card ?? null;
}

/** The hand got weaker in kind (or there is no hand at all). A higher kicker or a lower pair of the same kind is not news. */
function dropped(hand: Hand, without: Hand | null): boolean {
  return !without || handIndex(without.kind) < handIndex(hand.kind);
}

/** How many of the hand's cards are Floor days, and the hand without them when that changed its kind. */
export type FloorCredit = { inHand: number; of: number; without: Hand | null; made: boolean };

/**
 * The hand with every Floor day taken out. The river card stays only if the days still kept without them
 * are enough to earn it (saved days never count toward it), and it keeps its rank: it is never dealt again.
 * `made` when the kind of hand dropped, or nothing is left without them.
 */
export function floorCredit(week: Week): FloorCredit {
  const hand = week.hand;
  if (!hand) return { inHand: 0, of: 0, without: null, made: false };
  const dealt = dealtOf(week);
  const floors = new Set(dealt.filter(isFloorDay).map((c) => c.day));
  const inHand = hand.cards.filter((c) => !c.river && floors.has(c.day)).length;
  if (!floors.size) return { inHand, of: hand.cards.length, without: hand, made: false };
  const rest = dealt.filter((c) => !floors.has(c.day));
  const keptLeft = rest.filter((c) => !saved(c)).length;
  const river = week.river.card && keptLeft >= RIVER_DAYS ? [week.river.card] : [];
  const without = bestHand([...rest, ...river]);
  return { inHand, of: hand.cards.length, without, made: dropped(hand, without) };
}

/**
 * The saved card that changed the hand's kind, and the kind without it. `day` is the saved day itself, a
 * card in `hand.cards`; the comeback was the day after. Null when saved cards are only kickers.
 */
export function comebackCredit(week: Week): { day: Day; lifted: HandKind; without: HandKind | null } | null {
  const hand = week.hand;
  if (!hand) return null;
  const dealt = dealtOf(week);
  const savedDays = new Set(dealt.filter(saved).map((c) => c.day));
  const inHand = hand.cards.filter((c) => !c.river && savedDays.has(c.day));
  if (!inHand.length) return null;
  const river = week.river.card ? [week.river.card] : [];
  const handWithout = (gone: ReadonlySet<Day>) => bestHand([...dealt.filter((c) => !gone.has(c.day)), ...river]);
  // The saved card that changed it on its own, or, when only all of them together did, the first in the hand.
  const alone = inHand.find((c) => dropped(hand, handWithout(new Set([c.day]))));
  const without = handWithout(savedDays);
  if (!alone && !dropped(hand, without)) return null;
  const pick = alone ?? inHand[0];
  return { day: pick.day, lifted: hand.kind, without: (alone ? handWithout(new Set([alone.day])) : without)?.kind ?? null };
}

/** The river card that changed the hand's kind, and the kind without it. */
export function riverCredit(week: Week): { lifted: HandKind; without: HandKind | null } | null {
  const hand = week.hand;
  if (!hand || !week.river.card || !hand.cards.some((c) => c.river)) return null;
  const without = bestHand(dealtOf(week));
  return dropped(hand, without) ? { lifted: hand.kind, without: without?.kind ?? null } : null;
}

/**
 * The one credit line under the hand, or null. In order: a comeback that changed the kind, then Floor days
 * that changed it, then the river, and otherwise a count, said only when three or more cards are Floor days.
 */
export function madeThisLine(week: Week): string | null {
  const hand = week.hand;
  if (!hand || week.warmup) return null;
  const kind = HANDS[hand.kind].name;
  const back = comebackCredit(week);
  if (back) return `↺ ${dayName(addDays(back.day, 1))}’s comeback made this ${kind}.`;
  const floor = floorCredit(week);
  if (floor.made) return `Floor days made this ${kind}. Without them: ${floor.without ? floor.without.title : 'no hand'}.`;
  if (riverCredit(week)) return `The river made this ${kind}.`;
  if (floor.inHand >= 3) return floor.inHand === floor.of ? 'Every card here is a Floor day.' : `${floor.inHand} of these ${floor.of} cards are Floor days.`;
  return null;
}

/** The stamp for each played day: ↑ for a day with a Ceiling, ↓ for a Floor day, nothing for a saved day or the river. */
export function stampsFor(week: Week): Readonly<Record<Day, Stamp>> {
  const out: Record<Day, Stamp> = {};
  for (const played of week.hand?.cards ?? []) {
    if (played.river) continue;
    const card = sourceOf(week, played);
    if (!card || saved(card)) continue;
    out[played.day] = card.ceilingSuits.length ? 'ceiling' : 'floor';
  }
  return out;
}

/** The best hand of the cards turned so far, and its name. Null before the first card turns. */
export function handSoFar(cards: readonly DayCard[]): { kind: HandKind; title: string } | null {
  const hand = bestHand(cards);
  return hand && { kind: hand.kind, title: hand.title };
}

/** What a caption knows about a day beyond its card: whose habits were kept, a Ceiling, a late log. */
export type CaptionFacts = { names: (day: Day) => string[]; ceiling: (day: Day) => boolean; late: (day: Day) => boolean };

/** "Read", "Read and Walk", "Read, Walk and Stretch", "Read, Walk, Stretch and 2 more". */
function nameList(names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean.join('');
  if (clean.length > 4) return `${clean.slice(0, 3).join(', ')} and ${clean.length - 3} more`;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

/** "a Seven", "an Eight", "an Ace". */
function aRank(rank: Rank): string {
  const name = rankName(rank);
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * One line per played day, read by holding its card: what the card is, whose habits dealt it and on
 * which day, and whether it was a Ceiling day or a Floor day. A saved day says when it was saved, a Joker
 * what it plays as, and the river how it was earned.
 */
export function captionsFor(week: Week, facts: CaptionFacts): Readonly<Record<Day, string>> {
  const out: Record<Day, string> = {};
  for (const played of week.hand?.cards ?? []) {
    if (played.river) {
      out[played.day] = 'River card: earned by five kept days.';
      continue;
    }
    const card = sourceOf(week, played);
    if (!card) continue;
    const day = dayName(played.day);
    if (saved(card)) {
      out[played.day] = `${rankName(played.rank)}, no suit: ${day}, saved when you kept ${dayName(addDays(played.day, 1))}.`;
      continue;
    }
    const who = nameList(facts.names(played.day));
    const when = who ? `${who}, ${day}` : day;
    // Ceiling or Floor comes from the card itself, so the caption always agrees with the stamp under it.
    const level = card.ceilingSuits.length ? 'Ceiling day.' : 'Floor day.';
    if (card.kind === 'joker' || played.joker) {
      out[played.day] = `Joker: plays as ${aRank(played.rank)}. ${when}. ${level}`;
      continue;
    }
    const late = facts.late(played.day) ? ' Logged late.' : '';
    out[played.day] = `${cardName({ rank: played.rank, suit: played.suit })}: ${when}. ${level}${late}`;
  }
  return out;
}

/** The payout as pieces that sum to `weekTotal`: the hand, then Suited (only while it pays), then the call. */
export function payoutPieces(week: Week): { label: string; chips: number }[] {
  if (!week.hand) return [];
  const pieces = [{ label: HANDS[week.hand.kind].name, chips: week.chips }];
  if (week.suitedBonus > 0) pieces.push({ label: 'Suited', chips: week.suitedBonus });
  if (week.bonus > 0) pieces.push({ label: 'Call', chips: week.bonus });
  return pieces;
}

/** Chips with thousands marked, the way every screen writes them: "1,080". */
const chips = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The payout said as one sum: "Straight 100 + Call 100 = 200", or "Straight 100" with nothing to add. */
export function payoutLine(week: Week): string | null {
  const pieces = payoutPieces(week);
  if (!pieces.length) return null;
  const said = pieces.map((p) => `${p.label} ${chips(p.chips)}`).join(' + ');
  if (pieces.length === 1) return said;
  return `${said} = ${chips(pieces.reduce((sum, p) => sum + p.chips, 0))}`;
}

/**
 * The order to fan a hand in, as indexes into its cards: a run of five dealt high to low (a straight, a
 * straight flush, the wheel) fans low to high, so it reads the way it climbs; any other hand keeps its
 * groups first. `ranks` are the ranks the cards play as; a missing rank (a card still face down) keeps
 * the order as it is.
 */
export function fanOrder(ranks: readonly (Rank | null | undefined)[]): number[] {
  const same = ranks.map((_, i) => i);
  if (ranks.length !== 5 || ranks.some((r) => !r)) return same;
  const r = ranks as readonly Rank[];
  const wheel = [5, 4, 3, 2, 14].every((x, i) => r[i] === x);
  const run = r.every((x, i) => i === 0 || x === r[i - 1] - 1);
  return wheel || run ? [...same].reverse() : same;
}
