import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { contrast, faintestAlpha, luminance, mix, over, parseColor, withAlpha } from './color';
import { CARD_COLORS, cardColors, cardFace, chip, edgeBorder, hasEdge, INK, on, suitColors, tables, themeOn, themes, type Theme } from './tokens';

const ALL_THEMES: [string, Theme][] = [['light', themes.light], ['dark', themes.dark], ...Object.entries(tables)];
const DARK_THEMES = ALL_THEMES.filter(([, t]) => t.scheme === 'dark');
const round = (n: number) => Math.round(n * 100) / 100;

describe('colour maths', () => {
  it('measures the WCAG extremes', () => {
    expect(round(contrast('#000000', '#FFFFFF'))).toBe(21);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(luminance('#FFFFFF')).toBeCloseTo(1);
  });

  it('reads short hex, long hex, alpha hex and rgba alike', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#17121F80').a).toBeCloseTo(0.5, 2);
    expect(parseColor('rgba(23, 18, 31, 0.5)')).toEqual({ r: 23, g: 18, b: 31, a: 0.5 });
    expect(parseColor('transparent').a).toBe(0);
  });

  it('lays a see-through colour over an opaque one', () => {
    expect(over('rgba(0, 0, 0, 0.5)', '#FFFFFF')).toBe('#808080');
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(withAlpha('#17121F', 0.5)).toBe('rgba(23, 18, 31, 0.5)');
  });

  it('finds the faintest opacity that still reaches a ratio', () => {
    const a = faintestAlpha(INK, '#FFFFFF', 4.5);
    expect(contrast(withAlpha(INK, a), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(withAlpha(INK, a - 0.02), '#FFFFFF')).toBeLessThan(4.5);
  });
});

describe('habit card colours', () => {
  it.each(CARD_COLORS)('%s: its text reaches 4.5:1 on the card', (c) => {
    expect(contrast(cardColors[c].ink, cardColors[c].bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CARD_COLORS)('%s: the quiet Floor and Ceiling labels reach 4.5:1 on their tile', (c) => {
    // HabitCard's tile is ink at 10% over the card, and its labels take the quieter ink measured on the tile.
    const tile = over(withAlpha(INK, 0.1), cardColors[c].bg);
    expect(contrast(over(on(tile).secondary, tile), tile)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CARD_COLORS)('%s: its Floor-day soft colour takes ink at 4.5:1', (c) => {
    expect(contrast(INK, cardColors[c].soft)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CARD_COLORS)('%s: onDark reaches 3:1 on every dark surface and takes an ink arrow', (c) => {
    const { onDark } = cardColors[c];
    for (const [, t] of DARK_THEMES) {
      expect(contrast(onDark, t.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(onDark, t.bgRaised)).toBeGreaterThanOrEqual(3);
      expect(contrast(onDark, t.raised)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(INK, onDark)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CARD_COLORS)('%s: a Ceiling cell in onDark is stronger than a Floor cell on the dark table', (c) => {
    const floor = over(withAlpha(cardColors[c].bg, 0.45), themes.dark.bg);
    expect(contrast(cardColors[c].onDark, themes.dark.bg)).toBeGreaterThan(contrast(floor, themes.dark.bg));
  });

  it.each(CARD_COLORS)('%s: onDark reads as a large headline on the Comeback card in light mode too', (c) => {
    expect(contrast(cardColors[c].onDark, themes.light.raised)).toBeGreaterThanOrEqual(3);
  });
});

describe('playing cards and chips', () => {
  it.each(Object.keys(suitColors) as (keyof typeof suitColors)[])('%s: the glyph reaches 4.5:1 on a cream face', (s) => {
    expect(contrast(suitColors[s].glyph, cardFace.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.keys(suitColors) as (keyof typeof suitColors)[])('%s: the bright colour reads as text on every dark table and its panels', (s) => {
    for (const [, t] of DARK_THEMES) {
      expect(contrast(suitColors[s].bright, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(suitColors[s].bright, t.bgRaised)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('cream faces carry ink and the saved face carries its own ink', () => {
    expect(contrast(cardFace.ink, cardFace.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(cardFace.savedInk, cardFace.saved)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(cardFace.faint, cardFace.bg)).toBeGreaterThanOrEqual(3);
  });

  it('chip text reaches 4.5:1 on gold', () => {
    expect(contrast(chip.ink, chip.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(ALL_THEMES)('the %s table', (_name, t) => {
  it('text and secondary text reach 4.5:1 on the table, its panels and its surfaces', () => {
    for (const bg of [t.bg, t.bgRaised, t.surface]) {
      expect(contrast(t.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('faint text reaches 3:1 on the table and its panels', () => {
    expect(contrast(t.textFaint, t.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.textFaint, t.bgRaised)).toBeGreaterThanOrEqual(3);
  });

  it('dashed outlines of missed days reach 3:1 against the table', () => {
    expect(contrast(t.dashed, t.bg)).toBeGreaterThanOrEqual(3);
  });

  it('text on a raised surface reaches 4.5:1', () => {
    expect(contrast(t.onRaised, t.raised)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onRaisedSecondary, t.raised)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onCardBack, t.cardBack)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('the tab bar pill (text colour) reads against the table, with table-coloured words on it', () => {
    expect(contrast(t.bg, t.text)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(DARK_THEMES)('raised surfaces on the %s table', (_name, t) => {
  it('sit lighter than the table, never darker', () => {
    expect(luminance(t.raised)).toBeGreaterThan(luminance(t.bg));
    expect(t.cardBack).toBe(t.raised);
  });

  it('always wear a visible border', () => {
    expect(parseColor(t.edge).a).toBeGreaterThan(0);
    // The border, laid over the raised surface, is lighter than the surface itself.
    expect(luminance(over(t.edge, t.raised))).toBeGreaterThan(luminance(t.raised));
  });
});

/**
 * Screens that fade raised-surface text with opacity (`color={t.onCardBack} style={{ opacity: 0.6 }}`),
 * as "line: opacity". On the green felt a raised surface leaves little room, so a fade that reads on
 * the kitchen table can drop under 4.5:1 there.
 */
function fadedOnRaised(text: string): { line: number; alpha: number }[] {
  return text.split('\n').flatMap((src, i) => {
    const m = /color=\{t\.(?:onCardBack|onRaised)\}.*?opacity:\s*(\d*\.?\d+)/.exec(src);
    return m ? [{ line: i + 1, alpha: parseFloat(m[1]) }] : [];
  });
}

describe('raised-surface text in the screens', () => {
  const SRC = decodeURIComponent(new URL('..', import.meta.url).pathname);
  const files = ts.sys.readDirectory(SRC, ['.tsx']);

  it('finds a faded label and ignores the quieter token', () => {
    const text = [
      '<Label color={t.onCardBack} style={{ opacity: 0.6 }}>Your north star</Label>',
      '<Body color={t.onRaisedSecondary}>Tap to edit</Body>',
      '<Body color={t.onRaised} style={{ flexShrink: 1, opacity: .85 }}>Try this</Body>',
    ].join('\n');
    expect(fadedOnRaised(text)).toEqual([
      { line: 1, alpha: 0.6 },
      { line: 3, alpha: 0.85 },
    ]);
  });

  it('never fades it below 4.5:1 on any table: use t.onRaisedSecondary for quieter text', () => {
    expect(files.length).toBeGreaterThan(10);
    const tooFaint = files.flatMap((file) =>
      fadedOnRaised(ts.sys.readFile(file) ?? '').flatMap(({ line, alpha }) =>
        ALL_THEMES.filter(([, t]) => contrast(withAlpha(t.onRaised, alpha), t.raised) < 4.5).map(([name]) => `${file.slice(SRC.length)}:${line} at ${alpha} on ${name}`),
      ),
    );
    expect(tooFaint).toEqual([]);
  });
});

describe('edges', () => {
  it('gives the see-through edge of the light table no border, and every dark table a 1px one', () => {
    expect(hasEdge(themes.light)).toBe(false);
    expect(edgeBorder(themes.light)).toEqual({ borderWidth: 0, borderColor: themes.light.edge });
    for (const [, t] of DARK_THEMES) expect(edgeBorder(t)).toEqual({ borderWidth: 1, borderColor: t.edge });
    expect(hasEdge({ edge: 'transparent' })).toBe(false);
    expect(hasEdge({ edge: '#17121F00' })).toBe(false);
  });
});

describe('on(colour)', () => {
  const swatches = [
    ...CARD_COLORS.flatMap((c) => [cardColors[c].bg, cardColors[c].soft, cardColors[c].onDark]),
    ...Object.values(suitColors).flatMap((s) => [s.glyph, s.bright]),
    ...ALL_THEMES.map(([, t]) => t.bg),
    chip.bg,
    cardFace.bg,
  ];
  // A coarse sweep of the whole colour cube, including the middle greys where white and ink both struggle.
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) swatches.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
  swatches.push('#757575', '#767676', '#777777', '#7A7A7A', '#808080');

  it.each(swatches)('keeps chrome readable on %s', (bg) => {
    const c = on(bg);
    expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.secondary, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.faint, bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.dashed, bg)).toBeGreaterThanOrEqual(3);
  });

  it('picks the card colour’s own ink for every habit colour', () => {
    for (const c of CARD_COLORS) expect(on(cardColors[c].bg).text).toBe(cardColors[c].ink);
  });

  it('builds a whole theme on a card colour', () => {
    const t = themeOn(cardColors.tomato.bg, themes.light);
    expect(t.bg).toBe(cardColors.tomato.bg);
    expect(t.scheme).toBe('dark');
    expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
