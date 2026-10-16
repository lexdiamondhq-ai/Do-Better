import { Redirect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';

import { TabBar } from '@/components/TabBar';
import { Body, Button, Centered, Display } from '@/components/ui';
import { lastShowdown } from '@/engine/game';
import { useAuth } from '@/lib/auth';
import { hideSplash } from '@/lib/cache';
import { useData } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import { usePrefs } from '@/lib/prefs';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const t = useTheme();
  const router = useRouter();
  const { state, reload, seed } = useData();
  const { demo } = useAuth();
  const { prefs, ready: prefsReady } = usePrefs();
  const deck = useDeck();
  // The Showdown opens once per finished week. The demo deck plays it every time you open it.
  const opened = useRef<string | null>(null);

  const needsOnboarding = !!deck && !deck.profile.onboardedAt && deck.cards.length === 0 && deck.archived.length === 0;
  const showdown = deck ? lastShowdown(deck.game) : null;
  // Only a week later than the last one watched, so a clock moved back across a date line can't reopen a settled week.
  const seen = prefs.showdownSeen[seed];
  const pending = showdown && prefsReady && !needsOnboarding && (demo || !seen || showdown.start > seen) ? showdown.start : null;
  // Everything needed to choose the first screen: the deck (or an error) and the saved prefs.
  const settled = state.status === 'error' || (!!deck && prefsReady);

  // The splash stays up until the first screen is decided. A waiting Showdown opens under it first, so
  // Today never flashes before it.
  useEffect(() => {
    if (!settled) return;
    if (pending && opened.current !== pending) {
      opened.current = pending;
      router.push({ pathname: '/showdown', params: { week: pending } });
      setTimeout(hideSplash, 350);
    } else hideSplash();
  }, [settled, pending, router]);

  if (state.status === 'error') {
    return (
      <Centered>
        <Display size={30} style={{ textAlign: 'center' }}>Couldn’t load your deck.</Display>
        <Body color={t.textSecondary} style={{ textAlign: 'center' }}>{state.message}</Body>
        <Button label="Try again" onPress={reload} />
      </Centered>
    );
  }
  if (!deck) {
    return (
      <Centered>
        <ActivityIndicator color={t.text} />
      </Centered>
    );
  }
  if (needsOnboarding) return <Redirect href="/onboarding" />;

  return (
    // Hidden tabs stay frozen while another is in front, and switching slides between them.
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg }, freezeOnBlur: true, animation: 'shift' }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="hands" />
      <Tabs.Screen name="you" />
      <Tabs.Screen name="playbook" />
    </Tabs>
  );
}
