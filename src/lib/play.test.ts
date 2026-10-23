import { describe, expect, it } from 'vitest';

import type { Suit } from '@/engine/cards';
import { addDays, archivedAtFor, type Day } from '@/engine/day';
import type { Level } from '@/engine/kept';

import type { Loaded } from './backend';
import { dealHabits, forgetMoments, gameInput, LATE_ADD_REFUSED, LATE_UNDO_REFUSED, lateKey, lateRefusal, momentsOf, newMemory, pastKey, playGameFor, type Moment } from './play';
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

  it('gives a face card that brought a Joker the hand from before, wherever the keep was made', () => {
    // Monday and Tuesday kept this week, so the week already had a hand before today's keep.
    const week = addDays(TODAY, -2);
    const before = loaded([habit('reach', 'hearts', '2026-09-01')], [...kept('reach', '2026-09-10', 27), ...kept('reach', week, 2)]);
    const moments = momentsOf(before, plus(before, 'reach', TODAY), TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, newMemory());
    const face = moments.find((m) => m.kind === 'face');
    expect(face).toMatchObject({ kind: 'face', joker: true });
    expect(face && 'handWas' in face ? face.handWas?.kind : null).toBe('high-card');
  });

  it('says there was no hand before when the Joker comes on the week’s first card', () => {
    const moments = momentsOf(queenEve, plus(queenEve, 'reach', TODAY), TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, newMemory());
    expect(moments[0]).toMatchObject({ kind: 'face', joker: true, handWas: null });
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

  it('celebrates the first card once, even when it is undone and made again', () => {
    const data = loaded([habit('read', 'clubs', TODAY)], []);
    const after = plus(data, 'read', TODAY);
    const memory = newMemory();
    expect(kinds(momentsOf(data, after, TODAY, SEED, { habitId: 'read', level: 'floor', day: TODAY }, memory))).toEqual(['first']);
    // Undo leaves no days at all again, but the second swipe is an ordinary deal.
    const again = momentsOf(data, after, TODAY, SEED, { habitId: 'read', level: 'floor', day: TODAY }, memory);
    expect(again).toMatchObject([{ kind: 'deal', deal: { was: null, card: { day: TODAY } } }]);
  });

  it('celebrates the first card again when the first try never saved', () => {
    const data = loaded([habit('read', 'clubs', TODAY)], []);
    const after = plus(data, 'read', TODAY);
    const memory = newMemory();
    forgetMoments(momentsOf(data, after, TODAY, SEED, { habitId: 'read', level: 'floor', day: TODAY }, memory), TODAY, memory);
    expect(kinds(momentsOf(data, after, TODAY, SEED, { habitId: 'read', level: 'floor', day: TODAY }, memory))).toEqual(['first']);
  });

  it("says yesterday was saved when it's logged late", () => {
    const data = loaded([habit('read', 'clubs', '2026-10-01')], kept('read', '2026-10-05', 8));
    const moments = momentsOf(data, plus(data, 'read', YESTERDAY), TODAY, SEED, { habitId: 'read', level: 'floor', day: YESTERDAY }, newMemory());
    expect(moments).toMatchObject([{ kind: 'backfill', habitId: 'read', day: YESTERDAY, deal: { was: null, card: { kind: 'card', day: YESTERDAY } } }]);
  });

  it('earns a face card with a day logged late without turning yesterday into the Joker', () => {
    // 29 People days before this week. Logging yesterday late makes 30: the Queen, earned today.
    const lateDay = (data: Loaded): Loaded => ({ ...data, days: [...data.days, { habitId: 'reach', day: YESTERDAY, level: 'floor', loggedOn: TODAY }] });
    const moments = momentsOf(queenEve, lateDay(queenEve), TODAY, SEED, { habitId: 'reach', level: 'floor', day: YESTERDAY }, newMemory());
    expect(moments[0]).toMatchObject({ kind: 'face', suit: 'hearts', face: { face: 'queen' }, joker: false, jokerLands: 'today' });
    expect(moments[1]).toMatchObject({ kind: 'backfill', day: YESTERDAY, deal: { card: { kind: 'card', day: YESTERDAY } } });
    // Keeping today then deals the Joker on today's card.
    const after = lateDay(queenEve);
    expect(momentsOf(after, plus(after, 'reach', TODAY), TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, newMemory())).toMatchObject([
      { kind: 'deal', deal: { card: { kind: 'joker', day: TODAY } } },
    ]);
  });

  it('keeps today’s Joker where it is when yesterday is logged late after it', () => {
    const withToday = plus(queenEve, 'reach', TODAY);
    const lateDay: Loaded = { ...withToday, days: [...withToday.days, { habitId: 'reach', day: YESTERDAY, level: 'floor', loggedOn: TODAY }] };
    const [moment] = momentsOf(withToday, lateDay, TODAY, SEED, { habitId: 'reach', level: 'floor', day: YESTERDAY }, newMemory());
    expect(moment).toMatchObject({ kind: 'backfill', deal: { card: { kind: 'card', day: YESTERDAY } } });
    const game = playGameFor(lateDay, TODAY, SEED);
    expect(game.current.slots.find((s) => s.card?.kind === 'joker')?.day).toBe(TODAY);
    expect(game.current.slots.find((s) => s.day === YESTERDAY)?.card?.kind).toBe('card');
  });

  it('says a face card’s Joker waits for next week when this week already has one', () => {
    // A Jack of Spades this week brought its Joker on Monday; logging yesterday late earns the Queen of Hearts too.
    const data = loaded([habit('walk', 'spades', '2026-09-01'), habit('reach', 'hearts', '2026-09-01')], [...kept('walk', '2026-10-03', 10), ...kept('reach', '2026-09-10', 29)]);
    expect(playGameFor(data, TODAY, SEED).current.slots.some((s) => s.card?.kind === 'joker')).toBe(true);
    const after: Loaded = { ...data, days: [...data.days, { habitId: 'reach', day: YESTERDAY, level: 'floor', loggedOn: TODAY }] };
    const moments = momentsOf(data, after, TODAY, SEED, { habitId: 'reach', level: 'floor', day: YESTERDAY }, newMemory());
    expect(moments[0]).toMatchObject({ kind: 'face', suit: 'hearts', joker: false, jokerLands: 'next-week' });
  });

  it('replaces the saved card when yesterday is logged after today was kept', () => {
    const data = plus(loaded([habit('read', 'clubs', '2026-10-01')], kept('read', '2026-10-05', 7)), 'read', TODAY);
    const [moment] = momentsOf(data, plus(data, 'read', YESTERDAY), TODAY, SEED, { habitId: 'read', level: 'floor', day: YESTERDAY }, newMemory());
    expect(moment).toMatchObject({ kind: 'backfill', deal: { was: { kind: 'card', rescued: true }, card: { kind: 'card', rescued: false } } });
  });

  it('counts a milestone once, on the way up', () => {
    // Nine kept days across two suits: today's makes ten without earning a Jack.
    const data = loaded([habit('walk', 'spades', '2026-10-01'), habit('reach', 'hearts', '2026-10-01')], [...kept('walk', '2026-10-01', 5), ...kept('reach', '2026-10-06', 4)]);
    const memory = newMemory();
    const after = plus(data, 'walk', TODAY);
    const moments = momentsOf(data, after, TODAY, SEED, { habitId: 'walk', level: 'floor', day: TODAY }, memory);
    expect(moments.at(-1)).toEqual({ kind: 'milestone', count: 10 });
    // Undo, then keep a different card: still ten, so nothing new.
    expect(kinds(momentsOf(data, plus(data, 'reach', TODAY), TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, memory))).not.toContain('milestone');
    // A new day starts fresh, but only a real crossing counts.
    expect(kinds(momentsOf(after, plus(after, 'reach', '2026-10-15'), '2026-10-15', SEED, { habitId: 'reach', level: 'floor', day: '2026-10-15' }, memory))).not.toContain('milestone');
  });

  it('counts kept days as calendar days, so a second card on the same day is no milestone', () => {
    // Nine days with both cards kept: nine kept days, not eighteen.
    const data = loaded([habit('walk', 'spades', '2026-10-01'), habit('reach', 'hearts', '2026-10-01')], [...kept('walk', '2026-10-05', 9), ...kept('reach', '2026-10-05', 9)]);
    const memory = newMemory();
    const one = plus(data, 'walk', TODAY);
    expect(momentsOf(data, one, TODAY, SEED, { habitId: 'walk', level: 'floor', day: TODAY }, memory).at(-1)).toEqual({ kind: 'milestone', count: 10 });
    expect(kinds(momentsOf(one, plus(one, 'reach', TODAY), TODAY, SEED, { habitId: 'reach', level: 'floor', day: TODAY }, memory))).not.toContain('milestone');
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

  it('are dealt again when a past day turns out to have been logged late', () => {
    const late: Loaded = { ...data, days: data.days.map((d, i) => (i === 1 ? { ...d, loggedOn: addDays(d.day, 1) } : d)) };
    expect(key(late)).not.toBe(key(data));
    expect(gameInput(late, TODAY, SEED).late?.size).toBe(1);
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

describe('logging yesterday late', () => {
  const read = habit('read', 'clubs', '2026-10-01');
  const data = loaded([read, habit('old', 'spades', '2026-10-01', { archivedAt: archivedAtFor(TODAY) }), habit('new', 'hearts', TODAY)], kept('read', '2026-10-05', 7));
  const none = new Set<string>();

  it('never limits today', () => {
    expect(lateRefusal(data, 'read', TODAY, TODAY, 'add', none)).toBeNull();
    expect(lateRefusal(data, 'read', TODAY, TODAY, 'undo', none)).toBeNull();
  });

  it('adds yesterday only while it is empty, for a card that was running and is still in the deck', () => {
    expect(lateRefusal(data, 'read', YESTERDAY, TODAY, 'add', none)).toBeNull();
    expect(lateRefusal(plus(data, 'read', YESTERDAY), 'read', YESTERDAY, TODAY, 'add', none)).toBe(LATE_ADD_REFUSED);
    expect(lateRefusal(data, 'read', '2026-10-12', TODAY, 'add', none)).toBe(LATE_ADD_REFUSED);
    expect(lateRefusal(data, 'old', YESTERDAY, TODAY, 'add', none)).toBe(LATE_ADD_REFUSED);
    expect(lateRefusal(data, 'new', YESTERDAY, TODAY, 'add', none)).toBe(LATE_ADD_REFUSED);
    // A card that isn't in this deck at all.
    expect(lateRefusal(data, 'gone', YESTERDAY, TODAY, 'add', none)).toBe(LATE_ADD_REFUSED);
  });

  it('never reopens Sunday from Monday', () => {
    const monday = loaded([read], []);
    expect(lateRefusal(monday, 'read', '2026-10-18', '2026-10-19', 'add', none)).toBe(LATE_ADD_REFUSED);
  });

  it('takes back only a back-fill made on this phone, so yesterday can never be cleared and logged higher', () => {
    const withYesterday = plus(data, 'read', YESTERDAY);
    // Kept yesterday itself: it stays.
    expect(lateRefusal(withYesterday, 'read', YESTERDAY, TODAY, 'undo', none)).toBe(LATE_UNDO_REFUSED);
    // Logged late today on this phone: the undo is allowed.
    expect(lateRefusal(withYesterday, 'read', YESTERDAY, TODAY, 'undo', new Set([lateKey('read', YESTERDAY)]))).toBeNull();
    // And never once its week is over.
    expect(lateRefusal(withYesterday, 'read', '2026-10-18', '2026-10-19', 'undo', new Set([lateKey('read', '2026-10-18')]))).toBe(LATE_UNDO_REFUSED);
  });
});
