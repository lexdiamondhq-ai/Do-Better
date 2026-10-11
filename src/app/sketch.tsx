import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { HabitCard } from '@/components/HabitCard';
import { IdentityStack, STACK_HEIGHT } from '@/components/printed/IdentityStack';
import { PRINT_ASPECT, PrintedBack, PrintedCard, type Print } from '@/components/printed/PrintedCard';
import { useTilt } from '@/components/printed/useTilt';
import { SwipeCard, type SwipeDirection } from '@/components/SwipeCard';
import { Body, Button, Display, Label } from '@/components/ui';
import { localDay } from '@/engine/day';
import { identityLevel, levelProgress } from '@/engine/identity';
import type { Level } from '@/engine/kept';
import type { Habit } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, space, type CardColor } from '@/theme/tokens';

/**
 * Made-up habits to print from, one in each card colour. `cards` is how many cards already say
 * who the habit makes you, set so that every second sample reaches a new rank. Nothing here is saved.
 */
const SAMPLES: { name: string; identity: string; floor: string; ceiling: string; color: CardColor; cards: number }[] = [
  { name: 'Read', identity: 'a reader', floor: '1 page', ceiling: '20 pages', color: 'sky', cards: 28 },
  { name: 'Walk', identity: 'someone who moves every day', floor: 'Walk to the corner', ceiling: '30-minute walk', color: 'tomato', cards: 29 },
  { name: 'Meditate', identity: 'a calm person', floor: '1 mindful breath', ceiling: '10 minutes', color: 'lilac', cards: 8 },
  { name: 'Save', identity: 'good with money', floor: 'Move $1 to savings', ceiling: 'Review the week’s spending', color: 'pine', cards: 9 },
  { name: 'Journal', identity: 'someone who reflects', floor: 'One line', ceiling: 'A full page', color: 'sun', cards: 61 },
  { name: 'Reach out', identity: 'a good friend', floor: 'Send one message', ceiling: 'Call someone you love', color: 'rose', cards: 99 },
];

const SLOT = 16;
const STACK_GAP = 14;
/** The card feeds out in short pushes, like paper leaving a printer. */
const PUSHES = 7;
const PUSH_MS = 100;
const PUSH_REST_MS = 35;
const FLIP_AFTER_MS = PUSHES * PUSH_MS + 120;
const FLIP_MS = 560;
const STAMP_AFTER_MS = FLIP_AFTER_MS + FLIP_MS + 140;
/** How far below the slot the card hangs once it is all the way out. */
const HANG = 14;
const MAX_LEAN = 9;
/** A landed card is this wide, and shows this much above the stack it sits behind. */
const SMALL = 52;
const PEEK = 22;
const DROP_MS = 520;

type Step = 'deal' | 'printing' | 'revealed' | 'landing' | 'landed';

/** Runs things a little later, and forgets whatever is still waiting when the screen closes. */
function useLater() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  return useCallback((ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms));
  }, []);
}

/**
 * A throwaway look at two moments. You swipe a habit, and a card for that day feeds out of the slot
 * and flips over: a Floor prints matte, a Ceiling prints foil that moves with the phone. Then the
 * card is stamped with who it makes you and drops onto that stack, which shows how far the next rank is.
 * `?auto=ceiling` or `?auto=floor` prints without a swipe, `land=1` drops the card too, `tx` and `ty`
 * hold a tilt, and `card` picks the sample, so it can be checked where there is no finger and no motion sensor.
 */
export default function Sketch() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ auto?: string; land?: string; tx?: string; ty?: string; card?: string }>();
  const auto: Level | null = params.auto === 'floor' || params.auto === 'ceiling' ? params.auto : null;
  const autoLand = !!params.land;
  const heldX = Number(params.tx) || 0;
  const heldY = Number(params.ty) || 0;

  const [turn, setTurn] = useState(() => Number(params.card) || 0);
  const [print, setPrint] = useState<Print | null>(null);
  const [step, setStep] = useState<Step>('deal');
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const later = useLater();

  const sample = SAMPLES[turn % SAMPLES.length];
  const c = cardColors[sample.color];
  const count = step === 'landed' ? sample.cards + 1 : sample.cards;
  const rankedUp = step === 'landed' && identityLevel(sample.cards + 1).key !== identityLevel(sample.cards).key;

  const feed = useSharedValue(0);
  const flip = useSharedValue(0);
  const sweep = useSharedValue(0);
  const stamp = useSharedValue(0);
  const drop = useSharedValue(0);
  const dropping = useSharedValue(false);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const fill = useSharedValue(levelProgress(sample.cards));
  const pop = useSharedValue(1);
  const phone = useTilt();
  // Moving the card under your finger leans it, the same way tilting the phone does.
  const tiltX = useDerivedValue(() => Math.max(-1, Math.min(1, phone.x.get() + dragX.get() / 70 + heldX)));
  const tiltY = useDerivedValue(() => Math.max(-1, Math.min(1, phone.y.get() + dragY.get() / 110 + heldY)));
  const shineX = useDerivedValue(() => tiltX.get() + sweep.get());

  // The stage holds the slot and the card above, and the stack along the bottom.
  const room = stage ? stage.h - STACK_HEIGHT - STACK_GAP : 0;
  const cardW = stage ? Math.floor(Math.min(stage.w - 56, (room - SLOT - 44) * PRINT_ASPECT, 300)) : 0;
  const cardH = cardW / PRINT_ASPECT;
  const restY = stage ? (room - SLOT / 2 - cardH) / 2 + 6 : 0;
  const small = cardW ? SMALL / cardW : 1;
  const smallH = SMALL / PRINT_ASPECT;
  const stackTop = stage ? stage.h - STACK_HEIGHT : 0;
  const landX = stage ? 112 - stage.w / 2 : 0;
  const landY = stackTop - SLOT / 2 - PEEK + smallH / 2 - cardH / 2;

  function startPrint(level: Level) {
    const foil = level === 'ceiling';
    setPrint({
      name: sample.name,
      did: foil ? sample.ceiling : sample.floor,
      level,
      color: sample.color,
      number: sample.cards + 1,
      day: localDay(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
      identity: sample.identity,
    });
    setStep('printing');
    dropping.set(false);
    flip.set(0);
    stamp.set(0);
    drop.set(0);
    dragX.set(0);
    dragY.set(0);
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
    stamp.set(withDelay(STAMP_AFTER_MS, withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) })));

    for (let i = 0; i < PUSHES; i++) later(i * PUSH_MS, () => Haptics.selectionAsync());
    later(FLIP_AFTER_MS + FLIP_MS / 2, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    later(FLIP_AFTER_MS + FLIP_MS, () => {
      if (foil) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
    later(STAMP_AFTER_MS + 110, () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      setStep('revealed');
    });
  }

  /** Drops the printed card onto its stack. The bar fills first when the card reaches a new rank. */
  function land() {
    if (dropping.get()) return;
    dropping.set(true);
    setStep('landing');
    const after = sample.cards + 1;
    const newRank = identityLevel(after).key !== identityLevel(sample.cards).key;
    drop.set(withTiming(1, { duration: DROP_MS, easing: Easing.inOut(Easing.cubic) }));
    later(DROP_MS - 80, () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (newRank) {
        fill.set(withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
        return;
      }
      setStep('landed');
      fill.set(withTiming(levelProgress(after), { duration: 500, easing: Easing.out(Easing.cubic) }));
    });
    if (newRank) {
      later(DROP_MS + 280, () => {
        setStep('landed');
        fill.set(levelProgress(after));
        pop.set(withSequence(withTiming(1.05, { duration: 140 }), withSpring(1, { damping: 10 })));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      });
    }
  }

  const autoPrint = useEffectEvent(() => {
    if (!auto) return;
    startPrint(auto);
    if (autoLand) later(STAMP_AFTER_MS + 1300, land);
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
    fill.set(levelProgress(SAMPLES[(turn + 1) % SAMPLES.length].cards));
    setPrint(null);
    setStep('deal');
    setTurn((n) => n + 1);
  }

  function onStage(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setStage((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
  }

  // The printed card follows the finger. Let go low enough, or flick it down, and it drops onto the stack.
  const hold = Gesture.Pan()
    .enabled(step === 'revealed')
    .onUpdate((e) => {
      dragX.set(Math.max(-44, Math.min(44, e.translationX * 0.6)));
      dragY.set(e.translationY > 0 ? e.translationY : e.translationY * 0.3);
    })
    .onEnd((e) => {
      if (dragY.get() > 90 || e.velocityY > 900) {
        scheduleOnRN(land);
        return;
      }
      dragX.set(withSpring(0, { damping: 16 }));
      dragY.set(withSpring(0, { damping: 16 }));
    });

  const mover = useAnimatedStyle(() => {
    const k = flip.get();
    const d = drop.get();
    const fedOut = interpolate(feed.get(), [0, 1], [-cardH - 4, HANG]);
    const held = interpolate(k, [0, 1], [fedOut, restY]) + dragY.get();
    return {
      transform: [
        { translateX: interpolate(d, [0, 1], [dragX.get(), landX]) },
        { translateY: interpolate(d, [0, 1], [held, landY]) },
        { rotate: `${interpolate(d, [0, 1], [dragX.get() * 0.05, -4])}deg` },
        { scale: interpolate(d, [0, 1], [1, small]) },
      ],
      shadowOpacity: interpolate(k, [0, 1], [0, 0.22]) * (1 - d),
    };
  });
  const turner = useAnimatedStyle(() => {
    const k = flip.get();
    const lean = MAX_LEAN * k * (1 - drop.get());
    return {
      transform: [
        { perspective: 900 },
        { rotateY: `${interpolate(k, [0, 1], [180, 360]) + tiltX.get() * lean}deg` },
        { rotateX: `${-tiltY.get() * lean}deg` },
        { scale: interpolate(k, [0, 0.5, 1], [1, 1.07, 1]) },
      ],
    };
  });
  const faceUp = useAnimatedStyle(() => ({ opacity: flip.get() > 0.5 ? 1 : 0 }));
  const faceDown = useAnimatedStyle(() => ({ opacity: flip.get() > 0.5 ? 0 : 1 }));

  const habit: Habit = {
    id: `sample-${turn}`,
    name: sample.name,
    identity: sample.identity,
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

  const hint =
    step === 'deal'
      ? 'Up for the Ceiling, down for the Floor.'
      : step === 'printing'
        ? 'Printing today’s card.'
        : step === 'revealed'
          ? 'Tilt it to see the finish. Swipe it down to stack it.'
          : step === 'landing'
            ? ' '
            : rankedUp
              ? `New rank: ${identityLevel(count).label}.`
              : `${count} cards say I’m ${sample.identity}.`;

  // Two cards already on the stack, showing above it the way the landed one will.
  const earlier = [
    { x: 44, lift: PEEK - 5, turn: '-7deg', color: c.soft },
    { x: 78, lift: PEEK - 1, turn: '5deg', color: c.bg },
  ];

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
            {earlier.map((e) => (
              <View
                key={e.x}
                pointerEvents="none"
                style={{ position: 'absolute', left: e.x - SMALL / 2, top: stackTop - e.lift, width: SMALL, height: smallH, borderRadius: 5, backgroundColor: e.color, borderWidth: 1, borderColor: t.border, transform: [{ rotate: e.turn }] }}
              />
            ))}

            {/* Everything above the middle of the slot is hidden, so the card seems to come out of it. */}
            <View pointerEvents="box-none" style={{ position: 'absolute', top: SLOT / 2, left: -space.xl, right: -space.xl, bottom: 0, overflow: 'hidden', alignItems: 'center' }}>
              {print ? (
                <Animated.View style={[{ shadowColor: '#17121F', shadowRadius: 18, shadowOffset: { width: 0, height: 12 } }, mover]}>
                  <GestureDetector gesture={hold}>
                    <Animated.View style={turner}>
                      <Animated.View style={faceUp}>
                        <PrintedCard print={print} width={cardW} tiltX={shineX} tiltY={tiltY} stamp={stamp} />
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

            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
              <IdentityStack identity={sample.identity} color={sample.color} count={count} fill={fill} pop={pop} />
            </View>

            {!print ? (
              <View style={{ position: 'absolute', top: SLOT + space.lg, left: 0, right: 0, bottom: STACK_HEIGHT + STACK_GAP }}>
                <SwipeCard key={turn} onSwipe={onSwipe} allow={{ up: true, down: true }} labels={{ up: 'CEILING', down: 'FLOOR' }}>
                  <HabitCard habit={habit} subtitle={`Swipe to print No. ${sample.cards + 1}.`} />
                </SwipeCard>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={{ height: 104, paddingHorizontal: space.xl, justifyContent: 'flex-end', gap: space.md }}>
        <Body size={13} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }}>{hint}</Body>
        {step === 'revealed' ? <Button label="Add it to the stack" onPress={land} /> : null}
        {step === 'landed' ? <Button label="Deal the next card" onPress={dealNext} /> : null}
      </View>
    </View>
  );
}
