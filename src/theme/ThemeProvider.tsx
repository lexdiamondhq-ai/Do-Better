import { createContext, useContext, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { themes, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(themes.light);

/** Follows the system appearance. */
export function ThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  return <ThemeContext.Provider value={scheme === 'dark' ? themes.dark : themes.light}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
