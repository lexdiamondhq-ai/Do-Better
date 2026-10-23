import { describe, expect, it, vi } from 'vitest';

import { WEAR_MAX, wearOf } from '@/engine/wear';
import { contrast, luminance, over, withAlpha } from '@/theme/color';
import { CARD_COLORS, cardColors, INK, on, tables, themes } from '@/theme/tokens';

// Only the wear's colours and layers are tested here, so the native views and the app's data are stand-ins.
vi.mock('react-native', () => ({ StyleSheet: { absoluteFill: {} }, View: () => null, useColorScheme: () => 'light' }));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Defs: () => null, Ellipse: () => null, G: () => null, LinearGradient: () => null, Path: () => null, RadialGradient: () => null, Rect: () => null, Stop: () => null }));
vi.mock('@/lib/deck', () => ({ useDeck: () => null, useGrips: () => ({}) }));

const { cornerPoint, drawnCompact, FOIL_ALPHA, scuffSpan, wearInks, wearLift, wearShown } = await import('./CardWear');
const { densityFor } = await import('@/engine/today');

/** What sits on a habit card's face: its ink, its quieter ink, and the tinted tile under the Floor and Ceiling rows. */
const face = (c: (typeof CARD_COLORS)[number]) => ({ bg: cardColors[c].bg, ink: cardColors[c].ink, quiet: on(cardColors[c].bg).secondary, tile: withAlpha(INK, 0.1) });

describe('the wear on a card face', () => {
  it('never draws a layer above 0.25, foil included', () => {
    for (let k = 0; k <= 1000; k += 5) {
      const w = wearOf(k);
      for (const v of [w.corners, w.crease, w.thumb, w.gilt]) expect(v).toBeLessThanOrEqual(WEAR_MAX);
    }
    expect(FOIL_ALPHA).toBeLessThanOrEqual(WEAR_MAX);
  });

  it.each(CARD_COLORS)('%s: the crease, thumb mark and foil only ever lean away from its ink', (c) => {
    const { bg, ink } = face(c);
    const inks = wearInks(c);
    for (const tint of [inks.under, ...inks.foil]) {
      const worn = over(withAlpha(tint, WEAR_MAX), bg);
      // Darker under white ink, lighter under ink: the gap between the words and the card only grows.
      expect(contrast(ink, worn)).toBeGreaterThanOrEqual(contrast(ink, bg) - 0.001);
      if (ink === INK) expect(luminance(worn)).toBeGreaterThanOrEqual(luminance(bg) - 1e-9);
      else expect(luminance(worn)).toBeLessThanOrEqual(luminance(bg) + 1e-9);
    }
  });

  it.each(CARD_COLORS)('%s: every word on the card still reaches 4.5:1 over the deepest wear', (c) => {
    const { bg, ink, quiet } = face(c);
    const inks = wearInks(c);
    for (const tint of [inks.under, ...inks.foil]) {
      // The thumb's ridges cross its oval, so the deepest spot is two layers deep.
      const once = over(withAlpha(tint, WEAR_MAX), bg);
      const twice = over(withAlpha(tint, WEAR_MAX), once);
      for (const under of [bg, once, twice]) {
        expect(contrast(ink, under)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(quiet, under)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(CARD_COLORS)('%s: words on the Floor and Ceiling tiles read no worse over wear than without it', (c) => {
    const { bg, ink, quiet, tile } = face(c);
    const inks = wearInks(c);
    for (const tint of [inks.under, ...inks.foil]) {
      const twice = over(withAlpha(tint, WEAR_MAX), over(withAlpha(tint, WEAR_MAX), bg));
      for (const text of [ink, quiet]) expect(contrast(text, over(tile, twice))).toBeGreaterThanOrEqual(contrast(text, over(tile, bg)) - 0.001);
    }
  });

  it.each(CARD_COLORS)('%s: corners and gilt show on the card', (c) => {
    const { bg } = face(c);
    const inks = wearInks(c);
    expect(contrast(inks.edge, bg)).toBeGreaterThanOrEqual(4.5);
    // At least one stop of the gilt stands clear of the card, so the edge reads as a rule, not a smudge.
    expect(Math.max(...inks.gilt.map((g) => contrast(g, bg)))).toBeGreaterThanOrEqual(1.6);
  });
});

describe('the wear on the dark side', () => {
  const sides = [themes.light, themes.dark, ...Object.values(tables)];

  it('shows scuffs and gilt only', () => {
    const shown = wearShown(wearOf(400), { dark: true });
    expect(shown).toEqual({ corners: true, crease: false, thumb: false, gilt: true, foil: false });
  });

  it('rubs its corners toward the dark side’s own light text, and gilds in bright gold', () => {
    for (const t of sides) {
      const inks = wearInks('dark', t.onRaised);
      expect(inks.edge).toBe(t.onRaised);
      expect(Math.max(...inks.gilt.map((g) => contrast(g, t.raised)))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('wear deeper in the deck', () => {
  it('draws everything on the front card and the one behind it', () => {
    for (const depth of [0, 1]) expect(wearShown(wearOf(400), { depth })).toEqual({ corners: true, crease: true, thumb: true, gilt: true, foil: true });
  });

  it('draws only the corners from the third card back', () => {
    for (const depth of [2, 3, 7]) expect(wearShown(wearOf(400), { depth })).toEqual({ corners: true, crease: false, thumb: false, gilt: false, foil: false });
  });

  it('draws nothing at all on a fresh card', () => {
    expect(wearShown(wearOf(5))).toEqual({ corners: false, crease: false, thumb: false, gilt: false, foil: false });
  });

  it('draws soft corners only at 29 kept days, and the crease and thumb from 30', () => {
    expect(wearShown(wearOf(29))).toEqual({ corners: true, crease: false, thumb: false, gilt: false, foil: false });
    expect(wearShown(wearOf(30))).toMatchObject({ corners: true, crease: true, thumb: true, gilt: false });
  });
});

describe('the Heirloom foil’s place', () => {
  it('follows the card’s own layout when the card says it', () => {
    expect(drawnCompact(420, true)).toBe(true);
    expect(drawnCompact(300, false)).toBe(false);
  });

  it('otherwise picks the layout Today deals the card in, even half a point either side of the line', () => {
    for (const h of [300, 359.4, 359.6, 360, 360.4, 420, 600]) {
      // Today rounds the deck's height before it decides, so the wear rounds the card's height the same way.
      const today = densityFor({ cardHeight: Math.round(h), windowHeight: 844, fontScale: 1, screenReader: false }).mode === 'compact';
      expect(drawnCompact(h)).toBe(today);
    }
  });
});

describe('wear on a card drawn small', () => {
  it('draws its lines wider by the same factor the card shrank, up to three times, and never thinner', () => {
    expect(wearLift(1)).toBe(1);
    expect(wearLift(1.5)).toBe(1);
    expect(wearLift(0.5)).toBe(2);
    expect(wearLift(104 / 300)).toBeCloseTo(300 / 104, 5);
    expect(wearLift(0.1)).toBe(3);
    expect(wearLift(0)).toBe(1);
  });
});

describe('soft corners', () => {
  const size = { w: 300, h: 420 };

  it('rub out from each corner’s own point', () => {
    expect(cornerPoint('tl', size)).toEqual({ x: 0, y: 0 });
    expect(cornerPoint('tr', size)).toEqual({ x: 300, y: 0 });
    expect(cornerPoint('br', size)).toEqual({ x: 300, y: 420 });
    expect(cornerPoint('bl', size)).toEqual({ x: 0, y: 420 });
  });

  it('fade out within the corner’s curve and its reach, never running round the card', () => {
    for (const reach of [0.25, 0.6, 0.9]) {
      const span = scuffSpan({ reach }, size, 34);
      expect(span).toBeCloseTo(34 * (1 + reach), 5);
      // Two corners on the shorter edge, both at their longest, still leave its middle bare.
      expect(span * 2).toBeLessThan(size.w * 0.45);
    }
  });
});
