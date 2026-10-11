import { describe, expect, it } from 'vitest';

import type { Suit } from './cards';
import { dealDay, dealWeek, isBlank, rankFor, rescueWaiting, TIER_ORDER, TIERS, tallyDay, tierOf, unit, type DealHabit } from './deal';
import type { CheckIns, Level } from './kept';

const habit = (id: string, suit: Suit, startedOn = '2026-09-01', archivedOn: string | null = null): DealHabit => ({ id, suit, startedOn, archivedOn });
const log = (entries: Record<string, Record<string, Level>>) => new Map<string, CheckIns>(Object.entries(entries).map(([id, days]) => [id, new Map(Object.entries(days))]));

// 2026-10-05 is a Monday.
const MON = '2026-10-05';

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

describe('rankFor', () => {
  it('maps the ends of the range to the ends of each band', () => {
    expect(rankFor('showed-up', 0)).toBe(2);
    expect(rankFor('showed-up', 0.9999)).toBe(12);
    expect(rankFor('kept-all', 0.9999)).toBe(14);
    expect(rankFor('reached-up', 0)).toBe(9);
    expect(rankFor('perfect', 0)).toBe(10);
  });

  it('never lowers the card when the day gets better', () => {
    for (let i = 0; i < 1000; i++) {
      const u = i / 1000;
      const ranks = TIER_ORDER.map((t) => rankFor(t, u));
      for (let k = 1; k < ranks.length; k++) expect(ranks[k]).toBeGreaterThanOrEqual(ranks[k - 1]);
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

  it('gives a one-habit deck the whole deck for a Floor and a perfect day for a Ceiling', () => {
    const one = [habit('a', 'clubs')];
    expect(tierOf(tallyDay(MON, one, log({ a: { [MON]: 'floor' } })))).toBe('kept-all');
    expect(tierOf(tallyDay(MON, one, log({ a: { [MON]: 'ceiling' } })))).toBe('perfect');
  });

  it('lets a habit started today help but never hurt', () => {
    const deck = [habit('a', 'clubs'), habit('b', 'spades', MON)];
    expect(tierOf(tallyDay(MON, deck, log({ a: { [MON]: 'floor' } })))).toBe('kept-all');
    expect(tierOf(tallyDay(MON, deck, log({ a: { [MON]: 'ceiling' }, b: { [MON]: 'ceiling' } })))).toBe('perfect');
  });

  it('stops counting a habit from the day it was archived', () => {
    const deck = [habit('a', 'clubs'), habit('b', 'spades', '2026-09-01', MON)];
    expect(tierOf(tallyDay(MON, deck, log({ a: { [MON]: 'floor' } })))).toBe('kept-all');
    expect(tierOf(tallyDay('2026-10-04', deck, log({ a: { '2026-10-04': 'floor' } })))).toBe('showed-up');
  });
});

describe('dealDay', () => {
  const deck = [habit('read', 'clubs'), habit('walk', 'spades'), habit('call', 'hearts')];

  it('carries the suit of every habit kept, Ceilings first', () => {
    const card = dealDay(MON, deck, log({ read: { [MON]: 'floor' }, walk: { [MON]: 'ceiling' } }), 'me');
    expect(card?.kind).toBe('card');
    expect(card?.suits).toEqual(['spades', 'clubs']);
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
        { read: { [MON]: 'floor' }, walk: { [MON]: 'floor' } },
        { read: { [MON]: 'floor' }, walk: { [MON]: 'floor' }, call: { [MON]: 'floor' } },
        { read: { [MON]: 'ceiling' }, walk: { [MON]: 'floor' }, call: { [MON]: 'floor' } },
        { read: { [MON]: 'ceiling' }, walk: { [MON]: 'ceiling' }, call: { [MON]: 'ceiling' } },
      ];
      let last = 0;
      for (const s of steps) {
        const card = dealDay(MON, deck, log(s), seed);
        const rank = card?.kind === 'card' ? card.rank : 0;
        expect(rank).toBeGreaterThanOrEqual(last);
        last = rank;
      }
    }
  });

  it('can preview a check-in without saving it', () => {
    const card = dealDay(MON, [habit('read', 'clubs')], log({}), 'me', { habitId: 'read', level: 'ceiling' });
    expect(card?.kind === 'card' && card.tier).toBe('perfect');
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

  it('rescues a missed day with a low card when you come back the next day', () => {
    const slots = dealWeek(MON, '2026-10-09', deck, log({ read: { '2026-10-05': 'ceiling', '2026-10-07': 'ceiling' } }), 'me');
    const saved = slots[1].card;
    expect(saved?.kind === 'card' && saved.rescued).toBe(true);
    expect(saved?.kind === 'card' && saved.rank).toBeLessThanOrEqual(TIERS['showed-up'].hi);
    expect(saved?.suits).toEqual(['clubs']);
  });

  it('leaves the first of two missed days in a row empty', () => {
    const slots = dealWeek(MON, '2026-10-09', deck, log({ read: { '2026-10-05': 'floor', '2026-10-08': 'floor' } }), 'me');
    expect(slots[1].state).toBe('blank');
    expect(slots[2].card?.kind === 'card' && slots[2].card.rescued).toBe(true);
  });

  it('never rescues Sunday, because the hand is settled at midnight', () => {
    const slots = dealWeek(MON, '2026-10-12', deck, log({ read: { '2026-10-10': 'floor', '2026-10-12': 'floor' } }), 'me');
    expect(slots[6].state).toBe('blank');
  });

  it('deals a Joker on a day a face card was earned, once a week at most', () => {
    const checkIns = log({ read: { '2026-10-06': 'floor', '2026-10-08': 'floor' } });
    const slots = dealWeek(MON, '2026-10-09', deck, checkIns, 'me', new Set(['2026-10-06', '2026-10-08']));
    expect(slots[1].card).toEqual({ kind: 'joker', day: '2026-10-06', suits: ['clubs'] });
    expect(slots[3].card?.kind).toBe('card');
  });

  it('treats days before the first habit, and its unkept first day, as before the game', () => {
    const late = [habit('read', 'clubs', '2026-10-07')];
    const slots = dealWeek(MON, '2026-10-09', late, log({ read: { '2026-10-08': 'floor' } }), 'me');
    expect(slots.slice(0, 4).map((s) => s.state)).toEqual(['before', 'before', 'before', 'dealt']);
  });

  it('never treats an archived deck as blank', () => {
    const gone = [habit('read', 'clubs', '2026-09-01', '2026-10-06')];
    const slots = dealWeek(MON, '2026-10-09', gone, log({ read: { '2026-10-05': 'floor' } }), 'me');
    expect(slots.slice(0, 5).map((s) => s.state)).toEqual(['dealt', 'before', 'before', 'before', 'before']);
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

describe('skipping a day', () => {
  it('never deals a better card than keeping it would have', () => {
    const one = [habit('read', 'clubs', '2026-09-01')];
    for (let i = 0; i < 200; i++) {
      const seed = `p${i}`;
      const kept = dealWeek(MON, '2026-10-07', one, log({ read: { '2026-10-05': 'floor', '2026-10-06': 'floor', '2026-10-07': 'floor' } }), seed)[1].card;
      const skipped = dealWeek(MON, '2026-10-07', one, log({ read: { '2026-10-05': 'floor', '2026-10-07': 'floor' } }), seed)[1].card;
      expect(kept?.kind === 'card' && skipped?.kind === 'card' && skipped.rank <= kept.rank).toBe(true);
    }
  });
});
