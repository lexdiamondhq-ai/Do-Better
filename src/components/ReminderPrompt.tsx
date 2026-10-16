import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { previewLastCall, QUIET } from '@/engine/cues';
import { useAuth } from '@/lib/auth';
import { remindersSupported } from '@/lib/cues';
import { useDeck, type Deck } from '@/lib/deck';
import { usePrefs } from '@/lib/prefs';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { fontScale, radius, space, themeOn, typeScale } from '@/theme/tokens';

import { clockLabel, ReminderBanner, TimeChooser, ToggleRow, useTurnOnReminders } from './Reminders';
import { Body, Button, Display, Label } from './ui';

/**
 * Whether the reminder question is due: never asked, on a phone with the player's own deck, on a visit
 * after the first kept day, and not on a day that already has a moment of its own (a face card, a
 * Comeback or a Welcome back).
 */
export function reminderPromptDue(deck: Deck | null, asked: boolean, demo: boolean): boolean {
  if (!deck || asked || demo || !remindersSupported) return false;
  const keptBefore = deck.cards.some((c) => [...c.checkIns.keys()].some((day) => day < deck.today));
  if (!keptBefore) return false;
  if (deck.away || deck.cards.some((c) => c.neverTwice)) return false;
  if (deck.game.faces.some((f) => f.day === deck.today)) return false;
  return true;
}

/** True while the reminder question would show, for a screen that queues its interruptions. */
export function useReminderPromptDue(): boolean {
  const deck = useDeck();
  const { prefs, ready } = usePrefs();
  const { demo } = useAuth();
  return ready && reminderPromptDue(deck, prefs.reminders.asked, !!demo);
}

/**
 * "When do your cards play?" asked once, on a visit to Today after the first kept day. It decides itself
 * whether to show and calls `onDone` when it closes. Nothing is asked of the phone until "Remind me".
 * `preview` shows it regardless, for screenshots, and never asks the phone.
 */
export function ReminderPrompt({ onDone, preview = false }: { onDone?: () => void; preview?: boolean }) {
  const due = useReminderPromptDue();
  const [closed, setClosed] = useState(false);
  if (closed || !(due || preview)) return null;
  return (
    <PromptSheet
      preview={preview}
      onClose={() => {
        setClosed(true);
        onDone?.();
      }}
    />
  );
}

function PromptSheet({ onClose, preview }: { onClose: () => void; preview: boolean }) {
  const base = useTheme();
  const scene = themeOn(base.raised, base);
  const insets = useSafeAreaInsets();
  const deck = useDeck();
  const { prefs, setPrefs } = usePrefs();
  const turnOn = useTurnOnReminders();
  const [lastCall, setLastCall] = useState(prefs.reminders.lastCall);
  const [morning, setMorning] = useState(prefs.reminders.morning);
  const [busy, setBusy] = useState(false);

  const habits = (deck?.cards ?? []).map((c) => ({ id: c.habit.id, name: c.habit.name, floor: c.habit.floorLabel, firstMove: c.habit.twoMinuteLabel, startedOn: c.habit.startedOn, part: c.partOfDay, keptToday: false, remindAt: null }));
  const sample = previewLastCall(habits);

  async function remind() {
    if (preview) return onClose();
    setBusy(true);
    try {
      await turnOn({ lastCall, morning });
    } finally {
      setBusy(false);
      onClose();
    }
  }

  function notNow() {
    if (!preview) setPrefs((p) => ({ reminders: { ...p.reminders, asked: true } }));
    onClose();
  }

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={notNow}>
      <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1, backgroundColor: 'rgba(10, 8, 14, 0.55)', justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={notNow} style={{ flex: 1 }} />
        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(180)}
          accessibilityViewIsModal
          style={{ maxHeight: '92%', backgroundColor: scene.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderWidth: base.edge === 'transparent' ? 0 : 1, borderColor: base.edge, overflow: 'hidden' }}
        >
          <ThemeScope theme={scene}>
            <ScrollView bounces={false} contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.lg, gap: space.lg }}>
              <View aria-hidden style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: scene.border }} />
              <View style={{ gap: space.sm }}>
                <Label color={scene.textSecondary}>Reminders</Label>
                <Display size={typeScale.display.lg} header>
                  When do your cards play?
                </Display>
                <Body color={scene.textSecondary}>One nudge in the evening, only while a card is still open.</Body>
              </View>

              <ReminderBanner title={sample.title} body={sample.body} when={clockLabel(lastCall)} style={{ transform: [{ rotate: '-1.2deg' }] }} />

              <TimeChooser label="Last call" value={lastCall} onChange={setLastCall} quietHours presets={['18:00', '19:30', '20:30', '21:30']} />

              <View style={{ height: 1, backgroundColor: scene.border }} />
              <ToggleRow label="The morning after" caption={`After a quiet day, a nudge at ${clockLabel('09:00')} to log yesterday or still save it.`} value={morning} onChange={setMorning} />

              <View style={{ gap: space.xs }}>
                <Button label="Remind me" onPress={remind} busy={busy} hint="Your phone asks you to allow notifications" />
                <Button label="Not now" variant="quiet" onPress={notNow} />
              </View>
              <Body size={typeScale.text.sm} color={scene.textSecondary} maxFontSizeMultiplier={fontScale.page} style={{ textAlign: 'center' }}>
                {`Never more than two a day, never after ${clockLabel(QUIET.from)}. Change it any time in You.`}
              </Body>
            </ScrollView>
          </ThemeScope>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
