/**
 * Do Better design tokens: The Deck. Every habit is a card in its own colour, laid on a pale
 * lavender table (a deep plum table in dark mode). Ink is the only text colour on the table.
 * Type is "Soft": Fredoka for names and numbers, Nunito for everything you read.
 *
 * Playing cards have cream faces with suits in four colours, one per part of you. Bigger stacks
 * open new tables, which recolour the whole app.
 */

import type { Suit } from '@/engine/cards';
import type { TableKey } from '@/engine/game';

export const cardColors = {
  tomato: { bg: '#FF5B3A', ink: '#FFFFFF', soft: '#FFC9BC' },
  pine: { bg: '#17614B', ink: '#FFFFFF', soft: '#B5D6CB' },
  lilac: { bg: '#B7A4F7', ink: '#17121F', soft: '#E3DBFC' },
  sun: { bg: '#FFC93D', ink: '#17121F', soft: '#FFEBB5' },
  sky: { bg: '#4C7DFF', ink: '#FFFFFF', soft: '#C7D6FF' },
  rose: { bg: '#FF8FB1', ink: '#17121F', soft: '#FFD5E2' },
} as const;

export type CardColor = keyof typeof cardColors;
export const CARD_COLORS = Object.keys(cardColors) as CardColor[];

export function isCardColor(value: unknown): value is CardColor {
  return typeof value === 'string' && value in cardColors;
}

/**
 * Each suit's colour: the glyph on a cream card face, a brighter one for text on dark tables, and the
 * habit card colour it suggests.
 */
export const suitColors: Record<Suit, { glyph: string; bright: string; habit: CardColor }> = {
  spades: { glyph: '#17614B', bright: '#4CC79A', habit: 'pine' },
  hearts: { glyph: '#E5452A', bright: '#FF7A5C', habit: 'tomato' },
  diamonds: { glyph: '#2F5FE0', bright: '#7FA0FF', habit: 'sky' },
  clubs: { glyph: '#6B4FD6', bright: '#B3A1FF', habit: 'lilac' },
};

/** Playing card faces look the same on every table. */
export const cardFace = { bg: '#FFFDF8', ink: '#17121F', edge: 'rgba(23, 18, 31, 0.14)', faint: 'rgba(23, 18, 31, 0.45)' } as const;

/** Chips are gold everywhere. */
export const chip = { bg: '#FFC93D', ink: '#17121F', rim: '#E0A800' } as const;

export const palette = {
  table: '#ECE8F4',
  tableDeep: '#E2DCEE',
  ink: '#17121F',
  white: '#FFFFFF',
  night: '#120F18',
  nightRaised: '#1E1A26',
  nightSurface: '#2A2534',
  moon: '#F1EEF7',
} as const;

export type Theme = {
  scheme: 'light' | 'dark';
  bg: string;
  bgRaised: string;
  surface: string;
  text: string;
  textSecondary: string;
  textFaint: string;
  border: string;
  dashed: string;
  accent: string;
  onAccent: string;
  /** The dark side of a card: the Comeback card, the backs of cards still to come. */
  cardBack: string;
  onCardBack: string;
};

export const themes: { light: Theme; dark: Theme } = {
  light: {
    scheme: 'light',
    bg: palette.table,
    bgRaised: palette.white,
    surface: palette.tableDeep,
    text: palette.ink,
    textSecondary: 'rgba(23, 18, 31, 0.62)',
    textFaint: 'rgba(23, 18, 31, 0.38)',
    border: 'rgba(23, 18, 31, 0.14)',
    dashed: 'rgba(23, 18, 31, 0.32)',
    accent: palette.ink,
    onAccent: palette.white,
    cardBack: palette.ink,
    onCardBack: palette.white,
  },
  dark: {
    scheme: 'dark',
    bg: palette.night,
    bgRaised: palette.nightRaised,
    surface: palette.nightSurface,
    text: palette.moon,
    textSecondary: 'rgba(241, 238, 247, 0.66)',
    textFaint: 'rgba(241, 238, 247, 0.38)',
    border: 'rgba(241, 238, 247, 0.14)',
    dashed: 'rgba(241, 238, 247, 0.32)',
    accent: palette.moon,
    onAccent: palette.night,
    cardBack: '#05040A',
    onCardBack: palette.moon,
  },
};

/** A dark table: felt or velvet under the cards, light text, one accent. */
function table(bg: string, bgRaised: string, surface: string, text: string, accent: string, cardBack: string): Theme {
  const fade = (a: number) => `${text}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
  return {
    scheme: 'dark',
    bg,
    bgRaised,
    surface,
    text,
    textSecondary: fade(0.7),
    textFaint: fade(0.4),
    border: fade(0.16),
    dashed: fade(0.34),
    accent,
    onAccent: bg,
    cardBack,
    onCardBack: text,
  };
}

/** The tables you can unlock, apart from the kitchen table, which follows the phone's light or dark mode. */
export const tables: Record<Exclude<TableKey, 'kitchen'>, Theme> = {
  'card-room': table('#0E3B2C', '#14503D', '#1A5E48', '#F6F0E1', '#F2C14E', '#082419'),
  'velvet-room': table('#2B0D2F', '#3B1541', '#4A1C52', '#FBEAF5', '#FF8FB1', '#1A061D'),
  midnight: table('#0A1330', '#111D45', '#182756', '#E9EEFF', '#8FB0FF', '#050A1C'),
  'gold-room': table('#0B0A08', '#18150F', '#231E15', '#F6E7C3', '#E8C15A', '#000000'),
  library: table('#2A1C10', '#3A2716', '#47301B', '#F7ECD9', '#F0B45A', '#170E06'),
  lighthouse: table('#0B2A3F', '#113A55', '#164764', '#EEF6FB', '#FFD36E', '#06192A'),
  observatory: table('#0D0B1F', '#17143A', '#1F1B4A', '#ECE9FF', '#D8B26A', '#06051A'),
};

export function themeFor(key: TableKey, scheme: string | null | undefined): Theme {
  if (key === 'kitchen') return scheme === 'dark' ? themes.dark : themes.light;
  return tables[key];
}

export const fonts = {
  display: 'Fredoka_700Bold',
  displaySemi: 'Fredoka_600SemiBold',
  body: 'Nunito_500Medium',
  bodySemi: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, card: 34, pill: 999 } as const;
