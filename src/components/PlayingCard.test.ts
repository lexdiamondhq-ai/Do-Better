import { describe, expect, it, vi } from 'vitest';

import type { Rank } from '@/engine/cards';
import type { DayCard } from '@/engine/deal';
import type { PlayedCard } from '@/engine/poker';

// Only the card's words are tested here, so the native views are stand-ins.
vi.mock('react-native', () => ({ Text: () => null, View: () => null, useColorScheme: () => 'light' }));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, G: () => null, Path: () => null, Rect: () => null }));

const { cardLabel, faceLabel, faceOfDay, faceOfPlayed, stampSpot } = await import('./PlayingCard');

/** A day's card as the engine deals it. Saved days and the river card carry no suit. */
const day = (rank: Rank, suits: DayCard['suits'], extra: Record<string, unknown> = {}) =>
  ({ kind: 'card', day: '2026-10-12', rank, suits, tier: 'showed-up', rescued: false, ...extra }) as unknown as DayCard;

describe('what a screen reader hears for a card', () => {
  it('names the suit it plays in and reads out the others', () => {
    expect(faceLabel(faceOfDay(day(12, ['hearts', 'clubs', 'spades'])))).toBe('Queen of Hearts, also Clubs and Spades');
    expect(faceLabel(faceOfDay(day(12, ['hearts', 'clubs']), 'clubs'))).toBe('Queen of Clubs, also Hearts');
  });

  it('calls a saved day saved, never rescued, and gives it no suit', () => {
    const face = faceOfDay(day(7, [], { rescued: true }));
    expect(face).toMatchObject({ kind: 'card', suit: null });
    expect(faceLabel(face)).toBe('Seven, saved');
  });

  it('names the river card', () => {
    expect(faceLabel(faceOfDay(day(9, [], { river: true })))).toBe('Nine, the river card');
    expect(faceLabel(faceOfPlayed({ day: '2026-10-19', rank: 9, suit: null, joker: false, river: true } as unknown as PlayedCard))).toBe('Nine, the river card');
  });

  it('says what a Joker stands in for, with the right article', () => {
    const joker = (rank: 7 | 8 | 14, suit: 'spades' | null) => faceLabel(faceOfPlayed({ day: '2026-10-14', rank, suit, joker: true } as unknown as PlayedCard));
    expect(joker(7, null)).toBe('Joker, playing as a Seven');
    expect(joker(8, null)).toBe('Joker, playing as an Eight');
    expect(joker(14, null)).toBe('Joker, playing as an Ace');
    expect(joker(14, 'spades')).toBe('Joker, playing as the Ace of Spades');
    expect(faceLabel(faceOfDay({ kind: 'joker', day: '2026-10-14', suits: [] } as unknown as DayCard))).toBe('Joker');
  });
});

describe('a stamped card', () => {
  it('says the day it came from after its name', () => {
    const nine = faceOfDay(day(9, ['clubs']));
    expect(cardLabel(nine, null, 'floor')).toBe('Nine of Clubs, a Floor day');
    expect(cardLabel(nine, 'held', 'ceiling')).toBe('Nine of Clubs, in your hand, a Ceiling day');
    expect(cardLabel(nine, 'called')).toBe('Nine of Clubs, you called it');
    expect(cardLabel(nine)).toBe('Nine of Clubs');
  });

  it('keeps its stamp low on the left, inside what a fan leaves showing, on every size of card', () => {
    for (const size of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
      for (const width of [undefined, 86, 110, 150]) {
        const spot = stampSpot(size, width)!;
        const w = width ?? { xs: 40, sm: 52, md: 74, lg: 128, xl: 190 }[size];
        // A fan of five shows 55% of every card but the last.
        expect(spot.x + spot.r).toBeLessThanOrEqual(w * 0.55);
        expect(spot.x - spot.r).toBeGreaterThan(0);
      }
    }
  });

  it('fits the smallest card’s seal in its bottom corner, below its rank and pip', () => {
    const spot = stampSpot('xs')!;
    // An xs card is 40 by 56 with its rank and pip centred above y = 44.
    expect(spot.y + spot.r).toBeLessThan(56);
    expect(spot.y - spot.r).toBeGreaterThanOrEqual(44);
  });
});
