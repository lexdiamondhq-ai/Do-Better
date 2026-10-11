import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HabitCard } from '@/components/HabitCard';
import { PRINT_ASPECT, PrintedBack, PrintedCard, type Print } from '@/components/printed/PrintedCard';
import { useTilt } from '@/components/printed/useTilt';
import { SwipeCard, type SwipeDirection } from '@/components/SwipeCard';
import { Body, Button, Display, Label } from '@/components/ui';
import { localDay } from '@/engine/day';
import type { Level } from '@/engine/kept';
import type { Habit } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type CardColor } from '@/theme/tokens';

/** Made-up habits to print from, one in each card colour. Nothing here is saved. */
const SAMPLES: { name: string; floor: string; ceiling: string; color: CardColor }[] = [
  { name: 'Read', floor: '1 page', ceiling: '20 pages', color: 'sky' },
  { name: 'Walk', floor: 'Walk to the corner', ceiling: '30-minute walk', color: 'tomato' },
  { name: 'Meditate', floor: '1 mindful breath', ceiling: '10 minutes', color: 'lilac' },
  { name: 'Save', floor: 'Move $1 to savings', ceiling: 'Review the week’s spending', color: 'pine' },
  { name: 'Journal', floor: 'One line', ceiling: 'A full page', color: 'sun' },
  { name: 'Reach out', floor: 'Send one message', ceiling: 'Call someone you love', color: 'rose' },
];
const FIRST_NUMBER = 34;

const SLOT = 16;
/** The card feeds out in short pushes, like paper leaving a printer. */
const PUSHES = 7;
const PUSH_MS = 100;
const PUSH_REST_MS = 35;
const FLIP_AFTER_MS = PUSHES * PUSH_MS + 120;
const FLIP_MS = 560;
/** How far below the slot the card hangs once it is all the way out. */
const HANG = 14;
const MAX_LEAN = 9;

/**
 * A throwaway look at one moment: you swipe a habit, and a card for that day feeds out of the slot
 * and flips over. A Floor prints matte, a Ceiling prints foil that moves with the phone.
 * `?auto=ceiling` or `?auto=floor` prints without a swipe, `tx` and `ty` hold a tilt, and `card`
 * picks the sample, so the moment can be checked where there is no finger and no motion sensor.
 */
export default function Sketch() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ auto?: string; tx?: string; ty?: string; card?: string }>();
  const auto: Level | null = params.auto === 'floor' || params.auto === 'ceiling' ? params.auto : null;
  const heldX = Number(params.tx) || 0;
  const heldY = Number(params.ty) || 0;

  const [turn, setTurn] = useState(() => Number(params.card) || 0);
  const [print, setPrint] = useState<Print | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const feed = useSharedValue(0);
  const flip = useSharedValue(0);
  const sweep = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const phone = useTilt();
  const tiltX = useDerivedValue(() => Math.max(-1, Math.min(1, phone.x.get() + touchX.get() + heldX)));
  const tiltY = useDerivedValue(() => Math.max(-1, Math.min(1, phone.y.get() + touchY.get() + heldY)));
  const shineX = useDerivedValue(() => tiltX.get() + sweep.get());

  const sample = SAMPLES[turn % SAMPLES.length];
  const number = FIRST_NUMBER + turn;
  const cardW = stage ? Math.floor(Math.min(stage.w - 56, (stage.h - SLOT - 56) * PRINT_ASPECT, 300)) : 0;
  const cardH = cardW / PRINT_ASPECT;
  const restY = stage ? (stage.h - SLOT / 2 - cardH) / 2 + 6 : 0;

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  function later(ms: number, run: () => void) {
    timers.current.push(setTimeout(run, ms));
  }

  function startPrint(level: Level) {
    const foil = level === 'ceiling';
    setPrint({ name: sample.name, did: foil ? sample.ceiling : sample.floor, level, color: sample.color, number, day: localDay(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') });
    setRevealed(false);
    flip.set(0);
    feed.set(0);
    feed.set(
      withSequence(
        ...Array.from({ length: PUSHES }, (_, i) =>
          withDelay(i === 0 ? 0 : PUSH_REST_MS, withTiming((i + 1) / PUSHES, { duration: PUSH_MS - PUSH_REST_MS, easing: Easing.out(Easing.quad) })),
        ),
      ),
    );
    flip.set(withDelay(FLIP_AFTER_MS, withTiming(1, { duration: FLIP_MS, easing: Easing.inOut(Easing.cubic) })));
    // One pass of glare across the foil as it turns face up, so it shows before the phone moves.
    sweep.set(foil ? 2 : 0);
    if (foil) sweep.set(withDelay(FLIP_AFTER_MS + FLIP_MS / 2, withTiming(0, { duration: 1200, easing: Easing.out(Easing.cubic) })));

    for (let i = 0; i < PUSHES; i++) later(i * PUSH_MS, () => Haptics.selectionAsync());
    later(FLIP_AFTER_MS + FLIP_MS / 2, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    later(FLIP_AFTER_MS + FLIP_MS, () => {
      setRevealed(true);
      if (foil) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
  }

  const autoPrint = useEffectEvent(() => {
    if (auto) startPrint(auto);
  });
  const ready = stage !== null;
  useEffect(() => {
    if (!auto || !ready) return;
    const id = setTimeout(() => autoPrint(), 700);
    return () => clearTimeout(id);
  }, [auto, ready]);

  function onSwipe(dir: SwipeDirection) {
    if (dir === 'up') startPrint('ceiling');
    else if (dir === 'down') startPrint('floor');
  }

  function dealNext() {
    Haptics.selectionAsync();
    setPrint(null);
    setRevealed(false);
    setTurn((n) => n + 1);
  }

  function onStage(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setStage((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
  }

  // Pressing on the printed card leans it toward the finger, the same way tilting the phone does.
  const lean = Gesture.Pan()
    .enabled(revealed)
    .minDistance(0)
    .onBegin((e) => {
      touchX.set(withSpring(Math.max(-1, Math.min(1, (e.x / cardW - 0.5) * 2)), { damping: 18, stiffness: 220 }));
      touchY.set(withSpring(Math.max(-1, Math.min(1, (e.y / cardH - 0.5) * 2)), { damping: 18, stiffness: 220 }));
    })
    .onUpdate((e) => {
      touchX.set(withSpring(Math.max(-1, Math.min(1, (e.x / cardW - 0.5) * 2)), { damping: 18, stiffness: 220 }));
      touchY.set(withSpring(Math.max(-1, Math.min(1, (e.y / cardH - 0.5) * 2)), { damping: 18, stiffness: 220 }));
    })
    .onFinalize(() => {
      touchX.set(withSpring(0, { damping: 14 }));
      touchY.set(withSpring(0, { damping: 14 }));
    });

  const mover = useAnimatedStyle(() => {
    const k = flip.get();
    const fedOut = interpolate(feed.get(), [0, 1], [-cardH - 4, HANG]);
    return {
      transform: [{ translateY: interpolate(k, [0, 1], [fedOut, restY]) }],
      shadowOpacity: interpolate(k, [0, 1], [0, 0.22]),
    };
  });
  const turner = useAnimatedStyle(() => {
    const k = flip.get();
    return {
      transform: [
        { perspective: 900 },
        { rotateY: `${interpolate(k, [0, 1], [180, 360]) + tiltX.get() * MAX_LEAN * k}deg` },
        { rotateX: `${-tiltY.get() * MAX_LEAN * k}deg` },
        { scale: interpolate(k, [0, 0.5, 1], [1, 1.07, 1]) },
      ],
    };
  });
  const faceUp = useAnimatedStyle(() => ({ opacity: flip.get() > 0.5 ? 1 : 0 }));
  const faceDown = useAnimatedStyle(() => ({ opacity: flip.get() > 0.5 ? 0 : 1 }));

  const habit: Habit = {
    id: `sample-${turn}`,
    name: sample.name,
    identity: null,
    floorLabel: sample.floor,
    ceilingLabel: sample.ceiling,
    twoMinuteLabel: null,
    color: sample.color,
    anchor: null,
    whenWhere: null,
    why: null,
    recipeKey: null,
    position: 0,
    startedOn: '',
    archivedAt: null,
  };

  const hint = !print
    ? 'Up for the Ceiling, down for the Floor.'
    : !revealed
      ? 'Printing today’s card.'
      : `${print.level === 'ceiling' ? 'Foil for a Ceiling.' : 'Matte for a Floor.'} Tilt the phone, or drag the card.`;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }}>
      <View style={{ paddingHorizontal: space.xl, gap: space.md }}>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ alignSelf: 'flex-start' }}>
          <Body weight="bold" color={t.textSecondary}>← Close</Body>
        </Pressable>
        <View style={{ gap: 4 }}>
          <Label>Sketch · sample cards</Label>
          <Display size={40}>Printed</Display>
        </View>
      </View>

      <View onLayout={onStage} style={{ flex: 1, marginHorizontal: space.xl, marginTop: space.lg }}>
        {stage ? (
          <>
            {/* Everything above the middle of the slot is hidden, so the card seems to come out of it. */}
            <View pointerEvents="box-none" style={{ position: 'absolute', top: SLOT / 2, left: 0, right: 0, bottom: 0, overflow: 'hidden', alignItems: 'center' }}>
              {print ? (
                <Animated.View style={[{ shadowColor: '#17121F', shadowRadius: 18, shadowOffset: { width: 0, height: 12 } }, mover]}>
                  <GestureDetector gesture={lean}>
                    <Animated.View style={turner}>
                      <Animated.View style={faceUp}>
                        <PrintedCard print={print} width={cardW} tiltX={shineX} tiltY={tiltY} />
                      </Animated.View>
                      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotateY: '180deg' }] }, faceDown]}>
                        <PrintedBack width={cardW} />
                      </Animated.View>
                    </Animated.View>
                  </GestureDetector>
                </Animated.View>
              ) : null}
            </View>

            <View pointerEvents="none" style={{ alignSelf: 'center', width: cardW + 44, height: SLOT, borderRadius: SLOT / 2, backgroundColor: t.cardBack, justifyContent: 'center' }}>
              <View style={{ marginHorizontal: 14, height: 2, borderRadius: 1, backgroundColor: t.onCardBack, opacity: 0.18 }} />
            </View>

            {!print ? (
              <View style={{ position: 'absolute', top: SLOT + space.lg, left: 0, right: 0, bottom: 0 }}>
                <SwipeCard key={turn} onSwipe={onSwipe} allow={{ up: true, down: true }} labels={{ up: 'CEILING', down: 'FLOOR' }}>
                  <HabitCard habit={habit} subtitle={`Swipe to print No. ${number}.`} />
                </SwipeCard>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={{ height: 92, paddingHorizontal: space.xl, justifyContent: 'flex-end', gap: space.md }}>
        <Body size={13} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }}>{hint}</Body>
        {revealed ? <Button label="Deal the next card" onPress={dealNext} /> : null}
      </View>
    </View>
  );
}
