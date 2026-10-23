import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Body, Display, Label } from '@/components/ui';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { space, TAP } from '@/theme/tokens';

/**
 * Leave it where it plays: one card as a print or a lock screen, opened from the card's page with
 * `habit`. Stream 4 builds the previews; until then it is only its title.
 */
export default function LeaveSheet() {
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
          Leave it where it plays
        </Display>
      </ScrollView>
    </View>
  );
}
