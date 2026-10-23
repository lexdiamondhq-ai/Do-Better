import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Body, Display, Label } from '@/components/ui';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { space, TAP } from '@/theme/tokens';

/**
 * Your plan for a card's next Comeback: what got in the way, then the First move or the Floor. Opened
 * from a kept Comeback's receipt with `habit`. Stream 2 builds the sheet; until then it is only its title.
 */
export default function PlanSheet() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { habit } = useLocalSearchParams<{ habit?: string }>();
  const view = deck?.cards.find((c) => c.habit.id === habit) ?? null;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xl + space.sm, gap: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
          <Label numberOfLines={1} style={{ flexShrink: 1 }}>
            {view?.habit.name ?? ''}
          </Label>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" style={{ minHeight: TAP, justifyContent: 'center' }}>
            <Body weight="heavy" color={t.textSecondary}>
              Close
            </Body>
          </Pressable>
        </View>
        <Display size={34} header>
          Plan for next time
        </Display>
      </ScrollView>
    </View>
  );
}
