import { describe, expect, it, vi } from 'vitest';

import type { DayCard, Slot } from '@/engine/deal';
import type { Week } from '@/engine/game';
import type { Hand, PlayedCard } from '@/engine/poker';

// Only the strip's words are tested here, so the native views are stand-ins.
vi.mock('react-native', () => ({ Pressable: () => null, Text: () => null, View: () => null, useColorScheme: () => 'light' }));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Defs: () => null, G: () => null, LinearGradient: () => null, Path: () => null, RadialGradient: () => null, Rect: () => null, Stop: () => null }));
vi.mock('react-native-reanimated', () => ({
  default: { Text: () => null, View: () => null },
  Easing: { out: () => () => 0, cubic: () => 0 },
  ReduceMotion: { System: 'system' },
  useAnimatedStyle: () => ({}),
  useSharedValue: () => ({ set: () => {}, get: () => 0 }),
  withDelay: () => 0,
  withRepeat: () => 0,
  withSequence: () => 0,
  withSpring: () => 0,
  withTiming: () => 0,
}));

const { describeWeek, savedLine } = await import('./WeekStrip');

const card = (day: string, rank: number, suits: string[], extra: Record<string, unknown> = {}) =>
  ({ kind: 'card', day, rank, suits, ceilingSuits: [], tier: 'showed-up', lo: 2, rescued: false, ...extra }) as unknown as DayCard;
const joker = (day: string) => ({ kind: 'joker', day, suits: ['hearts'], ceilingSuits: [], tier: 'showed-up', lo: 2 }) as unknown as DayCard;
const slot = (day: string, c: DayCard | null, extra: Partial<Slot> = {}): Slot => ({ day, state: c ? 'dealt' : 'blank', card: c, isToday: false, ...extra });
const played = (day: string, rank: number, suit: string | null, isJoker = false): PlayedCard => ({ day, rank, suit, joker: isJoker }) as PlayedCard;

function week(slots: Slot[], cards: PlayedCard[]): Week {
  const hand = { kind: 'three-of-a-kind', title: 'Three Eights', cards, score: 400 } as unknown as Hand;
  return { start: '2026-10-12', slots, hand } as unknown as Week;
}

describe('the week strip read aloud', () => {
  it('says a Joker the hand uses is in your hand, and what it plays as', () => {
    const w = week(
      [slot('2026-10-12', card('2026-10-12', 8, ['spades'])), slot('2026-10-13', card('2026-10-13', 4, ['clubs'])), slot('2026-10-14', card('2026-10-14', 8, ['spades'])), slot('2026-10-15', joker('2026-10-15')), slot('2026-10-16', null, { state: 'open', isToday: true })],
      [played('2026-10-12', 8, 'spades'), played('2026-10-14', 8, 'spades'), played('2026-10-15', 8, null, true), played('2026-10-13', 4, 'clubs')],
    );
    const text = describeWeek(w, null);
    expect(text).toContain('Thursday, Joker, playing as an Eight, in your hand');
    expect(text).toContain('Monday, Eight of Spades, in your hand');
    expect(text).toContain('Today, not dealt yet');
  });

  it('says a saved card the hand uses is in your hand too, and leaves out cards it does not use', () => {
    const w = week([slot('2026-10-12', card('2026-10-12', 7, [], { rescued: true })), slot('2026-10-13', card('2026-10-13', 2, ['clubs']))], [played('2026-10-12', 7, null)]);
    const text = describeWeek(w, null);
    expect(text).toContain('Monday, Seven, saved, in your hand');
    expect(text).toContain('Tuesday, Two of Clubs.');
    expect(text).not.toContain('Two of Clubs, in your hand');
  });

  it('names yesterday’s saved card when the strip shows it face up, and never a suit', () => {
    const jack = card('2026-10-15', 11, [], { rescued: true });
    const w = week(
      [slot('2026-10-12', card('2026-10-12', 8, ['spades'])), slot('2026-10-13', null, { state: 'blank' }), slot('2026-10-14', null, { state: 'blank' }), slot('2026-10-15', null, { state: 'blank' }), slot('2026-10-16', null, { state: 'open', isToday: true }), slot('2026-10-17', null, { state: 'future' }), slot('2026-10-18', null, { state: 'future' })],
      [played('2026-10-12', 8, 'spades')],
    );
    const text = describeWeek(w, '2026-10-15', jack);
    expect(text).toContain('Yesterday, a Jack, waits to be saved.');
    expect(text).not.toContain('Thursday');
    // Without the saved card face up, the place is still described as one that can be saved.
    expect(describeWeek(w, '2026-10-15')).toContain('Thursday, no card yet, and it can still be saved today');
    expect(savedLine(jack)).toBe('Yesterday, a Jack, waits to be saved. Keep any habit today and it’s yours.');
    expect(savedLine(card('2026-10-15', 8, [], { rescued: true }))).toMatch(/^Yesterday, an Eight,/);
  });

  it('counts the days to come as cards still to be dealt', () => {
    const w = week([slot('2026-10-12', null, { state: 'open', isToday: true }), ...['2026-10-13', '2026-10-14'].map((d) => slot(d, null, { state: 'future' }))], []);
    expect(describeWeek(w, null)).toContain('2 cards to come');
    const one = week([slot('2026-10-17', null, { state: 'open', isToday: true }), slot('2026-10-18', null, { state: 'future' })], []);
    expect(describeWeek(one, null)).toContain('1 card to come');
  });
});
