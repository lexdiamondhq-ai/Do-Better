import { createContext, useContext, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import type { TableKey } from '@/engine/game';

import { themeFor, themes, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(themes.light);

/** The kitchen table follows the system appearance; every other table has its own colours. */
export function ThemeProvider({ table = 'kitchen', children }: PropsWithChildren<{ table?: TableKey }>) {
  const scheme = useColorScheme();
  return <ThemeContext.Provider value={themeFor(table, scheme)}>{children}</ThemeContext.Provider>;
}

/**
 * Gives everything inside a different theme, such as `themeOn(cardColour, t)` for chrome laid over a
 * coloured background, so every `Body`, `Label` and `Button` inside picks colours that read on it.
 */
export function ThemeScope({ theme, children }: PropsWithChildren<{ theme: Theme }>) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
