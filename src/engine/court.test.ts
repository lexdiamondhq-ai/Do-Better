import { describe, expect, it } from 'vitest';

import { cleanIdentity, faceDays, faceFor, newFaces, nextFace, summarizeCourt, type CourtHabit } from './court';
import { addDays } from './day';
import type { CheckIns, Level } from './kept';

const TODAY = '2026-10-11';

/** `n` kept days ending today. */
function days(n: number, level: Level = 'floor'): CheckIns {
  return new Map(Array.from({ length: n }, (_, i) => [addDays(TODAY, -i), level] as const));
}

describe('faces', () => {
  it('earns a Jack at 10 votes, a Queen at 30, a King at 100 and an Ace at 365', () => {
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

describe('summarizeCourt', () => {
  const habits: CourtHabit[] = [
    { id: 'read', suit: 'clubs', identity: 'I am a reader' },
    { id: 'learn', suit: 'clubs', identity: 'a learner' },
    { id: 'walk', suit: 'spades', identity: null },
  ];

  it('adds up votes per suit, Floors and Ceilings alike', () => {
    const court = summarizeCourt(habits, new Map([['read', days(25, 'ceiling')], ['learn', days(8)], ['walk', days(3)]]), TODAY);
    const clubs = court.find((c) => c.suit === 'clubs')!;
    expect(clubs.votes).toBe(33);
    expect(clubs.ceilings).toBe(25);
    expect(clubs.lastWeek).toBe(14);
    expect(clubs.face?.face).toBe('queen');
    expect(clubs.identities).toEqual(['a reader', 'a learner']);
    expect(court.find((c) => c.suit === 'spades')?.face).toBeNull();
    expect(court.map((c) => c.suit)).toEqual(['spades', 'hearts', 'diamonds', 'clubs']);
  });

  it('ignores check-ins after today', () => {
    const later = new Map([[addDays(TODAY, 1), 'floor' as Level]]);
    expect(summarizeCourt(habits, new Map([['walk', later]]), TODAY).find((c) => c.suit === 'spades')?.votes).toBe(0);
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
  it('dates each face card to the day its last needed vote came in', () => {
    const habits: CourtHabit[] = [
      { id: 'read', suit: 'clubs', identity: null },
      { id: 'learn', suit: 'clubs', identity: null },
    ];
    // Two Clubs votes a day: the 10th vote lands on the 5th day.
    const earned = faceDays(habits, new Map([['read', days(12)], ['learn', days(12)]]), TODAY);
    expect(earned).toEqual([{ day: addDays(TODAY, -7), suit: 'clubs', face: expect.objectContaining({ face: 'jack' }) }]);
  });

  it('ignores votes after the given day', () => {
    expect(faceDays([{ id: 'walk', suit: 'spades' }], new Map([['walk', days(10)]]), addDays(TODAY, -1))).toEqual([]);
  });
});
