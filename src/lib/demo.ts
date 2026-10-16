/**
 * The demo deck: a made-up player ten weeks into the game, kept in memory. It lets you try the
 * Showdown, the Hall of Hands and the Court straight away, without an account or a database.
 * Nothing is saved; signing out of the demo throws it away.
 *
 * The deck opens on one Comeback: every card was kept yesterday except Reach out, and Hearts is one
 * kept day short of its Queen, so the first swipe shows the Comeback, earns the Queen and deals a Joker.
 * Its history is laid out by week, so every face card falls in a week of its own, and none in this one.
 */

import { addDays, daysBetween, weekday, weekStart, type Day } from '@/engine/day';
import { unit, type DealHabit } from '@/engine/deal';
import { playPastWeeks, type Week } from '@/engine/game';
import { indexCheckIns, type Level } from '@/engine/kept';
import { RECIPES } from '@/engine/playbook';
import { atLeast, handIndex, type HandKind } from '@/engine/poker';
import { suitColors } from '@/theme/tokens';

import type { Backend, Loaded } from './backend';
import { emptyDeck } from './play';
import type { Habit, HabitDay } from './types';

type Plan = { recipe: string; weeks: number; keep: number; ceiling: number };

/** Each card, how many weeks before this one it started (on a Monday), and how often it was kept and reached. */
const PLANS: Plan[] = [
  { recipe: 'read', weeks: 10, keep: 0.86, ceiling: 0.45 },
  { recipe: 'walk', weeks: 10, keep: 0.8, ceiling: 0.35 },
  { recipe: 'deep-work', weeks: 9, keep: 0.72, ceiling: 0.4 },
  { recipe: 'reach-out', weeks: 7, keep: 0.62, ceiling: 0.25 },
];

/** The card the demo's first swipe keeps. */
const COMEBACK = 'reach-out';

/** Its suit's kept days before today: one short of the Queen. */
const COMEBACK_DAYS = 29;

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
      why: r.why,
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
    if (comeback) settle(mine, habits[i].id, today, blanks);
    days.push(...mine);
  });
  return { habits, days };
}

/**
 * Brings the Comeback card to exactly COMEBACK_DAYS kept days, taking days away or adding them evenly
 * after its Jack and before its last two days, so its Jack stays on the same day whatever today is.
 */
function settle(mine: HabitDay[], habitId: string, today: Day, blanks: ReadonlySet<Day>): void {
  const after = mine[11]?.day ?? today;
  const latest = addDays(today, -3);
  const kept = new Set(mine.map((d) => d.day));
  if (mine.length > COMEBACK_DAYS) {
    const movable = mine.filter((d) => d.day > after && d.day <= latest);
    for (const d of spread(movable, mine.length - COMEBACK_DAYS)) mine.splice(mine.indexOf(d), 1);
  } else if (mine.length < COMEBACK_DAYS) {
    const free: Day[] = [];
    for (let day = addDays(after, 1); day <= latest; day = addDays(day, 1)) if (!kept.has(day) && !blanks.has(day)) free.push(day);
    for (const day of spread(free, COMEBACK_DAYS - mine.length)) mine.push({ habitId, day, level: 'floor' });
    mine.sort((a, b) => a.day.localeCompare(b.day));
  }
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
 * The deal seed. The public demo takes the deal with the widest spread of hands. A typical player takes
 * the middle one, so a phone test sees what most players would.
 */
function pickSeed(today: Day, habits: readonly Habit[], days: readonly HabitDay[], typical: boolean): { seed: string; weeks: Week[] } {
  const deals = Array.from({ length: typical ? 15 : 8 }, (_, i) => {
    const seed = `demo-${i}`;
    const weeks = weeksFor(today, habits, days, seed);
    return { seed, weeks, score: variety(weeks) };
  });
  if (typical) return [...deals].sort((a, b) => a.score - b.score)[Math.floor(deals.length / 2)];
  return deals.reduce((best, d) => (d.score > best.score ? d : best));
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

/**
 * The demo player's calls. The public demo calls what each week went on to make, and every third week
 * reaches one hand higher and misses, so the Hall shows both. A typical player calls their usual hand.
 */
function callsFor(weeks: readonly Week[], typical: boolean): Loaded['calls'] {
  return weeks.map((w, i) => {
    if (typical) return { weekStart: w.start, hand: usualCall(weeks.slice(0, i)) };
    const made = callFor(w.hand?.kind);
    const higher = CALLS[CALLS.indexOf(made) + 1];
    return { weekStart: w.start, hand: i % 3 === 1 && higher ? higher : made };
  });
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
  const calls = callsFor(weeks, typical);
  // On Monday the call is yours to make. Later in the week, the demo player already called their usual hand.
  if (weekday(today) !== 0) calls.push({ weekStart: weekStart(today), hand: usualCall(weeks) });

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
