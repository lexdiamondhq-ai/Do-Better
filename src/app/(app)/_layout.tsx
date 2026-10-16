import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { Appearance, Platform } from 'react-native';

import { GameEvents } from '@/components/Events';
import { useAuth } from '@/lib/auth';
import { supabaseBackend } from '@/lib/backend';
import { DataProvider } from '@/lib/data';
import { DeckProvider, useLook } from '@/lib/deck';
import { setFeelSettings } from '@/lib/feel';
import { usePrefs, type Prefs } from '@/lib/prefs';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export default function AppLayout() {
  const { user, demo } = useAuth();
  const userId = user?.id ?? null;
  const backend = useMemo(() => demo ?? (userId ? supabaseBackend(userId) : null), [demo, userId]);
  if (!backend) return null;
  return (
    // Keyed by player so signing in as someone else, or leaving the demo, starts from a clean slate.
    <DataProvider key={backend.seed} backend={backend}>
      <DeckProvider>
        <Table>
          <Screens />
        </Table>
      </DeckProvider>
    </DataProvider>
  );
}

/** The table the player picked, once their stack has opened it. Until then, the kitchen table. */
function Table({ children }: PropsWithChildren) {
  const { table } = useLook();
  const dark = table !== 'kitchen';
  // Every table but the kitchen is dark, so the keyboard, alerts and action sheets go dark with it.
  // Back to the phone's own setting on the kitchen table, on sign-out and when leaving the demo.
  useEffect(() => {
    setSystemScheme(dark ? 'dark' : 'unspecified');
    return () => setSystemScheme('unspecified');
  }, [dark]);
  return <ThemeProvider table={table}>{children}</ThemeProvider>;
}

function setSystemScheme(scheme: 'dark' | 'unspecified') {
  if (Platform.OS === 'web') return;
  try {
    Appearance.setColorScheme(scheme);
  } catch {
    // Older native builds can't override the scheme; the app's own colours still follow the table.
  }
}

/** Haptics follow the player's setting. A phone with no saved setting feels them. */
function hapticsOn(prefs: Prefs): boolean {
  return 'haptics' in prefs ? prefs.haptics !== false : true;
}

function Screens() {
  const t = useTheme();
  const { back } = useLook();
  const { prefs } = usePrefs();
  const haptics = hapticsOn(prefs);

  useEffect(() => {
    setFeelSettings({ haptics });
  }, [haptics]);

  // The window behind every screen matches the table, so a sheet opening or a screen sliding away
  // never flashes white.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);

  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="habit/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="habit/[id]" />
        <Stack.Screen
          name="call"
          options={{ presentation: 'formSheet', sheetAllowedDetents: [0.65, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: t.bg } }}
        />
        <Stack.Screen name="showdown" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
      <GameEvents back={back} />
    </>
  );
}
