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

export function useTheme() {
  return useContext(ThemeContext);
}
