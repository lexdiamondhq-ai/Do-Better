import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardOut, CardOutFront, cardOutSize } from '@/components/CardOut';
import { Body, Button, Display, Label } from '@/components/ui';
import { LEAVE_FORMATS, leaveLines, type LeaveFormat } from '@/engine/leave';
import { useDeck, useLook } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { share, type ShareOutcome } from '@/lib/share';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { fontScale, fonts, radius, space, TAP, typeScale } from '@/theme/tokens';

const FORMATS: readonly { key: LeaveFormat; label: string; how: string; save: string }[] = [
  { key: 'print', label: 'Print', how: 'Print it, cut it out and fold it on the line. About the size of a playing card.', save: 'Save or print' },
  { key: 'lock', label: 'Lock screen', how: 'Save it, then choose it in Settings › Wallpaper.', save: 'Save it' },
];

const SAID: Partial<Record<ShareOutcome, string>> = {
  copied: 'Copied. Paste it wherever you like.',
  failed: 'That didn’t go through. Try again in a moment.',
};

/** The widest the previews grow on a big screen. */
const MAX_W = 520;

/**
 * Leave it where it plays: one card as a print to fold or a lock screen, opened from the card's page with
 * `habit`. The picture carries the card's words and nothing won. A card with no When it plays is asked for
 * one first: a cue works where its moment happens.
 */
export default function LeaveSheet() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const deck = useDeck();
  const { back } = useLook();
  const { habit: id } = useLocalSearchParams<{ habit?: string }>();
  const view = deck?.cards.find((c) => c.habit.id === id) ?? null;
  const [format, setFormat] = useState<LeaveFormat>('print');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const picture = useRef<View>(null);
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const habit = view?.habit ?? null;
  const contentW = Math.min(width - space.xl * 2, MAX_W);
  const chosen = FORMATS.find((f) => f.key === format) ?? FORMATS[0];

  const pick = (next: LeaveFormat) => {
    if (next === format) return;
    feel.tick();
    setSaid(null);
    setFormat(next);
    pop.set(withSequence(withTiming(0.95, { duration: 90 }), withSpring(1, { damping: 14, stiffness: 220 })));
  };

  async function save() {
    if (!habit) return;
    setBusy(true);
    setSaid(null);
    const outcome = await share({ kind: 'card', habitId: habit.id, name: habit.name, format }, { view: picture, size: LEAVE_FORMATS[format] });
    setBusy(false);
    if (outcome === 'image' || outcome === 'text') feel.tick();
    const words = SAID[outcome] ?? null;
    setSaid(words);
    // Said out loud too, since VoiceOver is on the button, not the line above it.
    if (words) AccessibilityInfo.announceForAccessibility(words);
  }

  const lines = habit ? leaveLines(habit) : null;
  // The lock screen keeps a phone's shape, so its height sets its size.
  const lockW = Math.min(contentW * 0.72, Math.max(180, (height - insets.top - 330) * (LEAVE_FORMATS.lock.w / LEAVE_FORMATS.lock.h)));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xl + space.sm, paddingBottom: insets.bottom + space.xxxl, gap: space.lg, alignItems: 'center' }}>
        <View style={{ alignSelf: 'stretch', gap: space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
            <Label numberOfLines={1} style={{ flexShrink: 1 }}>
              {habit?.name ?? ''}
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
        </View>

        {!habit || !lines ? null : lines.needsMoment ? (
          <NeedsMoment
            width={contentW}
            onAdd={() => {
              feel.tick();
              router.push({ pathname: '/habit/edit', params: { id: habit.id, focus: 'anchor' } });
            }}
          >
            <CardOutFront habit={habit} width={Math.min(200, contentW * 0.55)} />
          </NeedsMoment>
        ) : (
          <>
            <Segmented value={format} onChange={pick} width={contentW} />
            <Animated.View style={[{ alignItems: 'center' }, popStyle]}>
              {format === 'print' ? (
                <View style={{ transform: [{ rotate: '-1.2deg' }], boxShadow: '0 14px 30px rgba(23, 18, 31, 0.22), 0 2px 6px rgba(23, 18, 31, 0.12)' }}>
                  <CardOut habit={habit} back={back} format="print" width={contentW} cardRef={picture} />
                </View>
              ) : (
                <Phone width={lockW}>
                  <CardOut habit={habit} back={back} format="lock" width={lockW - PHONE_BEZEL * 2} cardRef={picture} />
                </Phone>
              )}
            </Animated.View>
            {/* What happened takes the place of the how-to line just above the button, in view wherever the button is. */}
            <View accessibilityLiveRegion="polite" aria-live="polite" style={{ alignSelf: 'stretch' }}>
              <Body size={typeScale.text.md} weight={said ? 'heavy' : 'bold'} color={said ? t.text : t.textSecondary} style={{ textAlign: 'center' }}>
                {said ?? chosen.how}
              </Body>
            </View>
            <Button label={chosen.save} busy={busy} onPress={() => void save()} style={{ alignSelf: 'stretch' }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Print or Lock screen: two choices on a track, with a solid thumb that slides to the one chosen. */
function Segmented({ value, onChange, width }: { value: LeaveFormat; onChange: (v: LeaveFormat) => void; width: number }) {
  const t = useTheme();
  const [track, setTrack] = useState(width);
  const index = FORMATS.findIndex((f) => f.key === value);
  const x = useSharedValue(index);
  // Inside the 1-point border and the 4-point padding, each choice takes half.
  const half = (track - 10) / 2;
  // Kept inside its track: the spring may overshoot, the thumb never does.
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: Math.min(1, Math.max(0, x.get())) * half }] }));
  const choose = (i: number) => {
    x.set(withSpring(i, { damping: 22, stiffness: 340 }));
    onChange(FORMATS[i].key);
  };
  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={(e: LayoutChangeEvent) => setTrack(e.nativeEvent.layout.width)}
      style={{ alignSelf: 'stretch', flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}
    >
      <Animated.View aria-hidden style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: half, borderRadius: radius.pill, backgroundColor: t.text }, thumb]} />
      {FORMATS.map((f, i) => {
        const on = f.key === value;
        return (
          <Pressable
            key={f.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            aria-checked={on}
            accessibilityLabel={f.label}
            onPress={() => choose(i)}
            style={{ flex: 1, minHeight: TAP, alignItems: 'center', justifyContent: 'center' }}
          >
            <Body weight="heavy" size={typeScale.text.md} color={on ? t.bg : t.text} maxFontSizeMultiplier={fontScale.chrome}>
              {f.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

const PHONE_BEZEL = 6;

/** A phone around the lock screen, with the time where the clock will sit, so the clear top reads as the clock's. The phone and the time are not in the picture. */
function Phone({ width, children }: { width: number; children: ReactNode }) {
  const inner = cardOutSize('lock', width - PHONE_BEZEL * 2);
  const [now] = useState(() => new Date());
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(now).replace(/\s?[AP]\.?M\.?$/i, '');
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  return (
    <View style={{ width, padding: PHONE_BEZEL, borderRadius: width * 0.14, backgroundColor: '#0B0A0F', boxShadow: '0 18px 40px rgba(23, 18, 31, 0.3)' }}>
      <View style={{ width: inner.w, height: inner.h, borderRadius: width * 0.12, overflow: 'hidden' }}>
        {children}
        <View pointerEvents="none" aria-hidden style={{ position: 'absolute', top: inner.h * 0.07, left: 0, right: 0, alignItems: 'center' }}>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.bodyBold, fontSize: inner.w * 0.055, color: withAlpha('#FFFFFF', 0.85) }}>
            {date}
          </Text>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.display, fontSize: inner.w * 0.24, lineHeight: inner.w * 0.27, color: withAlpha('#FFFFFF', 0.92), letterSpacing: -inner.w * 0.004 }}>
            {time}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** A card with no When it plays yet: its front, waiting, and the way to give it a moment. */
function NeedsMoment({ width, onAdd, children }: { width: number; onAdd: () => void; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: space.lg }}>
      <View style={{ opacity: 0.55, transform: [{ rotate: '3deg' }] }}>{children}</View>
      <View style={{ alignSelf: 'stretch', gap: space.sm, maxWidth: width }}>
        <Display size={typeScale.display.md} style={{ textAlign: 'center' }}>
          Give it a moment first
        </Display>
        <Body size={typeScale.text.md} color={t.textSecondary} style={{ textAlign: 'center' }}>
          A card works best where its moment happens.
        </Body>
      </View>
      <Button label="Add When it plays" onPress={onAdd} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
