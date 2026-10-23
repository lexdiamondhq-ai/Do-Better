import { describe, expect, it } from 'vitest';

import { HAND_LADDER, type HandKind } from './poker';
import { CHIPS_AT_MS, CHIPS_GAP_MS, chipsAfter, handRhythm } from './rhythm';

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
    const RUNS: HandKind[] = ['straight', 'straight-flush', 'royal-flush', 'flush'];
    for (const kind of KINDS) {
      const cards = handRhythm(kind)
        .map((b) => b.card)
        .filter((c) => c >= 0);
      // Groups lift in hand order. A run climbs from its lowest card, the last of `hand.cards`, which the
      // fan shows on the left, so the lift travels left to right.
      const order = cards.map((_, i) => i);
      expect(cards).toEqual(RUNS.includes(kind) ? order.reverse() : order);
      expect(cards.length).toBeLessThanOrEqual(5);
    }
    expect(handRhythm('straight-flush').at(-1)).toMatchObject({ weight: 'success', card: -1 });
  });

  it('runs a straight up its five cards from soft to rigid, 70 ms apart, and closes the flushes', () => {
    const run = handRhythm('straight');
    expect(run.map((b) => b.at)).toEqual([0, 70, 140, 210, 280]);
    expect(run.map((b) => b.weight)).toEqual(['soft', 'firm', 'firm', 'heavy', 'rigid']);
    expect(handRhythm('straight-flush').slice(5).map((b) => b.weight)).toEqual(['success']);
    expect(handRhythm('royal-flush').slice(5).map((b) => b.weight)).toEqual(['success', 'rigid']);
    expect(handRhythm('royal-flush').slice(5).every((b) => b.card === -1)).toBe(true);
  });

  it('spaces beats in a group 90 ms apart and groups 260 ms apart', () => {
    expect(handRhythm('two-pair').map((b) => b.at)).toEqual([0, 90, 350, 440]);
    expect(handRhythm('three-of-a-kind').map((b) => b.at)).toEqual([0, 90, 180]);
    expect(handRhythm('five-of-a-kind').map((b) => [b.at, b.weight])).toEqual([
      [0, 'heavy'],
      [90, 'heavy'],
      [180, 'heavy'],
      [270, 'heavy'],
      [360, 'heavy'],
      [620, 'success'],
    ]);
    expect(handRhythm('high-card')).toEqual([{ at: 0, weight: 'soft', card: 0 }]);
  });

  it('gives every kind of hand its own pattern', () => {
    const patterns = KINDS.map((kind) => JSON.stringify(handRhythm(kind).map((b) => [b.at, b.weight])));
    expect(new Set(patterns).size).toBe(KINDS.length);
  });
});

describe('when the chips land', () => {
  it('waits for every hand’s last beat and a little gap, so the chips never tap on the hand’s rhythm', () => {
    for (const kind of KINDS) {
      const beats = handRhythm(kind);
      const at = chipsAfter(beats);
      for (const b of beats) expect(at - b.at).toBeGreaterThanOrEqual(CHIPS_GAP_MS);
      expect(at).toBeGreaterThanOrEqual(CHIPS_AT_MS);
    }
  });

  it('lands at the usual moment for a short hand, and later for a full house or a royal flush', () => {
    expect(chipsAfter(handRhythm('pair'))).toBe(CHIPS_AT_MS);
    expect(chipsAfter(handRhythm('straight'))).toBe(CHIPS_AT_MS);
    expect(chipsAfter(handRhythm('full-house'))).toBe(530 + CHIPS_GAP_MS);
    expect(chipsAfter(handRhythm('royal-flush'))).toBe(630 + CHIPS_GAP_MS);
    expect(chipsAfter([])).toBe(CHIPS_AT_MS);
  });
});
