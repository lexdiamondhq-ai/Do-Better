/**
 * Do Better design tokens: The Deck. Every habit is a card in its own colour, laid on a pale
 * lavender table (a deep plum table in dark mode). Ink is the only text colour on the table.
 * Type is "Soft": Fredoka for names and numbers, Nunito for everything you read.
 *
 * Playing cards have cream faces with suits in four colours, one per part of you. Bigger stacks
 * open new tables, which recolour the whole app.
 *
 * Every pairing here is checked by src/theme/contrast.test.ts: text reaches 4.5:1 on what it sits on,
 * faint text and large shapes 3:1.
 */

import type { Suit } from '@/engine/cards';
import type { TableKey } from '@/engine/game';

import { contrast, faintestAlpha, mix, withAlpha } from './color';

export const INK = '#17121F';
export const WHITE = '#FFFFFF';

/**
 * Habit card colours. `ink` is the text on the card. `onDark` is the same colour lifted so it still
 * reads as that colour on a dark table: Ceiling cells in a habit's grid, the Comeback headline on a
 * dark card. Ink always reads on `onDark`, so an arrow drawn on it is ink.
 */
export const cardColors = {
  tomato: { bg: '#D63E22', ink: WHITE, soft: '#FFC9BC', onDark: '#FF7A5C' },
  pine: { bg: '#17614B', ink: WHITE, soft: '#B5D6CB', onDark: '#3FBF8F' },
  lilac: { bg: '#B7A4F7', ink: INK, soft: '#E3DBFC', onDark: '#B7A4F7' },
  sun: { bg: '#FFC93D', ink: INK, soft: '#FFEBB5', onDark: '#FFC93D' },
  sky: { bg: '#2F5FE0', ink: WHITE, soft: '#C7D6FF', onDark: '#7FA0FF' },
  rose: { bg: '#FF8FB1', ink: INK, soft: '#FFD5E2', onDark: '#FF8FB1' },
} as const;

export type CardColor = keyof typeof cardColors;
export const CARD_COLORS = Object.keys(cardColors) as CardColor[];

export function isCardColor(value: unknown): value is CardColor {
  return typeof value === 'string' && value in cardColors;
}

/**
 * Each suit's colour: the glyph on a cream card face, a brighter one for text on dark tables, and the
 * habit card colour it suggests. Hearts and Diamonds share their exact colour with tomato and sky.
 */
export const suitColors: Record<Suit, { glyph: string; bright: string; habit: CardColor }> = {
  spades: { glyph: '#17614B', bright: '#4CC79A', habit: 'pine' },
  hearts: { glyph: '#D63E22', bright: '#FF8A6E', habit: 'tomato' },
  diamonds: { glyph: '#2F5FE0', bright: '#8AA8FF', habit: 'sky' },
  clubs: { glyph: '#6B4FD6', bright: '#B3A1FF', habit: 'lilac' },
};

/**
 * Playing card faces look the same on every table. `saved` is the pale face of a saved day: a card
 * with a rank and no suit.
 */
export const cardFace = {
  bg: '#FFFDF8',
  ink: INK,
  edge: 'rgba(23, 18, 31, 0.14)',
  faint: 'rgba(23, 18, 31, 0.5)',
  saved: '#F5F2F9',
  savedInk: '#4A4258',
} as const;

/** Chips are gold everywhere. Gold means chips and payouts, and nothing else. */
export const chip = { bg: '#FFC93D', ink: INK, rim: '#E0A800' } as const;

export const palette = {
  table: '#ECE8F4',
  tableDeep: '#E2DCEE',
  ink: INK,
  white: WHITE,
  night: '#120F18',
  nightRaised: '#1E1A26',
  nightSurface: '#2A2534',
  nightCard: '#2B2338',
  moon: '#F1EEF7',
} as const;

export type Theme = {
  scheme: 'light' | 'dark';
  bg: string;
  /** Panels on the table: fields, rows, tiles. */
  bgRaised: string;
  surface: string;
  text: string;
  textSecondary: string;
  /** Decoration and inactive states only. At least 3:1, never for words someone needs to read. */
  textFaint: string;
  border: string;
  dashed: string;
  /** The table's own colour. A 1px rail on the tab bar and small marks, never a big fill. */
  accent: string;
  onAccent: string;
  /**
   * A dark surface floating above the table: the Comeback card, the north star, a toast. Ink on the
   * light table. On dark tables it is lighter than the table, never darker, so it can't vanish.
   */
  raised: string;
  onRaised: string;
  /**
   * Quieter text on a raised surface: eyebrows and captions on the Comeback card or the north star.
   * Still 4.5:1 on `raised`, so use it instead of fading `onRaised` with opacity.
   */
  onRaisedSecondary: string;
  /** The 1px border a raised surface wears. Clear on the light table, where ink stands out anyway. */
  edge: string;
  /** The light catching the top edge of a raised surface, drawn as a 1px inset line. */
  highlight: string;
  /** The dark side of a card. The same as `raised`; kept so older screens keep working. */
  cardBack: string;
  onCardBack: string;
  /** How strongly the felt grain shows, 0 to 1. Zero on the kitchen table. */
  felt: number;
  /** How much lighter the middle of the table is than its edges, 0 to 1. */
  vignette: number;
};

export const themes: { light: Theme; dark: Theme } = {
  light: {
    scheme: 'light',
    bg: palette.table,
    bgRaised: palette.white,
    surface: palette.tableDeep,
    text: palette.ink,
    textSecondary: 'rgba(23, 18, 31, 0.64)',
    textFaint: 'rgba(23, 18, 31, 0.55)',
    border: 'rgba(23, 18, 31, 0.14)',
    dashed: 'rgba(23, 18, 31, 0.5)',
    accent: palette.ink,
    onAccent: palette.white,
    raised: palette.ink,
    onRaised: palette.white,
    onRaisedSecondary: 'rgba(255, 255, 255, 0.6)',
    edge: 'rgba(23, 18, 31, 0)',
    highlight: 'rgba(255, 255, 255, 0.08)',
    cardBack: palette.ink,
    onCardBack: palette.white,
    felt: 0,
    vignette: 0,
  },
  dark: {
    scheme: 'dark',
    bg: palette.night,
    bgRaised: palette.nightRaised,
    surface: palette.nightSurface,
    text: palette.moon,
    textSecondary: 'rgba(241, 238, 247, 0.68)',
    textFaint: 'rgba(241, 238, 247, 0.55)',
    border: 'rgba(241, 238, 247, 0.14)',
    dashed: 'rgba(241, 238, 247, 0.4)',
    accent: palette.moon,
    onAccent: palette.night,
    raised: palette.nightCard,
    onRaised: palette.moon,
    onRaisedSecondary: 'rgba(241, 238, 247, 0.6)',
    edge: 'rgba(255, 255, 255, 0.12)',
    highlight: 'rgba(255, 255, 255, 0.10)',
    cardBack: palette.nightCard,
    onCardBack: palette.moon,
    felt: 0,
    vignette: 0,
  },
};

/**
 * A dark table: felt, velvet or leather under the cards, light text, one accent. Its panels and the
 * dark side of a card are the table mixed toward the text, so they always sit above it.
 */
function table(bg: string, text: string, accent: string, felt: number, vignette: number): Theme {
  const raised = mix(bg, text, 0.11);
  return {
    scheme: 'dark',
    bg,
    bgRaised: mix(bg, text, 0.06),
    surface: mix(bg, text, 0.13),
    text,
    textSecondary: withAlpha(text, 0.72),
    textFaint: withAlpha(text, 0.55),
    border: withAlpha(text, 0.16),
    dashed: withAlpha(text, 0.42),
    accent,
    onAccent: bg,
    raised,
    onRaised: text,
    // As faint as 0.6 where the table allows it; the green felt needs a little more.
    onRaisedSecondary: withAlpha(text, faintestAlpha(text, raised, 4.5, 0.6)),
    edge: withAlpha(text, 0.14),
    highlight: withAlpha(text, 0.12),
    cardBack: raised,
    onCardBack: text,
    felt,
    vignette,
  };
}

/** Every table except the kitchen. Wider than `TableKey` until the engine lists the last three. */
export type TableName = Exclude<TableKey, 'kitchen'> | 'library' | 'lighthouse' | 'observatory';

/** The tables you can unlock, apart from the kitchen table, which follows the phone's light or dark mode. */
export const tables: Record<TableName, Theme> = {
  /** Green felt and brass. */
  'card-room': table('#0E3B2C', '#F6F0E1', '#F2C14E', 0.07, 0.1),
  /** Deep plum, low light. */
  'velvet-room': table('#2B0D2F', '#FBEAF5', '#FF8FB1', 0.06, 0.1),
  /** Ink blue, for the late game. */
  midnight: table('#0A1330', '#E9EEFF', '#8FB0FF', 0.05, 0.12),
  /** Black and gold. */
  'gold-room': table('#0B0A08', '#F6E7C3', '#E8C15A', 0.05, 0.08),
  /** Oxblood leather under a reading lamp. */
  library: table('#2A1712', '#F7EBDA', '#E9A55B', 0.08, 0.12),
  /** Sea-dark teal with the lamp turning. */
  lighthouse: table('#0A2A36', '#EAF6F8', '#FFD36E', 0.05, 0.12),
  /** Night sky indigo, nebula lilac. */
  observatory: table('#100C24', '#ECE9FF', '#C3A8FF', 0.04, 0.14),
};

export function themeFor(key: TableKey, scheme: string | null | undefined): Theme {
  if (key === 'kitchen') return scheme === 'dark' ? themes.dark : themes.light;
  return tables[key] ?? themes.dark;
}

/** What reads on a colour: text, quieter text, decoration and lines, all checked against it. */
export type OnColor = { scheme: 'light' | 'dark'; text: string; secondary: string; faint: string; border: string; dashed: string };

/**
 * The text colours for chrome laid over any background colour, such as Today's table taking the front
 * card's colour. `text` and `secondary` reach 4.5:1 on `bg` and `faint` reaches 3:1. On a colour with
 * no room to spare (white on tomato is 4.59:1), `secondary` is the same as `text`: hierarchy then
 * comes from size and weight, never from fading.
 */
export function on(bg: string): OnColor {
  const white = contrast(WHITE, bg);
  const ink = contrast(INK, bg);
  let text = white >= ink ? WHITE : INK;
  // Ink isn't quite black, so on a few middle greys neither reaches 4.5:1. Black always does.
  if (Math.max(white, ink) < 4.5) text = '#000000';
  const scheme = text === WHITE ? 'dark' : 'light';
  return {
    scheme,
    text,
    secondary: withAlpha(text, faintestAlpha(text, bg, 4.5, 0.64)),
    faint: withAlpha(text, faintestAlpha(text, bg, 3, 0.5)),
    border: withAlpha(text, 0.22),
    dashed: withAlpha(text, faintestAlpha(text, bg, 3, 0.4)),
  };
}

/**
 * A whole theme for chrome on a coloured background, for `ThemeScope`. Panels stay the base theme's;
 * only what sits straight on the colour changes.
 */
export function themeOn(bg: string, base: Theme): Theme {
  const c = on(bg);
  return {
    ...base,
    scheme: c.scheme,
    bg,
    text: c.text,
    textSecondary: c.secondary,
    textFaint: c.faint,
    border: c.border,
    dashed: c.dashed,
    accent: c.text,
    onAccent: bg,
    felt: 0,
    vignette: 0,
  };
}

export const fonts = {
  display: 'Fredoka_700Bold',
  displaySemi: 'Fredoka_600SemiBold',
  body: 'Nunito_500Medium',
  bodySemi: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
} as const;

/**
 * The type scale. Display sizes are Fredoka (600 at 20 and below, where 700 clots); text sizes are
 * Nunito; labels are 11 pt uppercase. Pick from here instead of inventing a size.
 */
export const typeScale = {
  display: { hero: 64, xl: 44, lg: 32, md: 24, sm: 20 },
  text: { lg: 17, md: 15, sm: 13 },
  label: 11,
} as const;

/** Display sizes at or under this use Fredoka 600. */
export const DISPLAY_SEMI_AT = 20;

/**
 * How far text may grow with the phone's text size. Graphics (card faces, chip counts) never grow;
 * fixed chrome like the tab bar and pills grows a little; scrolling pages grow a lot.
 */
export const fontScale = { graphic: 1, tabs: 1.2, chrome: 1.3, page: 2 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, card: 34, pill: 999 } as const;

/** The smallest a thing you tap may be, in points. */
export const TAP = 44;
