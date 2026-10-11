import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type PropsWithChildren } from 'react';

import { GameEvents } from '@/components/Events';
import { useAuth } from '@/lib/auth';
import { supabaseBackend } from '@/lib/backend';
import { DataProvider } from '@/lib/data';
import { DeckProvider, useDeck } from '@/lib/deck';
import { usePrefs } from '@/lib/prefs';
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
  const deck = useDeck();
  const { prefs } = usePrefs();
  const table = deck?.game.tables.has(prefs.table) ? prefs.table : 'kitchen';
  return <ThemeProvider table={table}>{children}</ThemeProvider>;
}

function Screens() {
  const t = useTheme();
  const { prefs } = usePrefs();
  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="habit/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="habit/[id]" />
        <Stack.Screen name="call" options={{ presentation: 'modal' }} />
        <Stack.Screen name="showdown" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
      <GameEvents back={prefs.back} />
    </>
  );
}
