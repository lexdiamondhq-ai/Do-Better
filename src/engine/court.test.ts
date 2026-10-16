import { describe, expect, it } from 'vitest';

import { SUIT_INFO } from './cards';
import { cleanIdentity, faceDays, faceFor, newFaces, newRungs, nextFace, nextRung, rungFor, suitDays, summarizeCourt, type CourtHabit } from './court';
import { addDays } from './day';
import type { CheckIns, Level } from './kept';

// A Sunday.
const TODAY = '2026-10-11';

/** `n` kept days ending on `end` (today by default). */
function days(n: number, level: Level = 'floor', end = TODAY): CheckIns {
  return new Map(Array.from({ length: n }, (_, i) => [addDays(end, -i), level] as const));
}

describe('faces', () => {
  it('earns a Jack at 10 days, a Queen at 30, a King at 100 and an Ace at 365', () => {
    expect(faceFor(9)).toBeNull();
    expect(faceFor(10)?.face).toBe('jack');
    expect(faceFor(30)?.face).toBe('queen');
    expect(faceFor(99)?.face).toBe('queen');
    expect(faceFor(100)?.face).toBe('king');
    expect(faceFor(365)?.face).toBe('ace');
  });

  it('counts down to the next one', () => {
    expect(nextFace(4)).toMatchObject({ face: { face: 'jack' }, needed: 6 });
    expect(nextFace(365)).toBeNull();
  });
});

describe('rungs', () => {
  it('climbs a rung at 150, 200, 250 and 300 days, between the King and the Ace', () => {
    expect([99, 100, 149, 150, 199, 200, 250, 299, 300, 365].map(rungFor)).toEqual([0, 0, 0, 1, 1, 2, 3, 3, 4, 4]);
    expect(nextRung(120)).toEqual({ rung: 1, votes: 150, needed: 30 });
    expect(nextRung(260)).toEqual({ rung: 4, votes: 300, needed: 40 });
    expect(nextRung(300)).toBeNull();
  });

  it('reports each rung crossed, once, and never a Joker-dealing face for it', () => {
    const habits: CourtHabit[] = [{ id: 'walk', suit: 'spades', identity: 'someone who moves' }];
    const before = summarizeCourt(habits, new Map([['walk', days(149)]]), TODAY);
    const after = summarizeCourt(habits, new Map([['walk', days(150)]]), TODAY);
    expect(after.find((c) => c.suit === 'spades')?.rung).toBe(1);
    expect(newRungs(before, after)).toEqual([{ suit: 'spades', rung: 1, votes: 150, identities: ['someone who moves'] }]);
    expect(newFaces(before, after)).toEqual([]);
    expect(newRungs(after, after)).toEqual([]);
  });
});

describe('summarizeCourt', () => {
  const habits: CourtHabit[] = [
    { id: 'read', suit: 'clubs', identity: 'I am a reader' },
    { id: 'learn', suit: 'clubs', identity: 'a learner' },
    { id: 'walk', suit: 'spades', identity: null },
  ];

  it('counts days per suit: two habits in one suit on one day count once', () => {
    const court = summarizeCourt(habits, new Map([['read', days(25, 'ceiling')], ['learn', days(8)], ['walk', days(3)]]), TODAY);
    const clubs = court.find((c) => c.suit === 'clubs')!;
    expect(clubs.votes).toBe(25);
    expect(clubs.ceilings).toBe(25);
    expect(clubs.face?.face).toBe('jack');
    expect(clubs.next).toMatchObject({ face: { face: 'queen' }, needed: 5 });
    expect(clubs.identities).toEqual(['a reader', 'a learner']);
    expect(court.find((c) => c.suit === 'spades')?.face).toBeNull();
    expect(court.map((c) => c.suit)).toEqual(['spades', 'hearts', 'diamonds', 'clubs']);
  });

  it('adds days from different habits in one suit when they fall on different days', () => {
    const odd = new Map([['2026-10-01', 'floor' as Level], ['2026-10-03', 'floor' as Level]]);
    const even = new Map([['2026-10-02', 'ceiling' as Level], ['2026-10-03', 'ceiling' as Level]]);
    const clubs = summarizeCourt(habits, new Map([['read', odd], ['learn', even]]), TODAY).find((c) => c.suit === 'clubs')!;
    expect(clubs.votes).toBe(3);
    expect(clubs.ceilings).toBe(2);
  });

  it('counts this week from Monday, so it starts again at zero each Monday', () => {
    const habitsOne: CourtHabit[] = [{ id: 'walk', suit: 'spades', identity: null }];
    const checkIns = new Map([['walk', days(10)]]);
    expect(summarizeCourt(habitsOne, checkIns, TODAY)[0].lastWeek).toBe(7);
    // The Monday after: last week's days no longer count as this week.
    expect(summarizeCourt(habitsOne, checkIns, addDays(TODAY, 1))[0].lastWeek).toBe(0);
    expect(summarizeCourt(habitsOne, checkIns, addDays(TODAY, 1))[0].votes).toBe(10);
  });

  it('ignores check-ins after today', () => {
    const later = new Map([[addDays(TODAY, 1), 'floor' as Level]]);
    expect(summarizeCourt(habits, new Map([['walk', later]]), TODAY).find((c) => c.suit === 'spades')?.votes).toBe(0);
  });

  it('calls the Hearts part People', () => {
    expect(SUIT_INFO.hearts.part).toBe('People');
  });
});

describe('newFaces', () => {
  it('reports each face card crossed, once', () => {
    const habits: CourtHabit[] = [{ id: 'walk', suit: 'spades', identity: 'someone who moves' }];
    const before = summarizeCourt(habits, new Map([['walk', days(9)]]), TODAY);
    const after = summarizeCourt(habits, new Map([['walk', days(10)]]), TODAY);
    expect(newFaces(before, after)).toEqual([{ suit: 'spades', face: expect.objectContaining({ face: 'jack' }), identities: ['someone who moves'] }]);
    expect(newFaces(after, after)).toEqual([]);
  });
});

describe('cleanIdentity', () => {
  it('drops "I am" and extra spaces', () => {
    expect(cleanIdentity("  I'm   a runner ")).toBe('a runner');
    expect(cleanIdentity('   ')).toBeNull();
    expect(cleanIdentity(null)).toBeNull();
  });
});

describe('faceDays', () => {
  const habits: CourtHabit[] = [
    { id: 'read', suit: 'clubs', identity: null },
    { id: 'learn', suit: 'clubs', identity: null },
  ];

  it('dates each face card to the tenth day the suit was kept, not the tenth check-in', () => {
    // Both Clubs habits every day for 12 days: the 10th day is two days before today.
    const earned = faceDays(habits, new Map([['read', days(12)], ['learn', days(12)]]), TODAY);
    expect(earned).toEqual([{ day: addDays(TODAY, -2), suit: 'clubs', face: expect.objectContaining({ face: 'jack' }) }]);
    expect(suitDays(habits, new Map([['read', days(12)], ['learn', days(12)]]), 'clubs', TODAY)).toHaveLength(12);
  });

  it('ignores days after the given day', () => {
    expect(faceDays([{ id: 'walk', suit: 'spades' }], new Map([['walk', days(10)]]), addDays(TODAY, -1))).toEqual([]);
  });

  it('orders faces earned on the same day the same way whatever order the habits come in', () => {
    const two: CourtHabit[] = [
      { id: 'walk', suit: 'spades', identity: null },
      { id: 'read', suit: 'clubs', identity: null },
    ];
    const checkIns = new Map([['walk', days(10)], ['read', days(10)]]);
    expect(faceDays(two, checkIns, TODAY)).toEqual(faceDays([...two].reverse(), checkIns, TODAY));
  });
});
