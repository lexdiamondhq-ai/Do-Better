/**
 * Poker hands from a week of day cards. The best five of the week's cards make the hand: up to seven days,
 * plus the river card at the Showdown. Hands rank the usual way, with two changes. There is no Flush: every
 * kept habit adds its suit to the day, so five days in one suit come too easily to be a hand. And Five of a
 * kind sits above a Royal flush; only a Joker, or a very lucky week, makes that.
 *
 * A day card can carry more than one suit (a day you read and walked is Clubs and Spades) and plays as
 * whichever suit makes the better hand. Saved days, the river card and Jokers have no suit: they count for
 * pairs and straights, never for a straight flush. Every day is dealt from a fresh deck, so the same card
 * can turn up twice in one week.
 *
 * Suited is a line beside the hand, not a hand: five days in the week that reached a Ceiling in the same
 * suit, five Ceiling days for one part of you.
 */

import { RANKS, SUIT_INFO, SUITS, rankName, rankPlural, type Rank, type Suit } from './cards';
import type { Day } from './day';
import type { DayCard } from './deal';

export type HandKind =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  /** Retired: no week is a Flush any more. Kept so calls made before the change still read. */
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush'
  | 'five-of-a-kind';

/** Every hand a week can make, weakest first. */
export const HAND_LADDER: readonly HandKind[] = [
  'high-card',
  'pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
  'royal-flush',
  'five-of-a-kind',
];

/** The same ladder, under its older name. */
export const HAND_KINDS: readonly HandKind[] = HAND_LADDER;

/** Chips a Suited week adds beside its hand. Suited is shown as a line about the week and pays nothing (see economy.test.ts). */
export const SUITED_BONUS: number = 0;

/** Ceiling days in one suit that make a week Suited. */
export const SUITED_DAYS = 5;

/** How a Joker is described everywhere a player reads about one: the tips, the receipts, the Court moment and the rules. */
export const JOKER_LINE = 'It has no suit and plays as any rank.';

export type HandInfo = {
  name: string;
  /** Chips the hand pays at the Showdown. */
  chips: number;
  /** How to make it, in habit terms. */
  how: string;
  /** Hidden in the Hall of Hands until it has been made once. */
  secret: boolean;
};

export const HANDS: Record<HandKind, HandInfo> = {
  'high-card': { name: 'High card', chips: 10, how: 'Any week with a dealt day. Your best card plays.', secret: false },
  pair: { name: 'Pair', chips: 30, how: 'Two days dealt the same rank.', secret: false },
  'two-pair': { name: 'Two pair', chips: 50, how: 'Two different pairs in one week.', secret: false },
  'three-of-a-kind': { name: 'Three of a kind', chips: 70, how: 'Three days dealt the same rank.', secret: false },
  straight: { name: 'Straight', chips: 100, how: 'Five ranks in a row, like 6 7 8 9 10. Every day you keep something is another card to build with.', secret: false },
  'full-house': { name: 'Full house', chips: 140, how: 'Three of a kind and a pair. Days with every habit kept deal from a smaller, higher deck, so they match more often.', secret: false },
  'four-of-a-kind': { name: 'Four of a kind', chips: 250, how: 'Four days dealt the same rank.', secret: false },
  'straight-flush': { name: 'Straight flush', chips: 350, how: 'Five ranks in a row, all in one suit. A day counts in the suit of every habit you kept.', secret: false },
  'royal-flush': { name: 'Royal flush', chips: 500, how: '10, J, Q, K and A, all in one suit. Keep one part of you going through your best days.', secret: false },
  'five-of-a-kind': { name: 'Five of a kind', chips: 800, how: 'Five days dealt the same rank, or four of a kind and a Joker from a new face card in the Court. The rarest hand there is.', secret: true },
  flush: { name: 'Suited', chips: 30, how: 'Five Ceiling days in one suit: one part of you, at its best, all week.', secret: false },
};

/** Where a retired kind sits on the ladder, for comparing old calls: a Flush sat above a Straight. */
const RETIRED_INDEX: Partial<Record<HandKind, number>> = { flush: 4.5 };

export function handIndex(kind: HandKind): number {
  return RETIRED_INDEX[kind] ?? HAND_LADDER.indexOf(kind);
}

/** `a` is at least as strong a kind of hand as `b`. */
export function atLeast(a: HandKind, b: HandKind): boolean {
  return handIndex(a) >= handIndex(b);
}

/** A card as it plays in a hand: the day it came from, and the rank and suit it counts as. */
export type PlayedCard = {
  rank: Rank;
  /** Null for a saved day, the river card or a Joker. */
  suit: Suit | null;
  day: Day;
  joker: boolean;
  /** The river card, whose `day` is the Monday after its week. */
  river?: boolean;
};

export type Suited = { suit: Suit; days: number };

export type Hand = {
  kind: HandKind;
  /** The cards that make the hand, in the order to show them. Up to five. */
  cards: PlayedCard[];
  /** The ranks that break ties, most important first. */
  ranks: Rank[];
  /** The suit of a straight flush or royal flush. */
  suit: Suit | null;
  /** Five or more Ceiling days in one suit, or null. */
  suited: Suited | null;
  /** Higher beats lower, across every kind of hand. */
  score: number;
  /** "Full house, Kings over Sevens". */
  title: string;
};

type Option = { day: Day; rank: Rank; suits: readonly Suit[]; joker: boolean; river: boolean };

const play = (o: Option, suit: Suit | null): PlayedCard => ({ day: o.day, rank: o.rank, suit, joker: o.joker, ...(o.river ? { river: true } : {}) });
const lead = (o: Option) => play(o, o.suits[0] ?? null);

/** The top card of the best five-card run in `ranks`, with the Ace also playing low in 5-4-3-2-A, or 0. */
export function straightHigh(ranks: ReadonlySet<number>): Rank | 0 {
  for (let hi = 14; hi >= 6; hi--) {
    let run = true;
    for (let r = hi; r > hi - 5 && run; r--) run = ranks.has(r);
    if (run) return hi as Rank;
  }
  return [14, 2, 3, 4, 5].every((r) => ranks.has(r)) ? 5 : 0;
}

function runOf(hi: Rank): Rank[] {
  return (hi === 5 ? [5, 4, 3, 2, 14] : [hi, hi - 1, hi - 2, hi - 3, hi - 4]) as Rank[];
}

/** One card per rank of the run, preferring a real day over a Joker standing in for the same rank. */
function pickRun(options: readonly Option[], hi: Rank, suit: Suit | null): PlayedCard[] {
  return runOf(hi).map((rank) => {
    const fits = options.filter((o) => o.rank === rank && (!suit || o.suits.includes(suit)));
    const o = fits.find((x) => !x.joker && !x.river) ?? fits.find((x) => !x.joker) ?? fits[0];
    return suit ? play(o, suit) : lead(o);
  });
}

export function scoreOf(kind: HandKind, ranks: readonly Rank[]): number {
  let score = handIndex(kind);
  for (let i = 0; i < 5; i++) score = score * 15 + (ranks[i] ?? 0);
  return score;
}

export function handTitle(kind: HandKind, ranks: readonly Rank[], suit: Suit | null): string {
  const [a, b] = ranks;
  const suitName = suit ? SUIT_INFO[suit].name : '';
  switch (kind) {
    case 'high-card':
      return `${rankName(a)} high`;
    case 'pair':
      return `Pair of ${rankPlural(a)}`;
    case 'two-pair':
      return `Two pair, ${rankPlural(a)} and ${rankPlural(b)}`;
    case 'three-of-a-kind':
      return `Three ${rankPlural(a)}`;
    case 'straight':
      return `Straight to the ${rankName(a)}`;
    case 'full-house':
      return `Full house, ${rankPlural(a)} over ${rankPlural(b)}`;
    case 'four-of-a-kind':
      return `Four ${rankPlural(a)}`;
    case 'straight-flush':
      return `Straight flush in ${suitName}`;
    case 'royal-flush':
      return `Royal flush in ${suitName}`;
    case 'five-of-a-kind':
      return `Five ${rankPlural(a)}`;
    default:
      // The retired Flush, which only an old call still names.
      return HANDS[kind].name;
  }
}

/** The hand in a sentence: "a Pair of Jacks", "Two pair, Kings and Sevens", "Ace high". */
export function handPhrase(hand: Pick<Hand, 'kind' | 'title'>): string {
  const article = hand.kind === 'pair' || hand.kind === 'straight' || hand.kind === 'full-house' || hand.kind === 'straight-flush' || hand.kind === 'royal-flush';
  return article ? `a ${hand.title}` : hand.title;
}

/** Best-first, with a real day before a Joker or the river at equal rank, so those only show when needed. */
function sortOptions(options: readonly Option[]): Option[] {
  return [...options].sort((a, b) => b.rank - a.rank || Number(a.joker) - Number(b.joker) || Number(a.river) - Number(b.river));
}

function evaluate(options: readonly Option[]): Hand | null {
  if (!options.length) return null;
  const sorted = sortOptions(options);
  const groups = new Map<Rank, Option[]>();
  for (const o of sorted) {
    const g = groups.get(o.rank);
    if (g) g.push(o);
    else groups.set(o.rank, [o]);
  }
  // Map keeps insertion order, and `sorted` is highest first, so these come out highest first too.
  const ranksWith = (n: number) => [...groups.keys()].filter((r) => (groups.get(r)?.length ?? 0) >= n);
  const of = (rank: Rank, n: number) => (groups.get(rank) ?? []).slice(0, n);
  const kickers = (skip: readonly Rank[], n: number) => sorted.filter((o) => !skip.includes(o.rank)).slice(0, n);
  const make = (kind: HandKind, cards: PlayedCard[], ranks: Rank[], suit: Suit | null = null): Hand => ({
    kind,
    cards,
    ranks,
    suit,
    suited: null,
    score: scoreOf(kind, ranks),
    title: handTitle(kind, ranks, suit),
  });

  const [five] = ranksWith(5);
  if (five) return make('five-of-a-kind', of(five, 5).map(lead), [five]);

  // On a tie between suits, the one that led more of the week's days wins: the part of you that carried the week.
  const leads = (suit: Suit) => options.filter((o) => o.suits[0] === suit).length;
  let run: { hi: Rank; suit: Suit } | null = null;
  for (const suit of SUITS) {
    const inSuit = options.filter((o) => o.suits.includes(suit));
    if (inSuit.length < 5) continue;
    const hi = straightHigh(new Set(inSuit.map((o) => o.rank)));
    if (hi && (!run || hi > run.hi || (hi === run.hi && leads(suit) > leads(run.suit)))) run = { hi, suit };
  }
  if (run) return make(run.hi === 14 ? 'royal-flush' : 'straight-flush', pickRun(options, run.hi, run.suit), [run.hi], run.suit);

  const [quad] = ranksWith(4);
  if (quad) {
    const k = kickers([quad], 1);
    return make('four-of-a-kind', [...of(quad, 4), ...k].map(lead), [quad, ...k.map((o) => o.rank)]);
  }

  const [trips] = ranksWith(3);
  const pairs = ranksWith(2);
  const over = pairs.find((r) => r !== trips);
  if (trips && over) return make('full-house', [...of(trips, 3), ...of(over, 2)].map(lead), [trips, over]);

  const hi = straightHigh(new Set(options.map((o) => o.rank)));
  if (hi) return make('straight', pickRun(options, hi, null), [hi]);

  if (trips) {
    const k = kickers([trips], 2);
    return make('three-of-a-kind', [...of(trips, 3), ...k].map(lead), [trips, ...k.map((o) => o.rank)]);
  }
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    const k = kickers([a, b], 1);
    return make('two-pair', [...of(a, 2), ...of(b, 2), ...k].map(lead), [a, b, ...k.map((o) => o.rank)]);
  }
  if (pairs.length === 1) {
    const [a] = pairs;
    const k = kickers([a], 3);
    return make('pair', [...of(a, 2), ...k].map(lead), [a, ...k.map((o) => o.rank)]);
  }
  const top = sorted.slice(0, 5);
  return make('high-card', top.map(lead), top.map((o) => o.rank));
}

/** Every Joker plays as whichever rank helps most. A Joker has no suit, so it never completes a straight flush. */
function withJokers(real: Option[], jokers: readonly DayCard[]): Hand | null {
  if (!jokers.length) return evaluate(real);
  const [joker, ...rest] = jokers;
  let best: Hand | null = null;
  for (const rank of RANKS) {
    const hand = withJokers([...real, { day: joker.day, rank, suits: [], joker: true, river: false }], rest);
    if (hand && (!best || hand.score > best.score)) best = hand;
  }
  return best;
}

function split(cards: readonly DayCard[]): { real: Option[]; jokers: DayCard[] } {
  const real: Option[] = [];
  const jokers: DayCard[] = [];
  for (const c of cards) {
    if (c.kind === 'card') real.push({ day: c.day, rank: c.rank, suits: c.suits, joker: false, river: !!c.river });
    else jokers.push(c);
  }
  return { real, jokers };
}

/**
 * Suited: the suit with five or more days that reached a Ceiling in it. A Joker's day counts by its own
 * Ceilings; saved days and the river never count. Ties go to deck order.
 */
export function suitedOf(cards: readonly DayCard[]): Suited | null {
  let best: Suited | null = null;
  for (const suit of SUITS) {
    const days = cards.filter((c) => !(c.kind === 'card' && (c.rescued || c.river)) && c.ceilingSuits.includes(suit)).length;
    if (days >= SUITED_DAYS && (!best || days > best.days)) best = { suit, days };
  }
  return best;
}

/** The best hand in a set of day cards, with each Joker playing as whatever rank helps most. Null with no cards. */
export function bestHand(cards: readonly DayCard[]): Hand | null {
  const { real, jokers } = split(cards);
  const hand = withJokers(real, jokers);
  return hand && { ...hand, suited: suitedOf(cards) };
}

/** The kinds a set of joker-free cards holds, whether or not the hand ends on them. */
function heldBy(options: readonly Option[]): Set<HandKind> {
  const held = new Set<HandKind>();
  if (!options.length) return held;
  held.add('high-card');
  const counts = [...options.reduce((m, o) => m.set(o.rank, (m.get(o.rank) ?? 0) + 1), new Map<Rank, number>()).values()].sort((a, b) => b - a);
  const [top = 0, second = 0] = counts;
  if (top >= 2) held.add('pair');
  if (second >= 2) held.add('two-pair');
  if (top >= 3) held.add('three-of-a-kind');
  if (top >= 3 && second >= 2) held.add('full-house');
  if (top >= 4) held.add('four-of-a-kind');
  if (top >= 5) held.add('five-of-a-kind');
  if (straightHigh(new Set(options.map((o) => o.rank)))) held.add('straight');
  for (const suit of SUITS) {
    const inSuit = new Set<number>(options.filter((o) => o.suits.includes(suit)).map((o) => o.rank));
    const hi = straightHigh(inSuit);
    if (hi) held.add('straight-flush');
    if ([10, 11, 12, 13, 14].every((r) => inSuit.has(r))) held.add('royal-flush');
  }
  return held;
}

/**
 * Every kind of hand a week's cards hold, not only the one it ends on: a Full house week also holds a Pair,
 * Two pair and Three of a kind. A Royal flush is also a Straight flush. Jokers play as any rank.
 */
export function handsIn(cards: readonly DayCard[]): Set<HandKind> {
  const { real, jokers } = split(cards);
  const out = new Set<HandKind>();
  const walk = (opts: Option[], left: readonly DayCard[]) => {
    if (!left.length) {
      for (const k of heldBy(opts)) out.add(k);
      return;
    }
    const [joker, ...rest] = left;
    for (const rank of RANKS) walk([...opts, { day: joker.day, rank, suits: [], joker: true, river: false }], rest);
  };
  walk(real, jokers);
  return out;
}

/**
 * Whether a week's cards make a call: the called hand or any better one. A Flush call, from before Flush
 * left the ladder, is made when the week is Suited.
 */
export function makesCall(hand: Hand | null, call: HandKind): boolean {
  if (!hand) return false;
  if (call === 'flush') return !!hand.suited;
  return atLeast(hand.kind, call);
}
