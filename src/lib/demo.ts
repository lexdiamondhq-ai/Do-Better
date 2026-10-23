/**
 * The demo deck: a made-up player ten weeks into the game, kept in memory. It lets you try the
 * Showdown, the Hall of Hands and the Court straight away, without an account or a database.
 * Nothing is saved; signing out of the demo throws it away.
 *
 * The deck opens on one Comeback: every card was kept yesterday except Walk, so the first swipe turns
 * Walk's dark card back over and deals an everyday card. Reach out sits one kept day short of the Queen of
 * Hearts, so its keep later in the day earns the Queen and deals a Joker. Walk carries a plan made a few
 * weeks ago (`demoPlans`), so its Comeback card leads with Your plan.
 * Its history is laid out by week, so every face card falls in a week of its own, and none in this one.
 */

import type { Plan } from '@/engine/comeback';
import { addDays, daysBetween, weekday, weekStart, type Day } from '@/engine/day';
import { keptCards, unit, type DealHabit } from '@/engine/deal';
import { callPrices, playPastWeeks, type CallPrice, type Week } from '@/engine/game';
import { indexCheckIns, type Level } from '@/engine/kept';
import { RECIPES } from '@/engine/playbook';
import { atLeast, handIndex, type HandKind } from '@/engine/poker';
import { suitColors } from '@/theme/tokens';

import type { Backend, Loaded } from './backend';
import { emptyDeck } from './play';
import type { Habit, HabitDay } from './types';

type CardHistory = { recipe: string; weeks: number; keep: number; ceiling: number };

/** Each card, how many weeks before this one it started (on a Monday), and how often it was kept and reached. */
const PLANS: CardHistory[] = [
  { recipe: 'read', weeks: 10, keep: 0.86, ceiling: 0.45 },
  { recipe: 'walk', weeks: 10, keep: 0.8, ceiling: 0.35 },
  { recipe: 'deep-work', weeks: 9, keep: 0.72, ceiling: 0.4 },
  { recipe: 'reach-out', weeks: 7, keep: 0.62, ceiling: 0.25 },
];

/** The card the demo's first swipe keeps: the only one whose yesterday got away. */
const COMEBACK = 'walk';

/** The card that earns the Queen of Hearts and a Joker when it is kept today. */
const QUEEN = 'reach-out';

/**
 * Whys the demo player wrote in their own words. Only a why of your own shows on a card (a recipe's stock
 * why is hidden), so the Comeback card has one to show.
 */
const OWN_WHYS: Partial<Record<string, string>> = {
  [COMEBACK]: 'Ten minutes outside and the whole day goes better.',
  [QUEEN]: 'I don’t want my sister to only hear from me on birthdays.',
};

/**
 * Kept days before today for the cards the opening turns on, whatever the weekday: Walk's are worn in past
 * Well played, and Reach out (the only Hearts card) sits one short of the Queen.
 */
const SETTLED: Partial<Record<string, { days: number; after: number }>> = {
  // Moved days fall after its Queen (its 30th kept day), so every face card it earned stays where it was.
  [COMEBACK]: { days: 48, after: 31 },
  // Moved days fall after its Jack (its 10th kept day), so the Jack stays on the same day.
  [QUEEN]: { days: 29, after: 11 },
};

/**
 * Whole days off, counted from this week's Monday, so the game has rescues to show: a Tuesday and a
 * Thursday each saved by the next day, and a Wednesday and Thursday missed in a row, where only the
 * Thursday is saved.
 */
const BLANKS = [-13, -25, -40, -39];

/** Fixes the luck of the demo history. Chosen so every face card lands in a week of its own. */
const HISTORY = 'demo-history-22';

/** The hands the demo player calls, from a Pair to a Full house. */
const CALLS: readonly HandKind[] = ['pair', 'two-pair', 'three-of-a-kind', 'straight', 'full-house'];

/** A roll in [0, 1) for one card on one day, the same every week: days are counted from this week's Monday. */
const roll = (recipe: string, offset: number, what: string) => unit(`${HISTORY}:${recipe}:${offset}:${what}`);

/** `count` items from `from`, spread evenly across it. */
function spread<T>(from: readonly T[], count: number): T[] {
  if (count <= 0 || from.length === 0) return [];
  const n = Math.min(count, from.length);
  return Array.from({ length: n }, (_, k) => from[Math.floor(((k + 0.5) * from.length) / n)]);
}

function buildHistory(today: Day): { habits: Habit[]; days: HabitDay[] } {
  const monday = weekStart(today);
  const yesterday = addDays(today, -1);
  const blanks = new Set(BLANKS.map((n) => addDays(monday, n)));
  const habits: Habit[] = PLANS.map((plan, position) => {
    const r = RECIPES.find((x) => x.key === plan.recipe)!;
    return {
      id: `demo-${r.key}`,
      name: r.name,
      identity: r.identity,
      floorLabel: r.floor,
      ceilingLabel: r.ceiling,
      twoMinuteLabel: r.twoMinute,
      color: suitColors[r.suit].habit,
      suit: r.suit,
      suitSet: true,
      anchor: r.anchor,
      whenWhere: null,
      why: OWN_WHYS[r.key] ?? r.why,
      recipeKey: r.key,
      position,
      startedOn: addDays(monday, -7 * plan.weeks),
      archivedAt: null,
    };
  });

  const days: HabitDay[] = [];
  PLANS.forEach((plan, i) => {
    const comeback = plan.recipe === COMEBACK;
    const mine: HabitDay[] = [];
    for (let day = habits[i].startedOn; day < today; day = addDays(day, 1)) {
      const offset = daysBetween(monday, day);
      const level: Level = roll(plan.recipe, offset, 'ceiling') < plan.ceiling ? 'ceiling' : 'floor';
      let kept = roll(plan.recipe, offset, 'keep') < plan.keep && !blanks.has(day);
      // Yesterday got away for the Comeback card only, the day after a kept one. Every other card was kept.
      if (day === yesterday) kept = !comeback;
      if (comeback && day === addDays(today, -2)) kept = true;
      if (kept) mine.push({ habitId: habits[i].id, day, level });
    }
    const settled = SETTLED[plan.recipe];
    if (settled) settle(mine, habits[i].id, today, blanks, settled);
    days.push(...mine);
  });
  return { habits, days };
}

/**
 * Brings a card to exactly `to.days` kept days before today, taking days away or adding them evenly after
 * its `to.after`-th kept day and before its last two days, so the face cards it earned before then stay on
 * the same days whatever today is, and yesterday and the day before stay as they were.
 */
function settle(mine: HabitDay[], habitId: string, today: Day, blanks: ReadonlySet<Day>, to: { days: number; after: number }): void {
  const after = mine[to.after]?.day ?? today;
  const latest = addDays(today, -3);
  const kept = new Set(mine.map((d) => d.day));
  if (mine.length > to.days) {
    const movable = mine.filter((d) => d.day > after && d.day <= latest);
    for (const d of spread(movable, mine.length - to.days)) mine.splice(mine.indexOf(d), 1);
  } else if (mine.length < to.days) {
    const free: Day[] = [];
    for (let day = addDays(after, 1); day <= latest; day = addDays(day, 1)) if (!kept.has(day) && !blanks.has(day)) free.push(day);
    for (const day of spread(free, to.days - mine.length)) mine.push({ habitId, day, level: 'floor' });
    mine.sort((a, b) => a.day.localeCompare(b.day));
  }
}

/** How long ago the demo player made Walk's plan: long enough that the plan sheet offers a fresh one. */
const PLAN_MADE_DAYS_AGO = 20;

/**
 * The demo player's plans, by habit id: Walk's, made 20 days ago, for when they're too tired (put on your
 * shoes). Only shown in the demo, under any plan made on this phone.
 */
export function demoPlans(today: Day): Record<string, Plan> {
  return { [`demo-${COMEBACK}`]: { when: 'tired', then: 'first', made: addDays(today, -PLAN_MADE_DAYS_AGO) } };
}

/** The plans the demo player sees: the sample plan for any card without one, and every plan made on this phone over it. */
export function withDemoPlans(saved: Readonly<Record<string, Plan>>, today: Day): Record<string, Plan> {
  return { ...demoPlans(today), ...saved };
}

/** Finished weeks as a seed deals them, with no calls made. */
function weeksFor(today: Day, habits: readonly Habit[], days: readonly HabitDay[], seed: string): Week[] {
  const deal: DealHabit[] = habits.map((h) => ({ id: h.id, suit: h.suit, startedOn: h.startedOn, archivedOn: null }));
  return playPastWeeks({ seed, today, habits: deal, checkIns: indexCheckIns(days), calls: new Map() });
}

/** How many kinds of hand a deal's finished weeks show, with a little extra for a high one. */
function variety(weeks: readonly Week[]): number {
  const kinds = new Set(weeks.flatMap((w) => (w.hand ? [w.hand.kind] : [])));
  return kinds.size ? kinds.size * 2 + Math.max(...[...kinds].map(handIndex)) : 0;
}

/**
 * The deal seed. The public demo opens on last week's Showdown, so it takes a deal whose last week made a
 * call that pays, and among those the one with the widest spread of hands. A typical player takes the
 * middle one by spread, so a phone test sees what most players would.
 */
function pickSeed(today: Day, habits: readonly Habit[], days: readonly HabitDay[], typical: boolean): { seed: string; weeks: Week[] } {
  const deals = Array.from({ length: typical ? 15 : 8 }, (_, i) => {
    const seed = `demo-${i}`;
    const weeks = weeksFor(today, habits, days, seed);
    return { seed, weeks, score: variety(weeks) };
  });
  if (typical) return [...deals].sort((a, b) => a.score - b.score)[Math.floor(deals.length / 2)];
  const opens = deals.filter((d) => lastCallPays(d.weeks, habits));
  return (opens.length ? opens : deals).reduce((best, d) => (d.score > best.score ? d : best));
}

/** The highest callable hand a week's hand makes, or a Pair for a week that made none. */
function callFor(kind: HandKind | undefined): HandKind {
  if (!kind) return CALLS[0];
  return [...CALLS].reverse().find((c) => atLeast(kind, c)) ?? CALLS[0];
}

/** The hand a player usually ends a week with, as a call: the most common of their last four weeks, the lower on a tie. */
function usualCall(weeks: readonly Week[]): HandKind {
  const recent = weeks.slice(-4).map((w) => callFor(w.hand?.kind));
  if (!recent.length) return CALLS[0];
  const count = (k: HandKind) => recent.filter((r) => r === k).length;
  return recent.reduce((best, k) => (count(k) > count(best) || (count(k) === count(best) && handIndex(k) < handIndex(best)) ? k : best));
}

type Prices = Partial<Record<HandKind, CallPrice>>;

/** What each call pays in a finished week, priced as the game prices it: from the weeks before, for the cards in the deck then. */
function pricesFor(weeks: readonly Week[], i: number, habits: readonly Habit[]): Prices {
  const week = weeks[i];
  const first = keptCards(week.slots)[0]?.day ?? addDays(week.start, 6);
  return callPrices(weeks.slice(0, i), habits.filter((h) => h.startedOn <= first).length);
}

const pays = (prices: Prices, kind: HandKind) => (prices[kind]?.multiplier ?? 0) > 0;

/** `kind`, or the next call up that pays something. A sure thing pays nothing, and the call screen never offers one. */
function payingFrom(kind: HandKind, prices: Prices): HandKind {
  return CALLS.slice(CALLS.indexOf(kind)).find((k) => pays(prices, k)) ?? kind;
}

/**
 * The demo player's calls, every one of them priced to pay. The public demo calls the best paying hand
 * each week went on to make, and every third week reaches for the next paying hand and misses, so the
 * Hall shows both. A typical player calls their usual hand, or the next one up when that pays nothing.
 */
function callsFor(weeks: readonly Week[], habits: readonly Habit[], typical: boolean): Loaded['calls'] {
  return weeks.map((w, i) => {
    const prices = pricesFor(weeks, i, habits);
    if (typical) return { weekStart: w.start, hand: payingFrom(usualCall(weeks.slice(0, i)), prices) };
    const made = (k: HandKind) => !!w.hand && atLeast(w.hand.kind, k);
    const hits = CALLS.filter((k) => pays(prices, k) && made(k));
    const reach = CALLS.find((k) => pays(prices, k) && !made(k));
    // The last week is the Showdown the demo opens on, so it never carries the planned miss.
    const planned = i % 3 === 1 && i < weeks.length - 1;
    const hand = (planned && reach) || hits.at(-1) || reach || callFor(w.hand?.kind);
    return { weekStart: w.start, hand };
  });
}

/** Whether the last finished week made a call that pays, so the Showdown the demo opens on can show one. */
function lastCallPays(weeks: readonly Week[], habits: readonly Habit[]): boolean {
  const i = weeks.length - 1;
  const last = weeks[i];
  if (!last?.hand) return false;
  const prices = pricesFor(weeks, i, habits);
  return CALLS.some((k) => pays(prices, k) && atLeast(last.hand!.kind, k));
}

/** Whether this is a development build asking for a typical player (EXPO_PUBLIC_DEMO=typical). */
function typicalFromEnv(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_DEMO === 'typical';
}

export type DemoOptions = {
  /** A typical player instead of the curated one: the middle deal by variety, calling their usual hand. Development only. */
  typical?: boolean;
};

export function createDemoBackend(today: Day, options: DemoOptions = { typical: typicalFromEnv() }): Backend {
  const typical = options.typical ?? false;
  const { habits, days } = buildHistory(today);
  const { seed, weeks } = pickSeed(today, habits, days, typical);
  const calls = callsFor(weeks, habits, typical);
  // On Monday the call is yours to make. Later in the week, the demo player already called their usual hand.
  if (weekday(today) !== 0) calls.push({ weekStart: weekStart(today), hand: payingFrom(usualCall(weeks), callPrices(weeks, habits.length)) });

  const state: Loaded = {
    profile: { id: 'demo', displayName: 'Demo', timezone: 'UTC', northStar: 'Someone who reads every day, keeps moving, and stays close to the people I love.', onboardedAt: habits[0].startedOn },
    habits,
    days,
    prompts: [],
    calls,
  };
  const copy = (): Loaded => ({ ...state, habits: [...state.habits], days: [...state.days], prompts: [...state.prompts], calls: [...state.calls] });
  let made = 0;

  return {
    seed,
    kind: 'demo',
    async load(timezone) {
      state.profile = { ...state.profile, timezone };
      return copy();
    },
    async saveDay(habitId, day, level, loggedOn) {
      const row: HabitDay = loggedOn && loggedOn > day ? { habitId, day, level, loggedOn } : { habitId, day, level };
      state.days = [...state.days.filter((d) => !(d.habitId === habitId && d.day === day)), row];
    },
    async deleteDay(habitId, day) {
      state.days = state.days.filter((d) => !(d.habitId === habitId && d.day === day));
    },
    async createHabits(drafts, startedOn, position) {
      const habits = drafts.map<Habit>((draft, i) => ({
        ...draft,
        suitSet: true,
        id: `demo-new-${++made}`,
        identity: draft.identity.trim() || null,
        twoMinuteLabel: draft.twoMinuteLabel.trim() || null,
        anchor: draft.anchor.trim() || null,
        whenWhere: draft.whenWhere.trim() || null,
        why: draft.why.trim() || null,
        position: position + i,
        startedOn,
        archivedAt: null,
      }));
      state.habits = [...state.habits, ...habits];
      return habits;
    },
    async updateHabit(id, draft) {
      const old = state.habits.find((h) => h.id === id);
      if (!old) throw new Error('That card has left the deck.');
      const habit: Habit = {
        ...old,
        ...draft,
        suitSet: true,
        identity: draft.identity.trim() || null,
        twoMinuteLabel: draft.twoMinuteLabel.trim() || null,
        anchor: draft.anchor.trim() || null,
        whenWhere: draft.whenWhere.trim() || null,
        why: draft.why.trim() || null,
      };
      state.habits = state.habits.map((h) => (h.id === id ? habit : h));
      return habit;
    },
    async archiveHabit(id, archivedAt) {
      state.habits = state.habits.map((h) => (h.id === id ? { ...h, archivedAt } : h));
    },
    async updatePositions(moves) {
      const to = new Map(moves.map((m) => [m.id, m.position]));
      state.habits = state.habits.map((h) => (to.has(h.id) ? { ...h, position: to.get(h.id)! } : h));
    },
    async savePrompt(prompt) {
      const old = state.prompts.find((p) => p.habitId === prompt.habitId && p.missedDay === prompt.missedDay);
      state.prompts = [{ ...prompt, response: prompt.response ?? old?.response ?? null }, ...state.prompts.filter((p) => p !== old)];
    },
    async clearPrompt(habitId, missedDay) {
      state.prompts = state.prompts.map((p) => (p.habitId === habitId && p.missedDay === missedDay ? { ...p, response: null } : p));
    },
    async deletePrompt(habitId, missedDay) {
      state.prompts = state.prompts.filter((p) => !(p.habitId === habitId && p.missedDay === missedDay));
    },
    async saveProfile({ northStar, onboardedAt }) {
      state.profile = { ...state.profile, ...(northStar !== undefined ? { northStar } : {}), ...(onboardedAt ? { onboardedAt } : {}) };
    },
    async saveCall(weekStart, hand) {
      state.calls = [...state.calls.filter((c) => c.weekStart !== weekStart), { weekStart, hand }];
    },
    async deleteDeck() {
      Object.assign(state, emptyDeck(state));
    },
  };
}
