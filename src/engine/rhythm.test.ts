import { describe, expect, it } from 'vitest';

import { HAND_LADDER, type HandKind } from './poker';
import { handRhythm } from './rhythm';

const KINDS: readonly HandKind[] = [...HAND_LADDER, 'flush'];

describe('the Showdown rhythm', () => {
  it('groups the beats the way the hand is made', () => {
    const count = (kind: HandKind) => handRhythm(kind).length;
    expect(count('high-card')).toBe(1);
    expect(count('pair')).toBe(2);
    expect(count('two-pair')).toBe(4);
    expect(count('three-of-a-kind')).toBe(3);
    expect(count('straight')).toBe(5);
    expect(count('full-house')).toBe(5);
    expect(count('four-of-a-kind')).toBe(4);
    expect(count('straight-flush')).toBe(6);
    expect(count('royal-flush')).toBe(7);
    expect(count('five-of-a-kind')).toBe(6);
    expect(handRhythm('full-house').map((b) => b.at)).toEqual([0, 90, 180, 440, 530]);
  });

  it('only moves forward, never closer than 70 ms, and ends within 1300 ms', () => {
    for (const kind of KINDS) {
      const beats = handRhythm(kind);
      expect(beats.length).toBeGreaterThan(0);
      expect(beats[0].at).toBe(0);
      for (let i = 1; i < beats.length; i++) expect(beats[i].at - beats[i - 1].at).toBeGreaterThanOrEqual(70);
      expect(beats[beats.length - 1].at).toBeLessThanOrEqual(1300);
    }
  });

  it('lifts each played card once, in order, and nothing alone on a closing beat', () => {
    for (const kind of KINDS) {
      const cards = handRhythm(kind)
        .map((b) => b.card)
        .filter((c) => c >= 0);
      expect(cards).toEqual(cards.map((_, i) => i));
      expect(cards.length).toBeLessThanOrEqual(5);
    }
    expect(handRhythm('straight-flush').at(-1)).toMatchObject({ weight: 'success', card: -1 });
  });

  it('gives every kind of hand its own pattern', () => {
    const patterns = KINDS.map((kind) => JSON.stringify(handRhythm(kind).map((b) => [b.at, b.weight])));
    expect(new Set(patterns).size).toBe(KINDS.length);
  });
});
