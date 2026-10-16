import { describe, expect, it } from 'vitest';

import { addDays, weekDays, type Day } from './day';
import { dealDay, type DayCard, type DealHabit, type Slot } from './deal';
import {
  BACKS,
  CALL_BASELINE,
  CALL_HISTORY,
  CALLABLE,
  callChoices,
  callPrices,
  chapterRecap,
  dealEvent,
  improves,
  lastShowdown,
  multiplierFor,
  placeJokers,
  playGame,
  playLiveWeek,
  playPastWeeks,
  suggestCall,
  TABLES,
  unlocksFor,
  warmupWeek,
  weekReview,
  weekTotal,
  type CallPrice,
  type GameInput,
  type Week,
} from './game';
import type { CheckIns, Level } from './kept';
import { atLeast, HAND_LADDER, HANDS, type Hand, type HandKind } from './poker';

// Mondays.
const W1 = '2026-09-21';
const W2 = '2026-09-28';
const W3 = '2026-10-05';

const read: DealHabit = { id: 'read', suit: 'clubs', startedOn: W1, archivedOn: null, name: 'Read' };
const walk: DealHabit = { id: 'walk', suit: 'spades', startedOn: W1, archivedOn: null, name: 'Walk' };

function input(over: Partial<GameInput> & { days?: Record<string, Record<string, Level>> }): GameInput {
  const { days = {}, ...rest } = over;
  const checkIns = new Map<string, CheckIns>(Object.entries(days).map(([id, d]) => [id, new Map(Object.entries(d))]));
  return { seed: 'test-user', today: '2026-10-07', habits: [read], checkIns, calls: new Map(), ...rest };
}

/** Every day of a week (or the first `n`) at one level. */
function keep(start: string, level: Level = 'floor', n = 7): Record<string, Level> {
  return Object.fromEntries(weekDays(start).slice(0, n).map((d) => [d, level]));
}

/** `n` days in a row from `from`, at one level. */
function run(from: Day, n: number, level: Level = 'floor'): Record<string, Level> {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [addDays(from, i), level]));
}

const rankOf = (card: DayCard | null | undefined) => (card?.kind === 'card' ? card.rank : 0);
const log = (days: Record<string, Record<string, Level>>) => new Map<string, CheckIns>(Object.entries(days).map(([id, d]) => [id, new Map(Object.entries(d))]));

describe('playGame', () => {
  it('plays every week from the first habit to now, and banks only finished ones', () => {
    const game = playGame(input({ days: { read: { ...keep(W1), ...keep(W2, 'floor', 3), ...keep(W3, 'ceiling', 2) } } }));
    expect(game.weeks.map((w) => w.start)).toEqual([W1, W2]);
    expect(game.current.start).toBe(W3);
    expect(game.current.live).toBe(true);
    expect(game.stack).toBe(game.weeks.reduce((s, w) => s + weekTotal(w), 0));
    expect(game.stack).toBeGreaterThan(0);
  });

  it('turns a river card at the Showdown of a week with five kept days, and only then', () => {
    const game = playGame(input({ days: { read: { ...keep(W1, 'floor', 5), ...keep(W2, 'floor', 4), ...keep(W3, 'floor', 2) } } }));
    const [w1, w2] = game.weeks;
    expect(w1.river).toMatchObject({ earned: true, need: 0, card: { river: true, day: W2 } });
    expect(w2.river).toEqual({ earned: false, need: 1, card: null });
    expect(game.current.river).toEqual({ earned: false, need: 3, card: null });
  });

  it('has an empty week and no tips with no habits', () => {
    const game = playGame(input({ habits: [] }));
    expect(game.weeks).toEqual([]);
    expect(game.current.hand).toBeNull();
    expect(game.tips).toEqual([]);
  });

  it('plays the live week alone exactly as the whole game does, warm-up, archives and calls included', () => {
    const late: DealHabit = { ...read, startedOn: '2026-08-27' };
    const gone: DealHabit = { ...walk, startedOn: '2026-08-31', archivedOn: '2026-10-21' };
    const readDays = Object.fromEntries(Array.from({ length: 110 }, (_, i) => [addDays('2026-08-27', i), i % 3 ? 'floor' : 'ceiling'] as const).filter((_, i) => i % 5 !== 2));
    const walkDays = Object.fromEntries(Array.from({ length: 52 }, (_, i) => [addDays('2026-08-31', i), 'floor' as Level]).filter((_, i) => i % 4 !== 1));
    const calls = new Map<Day, HandKind>([['2026-09-07', 'two-pair'], ['2026-10-05', 'straight'], ['2026-11-02', 'full-house'], ['2026-12-07', 'pair']]);
    let before: Week[] = [];
    for (let day = '2026-08-27'; day <= '2026-12-14'; day = addDays(day, 3)) {
      const i = input({ habits: [late, gone], today: day, days: { read: readDays, walk: walkDays }, calls });
      const game = playGame(i);
      expect(playLiveWeek(i)).toEqual(game.current);
      expect(playLiveWeek(i, game.weeks)).toEqual(game.current);
      // A finished week never changes as later days are played, Jokers, prices and the river included,
      // which is what lets the app keep finished weeks from one render to the next.
      expect(game.weeks.slice(0, before.length)).toEqual(before);
      before = game.weeks;
    }
    expect(before.length).toBeGreaterThan(12);
    expect(before.some((w) => w.slots.some((s) => s.card?.kind === 'joker'))).toBe(true);
  });

  it('can take the finished weeks back without changing the game', () => {
    const i = input({ days: { read: { ...keep(W1), ...keep(W2, 'ceiling', 4), ...keep(W3, 'floor', 2) } } });
    expect(playGame(i, playPastWeeks(i))).toEqual(playGame(i));
    expect(playLiveWeek(i, playPastWeeks(i))).toEqual(playGame(i).current);
  });
});

describe('the warm-up week', () => {
  it('comes when the first habit starts Thursday to Sunday, and not Monday to Wednesday', () => {
    for (let i = 0; i < 7; i++) {
      const start = addDays(W1, i);
      expect(warmupWeek([{ ...read, startedOn: start }])).toBe(i >= 3 ? W1 : null);
    }
    expect(warmupWeek([])).toBeNull();
    // Only the first habit's start counts.
    expect(warmupWeek([{ ...read, startedOn: '2026-09-24' }, { ...walk, startedOn: '2026-09-22' }])).toBeNull();
  });

  it('deals its cards but pays nothing, takes no call and is left out of the Hall and the Showdown', () => {
    const late: DealHabit = { ...read, startedOn: '2026-09-24' };
    const days = { read: { ...run('2026-09-24', 4), [W2]: 'floor' as Level } };
    const game = playGame(input({ habits: [late], today: '2026-09-29', days, calls: new Map([[W1, 'pair' as HandKind]]) }));
    const [warm] = game.weeks;
    expect(warm.warmup).toBe(true);
    expect(warm.hand).not.toBeNull();
    expect([warm.chips, warm.bonus, warm.suitedBonus, warm.call]).toEqual([0, 0, 0, null]);
    expect(game.stack).toBe(0);
    expect(game.hall.every((e) => e.count === 0 && e.ended === 0)).toBe(true);
    expect(lastShowdown(game)).toBeNull();
    expect(game.backs).toEqual(new Set(['classic']));
  });

  it('has no call and says when the first full hand deals', () => {
    const late: DealHabit = { ...read, startedOn: '2026-09-24' };
    const game = playGame(input({ habits: [late], today: '2026-09-25', days: { read: run('2026-09-24', 2) } }));
    expect(game.current.warmup).toBe(true);
    expect(game.callOpen).toBe(false);
    expect(game.callOdds).toEqual({});
    expect(game.tips).toContainEqual({ tone: 'showdown', text: 'Warm-up week. Your first full hand deals Monday.' });
    expect(game.tips.some((t) => t.tone === 'call')).toBe(false);
  });

  it('is followed by a Showdown for the first full week', () => {
    const late: DealHabit = { ...read, startedOn: '2026-09-24' };
    const game = playGame(input({ habits: [late], today: W3, days: { read: { ...run('2026-09-24', 4), ...keep(W2, 'floor', 3) } } }));
    expect(lastShowdown(game)?.start).toBe(W2);
    expect(game.stack).toBe(weekTotal(game.weeks[1]));
  });
});

describe('Jokers', () => {
  const four: DealHabit[] = [
    { id: 'walk', suit: 'spades', startedOn: W1, archivedOn: null },
    { id: 'call', suit: 'hearts', startedOn: W1, archivedOn: null },
    { id: 'craft', suit: 'diamonds', startedOn: W1, archivedOn: null },
    { id: 'read', suit: 'clubs', startedOn: W1, archivedOn: null },
  ];
  // Ten days in a row earn four Jacks on 30 September, then one day each Monday after.
  const days = (extra: Record<string, Level>) => Object.fromEntries(four.map((h) => [h.id, { ...run(W1, 10), ...extra }]));
  const mondays = { [W3]: 'floor' as Level, '2026-10-12': 'floor' as Level, '2026-10-19': 'floor' as Level };

  it('deals four face cards earned on one day as Jokers in four different weeks', () => {
    const game = playGame(input({ habits: four, today: '2026-10-21', days: days(mondays) }));
    const jokers = placeJokers(input({ habits: four, today: '2026-10-21', days: days(mondays) }));
    expect(game.faces.map((f) => f.suit)).toEqual(['spades', 'hearts', 'diamonds', 'clubs']);
    expect([...jokers.days].sort()).toEqual(['2026-09-30', W3, '2026-10-12', '2026-10-19']);
    expect(jokers.waiting).toEqual([]);
    expect(game.pendingJoker).toBeNull();
    expect(game.current.slots[0].card?.kind).toBe('joker');
    const dealt = [...game.weeks, game.current].flatMap((w) => w.slots.filter((s) => s.card?.kind === 'joker').map((s) => s.day));
    expect(dealt).toEqual(['2026-09-30', W3, '2026-10-12', '2026-10-19']);
  });

  it('keeps the Jokers that haven’t landed waiting, oldest first, and says so', () => {
    const today = '2026-09-30';
    const game = playGame(input({ habits: four, today, days: days({}) }));
    expect(game.current.slots[2].card?.kind).toBe('joker');
    expect(game.pendingJoker).toBe('hearts');
    expect(game.tips[0]).toEqual({ tone: 'joker', text: 'You earned the Jack of Spades today, so today’s card is a Joker. It plays as any rank.' });
    const monday = playGame(input({ habits: four, today: W3, days: days({}) }));
    expect(monday.pendingJoker).toBe('hearts');
    expect(monday.tips[0]).toEqual({ tone: 'joker', text: 'Keep any habit today and it’s dealt as a Joker.' });
    const kept = playGame(input({ habits: four, today: W3, days: days({ [W3]: 'floor' }) }));
    expect(kept.current.slots[0].card?.kind).toBe('joker');
    expect(kept.pendingJoker).toBe('diamonds');
    expect(kept.tips[0]).toEqual({ tone: 'joker', text: 'Your Joker waits for next week’s first kept day.' });
  });
});

describe('Jokers and days logged late', () => {
  const call: DealHabit = { id: 'call', suit: 'hearts', startedOn: '2026-07-27', archivedOn: null, name: 'Call' };
  const move: DealHabit = { id: 'move', suit: 'spades', startedOn: '2026-07-27', archivedOn: null, name: 'Move' };
  const deck = [call, move];
  // Friday 16 October. Hearts has 29 days before this week, one short of its Queen; Spades kept Monday to Thursday.
  const today = '2026-10-16';
  const yesterday = '2026-10-15';
  const hearts = Object.fromEntries(Array.from({ length: 29 }, (_, i) => [addDays('2026-07-27', i * 2), 'floor' as Level]));
  const spades = run('2026-10-12', 4);
  const late = (habitId: string, day: Day, on: Day) => new Map([[habitId, new Map([[day, on]])]]);
  const jokerDay = (game: { current: Week }) => game.current.slots.find((s) => s.card?.kind === 'joker')?.day ?? null;

  it('keeps a Joker on the day it was dealt when yesterday is logged late, whatever the deal', () => {
    let lower = 0;
    for (let i = 0; i < 200; i++) {
      const seed = `late-${i}`;
      const before = input({ seed, today, habits: deck, days: { call: { ...hearts, [today]: 'floor' }, move: { ...spades, [today]: 'floor' } } });
      const after = { ...before, checkIns: log({ call: { ...hearts, [today]: 'floor', [yesterday]: 'floor' }, move: { ...spades, [today]: 'floor' } }), late: late('call', yesterday, today) };
      const was = playGame(before);
      const now = playGame(after);
      expect(jokerDay(was)).toBe(today);
      expect(jokerDay(now)).toBe(today);
      expect(now.faces.find((f) => f.face.face === 'queen')?.day).toBe(today);
      // Yesterday's own card can only go up. A hand gets weaker only when that higher card breaks a match.
      const card = (g: typeof was) => g.current.slots.find((s) => s.day === yesterday)?.card;
      expect(rankOf(card(now))).toBeGreaterThanOrEqual(rankOf(card(was)));
      if ((now.current.hand?.score ?? 0) < (was.current.hand?.score ?? 0)) {
        lower++;
        expect(rankOf(card(now))).toBeGreaterThan(rankOf(card(was)));
      }
    }
    expect(lower).toBeLessThan(20);
  });

  it('without knowing a day was logged late, would have moved the Joker back to it', () => {
    const days = { call: { ...hearts, [today]: 'floor' as Level, [yesterday]: 'floor' as Level }, move: { ...spades, [today]: 'floor' as Level } };
    expect(jokerDay(playGame(input({ today, habits: deck, days })))).toBe(yesterday);
    expect(jokerDay(playGame({ ...input({ today, habits: deck, days }), late: late('call', yesterday, today) }))).toBe(today);
  });

  it('deals the Joker of a face card earned with a day logged late on today’s card, never on yesterday’s', () => {
    const days = { call: { ...hearts, [yesterday]: 'floor' as Level }, move: spades };
    const game = playGame({ ...input({ today, habits: deck, days }), late: late('call', yesterday, today) });
    expect(game.faces.at(-1)).toMatchObject({ day: today, suit: 'hearts', face: { face: 'queen' } });
    expect(jokerDay(game)).toBeNull();
    expect(game.pendingJoker).toBe('hearts');
    expect(game.tips[0]).toEqual({ tone: 'joker', text: 'You earned the Queen of Hearts today. Keep any habit today and it’s dealt as a Joker.' });
    const kept = playGame({ ...input({ today, habits: deck, days: { ...days, move: { ...spades, [today]: 'floor' } } }), late: late('call', yesterday, today) });
    expect(jokerDay(kept)).toBe(today);
    expect(kept.tips[0]).toEqual({ tone: 'joker', text: 'You earned the Queen of Hearts today, so today’s card is a Joker. It plays as any rank.' });
  });

  it('never lands a waiting Joker on a day that was only logged late', () => {
    // Four Jacks on one day: the first lands that day and the rest wait for the weeks after.
    const four: DealHabit[] = ['spades', 'hearts', 'diamonds', 'clubs'].map((suit) => ({ id: suit, suit: suit as DealHabit['suit'], startedOn: W1, archivedOn: null }));
    const ten = Object.fromEntries(four.map((h) => [h.id, run(W1, 10)]));
    const tue = '2026-10-06';
    const wed = '2026-10-07';
    const waiting = playGame({ ...input({ habits: four, today: wed, days: { ...ten, spades: { ...ten.spades, [tue]: 'floor' } } }), late: late('spades', tue, wed) });
    expect(waiting.current.slots.some((s) => s.card?.kind === 'joker')).toBe(false);
    expect(waiting.tips[0]).toEqual({ tone: 'joker', text: 'Keep any habit today and it’s dealt as a Joker.' });
    const kept = playGame({ ...input({ habits: four, today: wed, days: { ...ten, spades: { ...ten.spades, [tue]: 'floor', [wed]: 'floor' } } }), late: late('spades', tue, wed) });
    expect(jokerDay(kept)).toBe(wed);
  });
});

describe('calls', () => {
  const hand = (kind: HandKind): Hand => ({ kind, cards: [], ranks: [], suit: null, suited: null, score: HAND_LADDER.indexOf(kind), title: '' });
  const week = (kind: HandKind | null, over: Partial<Week> = {}): Week => ({
    start: W1,
    slots: [],
    hand: kind ? hand(kind) : null,
    call: null,
    madeCall: false,
    chips: 0,
    suitedBonus: 0,
    bonus: 0,
    callMultiplier: 0,
    live: false,
    warmup: false,
    river: { earned: false, need: 5, card: null },
    contains: new Set(),
    keptDays: 0,
    ...over,
  });

  it('can call anything from a Pair to a Royal flush, and never the old Flush', () => {
    expect(CALLABLE).toEqual(['pair', 'two-pair', 'three-of-a-kind', 'straight', 'full-house', 'four-of-a-kind', 'straight-flush', 'royal-flush']);
  });

  it('pays nothing extra for a sure thing and up to three times for a long shot', () => {
    expect([0.9, 0.8, 0.7999, 0.4, 0.3999, 0.1, 0.0999, 0].map(multiplierFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('prices a new player from a deck their size', () => {
    for (let n = 1; n <= 6; n++) {
      const prices = callPrices([], n);
      for (const kind of CALLABLE) {
        expect(prices[kind]).toMatchObject({ made: 0, of: 0, p: CALL_BASELINE[n][kind] });
        expect(prices[kind]?.multiplier).toBe(multiplierFor(CALL_BASELINE[n][kind]!));
      }
    }
    expect(callPrices([], 0)).toEqual(callPrices([], 1));
    expect(callPrices([], 9)).toEqual(callPrices([], 6));
  });

  it('blends your last 8 finished weeks with the deck’s usual weeks, counting this hand or better', () => {
    const history = [...Array.from({ length: 4 }, () => week('high-card')), ...Array.from({ length: 6 }, () => week('three-of-a-kind')), week('pair'), week('straight')];
    const prices = callPrices(history, 2);
    const base = CALL_BASELINE[2];
    // The last 8: six Threes, then a Pair and a Straight.
    expect(prices.pair).toMatchObject({ made: 8, of: CALL_HISTORY });
    expect(prices['three-of-a-kind']?.made).toBe(7);
    expect(prices.straight?.made).toBe(1);
    expect(prices.straight?.p).toBeCloseTo((1 + 4 * base.straight!) / 12, 4);
    expect(prices['royal-flush']?.made).toBe(0);
  });

  it('leaves the warm-up week and the live week out of a price', () => {
    expect(callPrices([week('royal-flush', { warmup: true }), week('royal-flush', { live: true })], 1)).toEqual(callPrices([], 1));
  });

  it('suggests the call with the best expected bonus that pays at least once over', () => {
    const prices: Partial<Record<HandKind, CallPrice>> = {
      pair: { made: 8, of: 8, p: 0.95, multiplier: 0 },
      'two-pair': { made: 5, of: 8, p: 0.6, multiplier: 1 },
      'three-of-a-kind': { made: 3, of: 8, p: 0.35, multiplier: 2 },
      straight: { made: 1, of: 8, p: 0.15, multiplier: 2 },
      'royal-flush': { made: 0, of: 8, p: 0.01, multiplier: 3 },
    };
    // Two pair: 0.6 x 50 = 30. Three of a kind: 0.35 x 70 x 2 = 49. Straight: 0.15 x 100 x 2 = 30.
    expect(suggestCall(prices)).toBe('three-of-a-kind');
    expect(suggestCall({ pair: { made: 8, of: 8, p: 0.95, multiplier: 0 } })).toBe('pair');
  });

  it('prices a week by the habits in the deck that week, not today’s', () => {
    const gone: DealHabit = { ...walk, archivedOn: '2026-10-06' };
    const game = playGame(input({ habits: [read, gone], days: { read: { ...keep(W2), [W3]: 'floor' }, walk: keep(W2) } }));
    expect(game.callOdds).toEqual(callPrices(game.weeks, 2));
  });

  it('pays the called hand times its multiplier when the week makes it, and nothing is lost when it doesn’t', () => {
    const days = { read: { ...keep(W1), ...keep(W2, 'floor', 2) } };
    const plain = playGame(input({ days }));
    const made = plain.weeks[0].hand!.kind;
    const call: HandKind = CALLABLE.includes(made) ? made : 'pair';
    const game = playGame(input({ days, calls: new Map<Day, HandKind>([[W1, call], [W2, 'royal-flush']]) }));
    const [w1, w2] = game.weeks;
    expect(w1.callMultiplier).toBe(callPrices([], 1)[call]!.multiplier);
    expect(w1.madeCall).toBe(atLeast(made, call));
    expect(w1.bonus).toBe(w1.madeCall ? HANDS[call].chips * w1.callMultiplier : 0);
    expect(w2.madeCall).toBe(false);
    expect(w2.bonus).toBe(0);
    expect(w2.chips).toBe(HANDS[w2.hand!.kind].chips);
    expect(game.stack).toBe(plain.stack + w1.bonus);
  });

  it('counts an old Flush call as made when the week is Suited', () => {
    const calls = new Map<Day, HandKind>([[W1, 'flush'], [W2, 'flush']]);
    const game = playGame(input({ days: { read: { ...keep(W1, 'ceiling', 5), ...keep(W2, 'floor', 5) } }, calls }));
    const [w1, w2] = game.weeks;
    expect(w1.hand?.suited).toEqual({ suit: 'clubs', days: 5 });
    expect(w1.madeCall).toBe(true);
    expect(w1.bonus).toBe(HANDS.flush.chips);
    expect(w2.madeCall).toBe(false);
  });

  describe('the call window', () => {
    const open = (today: Day, days: Record<string, Level>) => playGame(input({ today, days: { read: { ...keep(W2), ...days } } })).callOpen;

    it('is open on Monday, before and after you keep something', () => {
      expect(open(W3, {})).toBe(true);
      expect(open(W3, { [W3]: 'floor' })).toBe(true);
    });

    it('stays open on Tuesday until the day ends when Monday was blank', () => {
      expect(open('2026-10-06', {})).toBe(true);
      expect(open('2026-10-06', { '2026-10-06': 'floor' })).toBe(true);
    });

    it('is closed the day after the first kept day', () => {
      expect(open('2026-10-07', { '2026-10-06': 'floor' })).toBe(false);
      expect(open('2026-10-06', { [W3]: 'floor' })).toBe(false);
    });

    it('asks for a call while it is open and no call is made', () => {
      const tips = playGame(input({ today: W3, days: { read: keep(W2) } })).tips;
      expect(tips).toContainEqual({ tone: 'call', text: 'Call the hand you’ll make this week. Make it and it pays. Calls close at midnight on your first kept day.' });
      const kept = playGame(input({ today: W3, days: { read: { ...keep(W2), [W3]: 'floor' } } })).tips;
      expect(kept).toContainEqual({ tone: 'call', text: 'Call the hand you’ll make this week. Make it and it pays. Calls close at midnight.' });
      const called = playGame(input({ today: W3, days: { read: keep(W2) }, calls: new Map<Day, HandKind>([[W3, 'pair']]) })).tips;
      expect(called.some((t) => t.tone === 'call')).toBe(false);
    });
  });

  describe('callChoices', () => {
    const price = (made: number, of: number, p: number): CallPrice => ({ made, of, p, multiplier: multiplierFor(p) });

    it('offers the best Safe, Stretch and Long shot call, and never one that pays nothing extra', () => {
      const choices = callChoices({
        callOdds: {
          pair: price(8, 8, 0.95),
          'two-pair': price(6, 8, 0.7),
          'three-of-a-kind': price(4, 8, 0.45),
          straight: price(2, 8, 0.3),
          'full-house': price(2, 8, 0.25),
          'four-of-a-kind': price(0, 8, 0.05),
          'straight-flush': price(0, 8, 0.02),
          'royal-flush': price(0, 8, 0.01),
        },
      });
      // Safe: Two pair 0.7 x 50 = 35 beats Three of a kind 0.45 x 70 = 31.5.
      expect(choices.safe).toEqual({ kind: 'two-pair', label: 'Safe', multiplier: 1, payout: 50, made: 6, of: 8, p: 0.7, line: 'Made this or better in 6 of your last 8 weeks.' });
      // Stretch: Full house 0.25 x 280 = 70 beats Straight 0.3 x 200 = 60.
      expect(choices.stretch).toMatchObject({ kind: 'full-house', multiplier: 2, payout: 280 });
      // Long shot: Four of a kind 0.05 x 750 = 37.5 beats Royal 0.01 x 1500 = 15.
      expect(choices.longShot).toMatchObject({ kind: 'four-of-a-kind', multiplier: 3, payout: HANDS['four-of-a-kind'].chips * 3 });
    });

    it('leaves out a band with nothing in it, and says plainly how a short record went', () => {
      const choices = callChoices({ callOdds: { pair: price(1, 1, 0.9), 'two-pair': price(0, 1, 0.5) } });
      expect(choices.safe?.line).toBe('Not made last week.');
      expect(choices.stretch).toBeNull();
      expect(choices.longShot).toBeNull();
      expect(callChoices({ callOdds: { 'two-pair': price(1, 1, 0.6) } }).safe?.line).toBe('Made this or better last week.');
      expect(callChoices({ callOdds: { 'two-pair': price(0, 0, 0.6) } }).safe?.line).toBe('No finished weeks yet, so it’s priced for a deck your size.');
      expect(callChoices({ callOdds: {} })).toEqual({ safe: null, stretch: null, longShot: null });
    });

    it('works straight from a game', () => {
      const game = playGame(input({ today: W3, days: { read: { ...keep(W1), ...keep(W2) } } }));
      const choices = callChoices(game);
      for (const c of [choices.safe, choices.stretch, choices.longShot]) if (c) expect(game.callOdds[c.kind]?.multiplier).toBe(c.multiplier);
    });
  });
});

describe('the Hall of Hands', () => {
  it('counts every kind a week held, and separately the kind it ended on', () => {
    const days = { read: { ...keep(W1), ...keep(W2), ...keep(W3), ...keep('2026-10-12', 'ceiling') }, walk: { ...keep(W2), ...keep('2026-10-12') } };
    const game = playGame(input({ habits: [read, walk], today: '2026-10-19', days }));
    for (const e of game.hall) {
      expect(e.count).toBe(game.weeks.filter((w) => w.contains.has(e.kind)).length);
      expect(e.ended).toBe(game.weeks.filter((w) => w.hand?.kind === e.kind).length);
      expect(e.count).toBeGreaterThanOrEqual(e.ended);
      expect(e.first).toBe(game.weeks.find((w) => w.contains.has(e.kind))?.start ?? null);
      if (e.best) expect(e.best.hand.kind).toBe(e.kind);
    }
    for (const w of game.weeks) if (w.hand) expect(w.contains.has(w.hand.kind)).toBe(true);
    const highCard = game.hall.find((e) => e.kind === 'high-card')!;
    expect(highCard.count).toBe(4);
    expect(game.bestEver?.hand.score).toBe(Math.max(...game.weeks.map((w) => w.hand?.score ?? 0)));
  });
});

describe('card backs', () => {
  const MON = '2026-07-06';
  const card = (day: Day, over: Partial<Extract<DayCard, { kind: 'card' }>> = {}): DayCard => ({ kind: 'card', day, rank: 9, suits: ['clubs'], ceilingSuits: [], tier: 'showed-up', lo: 2, rescued: false, ...over });
  /** A finished week with the given cards on its first days. */
  const week = (i: number, cards: ((day: Day) => DayCard)[], over: Partial<Week> = {}): Week => {
    const start = addDays(MON, 7 * i);
    const slots: Slot[] = weekDays(start).map((day, d) => ({ day, state: cards[d] ? 'dealt' : 'blank', card: cards[d]?.(day) ?? null, isToday: false }));
    const dealt = slots.flatMap((s) => (s.card ? [s.card] : []));
    return {
      start,
      slots,
      hand: dealt.length ? { kind: 'high-card', cards: [], ranks: [9], suit: null, suited: null, score: 1, title: 'Nine high' } : null,
      call: null,
      madeCall: false,
      chips: dealt.length ? 10 : 0,
      suitedBonus: 0,
      bonus: 0,
      callMultiplier: 0,
      live: false,
      warmup: false,
      river: { earned: false, need: 5, card: null },
      contains: new Set(dealt.length ? (['high-card'] as HandKind[]) : []),
      keptDays: dealt.length,
      ...over,
    };
  };
  const plain = (day: Day) => card(day);
  const ceiling = (day: Day) => card(day, { ceilingSuits: ['clubs'], tier: 'perfect', lo: 6 });
  const full = (day: Day) => card(day, { tier: 'kept-all', lo: 5 });
  const saved = (day: Day) => card(day, { suits: [], rescued: true });
  const backsAfter = (weeks: Week[], days: Record<string, Record<string, Level>> = {}) => {
    const habit: DealHabit = { ...read, startedOn: MON };
    const today = addDays(MON, 7 * weeks.length);
    return playGame(input({ habits: [habit], today, days }), weeks);
  };

  it('starts with Classic only, and lists how each back is unlocked', () => {
    expect(backsAfter([week(0, [plain])]).backs).toEqual(new Set(['classic']));
    expect(BACKS.map((b) => b.key)).toEqual(['classic', 'pinstripe', 'checker', 'chevron', 'ladder', 'velvet', 'houndstooth', 'lattice', 'sunburst', 'crown', 'aurora']);
    expect(BACKS.find((b) => b.key === 'lattice')?.how).toBe('7 days in total with every card kept.');
    for (const b of BACKS) expect(b.how.length).toBeGreaterThan(0);
  });

  it('unlocks Pinstripe with 5 dealt days in one week, saved days included', () => {
    expect(backsAfter([week(0, [plain, plain, plain, plain])]).backs.has('pinstripe')).toBe(false);
    const game = backsAfter([week(0, [plain, plain, plain]), week(1, [plain, saved, plain, saved, plain])]);
    expect(game.backUnlocks.get('pinstripe')).toBe(addDays(MON, 7));
  });

  it('unlocks Checker with 4 Ceiling days in one week, not spread over two', () => {
    expect(backsAfter([week(0, [ceiling, ceiling, ceiling]), week(1, [ceiling, ceiling, ceiling])]).backs.has('checker')).toBe(false);
    expect(backsAfter([week(0, [ceiling, ceiling, plain, ceiling, ceiling])]).backs.has('checker')).toBe(true);
  });

  it('unlocks Lattice after 7 fully kept days in total', () => {
    const game = backsAfter([week(0, [full, full, full, plain]), week(1, []), week(2, [full, plain, full, full, ceiling])]);
    expect(game.backUnlocks.get('lattice')).toBe(addDays(MON, 14));
    expect(backsAfter([week(0, [full, full, full]), week(1, [full, full, full])]).backs.has('lattice')).toBe(false);
  });

  it('unlocks Velvet after 13 weeks played in total, gaps allowed', () => {
    const weeks = Array.from({ length: 20 }, (_, i) => week(i, i % 3 === 2 ? [] : [plain]));
    const game = backsAfter(weeks);
    const thirteenth = weeks.filter((w) => w.hand)[12].start;
    expect(game.backUnlocks.get('velvet')).toBe(thirteenth);
    expect(backsAfter(weeks.slice(0, 18)).backs.has('velvet')).toBe(false);
  });

  it('unlocks Houndstooth with a call made, Ladder with a Straight, Crown with a Royal flush and Aurora with Five of a kind', () => {
    const game = backsAfter([
      week(0, [plain], { madeCall: true }),
      week(1, [plain], { contains: new Set<HandKind>(['high-card', 'straight']) }),
      week(2, [plain], { contains: new Set<HandKind>(['royal-flush']) }),
      week(3, [plain], { contains: new Set<HandKind>(['five-of-a-kind']) }),
    ]);
    expect(game.backUnlocks.get('houndstooth')).toBe(MON);
    expect(game.backUnlocks.get('ladder')).toBe(addDays(MON, 7));
    expect(game.backUnlocks.get('crown')).toBe(addDays(MON, 14));
    expect(game.backUnlocks.get('aurora')).toBe(addDays(MON, 21));
  });

  it('unlocks Aurora after 52 weeks played, too', () => {
    const weeks = Array.from({ length: 52 }, (_, i) => week(i, [plain]));
    expect(backsAfter(weeks).backUnlocks.get('aurora')).toBe(weeks[51].start);
    expect(backsAfter(weeks.slice(0, 51)).backs.has('aurora')).toBe(false);
  });

  it('unlocks Chevron with the first Jack and Sunburst with the first Queen, at that week’s Showdown', () => {
    const weeks = Array.from({ length: 6 }, (_, i) => week(i, [plain]));
    const days = { read: run(MON, 30) };
    const game = backsAfter(weeks, days);
    // The tenth day is 15 July, in the second week; the thirtieth is 4 August, in the fifth.
    expect(game.backUnlocks.get('chevron')).toBe(addDays(MON, 7));
    expect(game.backUnlocks.get('sunburst')).toBe(addDays(MON, 28));
  });

  it('never unlocks from the warm-up week', () => {
    const game = backsAfter([week(0, [plain, plain, plain, plain, plain], { warmup: true, madeCall: true, contains: new Set<HandKind>(['straight']) })]);
    expect(game.backs).toEqual(new Set(['classic']));
  });

  it('reports what a Showdown unlocked', () => {
    const weeks = [week(0, [plain]), week(1, [plain, plain, plain, plain, plain], { madeCall: true })];
    const game = backsAfter(weeks);
    const unlocks = unlocksFor(game, game.weeks[1]);
    expect(unlocks.backs.sort()).toEqual(['houndstooth', 'pinstripe']);
    expect(unlocks.firstOfKind).toBe(false);
    expect(unlocksFor(game, game.weeks[0]).firstOfKind).toBe(true);
  });
});

describe('tables', () => {
  it('open in order, each with its own line', () => {
    expect(TABLES.map((t) => t.key)).toEqual(['kitchen', 'card-room', 'velvet-room', 'midnight', 'gold-room', 'library', 'lighthouse', 'observatory']);
    for (let i = 1; i < TABLES.length; i++) expect(TABLES[i].chips).toBeGreaterThan(TABLES[i - 1].chips);
    expect(TABLES.find((t) => t.key === 'gold-room')?.about).toBe('Black and gold. For the long game.');
    expect(playGame(input({})).tables).toEqual(new Set(['kitchen']));
  });
});

describe('chapters', () => {
  it('count weeks with a hand, so a chapter never closes on a week away and always lands on a Showdown', () => {
    // Monday and Tuesday kept for 15 weeks from 6 July, except the 13th week, spent away.
    const MON = '2026-07-06';
    const days: Record<string, Level> = {};
    for (let i = 0; i < 15; i++) if (i !== 12) Object.assign(days, keep(addDays(MON, 7 * i), 'floor', 2));
    const habit: DealHabit = { ...read, startedOn: MON };
    const game = playGame(input({ habits: [habit], today: addDays(MON, 7 * 14), days: { read: days } }));
    expect(game.weeks[12].hand).toBeNull();
    expect(chapterRecap(game, game.weeks[12])).toBeNull();
    const recap = chapterRecap(game, game.weeks[13]);
    expect(recap).toMatchObject({ chapter: 1, start: MON, end: addDays(game.weeks[13].start, 6), dealtDays: 26 });
    expect(lastShowdown(game)).toBe(game.weeks[13]);
  });

  it('look back on every 13th week played, the warm-up week not counted', () => {
    const late: DealHabit = { ...read, startedOn: '2026-06-26' };
    // A Friday start: the week of 22 June is the warm-up, then 14 weeks with Mondays and Tuesdays kept.
    const days: Record<string, Level> = { '2026-06-26': 'floor' };
    for (let i = 1; i <= 14; i++) Object.assign(days, keep(addDays('2026-06-22', 7 * i), i === 3 ? 'ceiling' : 'floor', 2));
    const game = playGame(input({ habits: [late], today: addDays('2026-06-22', 7 * 15), days: { read: days } }));
    expect(game.weeks[0].warmup).toBe(true);
    expect(chapterRecap(game, game.weeks[12])).toBeNull();
    const recap = chapterRecap(game, game.weeks[13])!;
    expect(recap).toMatchObject({ chapter: 1, start: '2026-06-29', end: addDays(game.weeks[13].start, 6), dealtDays: 26, keptDays: 26 });
    expect(recap.chips).toBe(game.weeks.slice(1, 14).reduce((s, w) => s + weekTotal(w), 0));
    expect(recap.best?.hand.score).toBe(Math.max(...game.weeks.slice(1, 14).map((w) => w.hand?.score ?? 0)));
    expect(recap.faces.map((f) => f.face.face)).toEqual(['jack']);
    expect(chapterRecap(game, game.weeks[14])).toBeNull();
    expect(chapterRecap(game, game.weeks[0])).toBeNull();
  });
});

describe('weekReview', () => {
  it('tells the week habit by habit', () => {
    const habits = [read, walk];
    const days = { read: { ...keep(W2, 'floor', 5), [W2]: 'ceiling' as Level, '2026-09-29': 'ceiling' as Level }, walk: { [W2]: 'floor' as Level, '2026-10-01': 'ceiling' as Level } };
    const i = input({ habits, today: W3, days });
    const game = playGame(i);
    const review = weekReview(game.weeks[1], i);
    expect(review).toEqual({
      dealt: 5,
      saved: 0,
      ceilingDays: 3,
      keptDays: 7,
      ceilings: 3,
      lead: 'clubs',
      habits: [
        { id: 'read', suit: 'clubs', kept: 5, ceilings: 2, days: 7 },
        { id: 'walk', suit: 'spades', kept: 2, ceilings: 1, days: 7 },
      ],
      best: 'read',
      weakest: 'walk',
    });
  });

  it('counts saved days apart and leaves them out of the lead', () => {
    const one: DealHabit = { ...walk, startedOn: W2 };
    const i = input({ habits: [one], today: W3, days: { walk: { [W2]: 'floor', '2026-09-30': 'floor' } } });
    const review = weekReview(playGame(i).weeks[0], i);
    expect([review.dealt, review.saved, review.keptDays, review.lead]).toEqual([3, 1, 2, 'spades']);
  });
});

describe('dealEvent', () => {
  const fresh: DealHabit = { ...read, startedOn: W3 };
  const today = '2026-10-07';

  it('reports the card a check-in dealt and the hand before and after', () => {
    const before = playLiveWeek(input({ habits: [fresh], days: { read: keep(W3, 'floor', 2) } }));
    const after = playLiveWeek(input({ habits: [fresh], days: { read: keep(W3, 'floor', 3) } }));
    const event = dealEvent(before, after);
    expect(event?.was).toBeNull();
    expect(event?.card.day).toBe(today);
    expect(event?.hand).toEqual(after.hand);
    expect(event?.handWas).toEqual(before.hand);
    expect(event?.handDropped).toBe(false);
  });

  it('stays quiet when nothing about the card changed, or it got worse', () => {
    const week = playLiveWeek(input({ habits: [fresh], days: { read: keep(W3, 'floor', 3) } }));
    expect(dealEvent(week, week)).toBeNull();
    for (let i = 0; i < 40; i++) {
      const floor = playLiveWeek(input({ seed: `p-${i}`, habits: [fresh], days: { read: { ...keep(W3, 'floor', 2), [today]: 'floor' } } }));
      const ceiling = playLiveWeek(input({ seed: `p-${i}`, habits: [fresh], days: { read: { ...keep(W3, 'floor', 2), [today]: 'ceiling' } } }));
      expect(rankOf(ceiling.slots[2].card)).toBeGreaterThanOrEqual(rankOf(floor.slots[2].card));
      expect(dealEvent(ceiling, floor)).toBeNull();
    }
  });

  it('stays quiet when only a suit is added at the same rank', () => {
    const craft: DealHabit = { id: 'craft', suit: 'diamonds', startedOn: W1, archivedOn: null };
    const habits = [read, walk, craft];
    let quiet = 0;
    for (let i = 0; i < 40; i++) {
      const seed = `s-${i}`;
      const one = playLiveWeek(input({ seed, habits, days: { read: { [today]: 'floor' } } }));
      const two = playLiveWeek(input({ seed, habits, days: { read: { [today]: 'floor' }, walk: { [today]: 'floor' } } }));
      const [a, b] = [one.slots[2].card, two.slots[2].card];
      // Same weight and the same start: the lower id leads, so Read's Clubs come first.
      expect(b?.suits).toEqual(['clubs', 'spades']);
      if (rankOf(a) === rankOf(b)) {
        quiet++;
        expect(improves(b!, a)).toBe(false);
        expect(dealEvent(one, two)).toBeNull();
      } else expect(dealEvent(one, two)?.was).toEqual(a);
      expect(dealEvent(two, one)).toBeNull();
    }
    expect(quiet).toBeGreaterThan(20);
  });

  it('says so when a higher card breaks a match and the hand gets weaker', () => {
    let dropped = 0;
    for (let i = 0; i < 1500; i++) {
      const seed = `d-${i}`;
      const floor = playLiveWeek(input({ seed, habits: [fresh], days: { read: { ...keep(W3, 'floor', 2), [today]: 'floor' } } }));
      const ceiling = playLiveWeek(input({ seed, habits: [fresh], days: { read: { ...keep(W3, 'floor', 2), [today]: 'ceiling' } } }));
      const event = dealEvent(floor, ceiling);
      if (!event) continue;
      expect(event.handDropped).toBe(ceiling.hand!.score < floor.hand!.score);
      if (event.handDropped) dropped++;
    }
    expect(dropped).toBeGreaterThan(0);
  });

  it('announces a Joker once, not again when more habits are kept that day', () => {
    // Nine Clubs days so far: keeping Read today earns the Jack, which deals today's Joker.
    const nine = Object.fromEntries(weekDays(W2).concat(weekDays(W3).slice(0, 2)).map((d) => [d, 'floor' as Level]));
    const habits = [read, walk];
    const before = playLiveWeek(input({ habits, days: { read: nine } }));
    const one = playLiveWeek(input({ habits, days: { read: { ...nine, [today]: 'floor' } } }));
    const two = playLiveWeek(input({ habits, days: { read: { ...nine, [today]: 'floor' }, walk: { [today]: 'floor' } } }));
    expect(dealEvent(before, one)?.card.kind).toBe('joker');
    expect(two.slots[2].card?.kind).toBe('joker');
    expect(dealEvent(one, two)).toBeNull();
  });
});

describe('the Showdown', () => {
  it('shows last week once the new week starts, with what it unlocked', () => {
    const game = playGame(input({ days: { read: { ...keep(W1, 'floor', 1), ...keep(W2, 'floor', 5) } } }));
    const week = lastShowdown(game);
    expect(week?.start).toBe(W2);
    const unlocks = unlocksFor(game, week!);
    expect(unlocks.firstOfKind).toBe(game.weeks[0].hand?.kind !== week?.hand?.kind);
    expect(unlocks.backs).toContain('pinstripe');
    expect(unlocks.backs).not.toContain('classic');
  });

  it('has no Showdown when last week had no cards', () => {
    expect(lastShowdown(playGame(input({ days: { read: keep(W1, 'floor', 2) } })))).toBeNull();
  });
});

describe('tips', () => {
  it('asks for a habit when today has no card yet', () => {
    const game = playGame(input({ days: { read: keep(W3, 'floor', 2) } }));
    expect(game.tips[0]).toEqual({ tone: 'deal', text: 'Keep any habit to deal today’s card.' });
  });

  it('offers to save yesterday after a blank day', () => {
    const game = playGame(input({ days: { read: { ...keep(W2), [W3]: 'floor' } } }));
    expect(game.rescue).toBe('2026-10-06');
    expect(game.tips.some((t) => t.tone === 'rescue')).toBe(true);
  });

  it('points at a face card one day away, with its Joker, and deals the Joker when it lands', () => {
    const nine = Object.fromEntries(weekDays(W2).concat(weekDays(W3).slice(0, 2)).map((d) => [d, 'floor' as Level]));
    const before = playGame(input({ days: { read: nine } }));
    expect(before.tips[0]).toEqual({ tone: 'face', text: 'Keep a Mind habit today to earn the Jack of Clubs and a Joker.' });
    const after = playGame(input({ days: { read: { ...nine, '2026-10-07': 'floor' } } }));
    expect(after.current.slots[2].card?.kind).toBe('joker');
    expect(after.tips[0]).toMatchObject({ tone: 'joker' });
    expect(after.faces.map((f) => f.face.face)).toEqual(['jack']);
  });

  it('counts a face card by days, so a second habit in the suit on the same day doesn’t bring it closer', () => {
    const learn: DealHabit = { id: 'learn', suit: 'clubs', startedOn: W1, archivedOn: null };
    const eight = Object.fromEntries(weekDays(W2).concat(weekDays(W3).slice(0, 1)).map((d) => [d, 'floor' as Level]));
    const game = playGame(input({ habits: [read, learn], days: { read: eight, learn: { ...eight, '2026-10-06': 'floor' } } }));
    expect(game.tips[0]).toEqual({ tone: 'face', text: 'Keep a Mind habit today to earn the Jack of Clubs and a Joker.' });
  });

  it('names the habit still open on a partial day and the real band it would deal from', () => {
    const today = '2026-10-07';
    let named = 0;
    for (let i = 0; i < 60; i++) {
      const seed = `c-${i}`;
      const game = playGame(input({ seed, habits: [read, walk], days: { read: keep(W3, 'floor', 3), walk: keep(W3, 'floor', 2) } }));
      const rank = rankOf(game.current.slots[2].card);
      const both = rankOf(dealDay(today, [read, walk], log({ read: { [today]: 'floor' }, walk: { [today]: 'floor' } }), seed));
      const top = rankOf(dealDay(today, [read, walk], log({ read: { [today]: 'ceiling' }, walk: { [today]: 'ceiling' } }), seed));
      const climb = game.tips.find((t) => t.tone === 'climb' || t.tone === 'done');
      // A card that already fits a better band keeps its rank there, so only a band above it can lift it.
      if (rank >= 5) expect(both).toBe(rank);
      if (rank >= 6) expect(top).toBe(rank);
      if (rank < 5) {
        named++;
        expect(climb).toEqual({ tone: 'climb', text: 'Keep Walk too and today’s card is 5 or better.' });
      } else if (rank < 6) expect(climb).toEqual({ tone: 'climb', text: 'Keep every habit, all at their Ceilings, and today’s card is 6 or better.' });
      else expect(climb?.tone).toBe('done');
    }
    expect(named).toBeGreaterThan(3);
  });

  it('calls today’s card locked in only when nothing left to do today could lift it, and keeps every promise it makes', () => {
    const craft: DealHabit = { id: 'craft', suit: 'diamonds', startedOn: W1, archivedOn: null, name: 'Craft' };
    const deck = [read, walk, craft];
    const today = '2026-10-07';
    const levels: (Level | undefined)[] = [undefined, 'floor', 'ceiling'];
    const states = Array.from({ length: 26 }, (_, m) => deck.map((_, i) => levels[Math.floor((m + 1) / 3 ** i) % 3]));
    const daysOf = (state: (Level | undefined)[]) => Object.fromEntries(deck.flatMap((h, i) => (state[i] ? [[h.id, { [today]: state[i]! }]] : [])));
    const tones = new Set<string>();
    for (let n = 0; n < 120; n++) {
      const seed = `lift-${n}`;
      const rankAt = (state: (Level | undefined)[]) => rankOf(dealDay(today, deck, log(daysOf(state)), seed));
      const best = rankAt(deck.map(() => 'ceiling'));
      for (const state of states) {
        const game = playGame(input({ seed, habits: deck, days: daysOf(state) }));
        const rank = rankOf(game.current.slots[2].card);
        expect(rank).toBe(rankAt(state));
        const tip = game.tips.find((t) => t.tone === 'climb' || t.tone === 'done')!;
        tones.add(tip.text.replace(/\d+/g, 'N'));
        if (tip.tone === 'done') expect(best).toBe(rank);
        else expect(best).toBeGreaterThan(rank);
        const or = /(\d+) or better/.exec(tip.text);
        if (or) expect(Number(or[1])).toBeGreaterThan(rank);
        // "Keep Walk too", "Keep the other 2 habits too": keeping them at the Floor lifts the card.
        if (/ too and /.test(tip.text)) expect(rankAt(state.map((l) => l ?? 'floor'))).toBeGreaterThan(rank);
      }
    }
    expect(tones).toContain('Today’s card is locked in. Each habit you keep still counts in your Court.');
    expect(tones).toContain('Every habit at its Ceiling makes today’s card N or better.');
    // Every climb names a band above today's card: a card that fits a better band keeps its rank there.
    expect([...tones].some((x) => /goes up|lifts/.test(x))).toBe(false);
  });

  it('never asks for a habit archived today, which still counts but can’t be kept', () => {
    const today = '2026-10-07';
    const gone: DealHabit = { ...walk, archivedOn: today };
    for (let i = 0; i < 60; i++) {
      const seed = `gone-${i}`;
      const game = playGame(input({ seed, habits: [read, gone], days: { read: { [today]: 'floor' } } }));
      const rank = rankOf(game.current.slots[2].card);
      const tip = game.tips.find((t) => t.tone === 'climb' || t.tone === 'done')!;
      expect(tip.text).not.toMatch(/Walk|other|Keep every habit,/);
      const ceiling = rankOf(dealDay(today, [read, gone], log({ read: { [today]: 'ceiling' } }), seed));
      if (ceiling > rank) expect(tip.text).toBe('Keep every habit you still can, all at their Ceilings, and today’s card is 4 or better.');
      else expect(tip.tone).toBe('done');
    }
  });

  it('never points at a face card, a call or a first card through a deck archived today', () => {
    const today = '2026-10-07';
    const nine = Object.fromEntries(weekDays(W2).concat(weekDays(W3).slice(0, 2)).map((d) => [d, 'floor' as Level]));
    const game = playGame(input({ habits: [{ ...read, archivedOn: today }, walk], days: { read: nine } }));
    expect(game.tips.some((t) => t.tone === 'face')).toBe(false);
    const empty = playGame(input({ habits: [{ ...read, archivedOn: today }], days: { read: keep(W2) } }));
    expect(empty.tips).toEqual([]);
    expect(empty.callOpen).toBe(false);
  });

  it('calls a perfect day by name only when every habit reached its Ceiling', () => {
    const perfect = playGame(input({ habits: [read, walk], days: { read: keep(W3, 'ceiling', 3), walk: keep(W3, 'ceiling', 3) } }));
    expect(perfect.tips).toContainEqual({ tone: 'done', text: 'Perfect day. Every habit at its Ceiling.' });
    for (let i = 0; i < 30; i++) {
      const tips = playGame(input({ seed: `f-${i}`, habits: [read, walk], days: { read: keep(W3, 'ceiling', 3), walk: keep(W3, 'floor', 3) } })).tips;
      expect(tips.some((t) => t.text.startsWith('Perfect day'))).toBe(false);
      expect(tips.some((t) => /could still/.test(t.text))).toBe(false);
    }
  });

  it('counts down to the river card', () => {
    const game = playGame(input({ today: '2026-10-09', days: { read: keep(W3, 'floor', 4) } }));
    expect(game.tips).toContainEqual({ tone: 'showdown', text: 'One more day you keep something earns a river card at the Showdown.' });
  });

  it('says on Sunday that the hand pays out at midnight', () => {
    const game = playGame(input({ today: addDays(W3, 6), days: { read: keep(W3, 'floor', 7) } }));
    expect(game.tips).toContainEqual({ tone: 'showdown', text: 'Last day of the week. Showdown at midnight: your hand pays out.' });
  });

  it('never uses a casino word', () => {
    const texts = [
      ...playGame(input({ today: W3, days: { read: keep(W2) } })).tips,
      ...playGame(input({ today: addDays(W3, 6), days: { read: keep(W3, 'floor', 6) } })).tips,
    ].map((t) => t.text);
    for (const text of texts) expect(text).not.toMatch(/\b(odds|wager|jackpot|bet|streak)\b/i);
  });
});

describe('weekTotal', () => {
  it('adds the hand, the Suited line and the call', () => {
    expect(weekTotal({ chips: 50, suitedBonus: 0, bonus: 140 })).toBe(190);
  });
});
