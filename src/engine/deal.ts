/**
 * The deal. Every day you keep at least one habit is dealt one playing card.
 *
 * Its rank comes from a band that always runs up to the Ace. How the day went sets the band's lowest card,
 * `lo`: keep some of your habits and it starts at 2, with each habit kept and each Ceiling lifting it, up
 * to 4; keep every habit and it starts at 5; every habit at its Ceiling and it starts at 6. A fully kept
 * day, even all at the Floor, always beats any partial day. Where in the band the card lands is the luck
 * of the deal, fixed per person and day by a seeded hash, so the same history deals the same cards on
 * every device. The day keeps the card it was first dealt whenever that card fits the band, and is dealt
 * again inside the band only when it doesn't, so keeping more can only raise the day's card, never lower it.
 *
 * The suits are the suits of the habits you kept, so a day you read and walked counts as Clubs and Spades.
 * They are ordered by weight (a Ceiling outweighs a Floor), then by the habit started first, then by id,
 * never by deck order, so rearranging the deck can't re-deal a past week.
 *
 * A blank day (habits running, nothing kept) deals nothing, unless you come back the next day: then the
 * blank day is saved with a card from 2 to Ace that has no suit. It counts for pairs and straights, never
 * for suits, and it is never better than keeping one habit that day would have been, so skipping a day
 * never pays. Miss twice in a row and the first day stays empty. Sunday can't be saved, because the hand
 * is settled at midnight.
 *
 * A week with five or more kept days (saved days don't count) also earns the river card: one more card
 * with no suit, ranked in the band of a typical day that week, turned at the Showdown.
 *
 * Face cards earned in the Court deal Jokers. Which day gets one is worked out in game.ts and passed in.
 */

import type { LooseCard, Rank, Suit } from './cards';
import { addDays, weekDays, type Day } from './day';
import type { CheckIns, Level } from './kept';

export type DealHabit = {
  id: string;
  suit: Suit;
  startedOn: Day;
  /**
   * The local day the habit left the deck, or null while it's in the deck. A plain day ("2026-10-16") or
   * a midnight-UTC timestamp that stores that day ("2026-10-16T00:00:00.000Z") both work.
   */
  archivedOn: Day | null;
  /** The habit's name, for tips like "Keep Walk too". Optional. */
  name?: string;
};

export type Tier = 'showed-up' | 'kept-all' | 'reached-up' | 'perfect';

/** `lo` is the lowest card the tier can deal; the exact floor of a partial day depends on how much was kept. */
export type TierInfo = { lo: Rank; hi: Rank; label: string; about: string };

/** The lowest card of a day where every habit was kept. A partial day always starts below it. */
export const KEPT_LO: Rank = 5;
/** The lowest card of a day where every habit reached its Ceiling. */
export const TOP_LO: Rank = 6;
/** The highest a partial day's lowest card can climb. */
const PARTIAL_CAP: Rank = 4;

/** Labels for how a day went, weakest first. The band itself comes from `bandOf`. */
export const TIERS: Record<Tier, TierInfo> = {
  'showed-up': { lo: 2, hi: 14, label: 'Some kept', about: 'Some of your habits kept. Each habit and each Ceiling lifts the lowest card it can deal.' },
  'kept-all': { lo: KEPT_LO, hi: 14, label: 'Kept everything', about: `Every habit kept. Deals ${KEPT_LO} or better.` },
  'reached-up': { lo: KEPT_LO, hi: 14, label: 'Reached up', about: `Everything kept, with a Ceiling. Every habit at its Ceiling deals ${TOP_LO} or better.` },
  perfect: { lo: TOP_LO, hi: 14, label: 'Perfect day', about: `Every habit at its Ceiling. Deals ${TOP_LO} or better.` },
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

/** How many cards a re-deal turns before it settles for a card dealt straight into the band. */
const REDEAL_TRIES = 16;

/** Card `k` of a day's re-deal, from 2 to the Ace: the first from `again` itself, the rest from a hash of it. */
function redealCard(again: number, k: number): number {
  if (k === 0) return Math.min(14, 2 + Math.floor(again * 13));
  let h = (Math.floor(again * 0x1_0000_0000) ^ Math.imul(k, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return 2 + Math.floor(((h >>> 0) / 0x1_0000_0000) * 13);
}

/**
 * The day's rank in a band from `lo` to the Ace. Every day has one card from the full deck (`u`); the band
 * keeps it when it is at least `lo`. Otherwise the day deals again from a second deck of its own (`again`)
 * and keeps the first card that fits. So every rank in a band is equally likely, a higher `lo` never gives
 * a lower card, and a card that still fits a higher band is kept: keeping more never changes a card that
 * already fits.
 */
export function rankFor(lo: Rank, u: number, again = u): Rank {
  const base = Math.min(14, 2 + Math.floor(u * 13));
  if (base >= lo) return base as Rank;
  for (let k = 0; k < REDEAL_TRIES; k++) {
    const card = redealCard(again, k);
    if (card >= lo) return card as Rank;
  }
  return Math.min(14, lo + Math.floor(again * (15 - lo))) as Rank;
}

export type DayCard =
  | {
      kind: 'card';
      day: Day;
      rank: Rank;
      /** Suits of the habits kept, strongest first. Empty for a saved day and for the river card. */
      suits: Suit[];
      /** Suits with a Ceiling that day. */
      ceilingSuits: Suit[];
      tier: Tier;
      /** The lowest card the day's band could deal. */
      lo: Rank;
      /** A saved day: blank, then kept the next day. No suit. */
      rescued: boolean;
      /** The river card, earned by five kept days and turned at the Showdown. No suit. */
      river?: boolean;
    }
  | { kind: 'joker'; day: Day; suits: Suit[]; ceilingSuits: Suit[]; tier: Tier; lo: Rank };

/** One card face for display: a Joker, or the rank with the day's leading suit (none for a saved day or the river). */
export function faceOf(card: DayCard): LooseCard | 'joker' {
  return card.kind === 'joker' ? 'joker' : { rank: card.rank, suit: card.suits[0] ?? null };
}

export type DayTally = {
  /** Habits that count toward "everything": running before today, or kept today. */
  counted: number;
  kept: number;
  ceilings: number;
  /** Habits started that day and kept at the Floor. They join "everything" only when that helps. */
  freshFloors: number;
  /** Suits of the kept habits, strongest first: weight, then the habit started first, then id. */
  suits: Suit[];
  /** Suits with at least one Ceiling that day, in the same order. */
  ceilingSuits: Suit[];
  /** At least one habit was running before this day, so a day with nothing kept is a real blank. */
  running: boolean;
};

const EMPTY: CheckIns = new Map();

/** The archive day as a plain day, from either a day or a midnight-UTC timestamp storing that day. */
function archiveDayOf(archivedOn: string | null): Day | null {
  return archivedOn === null ? null : archivedOn.slice(0, 10);
}

/**
 * Whether a habit is in the deck on `day`: from the day it started through the day it was archived. It
 * leaves the next day, so archiving a habit you skipped can never lift that day's card.
 */
export function inDeck(h: DealHabit, day: Day): boolean {
  const archived = archiveDayOf(h.archivedOn);
  return h.startedOn <= day && (archived === null || day <= archived);
}

/**
 * Whether a habit can still be kept on `day`, the day being played now: it has started and hasn't been
 * archived. A habit archived today still counts in today's deal (see `inDeck`) but can't be kept any more,
 * so tips never ask for it.
 */
export function canKeep(h: DealHabit, day: Day): boolean {
  const archived = archiveDayOf(h.archivedOn);
  return h.startedOn <= day && (archived === null || day < archived);
}

/** Orders two habits for the suit tie-break: the one started first, then the lower id. */
function earlier(a: DealHabit, b: DealHabit): number {
  return a.startedOn.localeCompare(b.startedOn) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * How a day went across the deck. A habit started that day only counts if it was kept, so adding a new
 * card never lowers today's card. An archived habit counts through the day it left the deck.
 */
export function tallyDay(day: Day, habits: readonly DealHabit[], checkIns: ReadonlyMap<string, CheckIns>, extra?: { habitId: string; level: Level }): DayTally {
  let counted = 0;
  let kept = 0;
  let ceilings = 0;
  let freshFloors = 0;
  let running = false;
  const bySuit = new Map<Suit, { weight: number; first: DealHabit; ceiling: boolean }>();
  for (const h of habits) {
    const level = extra?.habitId === h.id ? extra.level : (checkIns.get(h.id) ?? EMPTY).get(day);
    const before = inDeck(h, day) && h.startedOn < day;
    if (before) running = true;
    if (!level && !before) continue;
    counted++;
    if (!level) continue;
    kept++;
    if (level === 'ceiling') ceilings++;
    else if (!before) freshFloors++;
    const entry = bySuit.get(h.suit);
    const weight = level === 'ceiling' ? 2 : 1;
    if (!entry) bySuit.set(h.suit, { weight, first: h, ceiling: level === 'ceiling' });
    else {
      entry.weight += weight;
      if (earlier(h, entry.first) < 0) entry.first = h;
      entry.ceiling ||= level === 'ceiling';
    }
  }
  const order = [...bySuit.entries()].sort(([, a], [, b]) => b.weight - a.weight || earlier(a.first, b.first));
  return { counted, kept, ceilings, freshFloors, suits: order.map(([s]) => s), ceilingSuits: order.filter(([, e]) => e.ceiling).map(([s]) => s), running };
}

/** The band's lowest card for a day with `counted` habits, `kept` of them kept and `ceilings` at the Ceiling. */
function loFrom(counted: number, kept: number, ceilings: number): Rank | null {
  if (kept <= 0 || counted <= 0) return null;
  if (kept < counted) return Math.min(PARTIAL_CAP, 2 + Math.floor((2 * kept) / counted) + Math.floor((2 * ceilings) / counted)) as Rank;
  return (KEPT_LO + Math.floor(((TOP_LO - KEPT_LO) * ceilings) / counted)) as Rank;
}

function tierFrom(counted: number, kept: number, ceilings: number): Tier | null {
  if (kept <= 0 || counted <= 0) return null;
  if (kept < counted) return 'showed-up';
  if (ceilings === kept) return 'perfect';
  if (ceilings > 0) return 'reached-up';
  return 'kept-all';
}

/**
 * Judges a day with and without each habit started that day and kept at its Floor, and keeps the best,
 * so keeping a brand-new card can only help.
 */
function bestWithFresh<T>(t: Pick<DayTally, 'counted' | 'kept' | 'ceilings'> & { freshFloors?: number }, judge: (counted: number, kept: number, ceilings: number) => T | null, better: (a: T, b: T) => boolean): T | null {
  let best: T | null = null;
  for (let j = 0; j <= (t.freshFloors ?? 0); j++) {
    const x = judge(t.counted - j, t.kept - j, t.ceilings);
    if (x !== null && (best === null || better(x, best))) best = x;
  }
  return best;
}

/** The lowest card a day's band can deal, or null when nothing was kept. */
export function loOf(t: Pick<DayTally, 'counted' | 'kept' | 'ceilings'> & { freshFloors?: number }): Rank | null {
  return bestWithFresh(t, loFrom, (a, b) => a > b);
}

/** The tier a day deals from: a label for how it went. */
export function tierOf(t: Pick<DayTally, 'counted' | 'kept' | 'ceilings'> & { freshFloors?: number }): Tier | null {
  return bestWithFresh(t, tierFrom, (a, b) => TIER_ORDER.indexOf(a) > TIER_ORDER.indexOf(b));
}

export type Band = { lo: Rank; label: string; line: string };

/** The band a day deals from, for showing: its lowest card, a label and one line. Null when nothing was kept. */
export function bandOf(t: Pick<DayTally, 'counted' | 'kept' | 'ceilings'> & { freshFloors?: number }): Band | null {
  const lo = loOf(t);
  const tier = tierOf(t);
  if (lo === null || tier === null) return null;
  return { lo, label: TIERS[tier].label, line: lo === 2 ? 'Deals any card, 2 to Ace.' : `Deals ${lo} or better.` };
}

/** A past day with habits running and nothing kept. Days before your first habit are never blank. */
export function isBlank(day: Day, habits: readonly DealHabit[], checkIns: ReadonlyMap<string, CheckIns>): boolean {
  const t = tallyDay(day, habits, checkIns);
  return t.running && t.kept === 0;
}

/** The rank a day deals from a band starting at `lo`, for this person. Tips use it to say truly whether more would lift today's card. */
export function dayRank(lo: Rank, day: Day, seed: string): Rank {
  return rankFor(lo, unit(`${seed}:${day}`), unit(`${seed}:${day}:again`));
}

/** The day's card before the Joker rule, or null when nothing was kept. */
export function dealDay(day: Day, habits: readonly DealHabit[], checkIns: ReadonlyMap<string, CheckIns>, seed: string, extra?: { habitId: string; level: Level }): DayCard | null {
  const t = tallyDay(day, habits, checkIns, extra);
  const lo = loOf(t);
  const tier = tierOf(t);
  if (lo === null || tier === null) return null;
  return { kind: 'card', day, rank: dayRank(lo, day, seed), suits: t.suits, ceilingSuits: t.ceilingSuits, tier, lo, rescued: false };
}

/** The card a blank day gets when you come back the next day: the day's own card from the full deck, with no suit. */
export function savedCard(day: Day, seed: string): DayCard {
  return { kind: 'card', day, rank: dayRank(2, day, seed), suits: [], ceilingSuits: [], tier: 'showed-up', lo: 2, rescued: true };
}

export type SlotState = 'before' | 'blank' | 'open' | 'future' | 'dealt';

export type Slot = { day: Day; state: SlotState; card: DayCard | null; isToday: boolean };

/**
 * The seven days of a week as cards. Today stays live (its card can still climb) until midnight.
 * `jokerDays` are the days dealt as Jokers (one a week at most). `extra` deals a hypothetical check-in
 * for today, for previews like "what would this swipe do".
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
    if (card?.kind === 'card' && !joker && jokerDays.has(day)) {
      joker = true;
      return { day, state: 'dealt', card: { kind: 'joker', day, suits: card.suits, ceilingSuits: card.ceilingSuits, tier: card.tier, lo: card.lo }, isToday };
    }
    if (card) return { day, state: 'dealt', card, isToday };
    if (!habits.some((h) => inDeck(h, day))) return { day, state: 'before', card: null, isToday };
    if (isToday) return { day, state: 'open', card: null, isToday };
    return { day, state: isBlank(day, habits, checkIns) ? 'blank' : 'before', card: null, isToday };
  });
  // Sunday is never followed by a day of the same week, so it can't be saved.
  for (let i = 0; i < slots.length - 1; i++) {
    if (slots[i].state === 'blank' && slots[i + 1].card) slots[i] = { ...slots[i], state: 'dealt', card: savedCard(slots[i].day, seed) };
  }
  return slots;
}

/** The days you kept something: dealt days that weren't saved. Jokers count. */
export function keptCards(slots: readonly Slot[]): DayCard[] {
  return slots.flatMap((s) => (s.card && !(s.card.kind === 'card' && s.card.rescued) ? [s.card] : []));
}

/** Kept days a week needs for its river card. */
export const RIVER_DAYS = 5;

/**
 * The lowest card the river can be, from the week's kept days as they stand: the band of the middle kept
 * day (the lower median of their `lo`). Null with fewer than five kept days. It says nothing about which
 * card the river will be: that is only dealt once the week is over (`riverCard`).
 */
export function riverBand(slots: readonly Slot[]): Rank | null {
  const los = keptCards(slots)
    .map((c) => c.lo)
    .sort((a, b) => a - b);
  return los.length < RIVER_DAYS ? null : los[Math.floor((los.length - 1) / 2)];
}

/**
 * The river card of a finished week: earned by five or more kept days (saved days don't count), ranked in
 * the band of the week's middle day (the lower median of their `lo`), with no suit. It carries the date
 * of the Monday after, the moment it turns, so it never matches a day of its own week.
 */
export function riverCard(start: Day, slots: readonly Slot[], seed: string): DayCard | null {
  const lo = riverBand(slots);
  if (lo === null) return null;
  const tier: Tier = lo >= TOP_LO ? 'perfect' : lo >= KEPT_LO ? 'kept-all' : 'showed-up';
  return { kind: 'card', day: addDays(start, 7), rank: rankFor(lo, unit(`${seed}:${start}:river`), unit(`${seed}:${start}:river:again`)), suits: [], ceilingSuits: [], tier, lo, rescued: false, river: true };
}

/** Yesterday, when it was blank and keeping anything today would save it. */
export function rescueWaiting(slots: readonly Slot[], today: Day): Day | null {
  const i = slots.findIndex((s) => s.day === today);
  if (i < 1 || slots[i].state !== 'open') return null;
  return slots[i - 1].state === 'blank' ? slots[i - 1].day : null;
}
