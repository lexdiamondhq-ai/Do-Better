import { describe, expect, it } from 'vitest';

import type { Rank, Suit } from './cards';
import { addDays } from './day';
import type { DayCard } from './deal';
import { atLeast, bestHand, HAND_KINDS, HANDS, scoreOf, straightHigh, type HandKind } from './poker';

type Spec = [Rank, ...Suit[]] | 'joker';

const ROTATE: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** Day cards dealt Monday onward, one per spec. Cards without a suit take turns, so they never make a flush by accident. */
function week(...specs: Spec[]): DayCard[] {
  return specs.map((s, i) => {
    const day = addDays('2026-10-05', i);
    if (s === 'joker') return { kind: 'joker', day, suits: ['clubs'] };
    const [rank, ...suits] = s;
    return { kind: 'card', day, rank, suits: suits.length ? suits : [ROTATE[i % 4]], tier: 'kept-all', rescued: false };
  });
}

const kind = (...specs: Spec[]) => bestHand(week(...specs))?.kind;
const title = (...specs: Spec[]) => bestHand(week(...specs))?.title;

describe('straightHigh', () => {
  it('finds runs, with the Ace high or low but never wrapping', () => {
    expect(straightHigh(new Set([6, 7, 8, 9, 10]))).toBe(10);
    expect(straightHigh(new Set([10, 11, 12, 13, 14]))).toBe(14);
    expect(straightHigh(new Set([14, 2, 3, 4, 5]))).toBe(5);
    expect(straightHigh(new Set([11, 12, 13, 14, 2]))).toBe(0);
    expect(straightHigh(new Set([4, 5, 6, 7, 8, 9]))).toBe(9);
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
    expect(title([2, 'clubs'], [5, 'clubs'], [9, 'clubs'], [11, 'clubs'], [13, 'clubs'])).toBe('Flush in Clubs');
    expect(title([13], [13], [13], [7], [7])).toBe('Full house, Kings over Sevens');
    expect(title([8], [8], [8], [8], [3])).toBe('Four Eights');
    expect(title([5, 'hearts'], [6, 'hearts'], [7, 'hearts'], [8, 'hearts'], [9, 'hearts'])).toBe('Straight flush in Hearts');
    expect(title([10, 'diamonds'], [11, 'diamonds'], [12, 'diamonds'], [13, 'diamonds'], [14, 'diamonds'])).toBe('Royal flush in Diamonds');
    expect(title([12], [12], [12], [12], [12])).toBe('Five Queens');
  });

  it('plays the best five of seven', () => {
    const hand = bestHand(week([2], [13], [13], [9], [9], [9], [4]));
    expect(hand?.kind).toBe('full-house');
    expect(hand?.ranks).toEqual([9, 13]);
    expect(hand?.cards).toHaveLength(5);
  });

  it('lets a day with two suits play as either one', () => {
    const hand = bestHand(week([2, 'clubs', 'spades'], [5, 'spades'], [9, 'clubs', 'spades'], [11, 'spades'], [13, 'hearts', 'spades'], [3, 'clubs']));
    expect(hand?.kind).toBe('flush');
    expect(hand?.suit).toBe('spades');
    expect(hand?.cards.every((c) => c.suit === 'spades')).toBe(true);
  });

  it('picks the stronger flush when two suits both make one', () => {
    const both: Suit[] = ['clubs', 'hearts'];
    const hand = bestHand(week([14, ...both], [12, 'clubs'], [9, ...both], [7, ...both], [5, ...both], [3, 'hearts']));
    expect(hand?.suit).toBe('clubs');
    expect(hand?.ranks).toEqual([14, 12, 9, 7, 5]);
  });

  it('breaks a tie between suits in favour of the one that led more days', () => {
    const all: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const lead: Suit[] = ['clubs', 'spades', 'hearts', 'diamonds'];
    expect(bestHand(week([14, ...all], [12, ...lead], [9, ...lead], [7, ...all], [5, ...lead]))?.suit).toBe('clubs');
  });

  it('counts the same card twice as a flush, because every day is a fresh deck', () => {
    expect(kind([13, 'clubs'], [13, 'clubs'], [9, 'clubs'], [7, 'clubs'], [2, 'clubs'])).toBe('flush');
  });

  it('needs five cards for straights and flushes', () => {
    expect(kind([6], [7], [8], [9])).toBe('high-card');
    expect(kind([2, 'clubs'], [4, 'clubs'], [6, 'clubs'], [8, 'clubs'])).toBe('high-card');
  });

  it('breaks ties on kickers', () => {
    const a = bestHand(week([13], [13], [14], [3]));
    const b = bestHand(week([13], [13], [12], [11]));
    expect(a!.score).toBeGreaterThan(b!.score);
  });

  it('ranks every kind above the one before it', () => {
    for (let i = 1; i < HAND_KINDS.length; i++) {
      expect(scoreOf(HAND_KINDS[i], [2, 2, 2, 2, 2])).toBeGreaterThan(scoreOf(HAND_KINDS[i - 1], [14, 14, 14, 14, 14]));
      expect(HANDS[HAND_KINDS[i]].chips).toBeGreaterThan(HANDS[HAND_KINDS[i - 1]].chips);
    }
    expect(atLeast('flush', 'straight')).toBe(true);
    expect(atLeast('pair', 'flush')).toBe(false);
  });
});

describe('Jokers', () => {
  it('turn four of a kind into five', () => {
    expect(title([11], [11], [11], [11], 'joker')).toBe('Five Jacks');
  });

  it('fill the gap in a royal flush and show what they stood for', () => {
    const hand = bestHand(week([10, 'clubs'], [11, 'clubs'], [12, 'clubs'], 'joker', [14, 'clubs']));
    expect(hand?.kind).toBe('royal-flush');
    const joker = hand?.cards.find((c) => c.joker);
    expect(joker).toMatchObject({ rank: 13, suit: 'clubs' });
  });

  it('pair with your best card', () => {
    expect(title([9], 'joker')).toBe('Pair of Nines');
    expect(title('joker')).toBe('Ace high');
  });

  it('only show in the hand when they are needed', () => {
    const hand = bestHand(week([13], [13], [13], [13], [2], 'joker'));
    expect(hand?.kind).toBe('five-of-a-kind');
    expect(hand?.cards.filter((c) => c.joker)).toHaveLength(1);
    const straight = bestHand(week([6], [7], [8], [9], [10], 'joker'));
    expect(straight?.kind).toBe('straight');
    expect(straight?.ranks).toEqual([11]);
  });

  it('make the best hand they can, not just any hand', () => {
    const hands: HandKind[] = ['pair', 'three-of-a-kind', 'four-of-a-kind', 'full-house', 'straight', 'flush'];
    expect(hands).toContain(kind([4], [4], [9], [9], 'joker'));
    expect(kind([4], [4], [9], [9], 'joker')).toBe('full-house');
  });
});
