import { describe, expect, it } from 'vitest';

import type { Suit } from '@/engine/cards';
import { addDays, type Day } from '@/engine/day';
import type { Level } from '@/engine/kept';

import type { Loaded } from './backend';
import { dealHabits, forgetMoments, gameInput, momentsOf, newMemory, pastKey, type Moment } from './play';
import type { Habit, HabitDay } from './types';

// Wednesday 14 October 2026. The week started on Monday the 12th.
const TODAY = '2026-10-14';
const YESTERDAY = '2026-10-13';
const SEED = 'test-seed';

function habit(id: string, suit: Suit, startedOn: Day, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    identity: null,
    floorLabel: 'Floor',
    ceilingLabel: 'Ceiling',
    twoMinuteLabel: null,
    color: 'tomato',
    suit,
    suitSet: true,
    anchor: null,
    whenWhere: null,
    why: null,
    recipeKey: null,
    position: 0,
    startedOn,
    archivedAt: null,
    ...extra,
  };
}

function loaded(habits: Habit[], days: HabitDay[]): Loaded {
  return { profile: { id: 'p', displayName: null, timezone: 'UTC', northStar: null, onboardedAt: null }, habits, days, prompts: [], calls: [] };
}

/** `count` Floor days in a row for one habit, starting on `from`. */
const kept = (habitId: string, from: Day, count: number): HabitDay[] => Array.from({ length: count }, (_, i) => ({ habitId, day: addDays(from, i), level: 'floor' as Level }));

const plus = (data: Loaded, habitId: string, day: Day, level: Level = 'floor'): Loaded => ({ ...data, days: [...data.days, { habitId, day, level }] });

const kinds = (moments: Moment[]) => moments.map((m) => m.kind);

describe('moments a check-in causes', () => {
  // 29 People days, all before this week: today's check-in earns the Queen of Hearts and a Joker.
  const queenEve = loaded([habit('reach', 'hearts', '2026-09-01')], kept('reach', '2026-09-10', 29));

  it('shows the face card first and leaves out the deal when the face card brought the Joker', () => {
    const moments = momentsOf(queenEve, plus(queenEve, 'reach', TODAY), TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, newMemory());
    expect(kinds(moments)).toEqual(['face']);
    expect(moments[0]).toMatchObject({ kind: 'face', suit: 'hearts', joker: true, face: { face: 'queen' } });
  });

  it("never replays a face card when today's check-in is undone and made again", () => {
    const memory = newMemory();
    const after = plus(queenEve, 'reach', TODAY);
    momentsOf(queenEve, after, TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, memory);
    const again = momentsOf(queenEve, after, TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, memory);
    expect(kinds(again)).not.toContain('face');
    // The Joker is still today's card, so the deal says so instead.
    expect(again).toMatchObject([{ kind: 'deal', deal: { card: { kind: 'joker' } } }]);
  });

  it('celebrates again when the first try never saved', () => {
    const memory = newMemory();
    const after = plus(queenEve, 'reach', TODAY);
    const lost = momentsOf(queenEve, after, TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, memory);
    forgetMoments(lost, TODAY, memory);
    expect(kinds(momentsOf(queenEve, after, TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, memory))).toEqual(['face']);
  });

  it('says which card was kept and at what level', () => {
    const data = loaded([habit('read', 'clubs', '2026-10-01'), habit('walk', 'spades', '2026-10-01')], [...kept('read', '2026-10-05', 3), ...kept('walk', '2026-10-05', 3)]);
    const moments = momentsOf(data, plus(data, 'walk', TODAY, 'ceiling'), TODAY, SEED, { habitId: 'walk', level: 'ceiling', day: TODAY }, newMemory());
    expect(moments).toMatchObject([{ kind: 'deal', habitId: 'walk', level: 'ceiling', deal: { was: null, card: { day: TODAY } } }]);
  });

  it('marks the first card ever', () => {
    const data = loaded([habit('read', 'clubs', TODAY)], []);
    const moments = momentsOf(data, plus(data, 'read', TODAY), TODAY, SEED, { habitId: 'read', level: 'floor', day: TODAY }, newMemory());
    expect(moments).toMatchObject([{ kind: 'first', habitId: 'read', deal: { was: null, handWas: null, card: { day: TODAY } } }]);
  });

  it("says yesterday was saved when it's logged late", () => {
    const data = loaded([habit('read', 'clubs', '2026-10-01')], kept('read', '2026-10-05', 8));
    const moments = momentsOf(data, plus(data, 'read', YESTERDAY), TODAY, SEED, { habitId: 'read', level: 'floor', day: YESTERDAY }, newMemory());
    expect(moments).toMatchObject([{ kind: 'backfill', habitId: 'read', day: YESTERDAY, deal: { was: null, card: { kind: 'card', day: YESTERDAY } } }]);
  });

  it('replaces the saved card when yesterday is logged after today was kept', () => {
    const data = plus(loaded([habit('read', 'clubs', '2026-10-01')], kept('read', '2026-10-05', 7)), 'read', TODAY);
    const [moment] = momentsOf(data, plus(data, 'read', YESTERDAY), TODAY, SEED, { habitId: 'read', level: 'floor', day: YESTERDAY }, newMemory());
    expect(moment).toMatchObject({ kind: 'backfill', deal: { was: { kind: 'card', rescued: true }, card: { kind: 'card', rescued: false } } });
  });

  it('counts a milestone once, on the way up', () => {
    // Nine kept days across two suits: today's makes ten without earning a Jack.
    const data = loaded([habit('walk', 'spades', '2026-10-01'), habit('reach', 'hearts', '2026-10-01')], [...kept('walk', '2026-10-05', 5), ...kept('reach', '2026-10-05', 4)]);
    const memory = newMemory();
    const after = plus(data, 'walk', TODAY);
    const moments = momentsOf(data, after, TODAY, SEED, { habitId: 'walk', level: 'floor', day: TODAY }, memory);
    expect(moments.at(-1)).toEqual({ kind: 'milestone', count: 10 });
    // Undo, then keep a different card: still ten, so nothing new.
    expect(kinds(momentsOf(data, plus(data, 'reach', TODAY), TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, memory))).not.toContain('milestone');
    // A new day starts fresh, but only a real crossing counts.
    expect(kinds(momentsOf(after, plus(after, 'reach', '2026-10-15'), '2026-10-15', SEED, { habitId: 'reach', level: 'floor', day: '2026-10-15' }, memory))).not.toContain('milestone');
  });

  it('celebrates a rung between the King and the Ace', () => {
    const data = loaded([habit('walk', 'spades', '2026-01-01')], kept('walk', '2026-01-01', 149));
    const moments = momentsOf(data, plus(data, 'walk', TODAY), TODAY, SEED, { habitId: 'walk', level: 'floor', day: TODAY }, newMemory());
    expect(moments).toContainEqual({ kind: 'rung', suit: 'spades', days: 150 });
    expect(kinds(moments)).not.toContain('face');
  });
});

describe('finished weeks', () => {
  const data = loaded([habit('read', 'clubs', '2026-09-01'), habit('walk', 'spades', '2026-09-01')], [...kept('read', '2026-09-20', 10), ...kept('walk', '2026-09-25', 5)]);
  const key = (d: Loaded) => pastKey(d, gameInput(d, TODAY, SEED));

  it('are dealt again when a past day changes level, even with the same number of rows', () => {
    const upgraded: Loaded = { ...data, days: data.days.map((d) => (d.habitId === 'read' && d.day === '2026-09-22' ? { ...d, level: 'ceiling' } : d)) };
    expect(key(upgraded)).not.toBe(key(data));
  });

  it('are dealt again when a past day moves to another card', () => {
    const moved: Loaded = { ...data, days: data.days.map((d, i) => (i === 0 ? { ...d, habitId: 'walk' } : d)) };
    expect(key(moved)).not.toBe(key(data));
  });

  it('are kept when only this week changes, or the rows arrive in another order', () => {
    expect(key(plus(data, 'read', TODAY))).toBe(key(data));
    expect(key(plus(data, 'walk', YESTERDAY, 'ceiling'))).toBe(key(data));
    expect(key({ ...data, days: [...data.days].reverse() })).toBe(key(data));
  });
});

describe('archived cards', () => {
  it('leave the deck on the local day they were archived, wherever the phone is now', () => {
    const encoded = habit('read', 'clubs', '2026-09-01', { archivedAt: '2026-10-12T00:00:00.000Z' });
    expect(dealHabits([encoded], 'America/Los_Angeles')[0].archivedOn).toBe('2026-10-12');
    expect(dealHabits([encoded], 'Pacific/Auckland')[0].archivedOn).toBe('2026-10-12');
  });

  it('archived before that keep the old reading of the real moment', () => {
    const older = habit('read', 'clubs', '2026-09-01', { archivedAt: '2026-10-13T03:30:00.000Z' });
    expect(dealHabits([older], 'America/New_York')[0].archivedOn).toBe('2026-10-12');
    expect(dealHabits([older], 'Europe/London')[0].archivedOn).toBe('2026-10-13');
  });
});
