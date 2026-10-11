/**
 * Do Better design tokens: The Deck. Every habit is a card in its own colour, laid on a pale
 * lavender table (a deep plum table in dark mode). Ink is the only text colour on the table.
 * Type is "Soft": Fredoka for names and numbers, Nunito for everything you read.
 */

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

export const themes = {
  light: {
    scheme: 'light' as const,
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
    /** The dark side of a card: the comeback, achievements you haven't earned. */
    cardBack: palette.ink,
    onCardBack: palette.white,
  },
  dark: {
    scheme: 'dark' as const,
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

export type Theme = (typeof themes)['light'] | (typeof themes)['dark'];

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
