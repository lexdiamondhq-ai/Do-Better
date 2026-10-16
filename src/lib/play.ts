import type { Suit } from '@/engine/cards';
import { newFaces, summarizeCourt, type CourtHabit, type CourtSuit, type FaceInfo } from '@/engine/court';
import { archivedDay, weekStart, type Day } from '@/engine/day';
import type { DayCard, DealHabit } from '@/engine/deal';
import { dealEvent, playGame, playLiveWeek, playPastWeeks, type DealEvent, type Game, type GameInput, type Week } from '@/engine/game';
import { indexCheckIns, type Level } from '@/engine/kept';
import type { HandKind } from '@/engine/poker';

import type { Loaded } from './backend';
import type { Habit } from './types';

/** Habits as the deal sees them. An archived habit leaves the deck on the local day it was archived. */
export function dealHabits(habits: readonly Habit[], timezone: string): DealHabit[] {
  return habits.map((h) => ({ id: h.id, suit: h.suit, startedOn: h.startedOn, archivedOn: h.archivedAt ? archivedDay(h.archivedAt, timezone) : null }));
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
 * (habit, day and level, in any order) and the calls. A past Floor turning into a Ceiling changes it.
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
    const [a, b] = hashes(`${d.habitId}:${d.day}:${d.level}`);
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

// Moments: what a check-in did that is worth showing ------------------------------------------------

/** Lifetime kept days worth a moment. Only ever counted up, never as days in a row. */
export const MILESTONES: readonly number[] = [10, 25, 50, 100, 250, 500, 1000];

/** Steps between a suit's King and its Ace, in days kept. Each is celebrated, with no Joker. */
export const RUNGS: readonly number[] = [150, 200, 250, 300];

/** Something a check-in caused that's worth a moment on screen. */
export type GameEvent =
  /** Today's card got better. `saved` is yesterday's card when the same check-in saved it too. */
  | { id: number; kind: 'deal'; habitId: string; level: Level; deal: DealEvent; saved: DayCard | null }
  /** A suit earned a face card in the Court. `joker` when the same check-in also dealt a Joker. */
  | { id: number; kind: 'face'; suit: Suit; face: FaceInfo; identities: string[]; joker: boolean }
  /** The very first card this player has been dealt. */
  | { id: number; kind: 'first'; habitId: string; level: Level; deal: DealEvent }
  /** Yesterday was logged late and got its card ("Yesterday saved"). `deal.card` is yesterday's card. */
  | { id: number; kind: 'backfill'; habitId: string; level: Level; day: Day; deal: DealEvent }
  /** Kept days across every card reached one of the MILESTONES. */
  | { id: number; kind: 'milestone'; count: number }
  /** A suit reached one of the RUNGS between its King and its Ace. */
  | { id: number; kind: 'rung'; suit: Suit; days: number };

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

/** A GameEvent before it has a place in the queue. */
export type Moment = WithoutId<GameEvent>;

/**
 * What has been celebrated today, held in memory only. An undo followed by the same check-in again can't
 * replay a face card or a milestone. `best` is the most kept days reached today.
 */
export type MomentMemory = { celebrated: Set<string>; best: { day: Day; count: number } | null };

export const newMemory = (): MomentMemory => ({ celebrated: new Set(), best: null });

/** The check-in that caused the moments. `day` is today, or yesterday for a back-fill. */
export type CheckInMade = { habitId: string; level: Level; day: Day };

const keptDays = (data: Loaded, upTo: Day) => data.days.filter((d) => d.day <= upTo).length;
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
  const courtWas = courtOf(before, today);
  const courtNow = courtOf(after, today);
  let jokerShown = false;
  for (const f of newFaces(courtWas, courtNow)) {
    const key = `face:${f.suit}:${f.face.face}:${today}`;
    if (memory.celebrated.has(key)) continue;
    memory.celebrated.add(key);
    out.push({ kind: 'face', suit: f.suit, face: f.face, identities: f.identities, joker });
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

  const first = before.days.length === 0;
  const { habitId, level } = made;
  if (made.day === today) {
    const deal = dealEvent(was, now);
    if (deal && first) out.push({ kind: 'first', habitId, level, deal });
    else if (deal && !jokerShown) {
      const saved = now.slots.find((slot, i) => slot.card?.kind === 'card' && slot.card.rescued && !was.slots[i].card)?.card ?? null;
      out.push({ kind: 'deal', habitId, level, deal, saved });
    }
  } else {
    const card = cardOn(now, made.day);
    if (card) {
      const deal: DealEvent = { card, was: first ? null : cardOn(was, made.day), hand: now.hand, handWas: first ? null : was.hand };
      out.push(first ? { kind: 'first', habitId, level, deal } : { kind: 'backfill', habitId, level, day: made.day, deal });
    }
  }

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
    if (m.kind === 'face') memory.celebrated.delete(`face:${m.suit}:${m.face.face}:${today}`);
    if (m.kind === 'rung') memory.celebrated.delete(`rung:${m.suit}:${m.days}:${today}`);
    if (m.kind === 'milestone' && memory.best?.day === today) memory.best.count = Math.min(memory.best.count, m.count - 1);
  }
}
