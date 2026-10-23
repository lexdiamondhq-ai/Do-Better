import type { Suit } from '@/engine/cards';
import { newFaces, RUNGS, summarizeCourt, type CourtHabit, type CourtSuit, type FaceInfo } from '@/engine/court';
import { archivedDay, canBackfill, weekStart, type Day } from '@/engine/day';
import type { DayCard, DealHabit } from '@/engine/deal';
import { dealEvent, playGame, playLiveWeek, playPastWeeks, type DealEvent, type Game, type GameInput, type Week } from '@/engine/game';
import { indexCheckIns, type Level } from '@/engine/kept';
import { lateIndex, levelIn } from '@/engine/ledger';
import type { Hand, HandKind } from '@/engine/poker';

import type { Loaded } from './backend';
import type { Habit } from './types';

/** Habits as the deal sees them. An archived habit leaves the deck on the local day it was archived. */
export function dealHabits(habits: readonly Habit[], timezone: string): DealHabit[] {
  return habits.map((h) => ({ id: h.id, name: h.name, suit: h.suit, startedOn: h.startedOn, archivedOn: h.archivedAt ? archivedDay(h.archivedAt, timezone) : null }));
}

export function courtHabits(habits: readonly Habit[]): CourtHabit[] {
  return habits.map((h) => ({ id: h.id, suit: h.suit, identity: h.identity }));
}

/** The same account with no deck: no cards, check-ins, prompts or calls, no North Star and not onboarded. */
export function emptyDeck(data: Loaded): Loaded {
  return { profile: { ...data.profile, northStar: null, onboardedAt: null }, habits: [], days: [], prompts: [], calls: [] };
}

/** Everything the game engine needs from the loaded rows. */
export function gameInput(data: Loaded, today: Day, seed: string): GameInput {
  return {
    seed,
    today,
    habits: dealHabits(data.habits, data.profile.timezone),
    checkIns: indexCheckIns(data.days),
    calls: new Map<Day, HandKind>(data.calls.map((c) => [c.weekStart, c.hand])),
    late: lateIndex(data.days),
  };
}

// Finished weeks only change when past check-ins, habits or calls do. This device only writes today
// and yesterday inside the live week, but a refresh can bring past rows from another device, so the
// deal of every finished week is kept from one render to the next only while those rows are the same.
let past: { key: string; weeks: Week[] } | null = null;

/** Two 32-bit FNV-1a hashes of a string, with different starting points. */
function hashes(text: string): [number, number] {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x0100019d);
  }
  return [a >>> 0, b >>> 0];
}

/**
 * A fingerprint of everything finished weeks are dealt from: the habits, every check-in before this week
 * (habit, day, level and the day a late one was logged, in any order) and the calls. A past Floor turning
 * into a Ceiling changes it.
 */
export function pastKey(data: Loaded, input: GameInput): string {
  const thisWeek = weekStart(input.today);
  const habits = input.habits.map((h) => `${h.id}:${h.suit}:${h.startedOn}:${h.archivedOn}`).join(',');
  // Summed per-row hashes don't depend on the order rows arrive in.
  let count = 0;
  let sumA = 0;
  let sumB = 0;
  for (const d of data.days) {
    if (d.day >= thisWeek) continue;
    const [a, b] = hashes(`${d.habitId}:${d.day}:${d.level}${d.loggedOn && d.loggedOn > d.day ? `@${d.loggedOn}` : ''}`);
    count++;
    sumA = (sumA + a) >>> 0;
    sumB = (sumB + b) >>> 0;
  }
  const calls = data.calls
    .filter((c) => c.weekStart < thisWeek)
    .map((c) => `${c.weekStart}:${c.hand}`)
    .sort()
    .join(',');
  return `${input.seed}|${thisWeek}|${habits}|${count}:${sumA.toString(36)}:${sumB.toString(36)}|${calls}`;
}

/** The whole game, reusing finished weeks when nothing behind them changed. */
export function playGameFor(data: Loaded, today: Day, seed: string): Game {
  const input = gameInput(data, today, seed);
  const key = pastKey(data, input);
  if (past?.key !== key) past = { key, weeks: playPastWeeks(input) };
  return playGame(input, past.weeks);
}

// Late check-ins: yesterday, logged after the fact ------------------------------------------------------

export const LATE_ADD_REFUSED = 'Only yesterday can be logged late, once, while its week is still being played.';
export const LATE_UNDO_REFUSED = 'That day is settled now, so it stays as it is.';

/** How a day logged late on this phone is remembered, so only that back-fill can be taken back. */
export const lateKey = (habitId: string, day: Day) => `${habitId}:${day}`;

/**
 * Why a check-in on `day` can't be added or taken back, or null when it can. Today is always open.
 * Yesterday can be added only where `canBackfill` allows it, for a card in the deck, and only when it is
 * still empty. Only a back-fill made on this phone (listed in `loggedLate` by `lateKey`) can be taken
 * back, so a day kept yesterday can't be cleared and logged again at a higher level.
 */
export function lateRefusal(data: Loaded, habitId: string, day: Day, today: Day, change: 'add' | 'undo', loggedLate: ReadonlySet<string>): string | null {
  if (day === today) return null;
  const habit = data.habits.find((h) => h.id === habitId);
  if (change === 'add') return habit && canBackfill(day, today, habit) && levelIn(data.days, habitId, day) === null ? null : LATE_ADD_REFUSED;
  return habit && canBackfill(day, today, habit) && loggedLate.has(lateKey(habitId, day)) ? null : LATE_UNDO_REFUSED;
}

// Moments: what a check-in did that is worth showing ------------------------------------------------

/** Lifetime kept days worth a moment. Only ever counted up, never as days in a row. */
export const MILESTONES: readonly number[] = [10, 25, 50, 100, 250, 500, 1000];

/** Steps between a suit's King and its Ace, in days kept. Each is celebrated, with no Joker. */

/** Something a check-in caused that's worth a moment on screen. */
export type GameEvent =
  /**
   * Today's card got better. `saved` is yesterday's card when the same check-in saved it too. `same` marks a
   * keep that left today's card as it was (another card kept today, or a Ceiling reached): it still lands
   * with a receipt, and `court` is the suit's kept days in the Court when the keep added one there.
   */
  | { id: number; kind: 'deal'; habitId: string; level: Level; deal: DealEvent; saved: DayCard | null; same?: true; court?: { suit: Suit; days: number } | null }
  /**
   * A suit earned a face card in the Court. `joker` when the same check-in also dealt a Joker, always
   * on today's card. Otherwise `jokerLands` says where it will: `today` when keeping anything today deals
   * it (the face came from a day logged late), `next-week` when this week already has one. With a Joker,
   * `handWas` is the week's hand before that check-in (null: none yet), since no deal comes with it.
   */
  | { id: number; kind: 'face'; suit: Suit; face: FaceInfo; identities: string[]; joker: boolean; jokerLands?: 'today' | 'next-week'; handWas?: Hand | null }
  /** The very first card this player has been dealt. */
  | { id: number; kind: 'first'; habitId: string; level: Level; deal: DealEvent }
  /** Yesterday was logged late and got its card ("Yesterday saved"). `deal.card` is yesterday's card. */
  | { id: number; kind: 'backfill'; habitId: string; level: Level; day: Day; deal: DealEvent }
  /** Kept days (calendar days with anything kept) reached one of the MILESTONES. */
  | { id: number; kind: 'milestone'; count: number }
  /** A suit reached one of the RUNGS between its King and its Ace. */
  | { id: number; kind: 'rung'; suit: Suit; days: number };

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

/** A GameEvent before it has a place in the queue. */
export type Moment = WithoutId<GameEvent>;

/**
 * What has been celebrated, held in memory only. An undo followed by the same check-in again can't
 * replay the first card, a face card or a milestone. `best` is the most kept days reached today.
 */
export type MomentMemory = { celebrated: Set<string>; best: { day: Day; count: number } | null };

export const newMemory = (): MomentMemory => ({ celebrated: new Set(), best: null });

const FIRST = 'first';

/** The check-in that caused the moments. `day` is today, or yesterday for a back-fill. */
export type CheckInMade = { habitId: string; level: Level; day: Day };

/** Calendar days with anything kept, the same count Today and You show: two cards on one day make one kept day. */
const keptDays = (data: Loaded, upTo: Day) => new Set(data.days.filter((d) => d.day <= upTo).map((d) => d.day)).size;
const jokers = (week: Week) => week.slots.filter((s) => s.card?.kind === 'joker').length;
const cardOn = (week: Week, day: Day) => week.slots.find((s) => s.day === day)?.card ?? null;
const courtOf = (data: Loaded, today: Day) => summarizeCourt(courtHabits(data.habits), indexCheckIns(data.days), today);

/** How many days a suit has kept, by the Court's count. */
const daysIn = (court: readonly CourtSuit[], suit: Suit) => court.find((c) => c.suit === suit)?.votes ?? 0;

/**
 * The moments one check-in caused, in the order to show them. Face cards come first, because a Joker only
 * makes sense once its face card has been seen, and the deal is left out when the face card already
 * brought the Joker. Then any rung, then the card (a deal, a back-fill, or the first card ever), then any
 * milestone. Updates `memory`.
 */
export function momentsOf(before: Loaded, after: Loaded, today: Day, seed: string, made: CheckInMade, memory: MomentMemory): Moment[] {
  const was = playLiveWeek(gameInput(before, today, seed));
  const now = playLiveWeek(gameInput(after, today, seed));
  const out: Moment[] = [];

  const joker = jokers(now) > jokers(was);
  const jokerLands = joker ? {} : { jokerLands: jokers(now) > 0 || now.warmup ? ('next-week' as const) : ('today' as const) };
  const courtWas = courtOf(before, today);
  const courtNow = courtOf(after, today);
  let jokerShown = false;
  for (const f of newFaces(courtWas, courtNow)) {
    const key = `face:${f.suit}:${f.face.face}:${today}`;
    if (memory.celebrated.has(key)) continue;
    memory.celebrated.add(key);
    out.push({ kind: 'face', suit: f.suit, face: f.face, identities: f.identities, joker, ...(joker ? { handWas: was.hand } : {}), ...jokerLands });
    jokerShown ||= joker;
  }

  for (const c of courtNow) {
    const had = daysIn(courtWas, c.suit);
    for (const days of RUNGS) {
      const key = `rung:${c.suit}:${days}:${today}`;
      if (had >= days || c.votes < days || memory.celebrated.has(key)) continue;
      memory.celebrated.add(key);
      out.push({ kind: 'rung', suit: c.suit, days });
    }
  }

  // The first card ever is celebrated once. Undone and made again, it turns over like any other card.
  const firstEver = before.days.length === 0;
  const first = firstEver && !memory.celebrated.has(FIRST);
  const { habitId, level } = made;
  if (made.day === today) {
    const deal = dealEvent(was, now);
    if (deal && first) out.push({ kind: 'first', habitId, level, deal });
    else if (deal && !jokerShown) {
      const saved = now.slots.find((slot, i) => slot.card?.kind === 'card' && slot.card.rescued && !was.slots[i].card)?.card ?? null;
      out.push({ kind: 'deal', habitId, level, deal, saved });
    } else if (!deal && !jokerShown && !first) {
      // A keep that left today's card as it was still lands with its own receipt: another card kept today (a day
      // for its suit in the Court) or a Ceiling reached. Turning a Ceiling back into a Floor stays quiet.
      const had = levelIn(before.days, habitId, today);
      const card = cardOn(now, today);
      const suit = after.habits.find((h) => h.id === habitId)?.suit;
      if (card && (had === null || (had === 'floor' && level === 'ceiling'))) {
        const days = suit ? daysIn(courtNow, suit) : 0;
        const court = suit && days > daysIn(courtWas, suit) ? { suit, days } : null;
        out.push({ kind: 'deal', habitId, level, deal: { card, was: cardOn(was, today), hand: now.hand, handWas: was.hand, handDropped: false }, saved: null, same: true, court });
      }
    }
  } else {
    const card = cardOn(now, made.day);
    if (card) {
      const handWas = firstEver ? null : was.hand;
      const handDropped = !!handWas && (!now.hand || now.hand.score < handWas.score);
      const deal: DealEvent = { card, was: firstEver ? null : cardOn(was, made.day), hand: now.hand, handWas, handDropped };
      out.push(first ? { kind: 'first', habitId, level, deal } : { kind: 'backfill', habitId, level, day: made.day, deal });
    }
  }

  if (out.some((m) => m.kind === 'first')) memory.celebrated.add(FIRST);

  if (memory.best?.day !== today) memory.best = { day: today, count: keptDays(before, today) };
  const floor = Math.max(memory.best.count, keptDays(before, today));
  const reached = keptDays(after, today);
  for (const count of MILESTONES) if (count > floor && count <= reached) out.push({ kind: 'milestone', count });
  memory.best.count = Math.max(floor, reached);

  return out;
}

/**
 * Forgets moments that were never shown because their check-in didn't save, so the same check-in can
 * celebrate them when it's made again.
 */
export function forgetMoments(moments: readonly Moment[], today: Day, memory: MomentMemory): void {
  for (const m of moments) {
    if (m.kind === 'first') memory.celebrated.delete(FIRST);
    if (m.kind === 'face') memory.celebrated.delete(`face:${m.suit}:${m.face.face}:${today}`);
    if (m.kind === 'rung') memory.celebrated.delete(`rung:${m.suit}:${m.days}:${today}`);
    if (m.kind === 'milestone' && memory.best?.day === today) memory.best.count = Math.min(memory.best.count, m.count - 1);
  }
}
