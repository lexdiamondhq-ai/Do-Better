import { describe, expect, it, vi } from 'vitest';

import type { Rank } from '@/engine/cards';
import type { DayCard } from '@/engine/deal';
import type { PlayedCard } from '@/engine/poker';

// Only the card's words are tested here, so the native views are stand-ins.
vi.mock('react-native', () => ({ Text: () => null, View: () => null, useColorScheme: () => 'light' }));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, G: () => null, Path: () => null, Rect: () => null }));

const { faceLabel, faceOfDay, faceOfPlayed } = await import('./PlayingCard');

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
