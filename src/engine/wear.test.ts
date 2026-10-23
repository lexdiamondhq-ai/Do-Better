import { describe, expect, it } from 'vitest';

import { blendGrip, defaultGrip, nextWear, WEAR_AT, wearLine, wearOf } from './wear';

describe('wear', () => {
  it('arrives at 10, 30, 100 and 365 kept days', () => {
    expect(WEAR_AT).toEqual({ new: 0, worn: 10, played: 30, gilt: 100, heirloom: 365 });
    expect([0, 9, 10, 29, 30, 99, 100, 364, 365, 2000].map((k) => wearOf(k).stage)).toEqual(['new', 'new', 'worn', 'worn', 'played', 'played', 'gilt', 'gilt', 'heirloom', 'heirloom']);
  });

  it('keeps every layer faint', () => {
    for (const kept of [0, 10, 30, 100, 365, 1000]) {
      const w = wearOf(kept);
      for (const layer of [w.corners, w.crease, w.thumb, w.gilt]) expect(layer).toBeLessThanOrEqual(0.25);
    }
  });

  it('says what comes next, and nothing after an Heirloom', () => {
    expect(nextWear(0)).toEqual({ stage: 'worn', name: 'Worn in', at: 10, left: 10 });
    expect(nextWear(29)).toEqual({ stage: 'played', name: 'Well played', at: 30, left: 1 });
    expect(nextWear(364)).toMatchObject({ stage: 'heirloom', left: 1 });
    expect(nextWear(365)).toBeNull();
  });

  it('words each stage on the card’s page', () => {
    expect(wearLine(1).line).toBe('Fresh from the deck · 1 kept day. It wears in at 10.');
    expect(wearLine(12).line).toBe('Worn in · 12 kept days. Well played at 30.');
    expect(wearLine(59)).toEqual({ title: 'Well played', line: 'Well played · 59 kept days. Broken in where your thumb holds it.' });
    expect(wearLine(120).line).toBe('Gilt edge · 120 kept days. An heirloom at a year.');
    expect(wearLine(400).line).toBe('Heirloom · 400 kept days. A year of kept days and more.');
  });

  it('puts a card’s thumb in the lower right before any swipe, the same place every time', () => {
    for (const id of ['demo-read', 'demo-walk', 'a', 'b', 'c']) {
      const g = defaultGrip(id);
      expect(g).toEqual(defaultGrip(id));
      expect(g.x).toBeGreaterThanOrEqual(0.6);
      expect(g.x).toBeLessThanOrEqual(0.85);
      expect(g.y).toBeGreaterThanOrEqual(0.6);
      expect(g.y).toBeLessThanOrEqual(0.85);
    }
  });

  it('averages real swipes inside the card, over 50 at most', () => {
    expect(blendGrip(null, { x: 0.2, y: 0.4 })).toEqual({ x: 0.2, y: 0.4, n: 1 });
    const two = blendGrip({ x: 0.2, y: 0.4, n: 1 }, { x: 0.4, y: 0.8 });
    expect(two.n).toBe(2);
    expect(two.x).toBeCloseTo(0.3);
    expect(two.y).toBeCloseTo(0.6);
    expect(blendGrip(null, { x: -3, y: 7 })).toEqual({ x: 0, y: 1, n: 1 });
    let g = blendGrip(null, { x: 0.5, y: 0.5 });
    for (let i = 0; i < 80; i++) g = blendGrip(g, { x: i % 2 ? 1.4 : -0.4, y: 0.9 });
    expect(g.n).toBe(50);
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x).toBeLessThanOrEqual(1);
    expect(blendGrip({ x: 0.5, y: 0.5, n: 3 }, { x: 1, y: 1 }, 3).n).toBe(3);
  });
});
