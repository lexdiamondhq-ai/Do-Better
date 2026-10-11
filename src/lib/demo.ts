/**
 * The demo deck: a made-up player ten weeks into the game, kept in memory. It lets you try the
 * Showdown, the Hall of Hands and the Court straight away, without an account or a database.
 * Nothing is saved; signing out of the demo throws it away.
 */

import { addDays, weekday, weekStart, type Day } from '@/engine/day';
import { dealWeek, type DealHabit } from '@/engine/deal';
import type { CheckIns, Level } from '@/engine/kept';
import { RECIPES } from '@/engine/playbook';
import { bestHand, handIndex, type HandKind } from '@/engine/poker';
import { suitColors } from '@/theme/tokens';

import type { Backend, Loaded } from './backend';
import type { Habit, HabitDay } from './types';

/** A small seeded generator, so the demo history is the same every time for the same day. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Plan = { recipe: string; daysAgo: number; keep: number; ceiling: number };

const PLANS: Plan[] = [
  { recipe: 'read', daysAgo: 70, keep: 0.86, ceiling: 0.45 },
  { recipe: 'walk', daysAgo: 70, keep: 0.8, ceiling: 0.35 },
  { recipe: 'deep-work', daysAgo: 63, keep: 0.72, ceiling: 0.4 },
  { recipe: 'reach-out', daysAgo: 49, keep: 0.62, ceiling: 0.25 },
];

/** Whole days off, so the game has rescues to show: two single misses and one miss-twice. */
const BLANK_DAYS_AGO = [9, 23, 40, 41];

function buildHistory(today: Day): { habits: Habit[]; days: HabitDay[] } {
  const next = random(20261011);
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
      anchor: r.anchor,
      whenWhere: null,
      why: r.why,
      recipeKey: r.key,
      position,
      startedOn: addDays(today, -plan.daysAgo),
      archivedAt: null,
    };
  });
  const blanks = new Set(BLANK_DAYS_AGO.map((n) => addDays(today, -n)));
  const days: HabitDay[] = [];
  PLANS.forEach((plan, i) => {
    for (let ago = plan.daysAgo; ago >= 1; ago--) {
      const day = addDays(today, -ago);
      const keep = next() < plan.keep;
      const ceiling = next() < plan.ceiling;
      if (keep && !blanks.has(day)) days.push({ habitId: habits[i].id, day, level: ceiling ? 'ceiling' : 'floor' });
    }
  });
  // Leave Hearts one vote short of its Queen, so keeping "Reach out" today earns it and deals a Joker.
  const hearts = days.filter((d) => d.habitId === 'demo-reach-out');
  for (const d of hearts.slice(0, Math.max(0, hearts.length - 29))) days.splice(days.indexOf(d), 1);
  for (let ago = PLANS[3].daysAgo, have = hearts.length; have < 29 && ago >= 1; ago--) {
    const day = addDays(today, -ago);
    if (blanks.has(day) || hearts.some((d) => d.day === day)) continue;
    days.push({ habitId: 'demo-reach-out', day, level: 'floor' });
    have++;
  }
  return { habits, days };
}

function checkInsOf(days: readonly HabitDay[]): Map<string, CheckIns> {
  const out = new Map<string, Map<Day, Level>>();
  for (const d of days) {
    if (!out.has(d.habitId)) out.set(d.habitId, new Map());
    out.get(d.habitId)!.set(d.day, d.level);
  }
  return out;
}

/** Picks, from a few deals, the one whose finished weeks show the widest spread of hands. */
function pickSeed(today: Day, habits: readonly Habit[], days: readonly HabitDay[]): string {
  const deal: DealHabit[] = habits.map((h) => ({ id: h.id, suit: h.suit, startedOn: h.startedOn, archivedOn: null }));
  const checkIns = checkInsOf(days);
  const first = weekStart(addDays(today, -70));
  let best = { seed: 'demo-0', score: -1 };
  for (let i = 0; i < 8; i++) {
    const seed = `demo-${i}`;
    const kinds = new Set<HandKind>();
    for (let start = first; start < weekStart(today); start = addDays(start, 7)) {
      const hand = bestHand(dealWeek(start, today, deal, checkIns, seed).flatMap((s) => (s.card ? [s.card] : [])));
      if (hand) kinds.add(hand.kind);
    }
    const top = Math.max(...[...kinds].map(handIndex));
    const score = kinds.size * 2 + top;
    if (score > best.score) best = { seed, score };
  }
  return best.seed;
}

export function createDemoBackend(today: Day): Backend {
  const { habits, days } = buildHistory(today);
  const thisWeek = weekStart(today);
  const calls: Loaded['calls'] = [];
  const pattern: HandKind[] = ['flush', 'full-house', 'flush', 'straight', 'flush', 'four-of-a-kind', 'flush', 'full-house', 'flush'];
  for (let start = addDays(thisWeek, -63), i = 0; start < thisWeek; start = addDays(start, 7), i++) calls.push({ weekStart: start, hand: pattern[i % pattern.length] });
  // On Monday the call is yours to make. Later in the week, the demo player already called a Flush.
  if (weekday(today) !== 0) calls.push({ weekStart: thisWeek, hand: 'flush' });

  const state: Loaded = {
    profile: { id: 'demo', displayName: 'Demo', timezone: 'UTC', northStar: 'Someone who reads every day, keeps moving, and stays close to the people I love.', onboardedAt: addDays(today, -70) },
    habits,
    days,
    prompts: [],
    calls,
  };
  const copy = (): Loaded => ({ ...state, habits: [...state.habits], days: [...state.days], prompts: [...state.prompts], calls: [...state.calls] });

  return {
    seed: pickSeed(today, habits, days),
    async load(timezone) {
      state.profile = { ...state.profile, timezone };
      return copy();
    },
    async saveDay(habitId, day, level) {
      state.days = [...state.days.filter((d) => !(d.habitId === habitId && d.day === day)), { habitId, day, level }];
    },
    async deleteDay(habitId, day) {
      state.days = state.days.filter((d) => !(d.habitId === habitId && d.day === day));
    },
    async createHabit(draft, startedOn, position) {
      const habit: Habit = {
        ...draft,
        id: `demo-${Date.now()}`,
        identity: draft.identity.trim() || null,
        twoMinuteLabel: draft.twoMinuteLabel.trim() || null,
        anchor: draft.anchor.trim() || null,
        whenWhere: draft.whenWhere.trim() || null,
        why: draft.why.trim() || null,
        position,
        startedOn,
        archivedAt: null,
      };
      state.habits = [...state.habits, habit];
      return habit;
    },
    async updateHabit(id, draft) {
      const old = state.habits.find((h) => h.id === id);
      if (!old) throw new Error('That card has left the deck.');
      const habit: Habit = {
        ...old,
        ...draft,
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
    async savePrompt(prompt) {
      const old = state.prompts.find((p) => p.habitId === prompt.habitId && p.missedDay === prompt.missedDay);
      state.prompts = [{ ...prompt, response: prompt.response ?? old?.response ?? null }, ...state.prompts.filter((p) => p !== old)];
    },
    async saveProfile({ northStar, onboardedAt }) {
      state.profile = { ...state.profile, ...(northStar !== undefined ? { northStar } : {}), ...(onboardedAt ? { onboardedAt } : {}) };
    },
    async saveCall(weekStart, hand) {
      state.calls = [...state.calls.filter((c) => c.weekStart !== weekStart), { weekStart, hand }];
    },
  };
}
