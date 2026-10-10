import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AchievementCard, SUIT_COLOR } from '@/components/AchievementCard';
import { Body, Display, Label } from '@/components/ui';
import { SUITS, type EarnedState, type Suit } from '@/engine/achievements';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, space } from '@/theme/tokens';

const SUIT_ORDER: Suit[] = ['spades', 'diamonds', 'clubs', 'hearts', 'joker'];

/** The whole collection, one suit at a time. Nothing in it can be lost. */
export default function Achievements() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const deck = useDeck();
  const [open, setOpen] = useState<EarnedState | null>(null);
  if (!deck) return null;

  const earned = deck.achievements.filter((s) => s.unlockedOn).length;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxxl, gap: space.xxl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>Your collection</Label>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Body weight="heavy">Done</Body>
          </Pressable>
        </View>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
            <Display size={96} style={{ lineHeight: 90 }}>{earned}</Display>
            <Display size={30} color={t.textSecondary} style={{ paddingBottom: 10 }}>{`/${deck.achievements.length}`}</Display>
          </View>
          <Body weight="bold" color={t.textSecondary}>Cards are earned from totals, never runs. A bad week can’t take one away.</Body>
        </View>

        {SUIT_ORDER.map((suit) => {
          const states = deck.achievements.filter((s) => s.achievement.suit === suit);
          const got = states.filter((s) => s.unlockedOn).length;
          const col = cardColors[SUIT_COLOR[suit]];
          return (
            <View key={suit} style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: col.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Display size={22} color={col.ink}>{SUITS[suit].glyph}</Display>
                </View>
                <View style={{ flex: 1 }}>
                  <Display size={22}>{SUITS[suit].name}</Display>
                  <Body size={13} color={t.textSecondary}>{`${SUITS[suit].about} ${got} of ${states.length}.`}</Body>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {states.map((s) => (
                  <Pressable key={s.achievement.id} style={{ width: '31.8%' }} onPress={() => setOpen(s)} accessibilityRole="button">
                    <AchievementCard state={s} />
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable onPress={() => setOpen(null)} style={{ flex: 1, backgroundColor: 'rgba(18,15,24,0.82)', alignItems: 'center', justifyContent: 'center', gap: space.xl, padding: space.xl }}>
          {open ? (
            <>
              <View style={{ transform: [{ rotate: '-3deg' }] }}>
                <AchievementCard state={open} size="large" />
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Body weight="bold" color="#FFFFFF" style={{ opacity: 0.75, textAlign: 'center' }}>
                  {open.unlockedOn ? `Earned ${open.unlockedOn}` : `${open.progress} of ${open.achievement.target} so far`}
                </Body>
              </View>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}
