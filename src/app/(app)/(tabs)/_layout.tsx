import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator } from 'react-native';

import { TabBar } from '@/components/TabBar';
import { Body, Button, Centered, Display } from '@/components/ui';
import { useData } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const t = useTheme();
  const { state, reload } = useData();
  const deck = useDeck();

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
  if (!deck.profile.onboardedAt && deck.cards.length === 0 && deck.archived.length === 0) return <Redirect href="/onboarding" />;

  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="pile" />
      <Tabs.Screen name="you" />
      <Tabs.Screen name="playbook" />
    </Tabs>
  );
}
