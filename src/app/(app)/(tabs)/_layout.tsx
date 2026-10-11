import { Redirect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';

import { TabBar } from '@/components/TabBar';
import { Body, Button, Centered, Display } from '@/components/ui';
import { lastShowdown } from '@/engine/game';
import { useAuth } from '@/lib/auth';
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
  const pending = showdown && prefsReady && !needsOnboarding && (demo || prefs.showdownSeen[seed] !== showdown.start) ? showdown.start : null;

  useEffect(() => {
    if (!pending || opened.current === pending) return;
    opened.current = pending;
    router.push({ pathname: '/showdown', params: { week: pending } });
  }, [pending, router]);

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
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="hands" />
      <Tabs.Screen name="you" />
      <Tabs.Screen name="playbook" />
    </Tabs>
  );
}
