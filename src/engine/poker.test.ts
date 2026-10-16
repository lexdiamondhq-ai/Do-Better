import { describe, expect, it } from 'vitest';

import type { Rank, Suit } from './cards';
import { addDays } from './day';
import type { DayCard } from './deal';
import { atLeast, bestHand, HAND_KINDS, HAND_LADDER, handPhrase, handsIn, HANDS, makesCall, scoreOf, straightHigh, suitedOf, type HandKind } from './poker';

/** A rank with the day's suits (strongest first), a suitless saved day, the river, or a Joker. */
type Spec = [Rank, ...Suit[]] | { saved: Rank } | { river: Rank } | 'joker';

const ROTATE: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/**
 * Day cards dealt Monday onward, one per spec. Cards without a given suit take turns, so they never line up
 * in one suit by accident. `ceiling` marks which suits reached a Ceiling (all of them by default).
 */
function week(specs: Spec[], ceiling: 'all' | 'none' = 'all'): DayCard[] {
  return specs.map((s, i): DayCard => {
    const day = addDays('2026-10-05', i);
    if (s === 'joker') return { kind: 'joker', day, suits: ['clubs'], ceilingSuits: ceiling === 'all' ? ['clubs'] : [], tier: 'kept-all', lo: 5 };
    if ('saved' in s) return { kind: 'card', day, rank: s.saved, suits: [], ceilingSuits: [], tier: 'showed-up', lo: 2, rescued: true };
    if ('river' in s) return { kind: 'card', day: '2026-10-12', rank: s.river, suits: [], ceilingSuits: [], tier: 'kept-all', lo: 5, rescued: false, river: true };
    const [rank, ...given] = s;
    const suits = given.length ? given : [ROTATE[i % 4]];
    return { kind: 'card', day, rank, suits, ceilingSuits: ceiling === 'all' ? suits : [], tier: 'kept-all', lo: 5, rescued: false };
  });
}

const hand = (...specs: Spec[]) => bestHand(week(specs));
const kind = (...specs: Spec[]) => hand(...specs)?.kind;
const title = (...specs: Spec[]) => hand(...specs)?.title;

describe('straightHigh', () => {
  it('finds runs, with the Ace high or low but never wrapping', () => {
    expect(straightHigh(new Set([6, 7, 8, 9, 10]))).toBe(10);
    expect(straightHigh(new Set([10, 11, 12, 13, 14]))).toBe(14);
    expect(straightHigh(new Set([14, 2, 3, 4, 5]))).toBe(5);
    expect(straightHigh(new Set([11, 12, 13, 14, 2]))).toBe(0);
    expect(straightHigh(new Set([4, 5, 6, 7, 8, 9]))).toBe(9);
  });
});

describe('the ladder', () => {
  it('has no Flush: five days in one suit is a Suited week, not a hand', () => {
    expect(HAND_LADDER).not.toContain('flush');
    expect(HAND_KINDS).toEqual(HAND_LADDER);
    expect(kind([2, 'clubs'], [5, 'clubs'], [9, 'clubs'], [11, 'clubs'], [13, 'clubs'])).toBe('high-card');
    expect(kind([13, 'clubs'], [13, 'clubs'], [9, 'clubs'], [7, 'clubs'], [2, 'clubs'])).toBe('pair');
  });

  it('never deals a Flush, across many random weeks', () => {
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 3000; i++) {
      const specs: Spec[] = Array.from({ length: 2 + Math.floor(next() * 6) }, () => {
        const suits = ROTATE.filter(() => next() < 0.5);
        return [(2 + Math.floor(next() * 13)) as Rank, ...(suits.length ? suits : ['clubs' as Suit])];
      });
      if (next() < 0.2) specs.push('joker');
      expect(kind(...specs)).not.toBe('flush');
    }
  });

  it('ranks every kind above the one before it, and pays more for it', () => {
    for (let i = 1; i < HAND_LADDER.length; i++) {
      expect(scoreOf(HAND_LADDER[i], [2, 2, 2, 2, 2])).toBeGreaterThan(scoreOf(HAND_LADDER[i - 1], [14, 14, 14, 14, 14]));
      expect(HANDS[HAND_LADDER[i]].chips).toBeGreaterThan(HANDS[HAND_LADDER[i - 1]].chips);
    }
  });

  it('still places an old Flush call between a Straight and a Full house', () => {
    expect(atLeast('flush', 'straight')).toBe(true);
    expect(atLeast('full-house', 'flush')).toBe(true);
    expect(atLeast('pair', 'flush')).toBe(false);
  });
});

describe('bestHand', () => {
  it('has no hand without cards', () => {
    expect(bestHand([])).toBeNull();
  });

  it('names every kind of hand', () => {
    expect(title([13])).toBe('King high');
    expect(title([13], [13], [4])).toBe('Pair of Kings');
    expect(title([7], [7], [13], [13], [2])).toBe('Two pair, Kings and Sevens');
    expect(title([9], [9], [9], [2], [5])).toBe('Three Nines');
    expect(title([6], [7], [8], [9], [10])).toBe('Straight to the Ten');
    expect(title([14], [2], [3], [4], [5])).toBe('Straight to the Five');
    expect(title([13], [13], [13], [7], [7])).toBe('Full house, Kings over Sevens');
    expect(title([8], [8], [8], [8], [3])).toBe('Four Eights');
    expect(title([5, 'hearts'], [6, 'hearts'], [7, 'hearts'], [8, 'hearts'], [9, 'hearts'])).toBe('Straight flush in Hearts');
    expect(title([10, 'diamonds'], [11, 'diamonds'], [12, 'diamonds'], [13, 'diamonds'], [14, 'diamonds'])).toBe('Royal flush in Diamonds');
    expect(title([12], [12], [12], [12], [12])).toBe('Five Queens');
  });

  it('plays the best five of seven', () => {
    const h = hand([2], [13], [13], [9], [9], [9], [4]);
    expect(h?.kind).toBe('full-house');
    expect(h?.ranks).toEqual([9, 13]);
    expect(h?.cards).toHaveLength(5);
  });

  it('lets a day with two suits play as either one in a straight flush', () => {
    const h = hand([5, 'clubs', 'spades'], [6, 'spades'], [7, 'clubs', 'spades'], [8, 'spades'], [9, 'hearts', 'spades'], [3, 'clubs']);
    expect(h?.kind).toBe('straight-flush');
    expect(h?.suit).toBe('spades');
    expect(h?.cards.every((c) => c.suit === 'spades')).toBe(true);
  });

  it('breaks a tie between suits in favour of the one that led more days', () => {
    const all: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const lead: Suit[] = ['clubs', 'spades', 'hearts', 'diamonds'];
    expect(hand([14, ...all], [13, ...lead], [12, ...lead], [11, ...all], [10, ...lead])?.suit).toBe('clubs');
  });

  it('needs five cards for a straight', () => {
    expect(kind([6], [7], [8], [9])).toBe('high-card');
  });

  it('breaks ties on kickers', () => {
    expect(hand([13], [13], [14], [3])!.score).toBeGreaterThan(hand([13], [13], [12], [11])!.score);
  });
});

describe('cards with no suit', () => {
  it('count for pairs and straights', () => {
    expect(kind([9], { saved: 9 })).toBe('pair');
    expect(kind([6], [7], { saved: 8 }, [9], [10])).toBe('straight');
  });

  it('are left out of straight flushes', () => {
    expect(kind([6, 'clubs'], [7, 'clubs'], { saved: 8 }, [9, 'clubs'], [10, 'clubs'])).toBe('straight');
    expect(kind([10, 'clubs'], [11, 'clubs'], [12, 'clubs'], [13, 'clubs'], { river: 14 })).toBe('straight');
  });

  it('show without a suit in the hand', () => {
    const h = hand([9, 'clubs'], { saved: 9 });
    expect(h?.cards.map((c) => c.suit).sort()).toEqual(['clubs', null].sort());
  });
});

describe('the river card', () => {
  it('plays inside the best five like any other card', () => {
    const h = hand([13], [13], [13], [7], [2], { river: 7 });
    expect(h?.kind).toBe('full-house');
    expect(h?.cards.some((c) => c.river)).toBe(true);
    expect(h?.cards.find((c) => c.river)).toMatchObject({ rank: 7, suit: null, day: '2026-10-12' });
  });

  it('stays out of the hand when a day of the week does the same job', () => {
    const h = hand([13], [13], [7], [7], [2], { river: 7 });
    expect(h?.kind).toBe('full-house');
    expect(h?.ranks).toEqual([7, 13]);
  });
});

describe('Suited', () => {
  it('needs five days that reached a Ceiling in one suit', () => {
    expect(hand([2, 'clubs'], [5, 'clubs'], [9, 'clubs'], [11, 'clubs'], [13, 'clubs'])?.suited).toEqual({ suit: 'clubs', days: 5 });
    expect(hand([2, 'clubs'], [5, 'clubs'], [9, 'clubs'], [11, 'clubs'])?.suited).toBeNull();
    expect(bestHand(week([[2, 'clubs'], [5, 'clubs'], [9, 'clubs'], [11, 'clubs'], [13, 'clubs']], 'none'))?.suited).toBeNull();
  });

  it('counts a day kept in several suits for each suit that reached its Ceiling', () => {
    const both: Suit[] = ['clubs', 'hearts'];
    const h = hand([14, ...both], [12, 'clubs'], [9, ...both], [7, ...both], [5, ...both]);
    expect(h?.suited).toEqual({ suit: 'clubs', days: 5 });
    expect(suitedOf(week([[14, ...both], [12, 'hearts'], [9, ...both], [7, ...both], [5, ...both], [3, 'hearts']]))).toEqual({ suit: 'hearts', days: 6 });
  });

  it('never counts a saved day or the river', () => {
    expect(hand([2, 'clubs'], [5, 'clubs'], [9, 'clubs'], [11, 'clubs'], { saved: 13 }, { river: 4 })?.suited).toBeNull();
  });
});

describe('handPhrase', () => {
  it('reads as part of a sentence', () => {
    expect(handPhrase(hand([13], [13], [4])!)).toBe('a Pair of Kings');
    expect(handPhrase(hand([7], [7], [13], [13], [2])!)).toBe('Two pair, Kings and Sevens');
    expect(handPhrase(hand([9], [9], [9], [2], [5])!)).toBe('Three Nines');
    expect(handPhrase(hand([6], [7], [8], [9], [10])!)).toBe('a Straight to the Ten');
    expect(handPhrase(hand([13], [13], [13], [7], [7])!)).toBe('a Full house, Kings over Sevens');
    expect(handPhrase(hand([8], [8], [8], [8], [3])!)).toBe('Four Eights');
    expect(handPhrase(hand([5, 'hearts'], [6, 'hearts'], [7, 'hearts'], [8, 'hearts'], [9, 'hearts'])!)).toBe('a Straight flush in Hearts');
    expect(handPhrase(hand([10, 'clubs'], [11, 'clubs'], [12, 'clubs'], [13, 'clubs'], [14, 'clubs'])!)).toBe('a Royal flush in Clubs');
    expect(handPhrase(hand([12], [12], [12], [12], [12])!)).toBe('Five Queens');
    expect(handPhrase(hand([13])!)).toBe('King high');
  });
});

describe('handsIn', () => {
  it('lists every kind a week held, not only the one it ended on', () => {
    expect([...handsIn(week([[13], [13], [13], [7], [7]]))].sort()).toEqual(['full-house', 'high-card', 'pair', 'three-of-a-kind', 'two-pair'].sort());
    expect(handsIn(week([[6], [7], [8], [9], [10], [10]])).has('straight')).toBe(true);
    expect(handsIn(week([[6], [7], [8], [9], [10], [10]])).has('pair')).toBe(true);
    expect(handsIn([]).size).toBe(0);
  });

  it('counts a Royal flush as a Straight flush and a Straight too', () => {
    const royal = handsIn(week([[10, 'clubs'], [11, 'clubs'], [12, 'clubs'], [13, 'clubs'], [14, 'clubs']]));
    expect(royal.has('royal-flush') && royal.has('straight-flush') && royal.has('straight')).toBe(true);
  });

  it('lets a Joker stand for any rank', () => {
    const held = handsIn(week([[11], [11], [11], [11], 'joker']));
    expect(held.has('five-of-a-kind')).toBe(true);
    expect(held.has('four-of-a-kind') && held.has('three-of-a-kind') && held.has('pair')).toBe(true);
    expect(handsIn(week([[6], [7], [9], [10], 'joker'])).has('straight')).toBe(true);
  });
});

describe('Jokers', () => {
  it('turn four of a kind into five', () => {
    expect(title([11], [11], [11], [11], 'joker')).toBe('Five Jacks');
  });

  it('have no suit, so they fill a straight but never a straight flush', () => {
    const h = hand([10, 'clubs'], [11, 'clubs'], [12, 'clubs'], 'joker', [14, 'clubs']);
    expect(h?.kind).toBe('straight');
    expect(h?.cards.find((c) => c.joker)).toMatchObject({ rank: 13, suit: null });
  });

  it('pair with your best card', () => {
    expect(title([9], 'joker')).toBe('Pair of Nines');
    expect(title('joker')).toBe('Ace high');
  });

  it('only show in the hand when they are needed', () => {
    const five = hand([13], [13], [13], [13], [2], 'joker');
    expect(five?.kind).toBe('five-of-a-kind');
    expect(five?.cards.filter((c) => c.joker)).toHaveLength(1);
    const straight = hand([6], [7], [8], [9], [10], 'joker');
    expect(straight?.kind).toBe('straight');
    expect(straight?.ranks).toEqual([11]);
  });

  it('make the best hand they can, not just any hand', () => {
    expect(kind([4], [4], [9], [9], 'joker')).toBe('full-house');
  });
});

describe('makesCall', () => {
  it('is made by the called hand or any better one', () => {
    const fh = bestHand(week([[13], [13], [13], [7], [7]]));
    for (const call of ['pair', 'two-pair', 'three-of-a-kind', 'straight', 'full-house'] as HandKind[]) expect(makesCall(fh, call)).toBe(true);
    expect(makesCall(fh, 'four-of-a-kind')).toBe(false);
    expect(makesCall(null, 'pair')).toBe(false);
  });

  it('counts an old Flush call as made when the week is Suited', () => {
    expect(makesCall(bestHand(week([[2, 'clubs'], [5, 'clubs'], [9, 'clubs'], [11, 'clubs'], [13, 'clubs']])), 'flush')).toBe(true);
    expect(makesCall(bestHand(week([[2, 'clubs'], [5, 'clubs'], [9, 'clubs'], [11, 'clubs'], [13, 'clubs']], 'none')), 'flush')).toBe(false);
    expect(makesCall(bestHand(week([[13], [13], [13], [7], [7]], 'none')), 'flush')).toBe(false);
  });
});
