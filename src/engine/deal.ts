/**
 * The deal. Every day you keep at least one habit is dealt one playing card.
 *
 * The rank depends on how the day went. Keep some of your habits and the card comes from 2 to Queen; keep
 * all of them and it comes from the full deck; add a Ceiling and it is 9 or better; reach the Ceiling on
 * every habit and it is 10 or better. Where in that range it lands is the luck of the deal, fixed per
 * person and day by a seeded hash, so the same history always deals the same cards on every device. Each
 * habit you keep can only raise the day's card, never lower it, and a better day keeps the card it already
 * had whenever that card fits the better range, so doing more rarely breaks a pair you were holding.
 *
 * The suits are the suits of the habits you kept, so a day you read and walked counts as Clubs and Spades.
 *
 * A blank day (habits running, nothing kept) deals nothing, unless you come back the next day: then it is
 * rescued with a low card, 2 to Queen, in one suit: the leading suit of the day you came back. Miss twice
 * in a row and the first day stays empty. That is the comeback as a rule of the game. A rescued card is
 * exactly what keeping one habit in that suit would have dealt, and keeping it would also have counted in
 * the Court, so skipping a day never pays. Sunday can't be rescued, because the hand is settled at midnight.
 *
 * The day you earn a face card in the Court, that day's card is dealt as a Joker, which plays as any card.
 * One Joker a week at most, so a burst of face cards in the same week can't stack them.
 */

import type { Card, Rank, Suit } from './cards';
import { weekDays, type Day } from './day';
import type { CheckIns, Level } from './kept';

export type DealHabit = {
  id: string;
  suit: Suit;
  startedOn: Day;
  /** The local day the habit was archived, or null while it's in the deck. */
  archivedOn: Day | null;
};

export type Tier = 'showed-up' | 'kept-all' | 'reached-up' | 'perfect';

export type TierInfo = { lo: Rank; hi: Rank; label: string; about: string };

/** Ordered from weakest to strongest. Each band starts at or above the one before, which keeps upgrades monotonic. */
export const TIERS: Record<Tier, TierInfo> = {
  'showed-up': { lo: 2, hi: 12, label: 'Showed up', about: 'Some of your habits kept. Deals a Queen or lower.' },
  'kept-all': { lo: 2, hi: 14, label: 'Kept everything', about: 'Every habit kept. Deals from the full deck.' },
  'reached-up': { lo: 9, hi: 14, label: 'Reached up', about: 'Everything kept, with a Ceiling. Deals 9 or better.' },
  perfect: { lo: 10, hi: 14, label: 'Perfect day', about: 'Every habit at the Ceiling. Deals 10 or better.' },
};

export const TIER_ORDER: readonly Tier[] = ['showed-up', 'kept-all', 'reached-up', 'perfect'];

/** A stable number in [0, 1) for a string: FNV-1a, then a murmur-style finalizer to spread nearby seeds apart. */
export function unit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
}

/**
 * The day's rank in a band. Every day has one card from the full deck; a band keeps it when it fits and
 * otherwise deals again inside the band with a second hash (`again`). Each band stays evenly spread.
 */
export function rankFor(tier: Tier, u: number, again = u): Rank {
  const { lo, hi } = TIERS[tier];
  const base = Math.min(14, 2 + Math.floor(u * 13));
  if (base >= lo && base <= hi) return base as Rank;
  return Math.min(hi, lo + Math.floor(again * (hi - lo + 1))) as Rank;
}

export type DayCard =
  | { kind: 'card'; day: Day; rank: Rank; suits: Suit[]; tier: Tier; rescued: boolean }
  | { kind: 'joker'; day: Day; suits: Suit[] };

/** One card face for display: a Joker, or the rank with the day's leading suit. */
export function faceOf(card: DayCard): Card | 'joker' {
  return card.kind === 'joker' ? 'joker' : { rank: card.rank, suit: card.suits[0] };
}

type DayTally = {
  /** Habits that count toward "everything": running before today, or kept today. */
  counted: number;
  kept: number;
  ceilings: number;
  /** Habits started that day and kept at the Floor. They join "everything" only by being kept. */
  freshFloors: number;
  /** Suits of the kept habits, strongest first (a Ceiling outweighs a Floor), then in deck order. */
  suits: Suit[];
  /** At least one habit was running before this day, so a day with nothing kept is a real blank. */
  running: boolean;
};

const EMPTY: CheckIns = new Map();

function available(h: DealHabit, day: Day): boolean {
  return h.startedOn <= day && (h.archivedOn === null || day < h.archivedOn);
}

/**
 * How a day went across the deck. A habit started that day only counts if it was kept, so adding a new
 * card never lowers today's card. An archived habit stops counting from the day it left the deck.
 */
export function tallyDay(day: Day, habits: readonly DealHabit[], checkIns: ReadonlyMap<string, CheckIns>, extra?: { habitId: string; level: Level }): DayTally {
  let counted = 0;
  let kept = 0;
  let ceilings = 0;
  let freshFloors = 0;
  let running = false;
  const weight = new Map<Suit, number>();
  const order: Suit[] = [];
  for (const h of habits) {
    const level = extra?.habitId === h.id ? extra.level : (checkIns.get(h.id) ?? EMPTY).get(day);
    const before = available(h, day) && h.startedOn < day;
    if (before) running = true;
    if (!level && !before) continue;
    counted++;
    if (!level) continue;
    kept++;
    if (level === 'ceiling') ceilings++;
    else if (!before) freshFloors++;
    if (!weight.has(h.suit)) order.push(h.suit);
    weight.set(h.suit, (weight.get(h.suit) ?? 0) + (level === 'ceiling' ? 2 : 1));
  }
  const suits = order.map((s, i) => ({ s, i })).sort((a, b) => (weight.get(b.s) ?? 0) - (weight.get(a.s) ?? 0) || a.i - b.i).map((x) => x.s);
  return { counted, kept, ceilings, freshFloors, suits, running };
}

function tierFrom(counted: number, kept: number, ceilings: number): Tier | null {
  if (kept === 0) return null;
  if (kept < counted) return 'showed-up';
  if (ceilings === kept) return 'perfect';
  if (ceilings > 0) return 'reached-up';
  return 'kept-all';
}

/**
 * The tier a day deals from. A habit started that day and kept at its Floor is judged both ways and the
 * better tier wins, so keeping a brand-new card can't pull a perfect day down to "reached up".
 */
export function tierOf(t: Pick<DayTally, 'counted' | 'kept' | 'ceilings'> & { freshFloors?: number }): Tier | null {
  const tier = tierFrom(t.counted, t.kept, t.ceilings);
  const fresh = t.freshFloors ?? 0;
  if (!fresh) return tier;
  const without = tierFrom(t.counted - fresh, t.kept - fresh, t.ceilings);
  const rank = (x: Tier | null) => (x ? TIER_ORDER.indexOf(x) : -1);
  return rank(without) > rank(tier) ? without : tier;
}

/** A past day with habits running and nothing kept. Days before your first habit are never blank. */
export function isBlank(day: Day, habits: readonly DealHabit[], checkIns: ReadonlyMap<string, CheckIns>): boolean {
  const t = tallyDay(day, habits, checkIns);
  return t.running && t.kept === 0;
}

/** The day's card before the Joker rule, or null when nothing was kept. */
export function dealDay(day: Day, habits: readonly DealHabit[], checkIns: ReadonlyMap<string, CheckIns>, seed: string, extra?: { habitId: string; level: Level }): DayCard | null {
  const t = tallyDay(day, habits, checkIns, extra);
  const tier = tierOf(t);
  if (!tier) return null;
  return { kind: 'card', day, rank: rankFor(tier, unit(`${seed}:${day}`), unit(`${seed}:${day}:again`)), suits: t.suits, tier, rescued: false };
}

/** The low card a blank day gets when you come back the next day, in the leading suit you came back with. */
export function rescueCard(day: Day, seed: string, suit: Suit): DayCard {
  return { kind: 'card', day, rank: rankFor('showed-up', unit(`${seed}:${day}`), unit(`${seed}:${day}:again`)), suits: [suit], tier: 'showed-up', rescued: true };
}

export type SlotState = 'before' | 'blank' | 'open' | 'future' | 'dealt';

export type Slot = { day: Day; state: SlotState; card: DayCard | null; isToday: boolean };

/**
 * The seven days of a week as cards. Today stays live (its card can still climb) until midnight.
 * `jokerDays` are the days a face card was earned. `extra` deals a hypothetical check-in for today,
 * for previews like "what would this swipe do".
 */
export function dealWeek(
  start: Day,
  today: Day,
  habits: readonly DealHabit[],
  checkIns: ReadonlyMap<string, CheckIns>,
  seed: string,
  jokerDays: ReadonlySet<Day> = new Set(),
  extra?: { habitId: string; level: Level },
): Slot[] {
  let joker = false;
  const slots = weekDays(start).map<Slot>((day) => {
    const isToday = day === today;
    if (day > today) return { day, state: 'future', card: null, isToday };
    const card = dealDay(day, habits, checkIns, seed, isToday ? extra : undefined);
    if (card && !joker && jokerDays.has(day)) {
      joker = true;
      return { day, state: 'dealt', card: { kind: 'joker', day, suits: card.suits }, isToday };
    }
    if (card) return { day, state: 'dealt', card, isToday };
    if (!habits.some((h) => available(h, day))) return { day, state: 'before', card: null, isToday };
    if (isToday) return { day, state: 'open', card: null, isToday };
    return { day, state: isBlank(day, habits, checkIns) ? 'blank' : 'before', card: null, isToday };
  });
  // Sunday is never followed by a day of the same week, so it can't be rescued.
  for (let i = 0; i < slots.length - 1; i++) {
    const next = slots[i + 1].card;
    if (slots[i].state === 'blank' && next) slots[i] = { ...slots[i], state: 'dealt', card: rescueCard(slots[i].day, seed, next.suits[0]) };
  }
  return slots;
}

/** Yesterday, when it was blank and keeping anything today would rescue it. */
export function rescueWaiting(slots: readonly Slot[], today: Day): Day | null {
  const i = slots.findIndex((s) => s.day === today);
  if (i < 1 || slots[i].state !== 'open') return null;
  return slots[i - 1].state === 'blank' ? slots[i - 1].day : null;
}
