/**
 * The game around the hands. Each week, Monday to Sunday, is one hand. At the Showdown on Sunday night it
 * pays chips into your stack, plus a bonus when you called the hand and made it. A call is priced from your
 * own record: a hand you make most weeks pays nothing extra, a stretch pays twice, a long shot three times.
 * Chips never leave the stack, so a bad week can't cost you anything you've won.
 *
 * If your first habit started too late in its week to deal five cards (Thursday to Sunday), that week is a
 * warm-up: its cards deal and count in the Court, but it has no call and no Showdown. The first Showdown is
 * the first full week.
 *
 * Each face card earned in the Court deals a Joker on the first day from then on that was kept on the day
 * and whose week doesn't have one yet, so a burst of face cards spreads over the weeks that follow and no
 * Joker is ever lost. A day logged late never takes a Joker, and only counts toward a face card from the
 * day it was logged, so logging yesterday can't move a Joker that has already been dealt.
 *
 * The Hall of Hands counts every kind of hand a week held, card backs unlock by their own conditions, and
 * a big enough stack opens a new table. All of it is worked out from check-ins and calls; none of it is stored.
 */

import { rankName, SUIT_INFO, SUITS, type Rank, type Suit } from './cards';
import { faceDays, knownOn, nextFace, suitDays, type FaceInfo, type LoggedLate } from './court';
import { addDays, weekday, weekStart, type Day } from './day';
import { canKeep, dayRank, dealWeek, inDeck, keptCards, loOf, rescueWaiting, RIVER_DAYS, riverCard, savedCard, tallyDay, TOP_LO, type DayCard, type DealHabit, type Slot } from './deal';
import type { CheckIns } from './kept';
import { callGap, callGroups, drawsLeft, outs, outsLine, outsWorthSaying, yours, type CallGap } from './outs';
import { atLeast, bestHand, HAND_LADDER, handIndex, handsIn, HANDS, makesCall, SUITED_BONUS, SUITED_DAYS, type Hand, type HandKind } from './poker';

export type GameInput = {
  /** Seeds the deal, so one person always gets the same cards. Their user id. */
  seed: string;
  today: Day;
  /** Every habit, archived ones included, so old weeks keep their cards. */
  habits: readonly DealHabit[];
  checkIns: ReadonlyMap<string, CheckIns>;
  /** Called hands, by the Monday their week starts. */
  calls: ReadonlyMap<Day, HandKind>;
  /** Check-ins logged after their day, and the day each was logged. Left out, every check-in counts as made on its day. */
  late?: LoggedLate;
};

/** What a made call pays, as a multiple of the hand's chips: 0 for a sure thing, up to 3 for a long shot. */
export type Multiplier = 0 | 1 | 2 | 3;

/** The price of calling a hand: how often you made it or better lately, and what that makes it pay. */
export type CallPrice = { made: number; of: number; p: number; multiplier: Multiplier };

export type Week = {
  start: Day;
  slots: Slot[];
  /** The best hand. A finished week includes its river card. */
  hand: Hand | null;
  call: HandKind | null;
  /** The hand matched or beat the call. */
  madeCall: boolean;
  /** What the hand pays. For the live week, what it would pay if the week ended now. Nothing in a warm-up week. */
  chips: number;
  /** The Suited line's chips. */
  suitedBonus: number;
  /** What the call paid: the called hand's chips times its multiplier. */
  bonus: number;
  /** The called hand's multiplier for this week, or 0 with no call. */
  callMultiplier: Multiplier;
  /** This is the week being played now. */
  live: boolean;
  /** The first habit's short first week: cards but no call and no Showdown. */
  warmup: boolean;
  /**
   * The river card: earned by five kept days (saved days don't count). `need` is how many more kept days
   * would earn it. `card` is only known once the week has finished.
   */
  river: { earned: boolean; need: number; card: DayCard | null };
  /** Every kind of hand the week's cards held, not only the one it ended on. */
  contains: Set<HandKind>;
  /** Times kept: one per habit per day, so it can pass 7. On screen it is "times kept", never "kept days". */
  keptDays: number;
};

/** Hands you can call: everything from a Pair to a Royal flush. */
export const CALLABLE: readonly HandKind[] = HAND_LADDER.filter((k) => k !== 'high-card' && k !== 'five-of-a-kind');

/** Finished weeks a call's price looks back on. */
export const CALL_HISTORY = 8;
/** How many weeks' worth of weight the starting price carries, so a short record doesn't swing it. */
const CALL_PRIOR = 4;

/**
 * How often a typical deck of 1 to 6 habits (kept 80% of days, 30% of those at the Ceiling) makes each hand or
 * better in a finished week, from the economy simulation (src/engine/economy.test.ts prints the table). It
 * prices calls until your own weeks take over.
 */
export const CALL_BASELINE: Readonly<Record<number, Readonly<Partial<Record<HandKind, number>>>>> = {
  1: { pair: 0.94, 'two-pair': 0.73, 'three-of-a-kind': 0.4, straight: 0.31, 'full-house': 0.24, 'four-of-a-kind': 0.073, 'straight-flush': 0.031, 'royal-flush': 0.011 },
  2: { pair: 0.99, 'two-pair': 0.82, 'three-of-a-kind': 0.48, straight: 0.39, 'full-house': 0.3, 'four-of-a-kind': 0.097, 'straight-flush': 0.039, 'royal-flush': 0.011 },
  3: { pair: 0.98, 'two-pair': 0.82, 'three-of-a-kind': 0.48, straight: 0.39, 'full-house': 0.29, 'four-of-a-kind': 0.096, 'straight-flush': 0.037, 'royal-flush': 0.01 },
  4: { pair: 0.98, 'two-pair': 0.83, 'three-of-a-kind': 0.52, straight: 0.42, 'full-house': 0.31, 'four-of-a-kind': 0.11, 'straight-flush': 0.04, 'royal-flush': 0.012 },
  5: { pair: 0.98, 'two-pair': 0.82, 'three-of-a-kind': 0.51, straight: 0.4, 'full-house': 0.3, 'four-of-a-kind': 0.11, 'straight-flush': 0.043, 'royal-flush': 0.011 },
  6: { pair: 0.98, 'two-pair': 0.82, 'three-of-a-kind': 0.5, straight: 0.4, 'full-house': 0.3, 'four-of-a-kind': 0.11, 'straight-flush': 0.044, 'royal-flush': 0.012 },
};

export type HallEntry = {
  kind: HandKind;
  /** Finished weeks whose cards held this hand. */
  count: number;
  /** Finished weeks that ended on this hand. */
  ended: number;
  /** The strongest week that ended on it. */
  best: { hand: Hand; week: Day } | null;
  /** The Monday of the first week that held it. */
  first: Day | null;
};

export type BackKey = 'classic' | 'pinstripe' | 'checker' | 'chevron' | 'ladder' | 'velvet' | 'houndstooth' | 'lattice' | 'sunburst' | 'crown' | 'aurora';

/** Card backs. Each has its own way to unlock, shown as `how`. They unlock at the Showdown of the week that earns them. */
export const BACKS: readonly { key: BackKey; name: string; how: string }[] = [
  { key: 'classic', name: 'Classic', how: 'Every deck starts with it.' },
  { key: 'pinstripe', name: 'Pinstripe', how: 'A week with 5 dealt days.' },
  { key: 'checker', name: 'Checker', how: '4 Ceiling days in one week.' },
  { key: 'chevron', name: 'Chevron', how: 'Your first Jack in the Court.' },
  { key: 'ladder', name: 'Ladder', how: 'Your first Straight.' },
  { key: 'velvet', name: 'Velvet', how: '13 weeks played, in total.' },
  { key: 'houndstooth', name: 'Houndstooth', how: 'Call a hand and make it.' },
  { key: 'lattice', name: 'Lattice', how: '7 days in total with every card kept.' },
  { key: 'sunburst', name: 'Sunburst', how: 'Your first Queen in the Court.' },
  { key: 'crown', name: 'Crown', how: 'A Royal flush.' },
  { key: 'aurora', name: 'Aurora', how: 'The secret hand, or 52 weeks played.' },
];

export type TableKey = 'kitchen' | 'card-room' | 'velvet-room' | 'midnight' | 'gold-room' | 'library' | 'lighthouse' | 'observatory';

/** Tables are the app's look. Each opens once your stack reaches its chips. */
export const TABLES: readonly { key: TableKey; name: string; chips: number; about: string }[] = [
  { key: 'kitchen', name: 'Kitchen table', chips: 0, about: 'Where every game starts. Light or dark, like your phone.' },
  { key: 'card-room', name: 'Card room', chips: 600, about: 'Green felt and brass.' },
  { key: 'velvet-room', name: 'Velvet room', chips: 1650, about: 'Deep plum, low light.' },
  { key: 'midnight', name: 'Midnight', chips: 2900, about: 'Ink blue, for the late game.' },
  { key: 'gold-room', name: 'Gold room', chips: 6400, about: 'Black and gold. For the long game.' },
  { key: 'library', name: 'Library', chips: 8100, about: 'Oak and lamplight, for the chapters you are writing.' },
  { key: 'lighthouse', name: 'Lighthouse', chips: 9800, about: 'Sea blue and white. A light to come back to.' },
  { key: 'observatory', name: 'Observatory', chips: 11500, about: 'Night sky and brass. Look how far you have come.' },
];

export type TipTone = 'joker' | 'face' | 'rescue' | 'deal' | 'climb' | 'draw' | 'call' | 'showdown' | 'done';

/** A line above the deck. `far` marks a climb that needs more than one step today (every habit at its Ceiling, or several Ceilings). */
export type Tip = { tone: TipTone; text: string; far?: true };

export type FaceEarned = { day: Day; suit: Suit; face: FaceInfo };

export type Game = {
  /** Finished weeks, oldest first, the warm-up week included. */
  weeks: Week[];
  current: Week;
  /** Chips banked from finished weeks. */
  stack: number;
  /** One entry per kind of hand, weakest first. The warm-up week doesn't count. */
  hall: HallEntry[];
  bestEver: { hand: Hand; week: Day } | null;
  backs: Set<BackKey>;
  /** The Monday of the week each card back (other than Classic) unlocked. */
  backUnlocks: ReadonlyMap<BackKey, Day>;
  tables: Set<TableKey>;
  /** The call with the best expected bonus among those that pay at least once over. */
  suggestedCall: HandKind;
  /** A call can be made or changed until the end of the first day this week that you keep something. */
  callOpen: boolean;
  /** This week's price for each callable hand. Empty in a warm-up week. */
  callOdds: Partial<Record<HandKind, CallPrice>>;
  /** Yesterday, when keeping anything today would save it. */
  rescue: Day | null;
  /** The card yesterday would be saved as: fixed by the day and the seed, whatever today keeps. */
  rescueCard: DayCard | null;
  /** How far this week's hand is from its call, or null with no call (and in a warm-up week). */
  callGap?: CallGap | null;
  /** Face cards earned, oldest first. Each one deals a Joker. */
  faces: FaceEarned[];
  /** The suit of the oldest face card whose Joker hasn't been dealt yet: it waits for a week without one. */
  pendingJoker: Suit | null;
  tips: Tip[];
};

/** Everything a week pays: its hand, the Suited line and the call. */
export function weekTotal(week: Pick<Week, 'chips' | 'suitedBonus' | 'bonus'>): number {
  return week.chips + week.suitedBonus + week.bonus;
}

/**
 * The strongest finished week: the highest hand, then the most chips, then the latest. The week still being
 * played, a warm-up week and a week with no hand never count. Null when there is none.
 */
export function bestWeek(weeks: readonly Week[]): Week | null {
  let best: Week | null = null;
  for (const w of weeks) {
    if (w.live || w.warmup || !w.hand) continue;
    if (!best?.hand) {
      best = w;
      continue;
    }
    const by = w.hand.score - best.hand.score || weekTotal(w) - weekTotal(best) || (w.start > best.start ? 1 : -1);
    if (by > 0) best = w;
  }
  return best;
}

function firstStart(habits: readonly DealHabit[]): Day | null {
  return habits.reduce<Day | null>((min, h) => (min === null || h.startedOn < min ? h.startedOn : min), null);
}

/** The Monday of the warm-up week, when the first habit started with fewer than five days left in its week. */
export function warmupWeek(habits: readonly DealHabit[]): Day | null {
  const first = firstStart(habits);
  return first && 7 - weekday(first) < 5 ? weekStart(first) : null;
}

/** Every day up to today with at least one habit kept on the day itself, in order. Days only logged late are left out. */
function liveDaysOf(input: GameInput): Day[] {
  const days = new Set<Day>();
  for (const h of input.habits) {
    for (const day of input.checkIns.get(h.id)?.keys() ?? []) if (day <= input.today && knownOn(input.late, h.id, day) === day) days.add(day);
  }
  return [...days].sort();
}

/**
 * Where each face card's Joker lands: the first day on or after the face day that was kept on the day
 * itself and whose week has no Joker yet (never the warm-up week). Face days count a day logged late from
 * the day it was logged, and a day logged late never takes a Joker, so a Joker once dealt stays where it
 * is. Faces whose Joker has nowhere to land yet are `waiting`.
 */
export function placeJokers(input: GameInput): { faces: FaceEarned[]; days: Set<Day>; waiting: FaceEarned[] } {
  const faces = faceDays(input.habits, input.checkIns, input.today, input.late);
  const warm = warmupWeek(input.habits);
  const kept = liveDaysOf(input);
  const used = new Set<Day>();
  const days = new Set<Day>();
  const waiting: FaceEarned[] = [];
  for (const f of faces) {
    const day = kept.find((d) => d >= f.day && !used.has(weekStart(d)) && weekStart(d) !== warm);
    if (day) {
      used.add(weekStart(day));
      days.add(day);
    } else waiting.push(f);
  }
  return { faces, days, waiting };
}

/** The multiplier for a hand you make with chance `p`. */
export function multiplierFor(p: number): Multiplier {
  return p >= 0.8 ? 0 : p >= 0.4 ? 1 : p >= 0.1 ? 2 : 3;
}

/**
 * This week's price for each callable hand. The chance is your own record over the last 8 finished weeks
 * (made means that hand or better), blended with how often a deck of this many habits makes it:
 * p = (made + 4 × baseline) / (weeks + 4).
 */
export function callPrices(history: readonly Pick<Week, 'hand' | 'live' | 'warmup'>[], deckSize: number): Partial<Record<HandKind, CallPrice>> {
  const recent = history.filter((w) => !w.live && !w.warmup).slice(-CALL_HISTORY);
  const base = CALL_BASELINE[Math.min(6, Math.max(1, deckSize))];
  const out: Partial<Record<HandKind, CallPrice>> = {};
  for (const kind of CALLABLE) {
    const made = recent.filter((w) => w.hand && atLeast(w.hand.kind, kind)).length;
    const p = Math.round(((made + CALL_PRIOR * (base[kind] ?? 0)) / (recent.length + CALL_PRIOR)) * 10_000) / 10_000;
    out[kind] = { made, of: recent.length, p, multiplier: multiplierFor(p) };
  }
  return out;
}

/** The callable hand with the best expected bonus among those paying at least once over. A Pair with nothing priced. */
export function suggestCall(prices: Partial<Record<HandKind, CallPrice>>): HandKind {
  let best: { kind: HandKind; value: number; p: number } | null = null;
  for (const kind of CALLABLE) {
    const price = prices[kind];
    if (!price || price.multiplier === 0) continue;
    const value = price.p * HANDS[kind].chips * price.multiplier;
    if (!best || value > best.value || (value === best.value && price.p > best.p)) best = { kind, value, p: price.p };
  }
  return best?.kind ?? 'pair';
}

/** The day that fixes a week's deck size for pricing its call: its first kept day, or the latest day so far. */
function priceDay(slots: readonly Slot[], today: Day): Day {
  const first = keptCards(slots)[0]?.day;
  const last = slots[slots.length - 1].day;
  return first ?? (today < last ? today : last);
}

type WeekContext = { live: boolean; jokerDays: ReadonlySet<Day>; history: readonly Pick<Week, 'hand' | 'live' | 'warmup'>[]; warmup: Day | null };

function playWeek(start: Day, input: GameInput, ctx: WeekContext): { week: Week; prices: Partial<Record<HandKind, CallPrice>> } {
  const { today, habits, checkIns, seed } = input;
  const slots = dealWeek(start, today, habits, checkIns, seed, ctx.jokerDays);
  const warmup = start === ctx.warmup;
  const dealt = slots.flatMap((s) => (s.card ? [s.card] : []));
  const kept = keptCards(slots).length;
  const river = ctx.live || warmup ? null : riverCard(start, slots, seed);
  const cards = river ? [...dealt, river] : dealt;
  const hand = bestHand(cards);
  const call = warmup ? null : (input.calls.get(start) ?? null);
  const prices = warmup ? {} : callPrices(ctx.history, habits.filter((h) => inDeck(h, priceDay(slots, today))).length);
  const callMultiplier: Multiplier = call ? (prices[call]?.multiplier ?? 1) : 0;
  const madeCall = !!call && makesCall(hand, call);
  const end = addDays(start, 6);
  let keptDays = 0;
  for (const h of habits) for (const day of checkIns.get(h.id)?.keys() ?? []) if (day >= start && day <= end && day <= today) keptDays++;
  const week: Week = {
    start,
    slots,
    hand,
    call,
    madeCall,
    chips: hand && !warmup ? HANDS[hand.kind].chips : 0,
    suitedBonus: hand?.suited && !warmup ? SUITED_BONUS : 0,
    bonus: madeCall && call ? HANDS[call].chips * callMultiplier : 0,
    callMultiplier,
    live: ctx.live,
    warmup,
    river: { earned: !warmup && kept >= RIVER_DAYS, need: Math.max(0, RIVER_DAYS - kept), card: river },
    contains: handsIn(cards),
    keptDays,
  };
  return { week, prices };
}

/**
 * Every finished week from the first habit's start to last Sunday. They only change when past check-ins,
 * habits or calls do, so callers can keep them and pass them back to `playGame`.
 */
export function playPastWeeks(input: GameInput): Week[] {
  const first = firstStart(input.habits);
  if (!first) return [];
  const { days: jokerDays } = placeJokers(input);
  const warmup = warmupWeek(input.habits);
  const thisWeek = weekStart(input.today);
  const weeks: Week[] = [];
  for (let start = weekStart(first); start < thisWeek; start = addDays(start, 7)) weeks.push(playWeek(start, input, { live: false, jokerDays, history: weeks, warmup }).week);
  return weeks;
}

/**
 * The hands of the last finished weeks a call's price looks back on, newest last, without playing the
 * rest of the history: all a live week needs from the past. Matches `playPastWeeks` for those weeks.
 */
function recentHands(input: GameInput, jokerDays: ReadonlySet<Day>, warmup: Day | null): Pick<Week, 'hand' | 'live' | 'warmup'>[] {
  const first = firstStart(input.habits);
  if (!first) return [];
  const out: Pick<Week, 'hand' | 'live' | 'warmup'>[] = [];
  for (let start = addDays(weekStart(input.today), -7); start >= weekStart(first) && out.length < CALL_HISTORY; start = addDays(start, -7)) {
    if (start === warmup) continue;
    const slots = dealWeek(start, input.today, input.habits, input.checkIns, input.seed, jokerDays);
    const river = riverCard(start, slots, input.seed);
    const dealt = slots.flatMap((s) => (s.card ? [s.card] : []));
    out.unshift({ hand: bestHand(river ? [...dealt, river] : dealt), live: false, warmup: false });
  }
  return out;
}

/**
 * Just the week being played, for working out what a single check-in changed. Pass the finished weeks if
 * you have them; without them only the weeks behind this week's call prices are dealt, so it stays quick.
 */
export function playLiveWeek(input: GameInput, pastWeeks?: readonly Week[]): Week {
  const { days: jokerDays } = placeJokers(input);
  const warmup = warmupWeek(input.habits);
  const history = pastWeeks ?? recentHands(input, jokerDays, warmup);
  return playWeek(weekStart(input.today), input, { live: true, jokerDays, history, warmup }).week;
}

/** Played weeks that count: finished, and not the warm-up. */
function counting(weeks: readonly Week[]): Week[] {
  return weeks.filter((w) => !w.warmup && !w.live);
}

/** When each card back unlocked: the Monday of the week that earned it. Classic is always there and isn't listed. */
function backTimeline(weeks: readonly Week[], faces: readonly FaceEarned[]): Map<BackKey, Day> {
  const at = new Map<BackKey, Day>();
  const firstFace = (face: FaceInfo['face']) => faces.find((f) => f.face.face === face)?.day ?? null;
  const jack = firstFace('jack');
  const queen = firstFace('queen');
  let played = 0;
  let fullDays = 0;
  for (const w of weeks) {
    const unlock = (key: BackKey, when: boolean) => {
      if (when && !at.has(key)) at.set(key, w.start);
    };
    const end = addDays(w.start, 6);
    const cards = keptCards(w.slots);
    if (w.hand) played++;
    fullDays += cards.filter((c) => c.tier !== 'showed-up').length;
    unlock('pinstripe', w.slots.filter((s) => s.card).length >= 5);
    unlock('checker', cards.filter((c) => c.ceilingSuits.length > 0).length >= 4);
    unlock('chevron', jack !== null && jack <= end);
    unlock('ladder', w.contains.has('straight'));
    unlock('velvet', played >= 13);
    unlock('houndstooth', w.madeCall);
    unlock('lattice', fullDays >= 7);
    unlock('sunburst', queen !== null && queen <= end);
    unlock('crown', w.contains.has('royal-flush'));
    unlock('aurora', w.contains.has('five-of-a-kind') || played >= 52);
  }
  return at;
}

export function playGame(input: GameInput, pastWeeks?: readonly Week[]): Game {
  const { today, habits } = input;
  const { faces, days: jokerDays, waiting } = placeJokers(input);
  const warmup = warmupWeek(habits);
  const weeks = pastWeeks ? [...pastWeeks] : playPastWeeks(input);
  const { week: current, prices } = playWeek(weekStart(today), input, { live: true, jokerDays, history: weeks, warmup });
  const played = counting(weeks);

  const stack = weeks.reduce((sum, w) => sum + weekTotal(w), 0);
  const hall = HAND_LADDER.map<HallEntry>((kind) => {
    let best: HallEntry['best'] = null;
    let count = 0;
    let ended = 0;
    let firstWeek: Day | null = null;
    for (const w of played) {
      if (w.contains.has(kind)) {
        count++;
        firstWeek ??= w.start;
      }
      if (w.hand?.kind !== kind) continue;
      ended++;
      if (!best || w.hand.score > best.hand.score) best = { hand: w.hand, week: w.start };
    }
    return { kind, count, ended, best, first: firstWeek };
  });
  const bestEver = hall.reduce<Game['bestEver']>((top, e) => (e.best && (!top || e.best.hand.score > top.hand.score) ? e.best : top), null);
  const backUnlocks = backTimeline(played, faces);
  const backs = new Set<BackKey>(['classic', ...backUnlocks.keys()]);
  const tables = new Set(TABLES.filter((t) => stack >= t.chips).map((t) => t.key));

  const rescue = rescueWaiting(current.slots, today);
  const rescueCard = rescue ? savedCard(rescue, input.seed) : null;
  const firstKept = keptCards(current.slots)[0]?.day ?? null;
  const callOpen = !current.warmup && habits.some((h) => canKeep(h, today)) && (firstKept === null || firstKept === today);
  const gap = current.call && !current.warmup ? callGap(current, current.call, today) : null;
  // The secret hand keeps its name hidden in the tips until a week has held it.
  const secretKnown = hall.some((e) => e.kind === 'five-of-a-kind' && e.count > 0);
  return {
    weeks,
    current,
    stack,
    hall,
    bestEver,
    backs,
    backUnlocks,
    tables,
    suggestedCall: suggestCall(prices),
    callOpen,
    callOdds: prices,
    rescue,
    rescueCard,
    callGap: gap,
    faces,
    pendingJoker: waiting[0]?.suit ?? null,
    tips: tipsFor(current, input, { rescue, rescueCard, callOpen, faces, waiting, gap, secretKnown }),
  };
}

export type CallChoice = {
  kind: HandKind;
  label: 'Safe' | 'Stretch' | 'Long shot';
  multiplier: 1 | 2 | 3;
  /** What the call pays if you make it. */
  payout: number;
  made: number;
  of: number;
  p: number;
  /** "Made this or better in 6 of your last 8 weeks." */
  line: string;
};

function historyLine(made: number, of: number): string {
  if (of === 0) return 'No finished weeks yet, so it’s priced for a deck your size.';
  if (of === 1) return made ? 'Made this or better last week.' : 'Not made last week.';
  return `Made this or better in ${made} of your last ${of} weeks.`;
}

/**
 * Up to three calls to offer: a Safe one paying once over, a Stretch paying twice and a Long shot paying
 * three times, each the hand with the best expected bonus at that multiplier. Any of them can be missing.
 */
export function callChoices(game: Pick<Game, 'callOdds'>): { safe: CallChoice | null; stretch: CallChoice | null; longShot: CallChoice | null } {
  const pick = (multiplier: 1 | 2 | 3, label: CallChoice['label']): CallChoice | null => {
    let best: CallChoice | null = null;
    for (const kind of CALLABLE) {
      const price = game.callOdds[kind];
      if (!price || price.multiplier !== multiplier) continue;
      const payout = HANDS[kind].chips * multiplier;
      if (!best || price.p * payout > best.p * best.payout || (price.p * payout === best.p * best.payout && price.p > best.p)) {
        best = { kind, label, multiplier, payout, made: price.made, of: price.of, p: price.p, line: historyLine(price.made, price.of) };
      }
    }
    return best;
  };
  return { safe: pick(1, 'Safe'), stretch: pick(2, 'Stretch'), longShot: pick(3, 'Long shot') };
}

/** The best Suited week still within reach: how many Ceiling days one suit has, and how many days could still join. */
export function suitedDraw(current: Week, input: GameInput): { suit: Suit; have: number; left: number } | null {
  const { today, habits } = input;
  const playable = new Set(habits.filter((h) => canKeep(h, today)).map((h) => h.suit));
  let best: { suit: Suit; have: number; left: number } | null = null;
  for (const suit of SUITS) {
    if (!playable.has(suit)) continue;
    let have = 0;
    let left = 0;
    for (const s of current.slots) {
      const card = s.card;
      if (card && !(card.kind === 'card' && card.rescued) && card.ceilingSuits.includes(suit)) have++;
      else if (s.state === 'future' || s.isToday) left++;
    }
    if (have >= SUITED_DAYS || have + left < SUITED_DAYS) continue;
    if (!best || have > best.have) best = { suit, have, left };
  }
  return best;
}

/** The next face card a suit could earn today: one more day kept in that suit gets there, and a habit in it is still open. */
function faceWithinReach(input: GameInput): { suit: Suit; face: FaceInfo } | null {
  const { today, habits, checkIns } = input;
  for (const suit of SUITS) {
    const days = suitDays(habits, checkIns, suit, today);
    if (days.at(-1) === today) continue;
    const open = habits.some((h) => h.suit === suit && canKeep(h, today) && !checkIns.get(h.id)?.has(today));
    const next = nextFace(days.length);
    if (open && next?.needed === 1) return { suit, face: next.face };
  }
  return null;
}

/** Today's check-ins split by what can still change: Floors that can still reach a Ceiling, and habits not kept yet. */
type TodayOpen = {
  /** Kept at the Floor and still in the deck, running before today or started today. */
  floors: { running: number; fresh: number };
  /** Not kept yet and still in the deck, running before today. They count toward "everything". */
  running: DealHabit[];
  /** Started today and not kept yet. They only count once kept. */
  fresh: number;
  /** Archived today with a Floor or nothing: they still count today but can't change. */
  archived: boolean;
};

function todayOpen(input: GameInput): TodayOpen {
  const { today, habits, checkIns } = input;
  const out: TodayOpen = { floors: { running: 0, fresh: 0 }, running: [], fresh: 0, archived: false };
  for (const h of habits) {
    if (!inDeck(h, today)) continue;
    const level = checkIns.get(h.id)?.get(today);
    if (level === 'ceiling') continue;
    const before = h.startedOn < today;
    if (!canKeep(h, today)) out.archived ||= before || !!level;
    else if (level) out.floors[before ? 'running' : 'fresh']++;
    else if (before) out.running.push(h);
    else out.fresh++;
  }
  return out;
}

/** The fewest more Ceilings today that would lift the card, and the band they would deal from, or null. */
function ceilingsToLift(t: ReturnType<typeof tallyDay>, open: TodayOpen, lifts: (lo: Rank | null) => boolean): { more: number; lo: Rank; all: boolean } | null {
  const { running, fresh: freshUp } = open.floors;
  for (let more = 1; more <= running + freshUp; more++) {
    let lo: Rank | null = null;
    for (let fresh = 0; fresh <= Math.min(more, freshUp); fresh++) {
      if (more - fresh > running) continue;
      const x = loOf({ counted: t.counted, kept: t.kept, ceilings: t.ceilings + more, freshFloors: t.freshFloors - fresh });
      if (x !== null && (lo === null || x > lo)) lo = x;
    }
    if (lifts(lo)) return { more, lo: lo!, all: t.ceilings + more === t.kept };
  }
  return null;
}

/**
 * What would lift today's card, worked out from the deal itself: "Keep Walk too and today's card is 5 or
 * better". A card that already fits a better band keeps its rank there (see `rankFor`), so only a band
 * above today's card can lift it. The card is called locked in only when nothing left to do today could
 * change it.
 */
function climbTip(input: GameInput, rank: Rank): Tip {
  const { today, habits, checkIns, seed } = input;
  const t = tallyDay(today, habits, checkIns);
  const lo = loOf(t) ?? 2;
  const open = todayOpen(input);
  const lifts = (to: Rank | null) => to !== null && dayRank(to, today, seed) > rank;
  const result = (to: Rank) => `today’s card is ${to} or better`;
  const locked: Tip = { tone: 'done', text: 'Today’s card is locked in. Each habit you keep still counts in your Court.' };
  if (t.kept < t.counted) {
    const keep = open.running;
    const floors = loOf({ counted: t.counted, kept: t.kept + keep.length, ceilings: t.ceilings, freshFloors: t.freshFloors });
    if (keep.length && lifts(floors)) {
      const who = keep.length === 1 ? `Keep ${keep[0].name?.trim() || 'your last habit'} too` : `Keep the other ${keep.length} habits too`;
      return { tone: 'climb', text: `${who} and ${result(floors!)}.` };
    }
    // Everything that can still change, all at the Ceiling, new habits included.
    const all = keep.length + open.fresh;
    const up = all + open.floors.running + open.floors.fresh;
    const top = loOf({ counted: t.counted + open.fresh, kept: t.kept + all, ceilings: t.ceilings + up, freshFloors: t.freshFloors - open.floors.fresh });
    if (lifts(top)) return { tone: 'climb', text: `${open.archived ? 'Keep every habit you still can' : 'Keep every habit'}, all at their Ceilings, and ${result(top!)}.`, far: true };
    return locked;
  }
  if (lo >= TOP_LO) return t.ceilings === t.kept ? { tone: 'done', text: 'Perfect day. Every habit at its Ceiling.' } : locked;
  const lift = ceilingsToLift(t, open, lifts);
  if (!lift) return locked;
  const makes = `today’s card ${lift.lo} or better`;
  if (lift.more === 1) return { tone: 'climb', text: lift.all ? `${t.counted === 1 ? 'Reaching the Ceiling' : 'Every habit at its Ceiling'} makes ${makes}.` : `One more Ceiling makes ${makes}.` };
  if (lift.all) return { tone: 'climb', text: `${t.counted === 1 ? 'Reaching the Ceiling' : 'Every habit at its Ceiling'} makes ${makes}.`, far: true };
  return { tone: 'climb', text: `${lift.more} more Ceilings make ${makes}.`, far: true };
}

/** Yesterday's saved card in words, and whether it lifts the hand: "Yesterday’s Jack can still be saved, and it makes your Two pair." */
function rescueTip(current: Week, saved: DayCard | null, secretKnown: boolean): Tip {
  if (saved?.kind !== 'card') return { tone: 'rescue', text: 'Yesterday’s card can still be saved. Keep any habit today and it gets a card too.' };
  const name = rankName(saved.rank);
  const now = current.hand;
  const lifted = now && !current.warmup ? bestHand([...current.slots.flatMap((s) => (s.card ? [s.card] : [])), saved]) : null;
  if (now && lifted && handIndex(lifted.kind) > handIndex(now.kind)) {
    return { tone: 'rescue', text: `Yesterday’s ${name} can still be saved, and it makes ${yours(lifted.kind, { secretKnown })}. Keep any habit today.` };
  }
  return { tone: 'rescue', text: `Yesterday’s ${name} can still be saved. Keep any habit today and it’s yours.` };
}

/**
 * The outs worth a tip on Today: the ranks one card away from the call, or, with three cards or more, the
 * ranks that make a Straight or better. Only while a day is still to play, and never in a warm-up week.
 */
function drawTip(current: Week, today: Day, gap: CallGap | null, secretKnown: boolean): Tip | null {
  if (current.warmup || drawsLeft(current, today).days === 0) return null;
  if (current.call && gap?.cards === 1) {
    const line = outsLine(callGroups(current, current.call, gap), { call: current.call, secretKnown });
    if (line) return { tone: 'draw', text: line };
  }
  if (!outsWorthSaying(current)) return null;
  const big = outs(current.slots.flatMap((s) => (s.card ? [s.card] : []))).filter((g) => atLeast(g.makes, 'straight'));
  const line = outsLine(big, { call: current.call, secretKnown });
  return line ? { tone: 'draw', text: line } : null;
}

function tipsFor(
  current: Week,
  input: GameInput,
  ctx: { rescue: Day | null; rescueCard: DayCard | null; callOpen: boolean; faces: readonly FaceEarned[]; waiting: readonly FaceEarned[]; gap: CallGap | null; secretKnown: boolean },
): Tip[] {
  const { today, habits } = input;
  if (!habits.some((h) => canKeep(h, today))) return [];
  const tips: Tip[] = [];
  const slot = current.slots.find((s) => s.isToday);
  const card: DayCard | null = slot?.card ?? null;

  const earnedToday = ctx.faces.filter((f) => f.day === today);
  const jokerThisWeek = current.slots.some((s) => s.card?.kind === 'joker');
  const reach = faceWithinReach(input);
  if (earnedToday.length) {
    const { face, suit } = earnedToday[0];
    const earned = `You earned the ${face.name} of ${SUIT_INFO[suit].name} today`;
    // Earned with a day logged late, before anything was kept today: today's card will be the Joker.
    const next = !card && !jokerThisWeek && !current.warmup;
    tips.push(
      card?.kind === 'joker'
        ? { tone: 'joker', text: `${earned}, so today’s card is a Joker.` }
        : next
          ? { tone: 'joker', text: `${earned}. Keep any habit today and it’s dealt as a Joker.` }
          : { tone: 'face', text: `${earned}. Its Joker waits for next week’s first kept day.` },
    );
  } else if (ctx.waiting.length) {
    tips.push(
      !card && !jokerThisWeek && !current.warmup
        ? { tone: 'joker', text: 'Keep any habit today and it’s dealt as a Joker.' }
        : { tone: 'joker', text: 'Your Joker waits for next week’s first kept day.' },
    );
  } else if (reach) {
    const { name, part } = SUIT_INFO[reach.suit];
    const prize = jokerThisWeek ? ' and a Joker for next week' : ' and a Joker';
    tips.push({ tone: 'face', text: `Keep a ${part} habit today to earn the ${reach.face.name} of ${name}${prize}.` });
  }

  if (!card) {
    tips.push(ctx.rescue ? rescueTip(current, ctx.rescueCard, ctx.secretKnown) : { tone: 'deal', text: 'Keep any habit to deal today’s card.' });
  } else if (card.kind === 'card') {
    tips.push(climbTip(input, card.rank));
  }

  const outsTip = drawTip(current, today, ctx.gap, ctx.secretKnown);
  if (outsTip) tips.push(outsTip);

  // Suited pays nothing while SUITED_BONUS is 0, so the draw only becomes a tip when it pays.
  const draw = SUITED_BONUS > 0 && !current.hand?.suited && !outsTip ? suitedDraw(current, input) : null;
  if (draw && draw.have >= 3) {
    const { glyph, part } = SUIT_INFO[draw.suit];
    const need = SUITED_DAYS - draw.have;
    const todayOpen = !card || !card.ceilingSuits.includes(draw.suit);
    tips.push({
      tone: 'draw',
      text:
        need === 1 && todayOpen
          ? `One more ${glyph} ${part} Ceiling day makes the week Suited. Reach a ${part} Ceiling today.`
          : `${draw.have} of 5 ${glyph} ${part} Ceiling days so far. ${need} more in the ${draw.left} days left makes the week Suited.`,
    });
  }

  if (ctx.callOpen && !current.call) {
    tips.push({ tone: 'call', text: `Call the hand you’ll make this week. Make it and it pays. ${card ? 'Calls close at midnight.' : 'Calls close at midnight on your first kept day.'}` });
  }

  const sunday = weekday(today) === 6;
  const daysLeft = 6 - weekday(today) + (card ? 0 : 1);
  if (current.warmup) {
    tips.push({ tone: 'showdown', text: sunday ? 'Last day of the warm-up week. Your first full hand deals Monday.' : 'Warm-up week. Your first full hand deals Monday.' });
  } else {
    const need = current.river.need;
    if (!current.river.earned && need <= daysLeft && need <= 2) {
      tips.push({ tone: 'showdown', text: `${need === 1 ? 'One more day' : `${need} more days`} you keep something ${need === 1 ? 'earns' : 'earn'} a river card at the Showdown.` });
    }
    if (sunday) {
      // The last draws, when any are left: today's card (until it is dealt) and the river.
      const left = drawsLeft(current, today);
      const last = left.river ? (left.days > 0 ? 'Today’s card and the river are your last two draws.' : 'The river is your last draw.') : null;
      tips.push({ tone: 'showdown', text: last ? `Showdown at midnight. ${last}` : 'Last day of the week. Showdown at midnight: your hand pays out.' });
    }
  }
  return tips;
}

/** What one check-in changed about today: the card before and after, and the hand before and after. */
export type DealEvent = {
  card: DayCard;
  was: DayCard | null;
  hand: Hand | null;
  handWas: Hand | null;
  /** Today's card went up but the week's hand got weaker: a higher card broke a match. Say so plainly. */
  handDropped: boolean;
};

/** Whether a day's card got better: a first card, a Joker, or a higher rank. A suit added at the same rank is not news. */
export function improves(card: DayCard, was: DayCard | null): boolean {
  if (!was) return true;
  if (card.kind === 'joker') return was.kind !== 'joker';
  if (was.kind === 'joker') return false;
  return card.rank > was.rank;
}

/**
 * The deal a check-in caused, from the live week before and after it. Null when today's card didn't get
 * better, so a suit added at the same rank, turning a Ceiling back into a Floor, or keeping more habits on
 * a Joker day stays quiet.
 */
export function dealEvent(before: Week, after: Week): DealEvent | null {
  const was = before.slots.find((s) => s.isToday)?.card ?? null;
  const card = after.slots.find((s) => s.isToday)?.card ?? null;
  if (!card || !improves(card, was)) return null;
  const handDropped = !!before.hand && (!after.hand || after.hand.score < before.hand.score);
  return { card, was, hand: after.hand, handWas: before.hand, handDropped };
}

/** The Showdown waiting to be shown: last week, once it has finished, if it had a hand and wasn't the warm-up. */
export function lastShowdown(game: Game): Week | null {
  const last = game.weeks.at(-1);
  return last && last.start === addDays(game.current.start, -7) && !last.warmup && last.hand ? last : null;
}

/** What a finished week unlocked: a first in the Hall of Hands (the hand it ended on), card backs, and any table its chips opened. */
export function unlocksFor(game: Game, week: Week): { firstOfKind: boolean; backs: BackKey[]; tables: TableKey[] } {
  const index = game.weeks.indexOf(week);
  const earlier = game.weeks.slice(0, index);
  const kind = week.hand?.kind;
  const firstOfKind = !!kind && !week.warmup && !counting(earlier).some((w) => w.hand?.kind === kind);
  const backs = BACKS.filter((b) => game.backUnlocks.get(b.key) === week.start).map((b) => b.key);
  const before = earlier.reduce((sum, w) => sum + weekTotal(w), 0);
  const after = before + weekTotal(week);
  return { firstOfKind, backs, tables: TABLES.filter((t) => t.chips > before && t.chips <= after).map((t) => t.key) };
}

/**
 * Weeks in a chapter. Every 13th played week looks back on the chapter it closes. A played week is a finished
 * week with a hand, the same count as the Velvet back, so the look-back always lands on a Showdown, even
 * after weeks away. Nothing resets.
 */
export const CHAPTER_WEEKS = 13;

export type ChapterRecap = {
  /** 1 for the first 13 played weeks, and so on. */
  chapter: number;
  start: Day;
  end: Day;
  chips: number;
  best: { hand: Hand; week: Day } | null;
  /** Days you kept something. */
  dealtDays: number;
  /** Times kept, one per habit per day. On screen it is "times kept", never "kept days". */
  keptDays: number;
  faces: FaceEarned[];
};

/** The chapter a finished week closes, when it is the 13th, 26th, ... played week. Null for any other week. */
export function chapterRecap(game: Game, week: Week): ChapterRecap | null {
  const played = counting(game.weeks).filter((w) => w.hand);
  const i = played.indexOf(week);
  if (i < 0 || (i + 1) % CHAPTER_WEEKS !== 0) return null;
  const chunk = played.slice(i + 1 - CHAPTER_WEEKS, i + 1);
  const start = chunk[0].start;
  const end = addDays(week.start, 6);
  let best: ChapterRecap['best'] = null;
  for (const w of chunk) if (w.hand && (!best || w.hand.score > best.hand.score)) best = { hand: w.hand, week: w.start };
  return {
    chapter: (i + 1) / CHAPTER_WEEKS,
    start,
    end,
    chips: chunk.reduce((sum, w) => sum + weekTotal(w), 0),
    best,
    dealtDays: chunk.reduce((sum, w) => sum + keptCards(w.slots).length, 0),
    keptDays: chunk.reduce((sum, w) => sum + w.keptDays, 0),
    faces: game.faces.filter((f) => f.day >= start && f.day <= end),
  };
}

export type HabitWeek = { id: string; suit: Suit; kept: number; ceilings: number; /** Days the habit was in the deck this week, so far. */ days: number };

export type WeekReview = {
  /** Days with a card, saved days included. */
  dealt: number;
  saved: number;
  /** Days with at least one Ceiling. */
  ceilingDays: number;
  /** Times kept, one per habit per day. On screen it is "times kept", never "kept days". */
  keptDays: number;
  ceilings: number;
  /** The part of you that showed up most: the suit kept on the most days (saved days don't count). */
  lead: Suit | null;
  /** Every habit in the deck that week, the one started first first. */
  habits: HabitWeek[];
  /** The habit kept most, or null when none was kept. */
  best: string | null;
  /** The habit kept least often for its days, when one was missed at all. */
  weakest: string | null;
};

/** Behind the hand: how the week went, habit by habit. */
export function weekReview(week: Week, input: GameInput): WeekReview {
  const end = addDays(week.start, 6);
  const last = input.today < end ? input.today : end;
  const cards = keptCards(week.slots);
  const habits: HabitWeek[] = [];
  for (const h of [...input.habits].sort((a, b) => a.startedOn.localeCompare(b.startedOn) || (a.id < b.id ? -1 : 1))) {
    let kept = 0;
    let ceilings = 0;
    let days = 0;
    for (let day = week.start; day <= last; day = addDays(day, 1)) {
      const level = input.checkIns.get(h.id)?.get(day);
      if (inDeck(h, day)) days++;
      if (level) kept++;
      if (level === 'ceiling') ceilings++;
    }
    if (days || kept) habits.push({ id: h.id, suit: h.suit, kept, ceilings, days: Math.max(days, kept) });
  }
  let lead: { suit: Suit; days: number; ceilings: number } | null = null;
  for (const suit of SUITS) {
    const days = cards.filter((c) => c.suits.includes(suit)).length;
    const ceilings = cards.filter((c) => c.ceilingSuits.includes(suit)).length;
    if (days && (!lead || days > lead.days || (days === lead.days && ceilings > lead.ceilings))) lead = { suit, days, ceilings };
  }
  const kept = habits.filter((h) => h.kept > 0);
  const best = kept.reduce<HabitWeek | null>((top, h) => (!top || h.kept > top.kept || (h.kept === top.kept && h.ceilings > top.ceilings) ? h : top), null);
  const missed = habits.filter((h) => h.days > 0 && h.kept < h.days);
  const weakest = missed.reduce<HabitWeek | null>((low, h) => (!low || h.kept / h.days < low.kept / low.days || (h.kept / h.days === low.kept / low.days && h.ceilings < low.ceilings) ? h : low), null);
  return {
    dealt: week.slots.filter((s) => s.card).length,
    saved: week.slots.filter((s) => s.card?.kind === 'card' && s.card.rescued).length,
    ceilingDays: cards.filter((c) => c.ceilingSuits.length > 0).length,
    keptDays: habits.reduce((sum, h) => sum + h.kept, 0),
    ceilings: habits.reduce((sum, h) => sum + h.ceilings, 0),
    lead: lead?.suit ?? null,
    habits,
    best: best?.id ?? null,
    weakest: weakest?.id ?? null,
  };
}
