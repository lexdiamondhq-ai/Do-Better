import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ShareCard } from '@/components/ShareCard';
import { Body, Button } from '@/components/ui';
import { weekReview } from '@/engine/game';
import { useData } from '@/lib/data';
import { useLook } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { gameInput } from '@/lib/play';
import { share, SHARE_LAYOUT, weekSuit, type HabitLine, type ShareOutcome, type ShareTarget } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { fontScale, radius, space, TAP } from '@/theme/tokens';

/** The share mark: a box with an arrow leaving it. */
function ShareIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M12 3v12M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * "Share this hand": opens the share card full size first, so you see exactly what will be sent, with
 * a switch to show your habit names (off unless you turn it on).
 */
export function ShareButton({
  target,
  label = 'Share',
  variant = 'ghost',
  style,
}: {
  target: ShareTarget;
  label?: string;
  variant?: 'primary' | 'ghost' | 'quiet';
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const color = variant === 'primary' ? t.bg : variant === 'ghost' ? t.text : t.textSecondary;
  return (
    <>
      <Button label={label} variant={variant} icon={<ShareIcon color={color} />} onPress={() => setOpen(true)} hint="Shows the picture before you share it" style={style} />
      <SharePreview target={target} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The preview's backdrop: the near-black of the card room with the lights down. */
const BACKDROP = '#08060C';

const SAID: Partial<Record<ShareOutcome, string>> = {
  copied: 'Copied. Paste it wherever you like.',
  failed: 'That didn’t go through. Try again in a moment.',
};

/**
 * The share card, shown at the size of the screen, with what to send and a Share button. The card is
 * drawn at its full 360 × 640 inside a scaled frame, so the picture taken of it is sharp at 1080 × 1920.
 */
export function SharePreview({ target, visible, onClose }: { target: ShareTarget; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { back } = useLook();
  const { state, today, seed } = useData();
  const [names, setNames] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const card = useRef<View>(null);

  const review = target.kind === 'hand' && state.status === 'ready' && target.week.hand ? weekReview(target.week, gameInput(state, today, seed)) : null;
  const habits: HabitLine[] =
    review && state.status === 'ready'
      ? review.habits.flatMap((h) => {
          const habit = state.habits.find((x) => x.id === h.id);
          return habit ? [{ name: habit.name, kept: h.kept, days: h.days }] : [];
        })
      : [];
  const shown: ShareTarget = target.kind === 'hand' ? { ...target, names } : target;

  const controls = 210 + (habits.length ? 56 : 0);
  const scale = Math.min((width - space.xl * 2) / SHARE_LAYOUT.w, (height - insets.top - insets.bottom - controls) / SHARE_LAYOUT.h, 1);
  const w = SHARE_LAYOUT.w * scale;
  const h = SHARE_LAYOUT.h * scale;

  const close = () => {
    setSaid(null);
    onClose();
  };

  const send = async () => {
    setBusy(true);
    setSaid(null);
    const outcome = await share(shown, { view: card, habits });
    setBusy(false);
    if (outcome === 'image' || outcome === 'text') {
      feel.chips();
      close();
      return;
    }
    setSaid(SAID[outcome] ?? null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md, paddingHorizontal: space.xl }}>
        {/* A solid backdrop, like a photo viewer: the picture is all there is to look at, with nothing ghosting through behind it. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP }]} />
        <View role="dialog" aria-modal aria-label={target.kind === 'hand' ? 'Share this hand' : 'Share this card'} accessibilityViewIsModal style={{ alignItems: 'center', gap: space.lg, width: '100%', maxWidth: 420 }}>
          <View style={{ width: w, height: h, borderRadius: 12 * scale + 4, overflow: 'hidden', boxShadow: '0px 18px 48px rgba(0, 0, 0, 0.5)' }}>
            <View style={{ width: SHARE_LAYOUT.w, height: SHARE_LAYOUT.h, transform: [{ translateX: -(SHARE_LAYOUT.w * (1 - scale)) / 2 }, { translateY: -(SHARE_LAYOUT.h * (1 - scale)) / 2 }, { scale }] }}>
              <ShareCard target={shown} habits={habits} back={back} lead={target.kind === 'hand' ? weekSuit(review, target.week.hand) : null} cardRef={card} />
            </View>
            {/* What happened, laid over the foot of the picture (never part of it), so nothing on the screen moves when it appears. */}
            {said ? (
              <View
                accessibilityLiveRegion="polite"
                aria-live="polite"
                style={{ position: 'absolute', left: space.md, right: space.md, bottom: space.md, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: 'rgba(8, 6, 12, 0.9)' }}
              >
                <Body weight="bold" color="#FFFDF8" style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
                  {said}
                </Body>
              </View>
            ) : null}
          </View>
          {habits.length ? <Toggle label="Show my habits" on={names} onChange={setNames} hint="Puts each habit’s name and kept days on the picture" /> : null}
          <View style={{ alignSelf: 'stretch', gap: space.xs }}>
            <Button
              label={Platform.OS === 'web' ? 'Share' : 'Share picture'}
              busy={busy}
              onPress={() => void send()}
              colors={{ bg: '#FFFDF8', fg: '#17121F' }}
              icon={<ShareIcon color="#17121F" />}
            />
            <Button label="Not now" variant="quiet" onPress={close} colors={{ bg: 'transparent', fg: 'rgba(255, 253, 248, 0.82)' }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** A labelled switch, drawn the same on every platform. */
function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (on: boolean) => void; hint?: string }) {
  return (
    <Pressable
      role="switch"
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={() => onChange(!on)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: 'rgba(255, 253, 248, 0.1)', opacity: pressed ? 0.75 : 1 })}
    >
      <Body weight="heavy" color="#FFFDF8" maxFontSizeMultiplier={fontScale.chrome}>
        {label}
      </Body>
      <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: on ? '#FFFDF8' : 'rgba(255, 253, 248, 0.28)', alignItems: on ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? '#17121F' : '#FFFDF8' }} />
      </View>
    </Pressable>
  );
}
