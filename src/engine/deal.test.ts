import { describe, expect, it } from 'vitest';

import type { Rank, Suit } from './cards';
import { addDays } from './day';
import {
  bandOf,
  dealDay,
  dealWeek,
  inDeck,
  isBlank,
  KEPT_LO,
  keptCards,
  loOf,
  rankFor,
  rescueWaiting,
  riverCard,
  savedCard,
  TIER_ORDER,
  tallyDay,
  tierOf,
  TOP_LO,
  unit,
  type DayCard,
  type DealHabit,
} from './deal';
import type { CheckIns, Level } from './kept';
import { bestHand } from './poker';

const habit = (id: string, suit: Suit, startedOn = '2026-09-01', archivedOn: string | null = null): DealHabit => ({ id, suit, startedOn, archivedOn });
const log = (entries: Record<string, Record<string, Level>>) => new Map<string, CheckIns>(Object.entries(entries).map(([id, days]) => [id, new Map(Object.entries(days))]));
const rankOf = (card: DayCard | null | undefined) => (card?.kind === 'card' ? card.rank : 0);

// 2026-10-05 is a Monday.
const MON = '2026-10-05';
const SUITS4: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

describe('unit', () => {
  it('is stable and stays in [0, 1)', () => {
    expect(unit('user:2026-10-05')).toBe(unit('user:2026-10-05'));
    for (let i = 0; i < 500; i++) {
      const u = unit(`seed:${i}`);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('spreads nearby seeds across the range', () => {
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 2000; i++) buckets[Math.floor(unit(`someone:2026-01-${i}`) * 10)]++;
    for (const b of buckets) expect(b).toBeGreaterThan(120);
  });
});

describe('bands', () => {
  /** For a deck of `n`, the lowest card for each number kept, at the Floor and then all at the Ceiling: "3/4 5/6". */
  const row = (n: number) =>
    Array.from({ length: n }, (_, i) => `${loOf({ counted: n, kept: i + 1, ceilings: 0 })}/${loOf({ counted: n, kept: i + 1, ceilings: i + 1 })}`).join(' ');

  it('follows the band table for 1 to 6 habits', () => {
    expect(row(1)).toBe('5/6');
    expect(row(2)).toBe('3/4 5/6');
    expect(row(3)).toBe('2/2 3/4 5/6');
    expect(row(4)).toBe('2/2 3/4 3/4 5/6');
    expect(row(5)).toBe('2/2 2/2 3/4 3/4 5/6');
    expect(row(6)).toBe('2/2 2/2 3/4 3/4 3/4 5/6');
  });

  it('starts a fully kept day at 5, and at 6 only when every habit reached its Ceiling', () => {
    expect([KEPT_LO, TOP_LO]).toEqual([5, 6]);
    for (let n = 1; n <= 6; n++) {
      for (let c = 0; c < n; c++) expect(loOf({ counted: n, kept: n, ceilings: c })).toBe(5);
      expect(loOf({ counted: n, kept: n, ceilings: n })).toBe(6);
    }
  });

  it('has no band when nothing was kept', () => {
    expect(loOf({ counted: 3, kept: 0, ceilings: 0 })).toBeNull();
    expect(bandOf({ counted: 3, kept: 0, ceilings: 0 })).toBeNull();
  });

  it('describes each band in one line', () => {
    expect(bandOf({ counted: 3, kept: 1, ceilings: 0 })).toEqual({ lo: 2, label: 'Some kept', line: 'Deals any card, 2 to Ace.' });
    expect(bandOf({ counted: 2, kept: 1, ceilings: 1 })).toEqual({ lo: 4, label: 'Some kept', line: 'Deals 4 or better.' });
    expect(bandOf({ counted: 2, kept: 2, ceilings: 0 })).toEqual({ lo: 5, label: 'Kept everything', line: 'Deals 5 or better.' });
    expect(bandOf({ counted: 2, kept: 2, ceilings: 1 })?.label).toBe('Reached up');
    expect(bandOf({ counted: 2, kept: 2, ceilings: 2 })).toEqual({ lo: 6, label: 'Perfect day', line: 'Deals 6 or better.' });
  });

  it('ranks a fully kept Floor day above any partial day', () => {
    for (let n = 1; n <= 6; n++) {
      const full = loOf({ counted: n, kept: n, ceilings: 0 })!;
      for (let k = 1; k < n; k++) for (let c = 0; c <= k; c++) expect(full).toBeGreaterThan(loOf({ counted: n, kept: k, ceilings: c })!);
    }
  });

  it('never lowers the band when a habit is kept or reaches its Ceiling, new habits included (every deck up to 6)', () => {
    const levels: (Level | undefined)[] = [undefined, 'floor', 'ceiling'];
    for (let size = 1; size <= 6; size++) {
      for (let fresh = 0; fresh <= size; fresh++) {
        const deck = Array.from({ length: size }, (_, i) => habit(`h${i}`, SUITS4[i % 4], i < fresh ? MON : '2026-09-01'));
        for (let mask = 0; mask < 3 ** size; mask++) {
          const state = deck.map((_, i) => levels[Math.floor(mask / 3 ** i) % 3]);
          const at = (s: (Level | undefined)[]) => tallyDay(MON, deck, new Map(deck.map((h, i) => [h.id, new Map(s[i] ? [[MON, s[i]!]] : [])])));
          const before = at(state);
          for (let i = 0; i < size; i++) {
            if (state[i] === 'ceiling') continue;
            const up = [...state];
            up[i] = state[i] ? 'ceiling' : 'floor';
            const after = at(up);
            expect(loOf(after) ?? 0).toBeGreaterThanOrEqual(loOf(before) ?? 0);
            expect(TIER_ORDER.indexOf(tierOf(after)!)).toBeGreaterThanOrEqual(TIER_ORDER.indexOf(tierOf(before) ?? 'showed-up'));
          }
        }
      }
    }
  });
});

describe('rankFor', () => {
  it('keeps the day’s own card when it fits the band, and deals again inside the band when it doesn’t', () => {
    const ten = (10 - 2 + 0.5) / 13;
    expect([2, 3, 4, 5, 6].map((lo) => rankFor(lo as Rank, ten, 0.99))).toEqual([10, 10, 10, 10, 10]);
    const four = (4 - 2 + 0.5) / 13;
    const nine = (9 - 2 + 0.5) / 13;
    expect(rankFor(4, four, nine)).toBe(4);
    // Too low for the band: the day's second deck turns a Nine, which fits.
    expect(rankFor(5, four, nine)).toBe(9);
    expect(rankFor(6, four, 0.9999)).toBe(14);
  });

  it('keeps a card dealt again when it still fits a higher band, so keeping more never changes a card that fits', () => {
    let kept = 0;
    for (let i = 0; i < 3000; i++) {
      const u = unit(`s:${i}`);
      const again = unit(`s:${i}:again`);
      for (let lo = 3; lo <= 6; lo++) {
        const r = rankFor(lo as Rank, u, again);
        for (let higher = lo + 1; higher <= 6; higher++) {
          if (r < higher) continue;
          expect(rankFor(higher as Rank, u, again)).toBe(r);
          kept++;
        }
      }
    }
    expect(kept).toBeGreaterThan(1000);
  });

  it('is never lower for a higher lowest card, whatever the deal', () => {
    for (let i = 0; i < 1000; i++) {
      const u = i / 1000;
      for (let j = 0; j < 20; j++) {
        const again = j / 20;
        let last = 0;
        for (let lo = 2; lo <= 14; lo++) {
          const r = rankFor(lo as Rank, u, again);
          expect(r).toBeGreaterThanOrEqual(lo);
          expect(r).toBeGreaterThanOrEqual(last);
          last = r;
        }
      }
    }
  });

  it('deals every rank in a band about equally often', () => {
    for (const lo of [2, 3, 4, 5, 6] as Rank[]) {
      const counts = new Map<number, number>();
      const n = 26000;
      for (let i = 0; i < n; i++) {
        const r = rankFor(lo, unit(`p:${i}`), unit(`p:${i}:again`));
        counts.set(r, (counts.get(r) ?? 0) + 1);
      }
      const even = n / (14 - lo + 1);
      for (let r = lo; r <= 14; r++) expect(Math.abs((counts.get(r) ?? 0) - even) / even).toBeLessThan(0.08);
    }
  });
});

describe('tierOf', () => {
  const two = [habit('a', 'clubs'), habit('b', 'spades')];
  const tier = (days: Record<string, Record<string, Level>>, day = MON) => tierOf(tallyDay(day, two, log(days)));

  it('reads a day from the habits kept', () => {
    expect(tier({})).toBeNull();
    expect(tier({ a: { [MON]: 'floor' } })).toBe('showed-up');
    expect(tier({ a: { [MON]: 'ceiling' } })).toBe('showed-up');
    expect(tier({ a: { [MON]: 'floor' }, b: { [MON]: 'floor' } })).toBe('kept-all');
    expect(tier({ a: { [MON]: 'ceiling' }, b: { [MON]: 'floor' } })).toBe('reached-up');
    expect(tier({ a: { [MON]: 'ceiling' }, b: { [MON]: 'ceiling' } })).toBe('perfect');
  });

  it('gives a one-habit deck everything for a Floor and a perfect day for a Ceiling', () => {
    const one = [habit('a', 'clubs')];
    expect(tierOf(tallyDay(MON, one, log({ a: { [MON]: 'floor' } })))).toBe('kept-all');
    expect(tierOf(tallyDay(MON, one, log({ a: { [MON]: 'ceiling' } })))).toBe('perfect');
  });

  it('lets a habit started today help but never hurt', () => {
    const deck = [habit('a', 'clubs'), habit('b', 'spades', MON)];
    expect(tierOf(tallyDay(MON, deck, log({ a: { [MON]: 'floor' } })))).toBe('kept-all');
    expect(tierOf(tallyDay(MON, deck, log({ a: { [MON]: 'ceiling' }, b: { [MON]: 'ceiling' } })))).toBe('perfect');
  });

  it('counts an archived habit through its archive day and stops the day after', () => {
    const deck = [habit('a', 'clubs'), habit('b', 'spades', '2026-09-01', MON)];
    expect(tierOf(tallyDay(MON, deck, log({ a: { [MON]: 'floor' } })))).toBe('showed-up');
    expect(tierOf(tallyDay(addDays(MON, 1), deck, log({ a: { [addDays(MON, 1)]: 'floor' } })))).toBe('kept-all');
  });
});

describe('archiving', () => {
  const deck = (archivedOn: string | null) => [habit('read', 'clubs'), habit('walk', 'spades', '2026-09-01', archivedOn)];
  const checkIns = log({ read: { [MON]: 'floor', [addDays(MON, -1)]: 'floor' }, walk: { [addDays(MON, -1)]: 'ceiling' } });

  it('keeps a habit in the deck through the day it was archived, in either way the day is stored', () => {
    for (const stored of [MON, `${MON}T00:00:00.000Z`]) {
      const h = habit('walk', 'spades', '2026-09-01', stored);
      expect(inDeck(h, MON)).toBe(true);
      expect(inDeck(h, addDays(MON, 1))).toBe(false);
      expect(inDeck(h, '2026-08-31')).toBe(false);
    }
  });

  it('never changes today’s card, or any card before it, when an unkept habit is archived today', () => {
    for (let i = 0; i < 100; i++) {
      const seed = `s${i}`;
      const live = dealWeek(addDays(MON, -7), MON, deck(null), checkIns, seed).concat(dealWeek(MON, MON, deck(null), checkIns, seed));
      for (const stored of [MON, `${MON}T00:00:00.000Z`]) {
        const archived = dealWeek(addDays(MON, -7), MON, deck(stored), checkIns, seed).concat(dealWeek(MON, MON, deck(stored), checkIns, seed));
        expect(archived).toEqual(live);
      }
    }
  });
});

describe('dealDay', () => {
  const deck = [habit('read', 'clubs'), habit('walk', 'spades'), habit('call', 'hearts')];

  it('carries the suit of every habit kept, Ceilings first, and which suits reached a Ceiling', () => {
    const card = dealDay(MON, deck, log({ read: { [MON]: 'floor' }, walk: { [MON]: 'ceiling' } }), 'me');
    expect(card?.kind).toBe('card');
    expect(card?.suits).toEqual(['spades', 'clubs']);
    expect(card?.ceilingSuits).toEqual(['spades']);
    expect(card?.lo).toBe(3);
  });

  it('breaks a tie between suits by the habit started first, then by id, never by deck order', () => {
    const four = [habit('read', 'clubs'), habit('walk', 'spades', '2026-08-15'), habit('call', 'hearts'), habit('work', 'diamonds')];
    const checkIns = log({ read: { [MON]: 'floor' }, walk: { [MON]: 'floor' }, call: { [MON]: 'floor' }, work: { [MON]: 'ceiling' } });
    const expected = dealDay(MON, four, checkIns, 'me');
    expect(expected?.suits).toEqual(['diamonds', 'spades', 'hearts', 'clubs']);
    const orders = (xs: DealHabit[]): DealHabit[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));
    for (const order of orders(four)) expect(dealDay(MON, order, checkIns, 'me')).toEqual(expected);
  });

  it('deals the same card for the same person and day', () => {
    const checkIns = log({ read: { [MON]: 'floor' } });
    expect(dealDay(MON, deck, checkIns, 'me')).toEqual(dealDay(MON, deck, checkIns, 'me'));
  });

  it('only ever raises the card as more habits are kept', () => {
    for (let i = 0; i < 60; i++) {
      const seed = `person-${i}`;
      const steps: Record<string, Record<string, Level>>[] = [
        { read: { [MON]: 'floor' } },
        { read: { [MON]: 'ceiling' } },
        { read: { [MON]: 'floor' }, walk: { [MON]: 'floor' } },
        { read: { [MON]: 'floor' }, walk: { [MON]: 'floor' }, call: { [MON]: 'floor' } },
        { read: { [MON]: 'ceiling' }, walk: { [MON]: 'floor' }, call: { [MON]: 'floor' } },
        { read: { [MON]: 'ceiling' }, walk: { [MON]: 'ceiling' }, call: { [MON]: 'ceiling' } },
      ];
      let last = 0;
      for (const s of steps) {
        const rank = rankOf(dealDay(MON, deck, log(s), seed));
        expect(rank).toBeGreaterThanOrEqual(last);
        last = rank;
      }
    }
  });

  it('never lowers a perfect day when a habit started that day is kept at its Floor', () => {
    const fresh = [habit('read', 'clubs', MON), habit('walk', 'spades', MON)];
    for (let i = 0; i < 200; i++) {
      const seed = `person-${i}`;
      const alone = dealDay(MON, fresh, log({ read: { [MON]: 'ceiling' } }), seed);
      const both = dealDay(MON, fresh, log({ read: { [MON]: 'ceiling' }, walk: { [MON]: 'floor' } }), seed);
      expect(alone?.tier).toBe('perfect');
      expect(both?.tier).toBe('perfect');
      expect(rankOf(both)).toBeGreaterThanOrEqual(rankOf(alone));
      expect(both?.suits).toEqual(['clubs', 'spades']);
    }
  });

  it('still asks habits that were already running to reach their Ceiling for a perfect day', () => {
    const t = tallyDay(MON, [habit('read', 'clubs'), habit('walk', 'spades')], log({ read: { [MON]: 'ceiling' }, walk: { [MON]: 'floor' } }));
    expect(tierOf(t)).toBe('reached-up');
  });

  it('can preview a check-in without saving it', () => {
    const card = dealDay(MON, [habit('read', 'clubs')], log({}), 'me', { habitId: 'read', level: 'ceiling' });
    expect(card?.tier).toBe('perfect');
  });
});

describe('dealWeek', () => {
  // Started on Monday, so the Sunday before is not a blank day.
  const deck = [habit('read', 'clubs', MON)];

  it('marks future days, today, kept days and blanks', () => {
    const slots = dealWeek(MON, '2026-10-09', deck, log({ read: { '2026-10-05': 'floor', '2026-10-08': 'floor' } }), 'me');
    expect(slots.map((s) => s.state)).toEqual(['dealt', 'blank', 'dealt', 'dealt', 'open', 'future', 'future']);
    expect(slots[4].isToday).toBe(true);
  });

  it('saves a missed day with a card that has no suit when you come back the next day', () => {
    const slots = dealWeek(MON, '2026-10-09', deck, log({ read: { '2026-10-05': 'ceiling', '2026-10-07': 'ceiling' } }), 'me');
    const saved = slots[1].card;
    expect(saved).toEqual(savedCard('2026-10-06', 'me'));
    expect(saved).toMatchObject({ kind: 'card', rescued: true, suits: [], ceilingSuits: [], lo: 2 });
  });

  it('leaves the first of two missed days in a row empty', () => {
    const slots = dealWeek(MON, '2026-10-09', deck, log({ read: { '2026-10-05': 'floor', '2026-10-08': 'floor' } }), 'me');
    expect(slots[1].state).toBe('blank');
    expect(slots[2].card?.kind === 'card' && slots[2].card.rescued).toBe(true);
  });

  it('saves any number of days in a week, one after each day you come back', () => {
    const days = { '2026-10-05': 'floor', '2026-10-07': 'floor', '2026-10-09': 'floor', '2026-10-11': 'floor' } as const;
    const slots = dealWeek(MON, '2026-10-11', deck, log({ read: days }), 'me');
    expect(slots.filter((s) => s.card?.kind === 'card' && s.card.rescued).map((s) => s.day)).toEqual(['2026-10-06', '2026-10-08', '2026-10-10']);
  });

  it('never saves Sunday, because the hand is settled at midnight', () => {
    const slots = dealWeek(MON, '2026-10-12', deck, log({ read: { '2026-10-10': 'floor', '2026-10-12': 'floor' } }), 'me');
    expect(slots[6].state).toBe('blank');
  });

  it('deals a Joker on a Joker day, keeping the day’s suits, once a week at most', () => {
    const checkIns = log({ read: { '2026-10-06': 'ceiling', '2026-10-08': 'floor' } });
    const slots = dealWeek(MON, '2026-10-09', deck, checkIns, 'me', new Set(['2026-10-06', '2026-10-08']));
    expect(slots[1].card).toEqual({ kind: 'joker', day: '2026-10-06', suits: ['clubs'], ceilingSuits: ['clubs'], tier: 'perfect', lo: 6 });
    expect(slots[3].card?.kind).toBe('card');
  });

  it('never deals a Joker on a saved day', () => {
    const checkIns = log({ read: { '2026-10-05': 'floor', '2026-10-07': 'floor' } });
    const slots = dealWeek(MON, '2026-10-09', deck, checkIns, 'me', new Set(['2026-10-06']));
    expect(slots[1].card?.kind).toBe('card');
  });

  it('treats days before the first habit, and its unkept first day, as before the game', () => {
    const late = [habit('read', 'clubs', '2026-10-07')];
    const slots = dealWeek(MON, '2026-10-09', late, log({ read: { '2026-10-08': 'floor' } }), 'me');
    expect(slots.slice(0, 4).map((s) => s.state)).toEqual(['before', 'before', 'before', 'dealt']);
  });

  it('never treats days after the whole deck was archived as blank', () => {
    const gone = [habit('read', 'clubs', '2026-09-01', '2026-10-06')];
    const slots = dealWeek(MON, '2026-10-09', gone, log({ read: { '2026-10-05': 'floor' } }), 'me');
    expect(slots.slice(0, 5).map((s) => s.state)).toEqual(['dealt', 'blank', 'before', 'before', 'before']);
  });

  it('deals the same week whatever order the habits come in', () => {
    const four = [habit('read', 'clubs'), habit('walk', 'spades'), habit('call', 'hearts'), habit('work', 'diamonds')];
    const checkIns = log({
      read: { '2026-10-05': 'floor', '2026-10-06': 'ceiling', '2026-10-08': 'floor' },
      walk: { '2026-10-05': 'floor', '2026-10-06': 'ceiling' },
      call: { '2026-10-05': 'ceiling', '2026-10-08': 'floor' },
      work: { '2026-10-06': 'floor', '2026-10-08': 'ceiling' },
    });
    const forward = dealWeek(MON, '2026-10-11', four, checkIns, 'me');
    expect(dealWeek(MON, '2026-10-11', [...four].reverse(), checkIns, 'me')).toEqual(forward);
    expect(dealWeek(MON, '2026-10-11', [four[2], four[0], four[3], four[1]], checkIns, 'me')).toEqual(forward);
  });
});

describe('saved days', () => {
  it('never make a week Suited', () => {
    const one = [habit('read', 'clubs')];
    const four = { '2026-10-05': 'ceiling', '2026-10-07': 'ceiling', '2026-10-08': 'ceiling', '2026-10-09': 'ceiling' } as const;
    const slots = dealWeek(MON, '2026-10-11', one, log({ read: four }), 'me');
    expect(slots[1].card?.kind === 'card' && slots[1].card.rescued).toBe(true);
    const cards = slots.flatMap((s) => (s.card ? [s.card] : []));
    expect(bestHand(cards)?.suited).toBeNull();
    const five = dealWeek(MON, '2026-10-11', one, log({ read: { ...four, '2026-10-10': 'ceiling' } }), 'me').flatMap((s) => (s.card ? [s.card] : []));
    expect(bestHand(five)?.suited).toEqual({ suit: 'clubs', days: 5 });
  });

  it('never deal a better card than keeping one habit that day would have, so skipping never pays', () => {
    for (let size = 1; size <= 4; size++) {
      const deck = Array.from({ length: size }, (_, i) => habit(`h${i}`, SUITS4[i]));
      for (let i = 0; i < 100; i++) {
        const seed = `p${i}`;
        const around = { '2026-10-05': 'floor', '2026-10-07': 'floor' } as const;
        const skipped = dealWeek(MON, '2026-10-07', deck, log({ h0: around }), seed)[1].card;
        for (let k = 0; k < size; k++) {
          const kept = dealWeek(MON, '2026-10-07', deck, log({ h0: around, [`h${k}`]: { ...(k === 0 ? around : {}), '2026-10-06': 'floor' } }), seed)[1].card;
          expect(kept?.kind).toBe('card');
          expect(rankOf(skipped)).toBeLessThanOrEqual(rankOf(kept));
        }
      }
    }
  });
});

describe('the river card', () => {
  const deck = [habit('read', 'clubs'), habit('walk', 'spades')];
  const week = (days: Record<string, Level>, walk: Record<string, Level> = {}) => dealWeek(MON, '2026-10-12', deck, log({ read: days, walk }), 'me');

  it('comes with five kept days, has no suit, and turns the Monday after', () => {
    const five = { '2026-10-05': 'floor', '2026-10-06': 'floor', '2026-10-07': 'floor', '2026-10-08': 'floor', '2026-10-09': 'floor' } as const;
    const slots = week(five, five);
    const river = riverCard(MON, slots, 'me');
    expect(river).toMatchObject({ kind: 'card', day: '2026-10-12', suits: [], ceilingSuits: [], river: true, rescued: false, lo: 5 });
    expect(rankOf(river)).toBeGreaterThanOrEqual(5);
    expect(riverCard(MON, slots, 'me')).toEqual(river);
  });

  it('deals from the band of the week’s middle day', () => {
    const days = { '2026-10-05': 'floor', '2026-10-06': 'floor', '2026-10-07': 'floor', '2026-10-08': 'floor', '2026-10-09': 'floor' } as const;
    // Two fully kept days, three with only one habit: the middle day kept one of two, so the band starts at 3.
    const slots = week(days, { '2026-10-05': 'floor', '2026-10-06': 'floor' });
    expect(riverCard(MON, slots, 'me')?.lo).toBe(3);
  });

  it('needs five days you kept something: saved days don’t count', () => {
    const four = week({ '2026-10-05': 'floor', '2026-10-07': 'floor', '2026-10-08': 'floor', '2026-10-09': 'floor', '2026-10-10': 'floor' });
    expect(keptCards(four)).toHaveLength(5);
    expect(riverCard(MON, four, 'me')).not.toBeNull();
    const saved = week({ '2026-10-05': 'floor', '2026-10-07': 'floor', '2026-10-09': 'floor', '2026-10-11': 'floor' });
    expect(saved.filter((s) => s.card).length).toBe(7);
    expect(keptCards(saved)).toHaveLength(4);
    expect(riverCard(MON, saved, 'me')).toBeNull();
  });
});

describe('rescueWaiting', () => {
  const deck = [habit('read', 'clubs', MON)];

  it('names yesterday when it was blank and today is still open', () => {
    const checkIns = log({ read: { '2026-10-05': 'floor' } });
    const slots = dealWeek(MON, '2026-10-07', deck, checkIns, 'me');
    expect(isBlank('2026-10-06', deck, checkIns)).toBe(true);
    expect(rescueWaiting(slots, '2026-10-07')).toBe('2026-10-06');
  });

  it('is quiet once today is kept, and on Monday', () => {
    const kept = log({ read: { '2026-10-05': 'floor', '2026-10-07': 'floor' } });
    expect(rescueWaiting(dealWeek(MON, '2026-10-07', deck, kept, 'me'), '2026-10-07')).toBeNull();
    expect(rescueWaiting(dealWeek('2026-10-12', '2026-10-12', deck, kept, 'me'), '2026-10-12')).toBeNull();
  });
});
