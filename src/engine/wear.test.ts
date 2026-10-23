import { describe, expect, it } from 'vitest';

import { blendGrip, CORNER_ORDER, creasePath, defaultGrip, nextWear, ridgePath, RIDGES, scuffPath, thumbOval, WEAR_AT, WEAR_MAX, wearArt, wearLine, wearOf, type Wear } from './wear';

const LAYERS = ['corners', 'crease', 'thumb', 'gilt'] as const;

describe('wear', () => {
  it('arrives at 10, 30, 100 and 365 kept days', () => {
    expect(WEAR_AT).toEqual({ new: 0, worn: 10, played: 30, gilt: 100, heirloom: 365 });
    expect([0, 9, 10, 29, 30, 99, 100, 364, 365, 2000].map((k) => wearOf(k).stage)).toEqual(['new', 'new', 'worn', 'worn', 'played', 'played', 'gilt', 'gilt', 'heirloom', 'heirloom']);
  });

  it('skips no stage as kept days rise one at a time', () => {
    const seen: string[] = [];
    for (let k = 0; k <= 400; k++) {
      const s = wearOf(k).stage;
      if (seen[seen.length - 1] !== s) seen.push(s);
    }
    expect(seen).toEqual(['new', 'worn', 'played', 'gilt', 'heirloom']);
  });

  it('brings each layer in at its own stage, exactly on the day', () => {
    expect(wearOf(9)).toEqual({ stage: 'new', corners: 0, crease: 0, thumb: 0, gilt: 0, foil: false });
    expect(wearOf(10).corners).toBeGreaterThan(0);
    expect(wearOf(29).crease).toBe(0);
    expect(wearOf(29).thumb).toBe(0);
    expect(wearOf(30).crease).toBeGreaterThan(0);
    expect(wearOf(30).thumb).toBeCloseTo(0.06);
    expect(wearOf(99).gilt).toBe(0);
    expect(wearOf(100).gilt).toBeGreaterThan(0);
    expect(wearOf(100).thumb).toBeCloseTo(0.22);
    expect(wearOf(364).foil).toBe(false);
    expect(wearOf(365).foil).toBe(true);
  });

  it('never takes a layer back as kept days rise', () => {
    let before: Wear = wearOf(0);
    for (let k = 1; k <= 800; k++) {
      const w = wearOf(k);
      for (const layer of LAYERS) expect(w[layer]).toBeGreaterThanOrEqual(before[layer]);
      if (before.foil) expect(w.foil).toBe(true);
      before = w;
    }
  });

  it('keeps every layer faint, 0.25 at most', () => {
    for (let k = 0; k <= 1200; k += 7) {
      const w = wearOf(k);
      for (const layer of LAYERS) {
        expect(w[layer]).toBeGreaterThanOrEqual(0);
        expect(w[layer]).toBeLessThanOrEqual(WEAR_MAX);
      }
    }
    expect(WEAR_MAX).toBe(0.25);
  });

  it('treats nonsense kept days as a fresh card', () => {
    expect(wearOf(-4).stage).toBe('new');
    expect(wearOf(Number.NaN)).toEqual(wearOf(0));
  });

  it('says what comes next, and nothing after an Heirloom', () => {
    expect(nextWear(0)).toEqual({ stage: 'worn', name: 'Worn in', at: 10, left: 10 });
    expect(nextWear(10)).toEqual({ stage: 'played', name: 'Well played', at: 30, left: 20 });
    expect(nextWear(29)).toEqual({ stage: 'played', name: 'Well played', at: 30, left: 1 });
    expect(nextWear(30)).toMatchObject({ stage: 'gilt', name: 'Gilt edge', at: 100 });
    expect(nextWear(364)).toMatchObject({ stage: 'heirloom', left: 1 });
    expect(nextWear(365)).toBeNull();
  });

  it('words each stage on the card’s page', () => {
    expect(wearLine(1).line).toBe('Fresh from the deck · 1 kept day. It wears in at 10.');
    expect(wearLine(4)).toEqual({ title: 'Fresh from the deck', line: 'Fresh from the deck · 4 kept days. It wears in at 10.' });
    expect(wearLine(12).line).toBe('Worn in · 12 kept days. Well played at 30.');
    expect(wearLine(59)).toEqual({ title: 'Well played', line: 'Well played · 59 kept days. Broken in where your thumb holds it.' });
    expect(wearLine(120).line).toBe('Gilt edge · 120 kept days. An heirloom at a year.');
    expect(wearLine(400).line).toBe('Heirloom · 400 kept days. A year of kept days and more.');
  });

  it('puts a card’s thumb in the lower right before any swipe, the same place every time', () => {
    for (const id of ['demo-read', 'demo-walk', 'demo-deep-work', 'demo-reach-out', 'a', 'b', 'c']) {
      const g = defaultGrip(id);
      expect(g).toEqual(defaultGrip(id));
      expect(g.x).toBeGreaterThanOrEqual(0.6);
      expect(g.x).toBeLessThanOrEqual(0.85);
      expect(g.y).toBeGreaterThanOrEqual(0.6);
      expect(g.y).toBeLessThanOrEqual(0.85);
    }
    expect(defaultGrip('demo-read')).not.toEqual(defaultGrip('demo-walk'));
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
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeLessThanOrEqual(1);
    expect(blendGrip({ x: 0.5, y: 0.5, n: 3 }, { x: 1, y: 1 }, 3).n).toBe(3);
  });

  it('settles on where the thumb really holds the card', () => {
    let g = blendGrip(null, defaultGrip('demo-read'));
    for (let i = 0; i < 60; i++) g = blendGrip(g, { x: 0.25, y: 0.75 });
    expect(g.x).toBeCloseTo(0.25, 1);
    expect(g.y).toBeCloseTo(0.75, 1);
  });
});

describe('the shapes of wear', () => {
  const grip = { x: 0.3, y: 0.7 };

  it('draws nothing on a fresh card', () => {
    expect(wearArt('demo-read', wearOf(3), grip)).toEqual({ scuffs: [], crease: null, thumb: null, gilt: false, foil: false });
  });

  it('softens all four corners from Worn in, with no crease or thumb yet', () => {
    const art = wearArt('demo-read', wearOf(12), grip);
    expect(art.scuffs.map((s) => s.corner)).toEqual(CORNER_ORDER);
    expect(art.crease).toBeNull();
    expect(art.thumb).toBeNull();
    for (const s of art.scuffs) {
      expect(s.dash).toHaveLength(6);
      for (const d of s.dash) expect(d).toBeGreaterThan(0);
      expect(s.reach).toBeGreaterThan(0);
      expect(s.reach).toBeLessThanOrEqual(0.9);
      expect(s.inset).toBeGreaterThanOrEqual(1);
      expect(s.inset).toBeLessThanOrEqual(2);
    }
  });

  it('wears each card its own way, and the same way every time', () => {
    const a = wearArt('demo-read', wearOf(59), grip);
    expect(wearArt('demo-read', wearOf(59), grip)).toEqual(a);
    const b = wearArt('demo-walk', wearOf(59), grip);
    expect(b.scuffs[0].dash).not.toEqual(a.scuffs[0].dash);
    expect(b.crease).not.toEqual(a.crease);
    expect(b.thumb?.angle === a.thumb?.angle && b.thumb?.ridges[0].start === a.thumb?.ridges[0].start).toBe(false);
  });

  it('keeps the same shapes as the card wears further, so wear only adds', () => {
    const at30 = wearArt('demo-read', wearOf(30), grip);
    const at400 = wearArt('demo-read', wearOf(400), grip);
    expect(at400.scuffs).toEqual(at30.scuffs);
    expect(at400.crease).toEqual(at30.crease);
    expect(at400.thumb).toEqual(at30.thumb);
    expect(at400.gilt && at400.foil).toBe(true);
    expect(at30.gilt || at30.foil).toBe(false);
  });

  it('creases across the middle of the card, edge to edge', () => {
    for (const id of ['demo-read', 'demo-walk', 'x', 'y', 'z']) {
      const c = wearArt(id, wearOf(40), grip).crease!;
      expect(c.from.x).toBeLessThan(0);
      expect(c.to.x).toBeGreaterThan(1);
      for (const y of [c.from.y, c.to.y, c.bend.y]) {
        expect(y).toBeGreaterThanOrEqual(0.25);
        expect(y).toBeLessThanOrEqual(0.75);
      }
    }
  });

  it('puts the thumb mark at the grip, tipped at the card’s own angle, with five ridges', () => {
    const t = wearArt('demo-read', wearOf(59), grip).thumb!;
    expect(t.at).toEqual(grip);
    expect(t.angle).toBeGreaterThanOrEqual(-55);
    expect(t.angle).toBeLessThanOrEqual(-10);
    expect(t.ridges).toHaveLength(RIDGES);
    for (const r of t.ridges) {
      expect(r.sweep).toBeGreaterThanOrEqual(150);
      expect(r.sweep).toBeLessThanOrEqual(290);
    }
    expect(wearArt('demo-read', wearOf(59), { x: 3, y: -1 }).thumb!.at).toEqual({ x: 1, y: 0 });
  });

  it('draws its paths inside the card', () => {
    const size = { w: 340, h: 480 };
    const art = wearArt('demo-read', wearOf(120), grip);
    const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    for (const s of art.scuffs) {
      const d = scuffPath(s, size, 34);
      expect(d.startsWith('M')).toBe(true);
      for (const n of numbers(d)) expect(Math.abs(n)).toBeLessThanOrEqual(480);
    }
    expect(creasePath(art.crease!, size)).toMatch(/^M-?\d+(\.\d)? \d+(\.\d)?Q/);
    const o = thumbOval(art.thumb!, size);
    expect(o.cx).toBeCloseTo(102);
    expect(o.cy).toBeCloseTo(336);
    expect(o.ry).toBeGreaterThan(o.rx);
    for (const r of art.thumb!.ridges) expect(ridgePath(art.thumb!, r, size)).toMatch(/^M[\d.-]+ [\d.-]+A/);
  });

  it('keeps a small card’s corners inside it', () => {
    const d = scuffPath({ corner: 'br', reach: 0.8, inset: 1.5 }, { w: 40, h: 56 }, 34);
    for (const n of (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(56);
    }
  });
});
