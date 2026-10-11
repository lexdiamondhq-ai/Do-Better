/**
 * The game around the hands. Each week, Monday to Sunday, is one hand. At the Showdown on Sunday night
 * it pays chips into your stack, plus a bonus when you called the hand on Monday and made it. Chips never
 * leave the stack, so a bad week can't cost you anything you've won. The first time you make each kind
 * of hand it goes into the Hall of Hands, card backs unlock up to your best hand, and a big enough stack
 * opens a new table.
 *
 * All of it is worked out from check-ins and calls, so none of it is stored.
 */

import { SUIT_INFO, SUITS, type Suit } from './cards';
import { faceDays, nextFace, type FaceInfo } from './court';
import { addDays, weekday, weekStart, type Day } from './day';
import { dealWeek, rescueWaiting, tallyDay, tierOf, type DayCard, type DealHabit, type Slot } from './deal';
import type { CheckIns } from './kept';
import { atLeast, bestHand, HAND_KINDS, handIndex, HANDS, type Hand, type HandKind } from './poker';

export type GameInput = {
  /** Seeds the deal, so one person always gets the same cards. Their user id. */
  seed: string;
  today: Day;
  /** Every habit, archived ones included, so old weeks keep their cards. */
  habits: readonly DealHabit[];
  checkIns: ReadonlyMap<string, CheckIns>;
  /** Called hands, by the Monday their week starts. */
  calls: ReadonlyMap<Day, HandKind>;
};

export type Week = {
  start: Day;
  slots: Slot[];
  hand: Hand | null;
  call: HandKind | null;
  /** The hand matched or beat the call. */
  madeCall: boolean;
  /** What the hand pays. For the live week, what it would pay if the week ended now. */
  chips: number;
  bonus: number;
  /** This is the week being played now. */
  live: boolean;
};

/** Hands you can call: everything from a Pair to a Royal flush. */
export const CALLABLE: readonly HandKind[] = HAND_KINDS.filter((k) => k !== 'high-card' && k !== 'five-of-a-kind');

export type HallEntry = {
  kind: HandKind;
  /** Finished weeks that ended with this hand. */
  count: number;
  best: { hand: Hand; week: Day } | null;
  /** The Monday of the first week it was made. */
  first: Day | null;
};

export type BackKey = 'classic' | 'pinstripe' | 'checker' | 'chevron' | 'ladder' | 'velvet' | 'houndstooth' | 'lattice' | 'sunburst' | 'crown' | 'aurora';

/** Card backs. Each one unlocks the first time you finish a week with its hand or a better one. */
export const BACKS: readonly { key: BackKey; name: string; hand: HandKind }[] = [
  { key: 'classic', name: 'Classic', hand: 'high-card' },
  { key: 'pinstripe', name: 'Pinstripe', hand: 'pair' },
  { key: 'checker', name: 'Checker', hand: 'two-pair' },
  { key: 'chevron', name: 'Chevron', hand: 'three-of-a-kind' },
  { key: 'ladder', name: 'Ladder', hand: 'straight' },
  { key: 'velvet', name: 'Velvet', hand: 'flush' },
  { key: 'houndstooth', name: 'Houndstooth', hand: 'full-house' },
  { key: 'lattice', name: 'Lattice', hand: 'four-of-a-kind' },
  { key: 'sunburst', name: 'Sunburst', hand: 'straight-flush' },
  { key: 'crown', name: 'Crown', hand: 'royal-flush' },
  { key: 'aurora', name: 'Aurora', hand: 'five-of-a-kind' },
];

export type TableKey = 'kitchen' | 'card-room' | 'velvet-room' | 'midnight' | 'gold-room';

/** Tables are the app's look. Each opens once your stack reaches its chips. */
export const TABLES: readonly { key: TableKey; name: string; chips: number; about: string }[] = [
  { key: 'kitchen', name: 'Kitchen table', chips: 0, about: 'Where every game starts. Light or dark, like your phone.' },
  { key: 'card-room', name: 'Card room', chips: 300, about: 'Green felt and brass.' },
  { key: 'velvet-room', name: 'Velvet room', chips: 1000, about: 'Deep plum, low light.' },
  { key: 'midnight', name: 'Midnight', chips: 2500, about: 'Ink blue, for the late game.' },
  { key: 'gold-room', name: 'Gold room', chips: 6000, about: 'Black and gold. The high-roller room.' },
];

export type TipTone = 'joker' | 'face' | 'rescue' | 'deal' | 'climb' | 'draw' | 'call' | 'showdown' | 'done';

export type Tip = { tone: TipTone; text: string };

export type Game = {
  /** Finished weeks, oldest first. */
  weeks: Week[];
  current: Week;
  /** Chips banked from finished weeks. */
  stack: number;
  /** One entry per kind of hand, weakest first. */
  hall: HallEntry[];
  bestEver: { hand: Hand; week: Day } | null;
  backs: Set<BackKey>;
  tables: Set<TableKey>;
  suggestedCall: HandKind;
  /** A call can be made or changed until Monday ends. */
  callOpen: boolean;
  /** Yesterday, when keeping anything today would rescue it. */
  rescue: Day | null;
  /** Face cards earned, oldest first. Each one dealt a Joker. */
  faces: { day: Day; suit: Suit; face: FaceInfo }[];
  tips: Tip[];
};

/** Backs for every hand up to the given one: the best hand made so far, as an index into HAND_KINDS. */
function backsUpTo(best: number): Set<BackKey> {
  return new Set(BACKS.filter((b) => b.key === 'classic' || handIndex(b.hand) <= best).map((b) => b.key));
}

function playWeek(start: Day, input: GameInput, live: boolean, jokerDays: ReadonlySet<Day>): Week {
  const slots = dealWeek(start, input.today, input.habits, input.checkIns, input.seed, jokerDays);
  const hand = bestHand(slots.flatMap((s) => (s.card ? [s.card] : [])));
  const call = input.calls.get(start) ?? null;
  const madeCall = !!(call && hand && atLeast(hand.kind, call));
  return { start, slots, hand, call, madeCall, chips: hand ? HANDS[hand.kind].chips : 0, bonus: madeCall && call ? HANDS[call].chips : 0, live };
}

/** One step above your usual hand: the lower median of your last four finished hands. A Flush to start. */
export function suggestCall(weeks: readonly Week[]): HandKind {
  const recent = weeks.filter((w) => w.hand).slice(-4).map((w) => handIndex(w.hand!.kind)).sort((a, b) => a - b);
  if (!recent.length) return 'flush';
  const usual = recent[Math.floor((recent.length - 1) / 2)];
  const index = Math.min(handIndex('royal-flush'), Math.max(handIndex('pair'), usual + 1));
  return HAND_KINDS[index];
}

/** The days face cards were earned, which deal Jokers. */
function jokerDaysOf(input: GameInput): { faces: Game['faces']; jokerDays: Set<Day> } {
  const faces = faceDays(input.habits, input.checkIns, input.today);
  return { faces, jokerDays: new Set(faces.map((f) => f.day)) };
}

/**
 * Every finished week from the first habit's start to last Sunday. They only change when past
 * check-ins or habits do, so callers can keep them and pass them back to `playGame`.
 */
export function playPastWeeks(input: GameInput): Week[] {
  const first = input.habits.reduce<Day | null>((min, h) => (min === null || h.startedOn < min ? h.startedOn : min), null);
  if (!first) return [];
  const { jokerDays } = jokerDaysOf(input);
  const thisWeek = weekStart(input.today);
  const weeks: Week[] = [];
  for (let start = weekStart(first); start < thisWeek; start = addDays(start, 7)) weeks.push(playWeek(start, input, false, jokerDays));
  return weeks;
}

/** Just the week being played, for working out what a single check-in changed. */
export function playLiveWeek(input: GameInput): Week {
  return playWeek(weekStart(input.today), input, true, jokerDaysOf(input).jokerDays);
}

export function playGame(input: GameInput, pastWeeks?: readonly Week[]): Game {
  const { today } = input;
  const { faces, jokerDays } = jokerDaysOf(input);
  const weeks = pastWeeks ? [...pastWeeks] : playPastWeeks(input);
  const current = playWeek(weekStart(today), input, true, jokerDays);

  const stack = weeks.reduce((sum, w) => sum + w.chips + w.bonus, 0);
  const hall = HAND_KINDS.map<HallEntry>((kind) => {
    let best: HallEntry['best'] = null;
    let count = 0;
    let firstWeek: Day | null = null;
    for (const w of weeks) {
      if (w.hand?.kind !== kind) continue;
      count++;
      firstWeek ??= w.start;
      if (!best || w.hand.score > best.hand.score) best = { hand: w.hand, week: w.start };
    }
    return { kind, count, best, first: firstWeek };
  });
  const bestEver = hall.reduce<Game['bestEver']>((top, e) => (e.best && (!top || e.best.hand.score > top.hand.score) ? e.best : top), null);
  const backs = backsUpTo(Math.max(-1, ...weeks.map((w) => (w.hand ? handIndex(w.hand.kind) : -1))));
  const tables = new Set(TABLES.filter((t) => stack >= t.chips).map((t) => t.key));

  const rescue = rescueWaiting(current.slots, today);
  const callOpen = weekday(today) === 0;
  return {
    weeks,
    current,
    stack,
    hall,
    bestEver,
    backs,
    tables,
    suggestedCall: suggestCall(weeks),
    callOpen,
    rescue,
    faces,
    tips: tipsFor(current, input, { rescue, callOpen, faces }),
  };
}

const live = (h: DealHabit, day: Day) => h.startedOn <= day && (h.archivedOn === null || day < h.archivedOn);

/** The best flush still within reach this week: how many days the suit has, and how many could still join it. */
export function flushDraw(current: Week, input: GameInput): { suit: Suit; have: number; left: number } | null {
  const { today, habits } = input;
  const playable = new Set(habits.filter((h) => live(h, today)).map((h) => h.suit));
  const jokers = current.slots.filter((s) => s.card?.kind === 'joker').length;
  let best: { suit: Suit; have: number; left: number } | null = null;
  for (const suit of SUITS) {
    if (!playable.has(suit)) continue;
    let have = jokers;
    let left = 0;
    for (const s of current.slots) {
      const card = s.card;
      if (card?.kind === 'card' && card.suits.includes(suit)) have++;
      else if (s.state === 'future' || (s.isToday && card?.kind !== 'joker')) left++;
    }
    if (have >= 5 || have + left < 5) continue;
    if (!best || have > best.have) best = { suit, have, left };
  }
  return best;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The next face card a suit could earn today, if keeping its remaining habits gets there. */
function faceWithinReach(input: GameInput): { suit: Suit; face: FaceInfo; needed: number } | null {
  const { today, habits, checkIns } = input;
  for (const suit of SUITS) {
    let votes = 0;
    let open = 0;
    for (const h of habits) {
      if (h.suit !== suit) continue;
      const days = checkIns.get(h.id);
      for (const day of days?.keys() ?? []) if (day <= today) votes++;
      if (live(h, today) && !days?.has(today)) open++;
    }
    const next = nextFace(votes);
    if (next && next.needed <= open) return { suit, face: next.face, needed: next.needed };
  }
  return null;
}

function tipsFor(current: Week, input: GameInput, ctx: { rescue: Day | null; callOpen: boolean; faces: Game['faces'] }): Tip[] {
  const { today, habits, checkIns } = input;
  if (!habits.some((h) => live(h, today))) return [];
  const tips: Tip[] = [];
  const slot = current.slots.find((s) => s.isToday);
  const card: DayCard | null = slot?.card ?? null;

  const earnedToday = ctx.faces.filter((f) => f.day === today);
  const jokerThisWeek = current.slots.some((s) => s.card?.kind === 'joker');
  const reach = faceWithinReach(input);
  if (earnedToday.length) {
    const { face, suit } = earnedToday[earnedToday.length - 1];
    const earned = `You earned the ${face.name} of ${SUIT_INFO[suit].name} today`;
    tips.push(
      card?.kind === 'joker'
        ? { tone: 'joker', text: `${earned}, so today's card is a Joker. It plays as any card.` }
        : { tone: 'face', text: `${earned}. This week already had its Joker.` },
    );
  } else if (reach) {
    const { name, part } = SUIT_INFO[reach.suit];
    const keep = reach.needed === 1 ? `Keep one more ${part} habit` : `Keep ${reach.needed} more ${part} habits`;
    const prize = jokerThisWeek ? '' : ' and a Joker';
    tips.push({ tone: 'face', text: `${keep} today to earn the ${reach.face.name} of ${name}${prize}.` });
  }

  if (!card) {
    tips.push(
      ctx.rescue
        ? { tone: 'rescue', text: "Yesterday's card can still be saved. Keep any habit today and it gets a card too." }
        : { tone: 'deal', text: "Keep any habit to deal today's card." },
    );
  } else if (card.kind === 'card') {
    const t = tallyDay(today, habits, checkIns);
    const tier = tierOf(t);
    const climb = (floor: number, action: string) => {
      if (card.rank === 14) return;
      const text = card.rank < floor ? `${action} lifts today's card to ${floor} or better.` : `${action} could still lift today's card.`;
      tips.push({ tone: 'climb', text });
    };
    if (tier === 'showed-up') tips.push({ tone: 'climb', text: 'Keep every habit today to draw from the whole deck, up to an Ace.' });
    else if (tier === 'kept-all') climb(t.kept === 1 ? 10 : 9, t.kept === 1 ? 'Reaching the Ceiling' : 'One Ceiling');
    else if (tier === 'reached-up') climb(10, 'Every habit at its Ceiling');
    else tips.push({ tone: 'done', text: "Perfect day. Today's card is locked in." });
  }

  const handIsFlushOrBetter = current.hand && atLeast(current.hand.kind, 'flush');
  const draw = handIsFlushOrBetter ? null : flushDraw(current, input);
  if (draw && draw.have >= 2) {
    const { glyph, part } = SUIT_INFO[draw.suit];
    const need = 5 - draw.have;
    const todayOpen = card?.kind !== 'joker' && !card?.suits.includes(draw.suit);
    tips.push({
      tone: 'draw',
      text:
        need === 1 && todayOpen
          ? `One more ${glyph} day makes a Flush. Keep a ${part} habit today.`
          : `Flush draw: ${draw.have} of 5 ${glyph} days, ${plural(draw.left, 'day', 'days')} left to find ${need} more.`,
    });
  }

  if (ctx.callOpen && !current.call) tips.push({ tone: 'call', text: 'Call your hand for the week before midnight. Make it and win bonus chips.' });
  if (weekday(today) === 6) tips.push({ tone: 'showdown', text: 'Last card of the week. Showdown at midnight.' });
  return tips;
}

/** What one check-in changed about today: the card before and after, and the hand before and after. */
export type DealEvent = { card: DayCard; was: DayCard | null; hand: Hand | null; handWas: Hand | null };

function sameCard(a: DayCard | null, b: DayCard | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind || a.suits.join() !== b.suits.join()) return false;
  return a.kind === 'joker' || (b.kind === 'card' && a.rank === b.rank);
}

/** The deal a check-in caused, from the live week before and after it, or null when today's card didn't change. */
export function dealEvent(before: Week, after: Week): DealEvent | null {
  const was = before.slots.find((s) => s.isToday)?.card ?? null;
  const card = after.slots.find((s) => s.isToday)?.card ?? null;
  if (!card || sameCard(card, was)) return null;
  return { card, was, hand: after.hand, handWas: before.hand };
}

/** The Showdown waiting to be shown: last week, once it has finished, if it had a hand. */
export function lastShowdown(game: Game): Week | null {
  const last = game.weeks.at(-1);
  return last && last.start === addDays(game.current.start, -7) && last.hand ? last : null;
}

/** What a finished week unlocked: a first in the Hall of Hands, card backs, and any table its chips opened. */
export function unlocksFor(game: Game, week: Week): { firstOfKind: boolean; backs: BackKey[]; tables: TableKey[] } {
  const index = game.weeks.indexOf(week);
  const earlier = game.weeks.slice(0, index);
  const kind = week.hand?.kind;
  const firstOfKind = !!kind && !earlier.some((w) => w.hand?.kind === kind);
  const bestBefore = Math.max(-1, ...earlier.map((w) => (w.hand ? handIndex(w.hand.kind) : -1)));
  const had = backsUpTo(bestBefore);
  const backs = [...backsUpTo(Math.max(bestBefore, kind ? handIndex(kind) : -1))].filter((b) => !had.has(b));
  const before = earlier.reduce((sum, w) => sum + w.chips + w.bonus, 0);
  const after = before + week.chips + week.bonus;
  return { firstOfKind, backs, tables: TABLES.filter((t) => t.chips > before && t.chips <= after).map((t) => t.key) };
}
