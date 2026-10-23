import { describe, expect, it } from 'vitest';

import { planLine, planOffered } from '@/engine/comeback';
import { FACES, RUNGS, summarizeCourt } from '@/engine/court';
import { addDays, weekday, weekStart, type Day } from '@/engine/day';
import { lastShowdown, playGame } from '@/engine/game';
import { indexCheckIns, neverTwiceDay, type Level } from '@/engine/kept';
import { partOfDay } from '@/engine/playbook';
import { buildQueue, partOfDayAt } from '@/engine/today';

import type { Loaded } from './backend';
import { createDemoBackend, demoPlans } from './demo';
import { courtHabits, gameInput, MILESTONES, momentsOf, newMemory } from './play';

// Monday 12 to Sunday 18 October 2026: the demo is laid out by week, so every day of the week is checked.
const WEEK: Day[] = Array.from({ length: 7 }, (_, i) => addDays('2026-10-12', i));

const CALLABLE = ['pair', 'two-pair', 'three-of-a-kind', 'straight', 'full-house'];
const WALK = 'demo-walk';
const REACH_OUT = 'demo-reach-out';

async function open(today: Day, typical = false) {
  const backend = createDemoBackend(today, { typical });
  const data = await backend.load('UTC');
  return { backend, data, game: playGame(gameInput(data, today, backend.seed)) };
}

const keep = (data: Loaded, habitId: string, day: Day, level: Level = 'floor'): Loaded => ({ ...data, days: [...data.days, { habitId, day, level }] });

describe.each(WEEK)('the demo deck on %s', (today) => {
  it('opens on a single Comeback, for Walk', async () => {
    const { data, game } = await open(today);
    const checkIns = indexCheckIns(data.days);
    const comebacks = data.habits.filter((h) => neverTwiceDay(h.startedOn, today, checkIns.get(h.id) ?? new Map()));
    expect(comebacks.map((h) => h.name)).toEqual(['Walk']);
    expect(data.days.some((d) => d.day >= today)).toBe(false);
    // Yesterday got away for Walk alone: Reach out was kept, so nothing is left to save and no card shows face up.
    expect(data.days.some((d) => d.habitId === 'demo-reach-out' && d.day === addDays(today, -1))).toBe(true);
    expect(game.rescue).toBeNull();
    expect(game.rescueCard).toBeNull();
  });

  it('keeps Walk’s Comeback as a plain deal: the first swipe turns it over and deals an everyday card', async () => {
    const { backend, data } = await open(today);
    const moments = momentsOf(data, keep(data, WALK, today), today, backend.seed, { habitId: WALK, level: 'floor', day: today }, newMemory());
    expect(moments.map((m) => m.kind)).toEqual(['deal']);
  });

  it('earns the Queen of Hearts and a Joker when Reach out is kept, after Walk or first', async () => {
    const { backend, data } = await open(today);
    const memory = newMemory();
    const walked = keep(data, WALK, today);
    momentsOf(data, walked, today, backend.seed, { habitId: WALK, level: 'floor', day: today }, memory);
    const queen = [expect.objectContaining({ kind: 'face', suit: 'hearts', face: expect.objectContaining({ face: 'queen' }), joker: true })];
    expect(momentsOf(walked, keep(walked, REACH_OUT, today), today, backend.seed, { habitId: REACH_OUT, level: 'floor', day: today }, memory)).toEqual(queen);
    expect(momentsOf(data, keep(data, REACH_OUT, today), today, backend.seed, { habitId: REACH_OUT, level: 'floor', day: today }, newMemory())).toEqual(queen);
  });

  it('at 09:00 lets an everyday card come before Reach out, so the Queen comes later in the day', async () => {
    const { data } = await open(today);
    const cards = data.habits.map((h) => ({ id: h.id, level: null, comeback: h.id === WALK, part: partOfDay(h) }));
    const order = (hour: number) => buildQueue({ cards, deferred: [], now: partOfDayAt(hour) }).map((q) => q.id);
    const morning = order(9);
    expect(morning[0]).toBe(WALK);
    expect(morning.indexOf(REACH_OUT)).toBeGreaterThanOrEqual(2);
    expect(buildQueue({ cards, deferred: [], now: partOfDayAt(9) })[0].kind).toBe('comeback');
    // After lunch it is next; in the evening it waits behind the evening card.
    expect(order(13).indexOf(REACH_OUT)).toBe(1);
    expect(order(20).indexOf(REACH_OUT)).toBeGreaterThan(1);
  });

  it('keeps the Joker on today’s card when Walk’s yesterday is then logged late', async () => {
    if (weekday(today) === 0) return;
    const { backend, data } = await open(today);
    const yesterday = addDays(today, -1);
    const withToday = keep(keep(data, WALK, today), REACH_OUT, today);
    const late: Loaded = { ...withToday, days: [...withToday.days, { habitId: WALK, day: yesterday, level: 'floor', loggedOn: today }] };
    const jokerDay = (d: Loaded) => playGame(gameInput(d, today, backend.seed)).current.slots.find((s) => s.card?.kind === 'joker')?.day;
    expect(jokerDay(withToday)).toBe(today);
    expect(jokerDay(late)).toBe(today);
  });

  it('deals plain cards for every swipe after the Queen', async () => {
    const { backend, data } = await open(today);
    const memory = newMemory();
    let state = data;
    for (const id of [WALK, REACH_OUT]) {
      const next = keep(state, id, today);
      momentsOf(state, next, today, backend.seed, { habitId: id, level: 'floor', day: today }, memory);
      state = next;
    }
    for (const id of ['demo-read', 'demo-deep-work']) {
      const next = keep(state, id, today, 'ceiling');
      const kinds = momentsOf(state, next, today, backend.seed, { habitId: id, level: 'ceiling', day: today }, memory).map((m) => m.kind);
      expect(kinds.every((k) => k === 'deal')).toBe(true);
      state = next;
    }
    const total = data.days.length;
    expect(MILESTONES.some((m) => m > total && m <= total + 4)).toBe(false);
    const court = summarizeCourt(courtHabits(data.habits), indexCheckIns(data.days), today);
    for (const c of court.filter((c) => c.suit !== 'hearts')) expect([...FACES.map((f) => f.votes), ...RUNGS]).not.toContain(c.votes + 1);
  });

  it('keeps every face card in a week of its own, none of them this week', async () => {
    const { game } = await open(today);
    const weeks = game.faces.map((f) => weekStart(f.day));
    expect(game.faces.length).toBeGreaterThanOrEqual(6);
    expect(new Set(weeks).size).toBe(weeks.length);
    expect(weeks).not.toContain(weekStart(today));
    expect(game.current.slots.some((s) => s.card?.kind === 'joker')).toBe(false);
  });

  it('only calls hands that pay, and opens on a Showdown whose call was made', async () => {
    for (const typical of [false, true]) {
      const { game } = await open(today, typical);
      expect(game.weeks.filter((w) => w.call && w.callMultiplier === 0)).toEqual([]);
      if (weekday(today) !== 0) expect(game.current.callMultiplier).toBeGreaterThan(0);
    }
    const { game } = await open(today);
    const last = lastShowdown(game);
    expect(last?.madeCall).toBe(true);
    expect(last?.bonus).toBeGreaterThan(0);
  });

  it('looks like ten weeks of play, with rescues and calls made and missed', async () => {
    const { data, game } = await open(today);
    expect(game.weeks).toHaveLength(10);
    expect(game.weeks.every((w) => w.hand && w.call)).toBe(true);
    expect(game.weeks.some((w) => w.madeCall)).toBe(true);
    expect(game.weeks.some((w) => !w.madeCall)).toBe(true);
    expect(game.weeks.flatMap((w) => w.slots).filter((s) => s.card?.kind === 'card' && s.card.rescued).length).toBeGreaterThanOrEqual(3);
    expect(data.calls.every((c) => CALLABLE.includes(c.hand))).toBe(true);
    // The call for this week is open on Monday, and already made later in the week.
    expect(data.calls.some((c) => c.weekStart === weekStart(today))).toBe(weekday(today) !== 0);
  });
});

describe('the demo deck', () => {
  it('opens on Friday 23 October with Walk, 48 kept days in, as the only Comeback, and Reach out at 29 Hearts days', async () => {
    const today = '2026-10-23';
    const { data } = await open(today);
    const checkIns = indexCheckIns(data.days);
    const comebacks = data.habits.filter((h) => neverTwiceDay(h.startedOn, today, checkIns.get(h.id) ?? new Map()));
    expect(comebacks.map((h) => h.id)).toEqual([WALK]);
    expect(new Set(data.days.filter((d) => d.habitId === WALK).map((d) => d.day)).size).toBe(48);
    const hearts = summarizeCourt(courtHabits(data.habits), checkIns, today).find((c) => c.suit === 'hearts');
    expect(hearts).toMatchObject({ votes: 29, habitIds: [REACH_OUT] });
    expect(data.habits.find((h) => h.id === WALK)?.why).toBe('Ten minutes outside and the whole day goes better.');
  });

  it('gives Walk a plan made 20 days ago, too tired then the first move, so the plan sheet can offer a new one', () => {
    const today = '2026-10-23';
    const plans = demoPlans(today);
    expect(Object.keys(plans)).toEqual([WALK]);
    expect(plans[WALK]).toEqual({ when: 'tired', then: 'first', made: '2026-10-03' });
    expect(planLine(plans[WALK], { floorLabel: 'Walk to the corner', twoMinuteLabel: 'Put on your shoes' })).toBe('Too tired? Put on your shoes.');
    expect(planOffered({ keptComebackToday: true, plan: plans[WALK], today })).toBe(true);
  });

  it('has the same history every week', async () => {
    const [a, b] = await Promise.all([open('2026-10-14'), open('2026-10-21')]);
    expect(b.data.days.map((d) => ({ ...d, day: addDays(d.day, -7) }))).toEqual(a.data.days);
  });

  it('remembers a day logged late, so its Joker and face card stay where they were dealt', async () => {
    const backend = createDemoBackend('2026-10-16');
    await backend.saveDay(WALK, '2026-10-15', 'floor', '2026-10-16');
    await backend.saveDay(WALK, '2026-10-16', 'floor');
    const days = (await backend.load('UTC')).days.filter((d) => d.habitId === WALK && d.day >= '2026-10-15');
    expect(days).toEqual([
      { habitId: WALK, day: '2026-10-15', level: 'floor', loggedOn: '2026-10-16' },
      { habitId: WALK, day: '2026-10-16', level: 'floor' },
    ]);
  });

  it('can delete the whole deck, leaving an account that starts again from onboarding', async () => {
    const backend = createDemoBackend('2026-10-16');
    await backend.deleteDeck();
    const data = await backend.load('UTC');
    expect(data).toMatchObject({ habits: [], days: [], prompts: [], calls: [], profile: { northStar: null, onboardedAt: null } });
  });

  it('can be a typical player for testing, with the same history and their usual calls', async () => {
    const curated = await open('2026-10-16');
    const typical = await open('2026-10-16', true);
    expect(typical.data.days).toEqual(curated.data.days);
    expect(typical.data.calls.every((c) => CALLABLE.includes(c.hand))).toBe(true);
    expect(typical.data.calls).toHaveLength(curated.data.calls.length);
  });
});
