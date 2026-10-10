/** Do Better design tokens. A calm neutral base; green is the only colour that means "kept". */

export const palette = {
  paper: '#F7F4EE',
  ivory: '#FFFDF9',
  ink: '#1C1A17',
  stone: '#E7E1D6',
  kept: '#2F7D4F',
  keptLight: '#6CC08F',
  night: '#141311',
  nightRaised: '#1F1D1A',
  nightSurface: '#2A2724',
} as const;

export const themes = {
  light: {
    scheme: 'light' as const,
    bg: palette.paper,
    bgRaised: palette.ivory,
    surface: palette.stone,
    text: palette.ink,
    textSecondary: 'rgba(28, 26, 23, 0.64)',
    border: 'rgba(28, 26, 23, 0.16)',
    accent: palette.kept,
    onAccent: palette.ivory,
  },
  dark: {
    scheme: 'dark' as const,
    bg: palette.night,
    bgRaised: palette.nightRaised,
    surface: palette.nightSurface,
    text: palette.paper,
    textSecondary: 'rgba(247, 244, 238, 0.66)',
    border: 'rgba(247, 244, 238, 0.16)',
    accent: palette.keptLight,
    onAccent: palette.night,
  },
};

export type Theme = (typeof themes)['light'] | (typeof themes)['dark'];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { md: 12, lg: 20 } as const;
