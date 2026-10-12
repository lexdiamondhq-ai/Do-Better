import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips } from '@/components/Chips';
import { ask } from '@/components/Ask';
import { EXAMPLES, HandRow } from '@/components/HandFan';
import { Body, Button, Display, Label } from '@/components/ui';
import { CALLABLE } from '@/engine/game';
import { atLeast, HANDS, type HandKind } from '@/engine/poker';
import { useData } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { chip, radius, space } from '@/theme/tokens';

/**
 * Call your hand: on Monday, say what this week will make. Make that hand or better by Sunday and it
 * pays its chips a second time. A miss costs nothing, so the call is a promise to yourself, not a bet.
 */
export default function Call() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const deck = useDeck();
  const { callHand } = useData();
  const [picked, setPicked] = useState<HandKind | null>(null);
  const [busy, setBusy] = useState(false);
  if (!deck) return null;

  const { game } = deck;
  const current = game.current.call;
  const choice = picked ?? current ?? game.suggestedCall;
  const recent = game.weeks.filter((w) => w.hand).slice(-10);

  async function confirm() {
    setBusy(true);
    try {
      await callHand(choice);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + 140, gap: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>{game.callOpen ? 'Calls close at midnight' : 'Calls open on Mondays'}</Label>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Body weight="heavy" color={t.textSecondary}>Close</Body>
          </Pressable>
        </View>
        <Display size={40}>Call your hand</Display>
        <Body color={t.textSecondary}>
          Say what this week will make. Make it or better by Sunday midnight and it pays its chips twice. Miss and you lose nothing, so it is a promise to yourself, not a bet.
        </Body>

        <View style={{ gap: space.sm }}>
          {[...CALLABLE].reverse().map((kind) => {
            const info = HANDS[kind];
            const on = choice === kind;
            const made = recent.filter((w) => w.hand && atLeast(w.hand.kind, kind)).length;
            const suggested = kind === game.suggestedCall;
            return (
              <Pressable
                key={kind}
                disabled={!game.callOpen}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !game.callOpen }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPicked(kind);
                }}
                style={{
                  backgroundColor: on ? chip.bg : t.bgRaised,
                  borderRadius: radius.lg,
                  padding: space.lg,
                  gap: space.sm,
                  opacity: !game.callOpen && !on ? 0.55 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <Display size={22} color={on ? chip.ink : t.text}>{info.name}</Display>
                      {suggested ? (
                        <View style={{ backgroundColor: on ? chip.ink : t.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Body size={10} weight="heavy" color={on ? chip.bg : t.onAccent}>SUGGESTED</Body>
                        </View>
                      ) : null}
                    </View>
                    <Body size={13} weight="bold" color={on ? chip.ink : t.textSecondary}>
                      {recent.length ? `Made it ${made} of your last ${recent.length} weeks` : info.how}
                    </Body>
                  </View>
                  <Chips value={info.chips} size={16} sign color={on ? chip.ink : t.text} />
                </View>
                <HandRow faces={EXAMPLES[kind]} size="xs" overlap={0.12} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {game.callOpen ? (
        <View style={{ position: 'absolute', left: space.xl, right: space.xl, bottom: insets.bottom + space.lg, gap: space.xs }}>
          <Button label={current === choice ? `Keep my call: ${HANDS[choice].name}` : `Call ${HANDS[choice].name}`} busy={busy} onPress={current === choice ? () => router.back() : confirm} />
          <Body size={12} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }}>
            {`Bonus if you make it: ${HANDS[choice].chips} chips. You can change your call until midnight.`}
          </Body>
        </View>
      ) : null}
    </View>
  );
}
