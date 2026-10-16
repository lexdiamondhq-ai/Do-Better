import { describe, expect, it } from 'vitest';

import { FACES, RUNGS, summarizeCourt } from '@/engine/court';
import { addDays, weekday, weekStart, type Day } from '@/engine/day';
import { playGame } from '@/engine/game';
import { indexCheckIns, neverTwiceDay, type Level } from '@/engine/kept';

import type { Loaded } from './backend';
import { createDemoBackend } from './demo';
import { courtHabits, gameInput, MILESTONES, momentsOf, newMemory } from './play';

// Monday 12 to Sunday 18 October 2026: the demo is laid out by week, so every day of the week is checked.
const WEEK: Day[] = Array.from({ length: 7 }, (_, i) => addDays('2026-10-12', i));

const CALLABLE = ['pair', 'two-pair', 'three-of-a-kind', 'straight', 'full-house'];

async function open(today: Day, typical = false) {
  const backend = createDemoBackend(today, { typical });
  const data = await backend.load('UTC');
  return { backend, data, game: playGame(gameInput(data, today, backend.seed)) };
}

const keep = (data: Loaded, habitId: string, day: Day, level: Level = 'floor'): Loaded => ({ ...data, days: [...data.days, { habitId, day, level }] });

describe.each(WEEK)('the demo deck on %s', (today) => {
  it('opens on a single Comeback, for Reach out', async () => {
    const { data } = await open(today);
    const checkIns = indexCheckIns(data.days);
    const comebacks = data.habits.filter((h) => neverTwiceDay(h.startedOn, today, checkIns.get(h.id) ?? new Map()));
    expect(comebacks.map((h) => h.name)).toEqual(['Reach out']);
    expect(data.days.some((d) => d.day >= today)).toBe(false);
  });

  it('earns the Queen of Hearts and a Joker with the first swipe', async () => {
    const { backend, data } = await open(today);
    const moments = momentsOf(data, keep(data, 'demo-reach-out', today), today, backend.seed, { habitId: 'demo-reach-out', level: 'floor', day: today }, newMemory());
    expect(moments).toEqual([expect.objectContaining({ kind: 'face', suit: 'hearts', face: expect.objectContaining({ face: 'queen' }), joker: true })]);
  });

  it('keeps the Joker on today’s card when yesterday is then logged late', async () => {
    if (weekday(today) === 0) return;
    const { backend, data } = await open(today);
    const yesterday = addDays(today, -1);
    const withToday = keep(data, 'demo-reach-out', today);
    const late: Loaded = { ...withToday, days: [...withToday.days, { habitId: 'demo-reach-out', day: yesterday, level: 'floor', loggedOn: today }] };
    const jokerDay = (d: Loaded) => playGame(gameInput(d, today, backend.seed)).current.slots.find((s) => s.card?.kind === 'joker')?.day;
    expect(jokerDay(withToday)).toBe(today);
    expect(jokerDay(late)).toBe(today);
  });

  it('deals plain cards for every other swipe today', async () => {
    const { backend, data } = await open(today);
    let state = keep(data, 'demo-reach-out', today);
    const memory = newMemory();
    momentsOf(data, state, today, backend.seed, { habitId: 'demo-reach-out', level: 'floor', day: today }, memory);
    for (const id of ['demo-read', 'demo-walk', 'demo-deep-work']) {
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
  it('has the same history every week', async () => {
    const [a, b] = await Promise.all([open('2026-10-14'), open('2026-10-21')]);
    expect(b.data.days.map((d) => ({ ...d, day: addDays(d.day, -7) }))).toEqual(a.data.days);
  });

  it('remembers a day logged late, so its Joker and face card stay where they were dealt', async () => {
    const backend = createDemoBackend('2026-10-16');
    await backend.saveDay('demo-reach-out', '2026-10-15', 'floor', '2026-10-16');
    await backend.saveDay('demo-reach-out', '2026-10-16', 'floor');
    const days = (await backend.load('UTC')).days.filter((d) => d.habitId === 'demo-reach-out' && d.day >= '2026-10-15');
    expect(days).toEqual([
      { habitId: 'demo-reach-out', day: '2026-10-15', level: 'floor', loggedOn: '2026-10-16' },
      { habitId: 'demo-reach-out', day: '2026-10-16', level: 'floor' },
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
