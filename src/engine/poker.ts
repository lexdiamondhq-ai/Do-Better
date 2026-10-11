/**
 * Poker hands from a week of day cards. The best five of up to seven cards make the hand, ranked the
 * usual way, with Five of a kind above a Royal flush. Only a Joker, or a very lucky week, makes that.
 *
 * Two things differ from a casino. A day card can carry more than one suit (a day you read and walked
 * is Clubs and Spades), and it plays as whichever suit makes the better hand. And every day is dealt
 * from a fresh deck, so the same card can turn up twice in one week.
 */

import { RANKS, SUIT_INFO, SUITS, rankName, rankPlural, type Card, type Rank, type Suit } from './cards';
import type { Day } from './day';
import type { DayCard } from './deal';

export type HandKind =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush'
  | 'five-of-a-kind';

/** Weakest first. */
export const HAND_KINDS: readonly HandKind[] = [
  'high-card',
  'pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
  'royal-flush',
  'five-of-a-kind',
];

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
  'high-card': { name: 'High card', chips: 10, how: 'Any week with a kept day. Your best card plays.', secret: false },
  pair: { name: 'Pair', chips: 20, how: 'Two days dealt the same rank.', secret: false },
  'two-pair': { name: 'Two pair', chips: 30, how: 'Two different pairs in one week.', secret: false },
  'three-of-a-kind': { name: 'Three of a kind', chips: 40, how: 'Three days dealt the same rank.', secret: false },
  straight: { name: 'Straight', chips: 60, how: 'Five ranks in a row, like 6 7 8 9 10. Every kept day is another card to build with.', secret: false },
  flush: { name: 'Flush', chips: 80, how: 'Five days in one suit. Keep one part of you going all week.', secret: false },
  'full-house': { name: 'Full house', chips: 120, how: 'Three of a kind and a pair. Ceiling days deal from a smaller, higher deck, so they match more often.', secret: false },
  'four-of-a-kind': { name: 'Four of a kind', chips: 200, how: 'Four days dealt the same rank.', secret: false },
  'straight-flush': { name: 'Straight flush', chips: 300, how: 'Five ranks in a row, all in one suit.', secret: false },
  'royal-flush': { name: 'Royal flush', chips: 500, how: '10, J, Q, K and A in one suit. Only great days deal that high.', secret: false },
  'five-of-a-kind': { name: 'Five of a kind', chips: 800, how: 'Four of a kind and a Joker, which you earn with a new face card in the Court. The rarest hand there is.', secret: true },
};

export function handIndex(kind: HandKind): number {
  return HAND_KINDS.indexOf(kind);
}

/** `a` is at least as strong a kind of hand as `b`. */
export function atLeast(a: HandKind, b: HandKind): boolean {
  return handIndex(a) >= handIndex(b);
}

/** A card as it plays in a hand: the day it came from, and the rank and suit it counts as. */
export type PlayedCard = Card & { day: Day; joker: boolean };

export type Hand = {
  kind: HandKind;
  /** The cards that make the hand, in the order to show them. Up to five. */
  cards: PlayedCard[];
  /** The ranks that break ties, most important first. */
  ranks: Rank[];
  /** The suit of a flush, straight flush or royal flush. */
  suit: Suit | null;
  /** Higher beats lower, across every kind of hand. */
  score: number;
  /** "Full house, Kings over Sevens". */
  title: string;
};

type Option = { day: Day; rank: Rank; suits: readonly Suit[]; joker: boolean };

const play = (o: Option, suit: Suit): PlayedCard => ({ day: o.day, rank: o.rank, suit, joker: o.joker });
const lead = (o: Option) => play(o, o.suits[0]);

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

/** One card per rank of the run, preferring real cards over a Joker standing in for the same one. */
function pickRun(options: readonly Option[], hi: Rank, suit: Suit | null): PlayedCard[] {
  return runOf(hi).map((rank) => {
    const fits = options.filter((o) => o.rank === rank && (!suit || o.suits.includes(suit)));
    const o = fits.find((x) => !x.joker) ?? fits[0];
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
    case 'flush':
      return `Flush in ${suitName}`;
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
  }
}

/** Compares two lists of ranks from the top, like comparing two flushes. */
function compareRanks(a: readonly Option[], b: readonly Option[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i]?.rank ?? 0) - (b[i]?.rank ?? 0);
    if (d) return d;
  }
  return 0;
}

function evaluate(options: readonly Option[]): Hand | null {
  if (!options.length) return null;
  // Highest first; at equal rank a real card comes before a Joker, so the Joker only shows when it is needed.
  const sorted = [...options].sort((a, b) => b.rank - a.rank || Number(a.joker) - Number(b.joker));
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
    score: scoreOf(kind, ranks),
    title: handTitle(kind, ranks, suit),
  });

  // On a tie between suits, the one that led more of the week's days wins: the part of you that carried the week.
  const leads = (suit: Suit) => options.filter((o) => o.suits[0] === suit).length;

  const [five] = ranksWith(5);
  if (five) return make('five-of-a-kind', of(five, 5).map(lead), [five]);

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

  let flush: { suit: Suit; cards: Option[] } | null = null;
  for (const suit of SUITS) {
    const top = sorted.filter((o) => o.suits.includes(suit)).slice(0, 5);
    if (top.length < 5) continue;
    const order = flush ? compareRanks(top, flush.cards) || leads(suit) - leads(flush.suit) : 1;
    if (order > 0) flush = { suit, cards: top };
  }
  if (flush) {
    const { suit, cards } = flush;
    return make('flush', cards.map((o) => play(o, suit)), cards.map((o) => o.rank), suit);
  }

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

function withJokers(real: Option[], jokers: readonly DayCard[]): Hand | null {
  if (!jokers.length) return evaluate(real);
  const [joker, ...rest] = jokers;
  // A Joker can only help a flush in a suit the real cards already have, so other suits are never worth trying.
  const present = SUITS.filter((s) => real.some((o) => o.suits.includes(s)));
  const suits = present.length ? present : SUITS.slice(0, 1);
  let best: Hand | null = null;
  for (const rank of RANKS) {
    for (const suit of suits) {
      const hand = withJokers([...real, { day: joker.day, rank, suits: [suit], joker: true }], rest);
      if (hand && (!best || hand.score > best.score)) best = hand;
    }
  }
  return best;
}

/** The best hand in a set of day cards, with each Joker playing as whatever card helps most. Null with no cards. */
export function bestHand(cards: readonly DayCard[]): Hand | null {
  const real: Option[] = [];
  const jokers: DayCard[] = [];
  for (const c of cards) {
    if (c.kind === 'card') real.push({ day: c.day, rank: c.rank, suits: c.suits, joker: false });
    else jokers.push(c);
  }
  return withJokers(real, jokers);
}
