import { useEffect, useImperativeHandle, useState, type PropsWithChildren, type ReactNode, type Ref } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type AccessibilityActionEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import * as feel from '@/lib/feel';
import { fontScale, fonts, INK, radius } from '@/theme/tokens';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/** Sends the card on its way from a button or a key: the same exit, sound and haptics as a swipe. */
export type Fling = (dir: SwipeDirection, opts?: { note?: string; tag?: string }) => void;
export type SwipeHandle = { fling: Fling };

/** How far a card has to travel before letting go counts. */
export const DISTANCE = 110;
/** A flick this fast counts even when it is short. */
const VELOCITY = 900;
/** How far toward the front the cards behind come while the front card is pulled all the way. */
export const LIFT = 0.6;

const SPRING = { damping: 17, stiffness: 190, mass: 0.9 };

/** Where a card `depth` places back in the deck sits: a little higher, smaller and turned. 0 is the front. */
export function deckPose(depth: number) {
  'worklet';
  return {
    translateY: -11 * depth,
    scale: 1 - 0.055 * depth,
    rotate: interpolate(depth, [0, 1, 2, 3], [-1.2, 3.4, -4.4, 2.6], 'clamp'),
  };
}

/** Past this, a blocked direction gives a little and then holds, so the card says no without a word. */
function resist(d: number) {
  'worklet';
  return Math.sign(d) * Math.pow(Math.abs(d), 0.7);
}

type Allow = Partial<Record<SwipeDirection, boolean>>;

/**
 * The front card of the deck. Drag it up, down or sideways; past the line it commits at once
 * (`onCommit`: play the sound, keep the day), leaves with the speed of the throw, and reports when it
 * has gone (`onGone`, and the older `onSwipe`). A Floor presses into the table and drops, a Ceiling
 * lifts and sails up, later slides off the side. Let go early and it springs back. A blocked way gives a
 * little and holds, and shows no stamp.
 *
 * `pull` (0 to 1) tells the screen how close the card is to going, so the cards behind it and the
 * table can move with the finger. `from` is the depth it starts at, for a card that was just behind;
 * `appear="flip"` turns it over into place instead. A `ghost` is a card that has already been played
 * and is only finishing its exit: it takes no touches. Every swipe is also an accessibility action,
 * and `fling` lets a button do the same. Remount it with a new key for the next card.
 */
export function SwipeCard({
  ref,
  children,
  onCommit,
  onGone,
  onSwipe,
  allow = { up: true, down: true, left: true, right: true },
  labels = {},
  actions,
  ink = INK,
  wash = 'rgba(255,255,255,0.92)',
  pull,
  from = 0,
  appear = 'deal',
  ghost = false,
  label,
  testID,
}: PropsWithChildren<{
  ref?: Ref<SwipeHandle>;
  onCommit?: (dir: SwipeDirection, tag?: string) => void;
  onGone?: (dir: SwipeDirection) => void;
  onSwipe?: (dir: SwipeDirection) => void;
  allow?: Allow;
  /** The stamp that shows while dragging each way, such as FLOOR. Only allowed ways show one. */
  labels?: Partial<Record<SwipeDirection, string>>;
  /** What VoiceOver offers for each way, such as "Keep the Floor". Defaults to the stamps. */
  actions?: Partial<Record<SwipeDirection, string>>;
  /** The stamp's ink and the wash behind it, usually the card's own ink and colour. */
  ink?: string;
  wash?: string;
  pull?: SharedValue<number>;
  from?: number;
  appear?: 'deal' | 'flip';
  ghost?: boolean;
  /** What the card is, read out with its actions. */
  label?: string;
  testID?: string;
}>) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);
  const spin = useSharedValue(0);
  const fade = useSharedValue(1);
  const depth = useSharedValue(appear === 'deal' ? from : 0);
  const turn = useSharedValue(appear === 'flip' ? 1 : 0);
  // Once a card commits it ignores every touch: it can only leave.
  const gone = useSharedValue(false);
  const own = useSharedValue(0);
  const noteIn = useSharedValue(0);
  const [note, setNote] = useState<string | null>(null);
  const p = pull ?? own;
  const up = !!allow.up;
  const down = !!allow.down;
  const left = !!allow.left;
  const right = !!allow.right;

  useEffect(() => {
    if (appear === 'flip') turn.set(withTiming(0, { duration: reduced ? 160 : 420, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }));
    else if (from) depth.set(withSpring(0, { ...SPRING, reduceMotion: ReduceMotion.System }));
  }, [appear, depth, from, reduced, turn]);

  /** How close the card is to counting, 0 to 1, along whichever allowed way it is going. */
  const progress = (dx: number, dy: number) => {
    'worklet';
    const along = (d: number) => Math.min(1, Math.max(0, d / DISTANCE));
    const vertical = Math.abs(dy) >= Math.abs(dx);
    if (vertical) return dy < 0 ? (up ? along(-dy) : 0) : down ? along(dy) : 0;
    return dx < 0 ? (left ? along(-dx) : 0) : right ? along(dx) : 0;
  };

  const report = (dir: SwipeDirection) => {
    if (onGone) onGone(dir);
    if (onSwipe) onSwipe(dir);
  };

  const commit = (dir: SwipeDirection, tag?: string) => {
    if (onCommit) onCommit(dir, tag);
  };

  const exit = (dir: SwipeDirection, vx: number, vy: number, tag?: string) => {
    'worklet';
    gone.set(true);
    scheduleOnRN(commit, dir, tag);
    // The deck behind comes forward as this one goes.
    p.set(withTiming(1, { duration: 180, reduceMotion: ReduceMotion.Never }));
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(report, dir);
    };
    if (reduced) {
      // A short fade a little way in the direction chosen, nothing flying.
      const step = 28;
      const dx = dir === 'left' ? -step : dir === 'right' ? step : 0;
      const dy = dir === 'up' ? -step : dir === 'down' ? step : 0;
      const quick = { duration: 200, reduceMotion: ReduceMotion.Never };
      x.set(withTiming(x.get() + dx, quick));
      y.set(withTiming(y.get() + dy, quick));
      fade.set(withTiming(0, quick, done));
      return;
    }
    const off = { reduceMotion: ReduceMotion.Never };
    const sx = x.get();
    const sy = y.get();
    const side = Math.sign(vx || sx || 1);
    if (dir === 'up' || dir === 'down') {
      const target = dir === 'up' ? -(height + 240) : height + 240;
      const speed = Math.abs(vy);
      const thrown = speed > 1600;
      const duration = thrown ? Math.min(380, Math.max(170, (Math.abs(target - sy) / speed) * 1000)) : dir === 'up' ? 440 : 400;
      const easing = thrown ? Easing.linear : Easing.in(Easing.cubic);
      x.set(withTiming(sx + (vx * duration) / 2600, { duration, easing, ...off }));
      if (dir === 'up') {
        // A Ceiling lifts toward you, then sails up and away. A throw keeps its speed.
        scale.set(withTiming(1.12, { duration: Math.min(duration, 260), easing: Easing.out(Easing.quad), ...off }));
        spin.set(withTiming(side * 14, { duration, ...off }));
        y.set(thrown ? withTiming(target, { duration, easing, ...off }, done) : withSequence(withTiming(sy - 22, { duration: 110, easing: Easing.out(Easing.quad), ...off }), withTiming(target, { duration, easing, ...off }, done)));
      } else {
        // A Floor presses into the table with a thud, then drops.
        scale.set(withSequence(withTiming(0.93, { duration: 90, ...off }), withTiming(0.98, { duration, ...off })));
        spin.set(withTiming(side * 7, { duration, ...off }));
        y.set(thrown ? withTiming(target, { duration, easing, ...off }, done) : withSequence(withTiming(sy + 16, { duration: 90, ...off }), withTiming(target, { duration, easing, ...off }, done)));
      }
    } else {
      // Later: it slides off the side, turning, toward the back of the deck.
      const target = dir === 'left' ? -(width + 200) : width + 200;
      const speed = Math.abs(vx);
      const thrown = speed > 1600;
      const duration = thrown ? Math.min(340, Math.max(160, (Math.abs(target - sx) / speed) * 1000)) : 340;
      const easing = thrown ? Easing.linear : Easing.in(Easing.quad);
      scale.set(withTiming(0.9, { duration, ...off }));
      spin.set(withTiming((dir === 'left' ? -1 : 1) * 16, { duration, ...off }));
      y.set(withTiming(sy + (vy * duration) / 2400 + 30, { duration, ...off }));
      x.set(withTiming(target, { duration, easing, ...off }, done));
    }
  };

  const fling: Fling = (dir, opts) => {
    if (opts?.note) {
      setNote(opts.note);
      noteIn.set(withTiming(1, { duration: 140, reduceMotion: ReduceMotion.Never }));
    }
    const tag = opts?.tag;
    scheduleOnUI(() => {
      'worklet';
      if (gone.get()) return;
      exit(dir, 0, 0, tag);
    });
  };

  useImperativeHandle(ref, () => ({ fling }));

  const pan = Gesture.Pan()
    .enabled(!ghost)
    .minDistance(8)
    .onUpdate((e) => {
      if (gone.get()) return;
      const dx = e.translationX;
      const dy = e.translationY;
      x.set((dx < 0 ? left : right) ? dx : resist(dx));
      y.set((dy < 0 ? up : down) ? dy : resist(dy));
      p.set(progress(x.get(), y.get()));
    })
    .onEnd((e) => {
      if (gone.get()) return;
      const dx = x.get();
      const dy = y.get();
      const vx = e.velocityX;
      const vy = e.velocityY;
      const fast = Math.hypot(vx, vy) > VELOCITY;
      // A fast flick goes the way it was flicked; a slow drag goes the way it was dragged.
      const vertical = fast ? Math.abs(vy) > Math.abs(vx) : Math.abs(dy) > Math.abs(dx);
      let dir: SwipeDirection | null = null;
      if (vertical) {
        const d: SwipeDirection = (fast ? vy : dy) < 0 ? 'up' : 'down';
        const way = d === 'up' ? -1 : 1;
        const ok = d === 'up' ? up : down;
        if (ok && (dy * way > DISTANCE || (fast && vy * way > VELOCITY && dy * way > 24))) dir = d;
      } else {
        const d: SwipeDirection = (fast ? vx : dx) < 0 ? 'left' : 'right';
        const way = d === 'left' ? -1 : 1;
        const ok = d === 'left' ? left : right;
        if (ok && (dx * way > DISTANCE || (fast && vx * way > VELOCITY && dx * way > 24))) dir = d;
      }
      if (dir) {
        exit(dir, vx, vy, 'swipe');
        return;
      }
      x.set(withSpring(0, { ...SPRING, velocity: vx }));
      y.set(withSpring(0, { ...SPRING, velocity: vy }));
      p.set(withSpring(0, SPRING));
    });

  // A light tap in the hand as the card crosses the line, and a softer one if it is pulled back.
  useAnimatedReaction(
    () => !gone.get() && progress(x.get(), y.get()) >= 1,
    (armed, was) => {
      if (was === null || armed === was) return;
      scheduleOnRN(armed ? feel.arm : feel.disarm);
    },
  );

  const card = useAnimatedStyle(() => {
    const pose = deckPose(depth.get());
    const tilt = reduced ? 0 : x.get() / 18;
    const t = turn.get();
    return {
      opacity: fade.get(),
      transform: [
        { perspective: 900 },
        { translateX: x.get() },
        { translateY: y.get() + pose.translateY },
        { rotate: `${pose.rotate + tilt + spin.get()}deg` },
        { rotateY: `${t * 90}deg` },
        { scale: scale.get() * pose.scale },
      ],
    };
  });

  const stamp = (dir: SwipeDirection) => {
    'worklet';
    const dx = x.get();
    const dy = y.get();
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const along = dir === 'up' ? (vertical ? -dy : 0) : dir === 'down' ? (vertical ? dy : 0) : dir === 'left' ? (vertical ? 0 : -dx) : vertical ? 0 : dx;
    return interpolate(along, [24, DISTANCE], [0, 1], 'clamp') * (1 - noteIn.get());
  };
  // Each stamp comes from the edge its way leads to: the Ceiling drops from the top, the Floor rises from the bottom.
  const upStyle = useAnimatedStyle(() => ({ opacity: stamp('up'), transform: [{ translateY: -14 * (1 - stamp('up')) }, { rotate: '-9deg' }, { scale: 0.84 + 0.16 * stamp('up') }] }));
  const downStyle = useAnimatedStyle(() => ({ opacity: stamp('down'), transform: [{ translateY: 14 * (1 - stamp('down')) }, { rotate: '7deg' }, { scale: 0.84 + 0.16 * stamp('down') }] }));
  const leftStyle = useAnimatedStyle(() => ({ opacity: stamp('left'), transform: [{ rotate: '-12deg' }, { scale: 0.84 + 0.16 * stamp('left') }] }));
  const rightStyle = useAnimatedStyle(() => ({ opacity: stamp('right'), transform: [{ rotate: '12deg' }, { scale: 0.84 + 0.16 * stamp('right') }] }));
  const noteStyle = useAnimatedStyle(() => ({ opacity: noteIn.get(), transform: [{ rotate: '-6deg' }, { scale: 0.8 + 0.2 * noteIn.get() }] }));

  const ways: { dir: SwipeDirection; style: typeof upStyle; at: ViewStyle }[] = [
    { dir: 'up', style: upStyle, at: { top: '30%', alignSelf: 'center' } },
    { dir: 'down', style: downStyle, at: { top: '30%', alignSelf: 'center' } },
    { dir: 'left', style: leftStyle, at: { top: '34%', right: 18 } },
    { dir: 'right', style: rightStyle, at: { top: '34%', left: 18 } },
  ];
  const offered = (['up', 'down', 'left', 'right'] as const).filter((d) => allow[d] && (actions?.[d] ?? labels[d]));
  const onAction = (e: AccessibilityActionEvent) => {
    const dir = e.nativeEvent.actionName as SwipeDirection;
    if (offered.includes(dir)) fling(dir, { tag: 'action' });
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID={testID}
        pointerEvents={ghost ? 'none' : 'auto'}
        aria-hidden={ghost || undefined}
        importantForAccessibility={ghost ? 'no-hide-descendants' : 'auto'}
        style={[StyleSheet.absoluteFill, card]}
        accessibilityLabel={ghost ? undefined : label}
        accessibilityActions={ghost ? undefined : offered.map((d) => ({ name: d, label: actions?.[d] ?? labels[d] }))}
        onAccessibilityAction={ghost ? undefined : onAction}
      >
        {children}
        {ways.map(({ dir, style, at }) =>
          allow[dir] && labels[dir] ? (
            <Animated.View
              key={dir}
              pointerEvents="none"
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.stamp, at, { borderColor: ink, backgroundColor: wash }, style]}
            >
              <Text allowFontScaling={false} style={[styles.stampText, { color: ink }]}>
                {labels[dir]}
              </Text>
            </Animated.View>
          ) : null,
        )}
        {note ? (
          <Animated.View
            pointerEvents="none"
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.stamp, styles.note, { top: '32%', borderColor: ink, backgroundColor: wash }, noteStyle]}
          >
            <Text allowFontScaling={false} style={[styles.noteText, { color: ink }]}>
              {note}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * A card waiting behind the front one. It moves up the deck as the front card is pulled away, and
 * glides to its new place when the deck moves on. Purely a picture: no touches, nothing read out.
 */
export function DeckCard({ depth, pull, children }: PropsWithChildren<{ depth: number; pull: SharedValue<number> }>) {
  const reduced = useReducedMotion();
  const at = useSharedValue(depth + 1);
  const shown = useSharedValue(0);

  useEffect(() => {
    // Take up any pull the deck had, so the card carries on from where it was drawn.
    at.set(Math.max(depth, at.get() - LIFT * pull.get()));
    at.set(withSpring(depth, { ...SPRING, reduceMotion: ReduceMotion.System }));
    shown.set(withTiming(1, { duration: reduced ? 120 : 260, reduceMotion: ReduceMotion.Never }));
  }, [at, depth, pull, reduced, shown]);

  const style = useAnimatedStyle(() => {
    const d = Math.max(0, at.get() - LIFT * pull.get());
    const pose = deckPose(d);
    return {
      opacity: shown.get(),
      transform: [{ translateY: pose.translateY }, { rotate: `${pose.rotate}deg` }, { scale: pose.scale }],
    };
  });

  return (
    <Animated.View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  );
}

/**
 * A button on a swipeable card. A tap presses it; a drag that starts on it moves the card instead.
 * At least 44 points, read out as a button, and pressable from VoiceOver and the keyboard.
 */
export function CardButton({
  onPress,
  label,
  hint,
  style,
  pressedScale = 0.96,
  children,
  testID,
}: {
  onPress: () => void;
  label: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  children: ReactNode;
  testID?: string;
}) {
  const down = useSharedValue(0);
  const tap = Gesture.Tap()
    .maxDistance(10)
    .onBegin(() => {
      down.set(withTiming(1, { duration: 70 }));
    })
    .onFinalize((_e, success) => {
      down.set(withTiming(0, { duration: 160 }));
      if (success) scheduleOnRN(onPress);
    });
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - pressedScale) * down.get() }], opacity: 1 - 0.15 * down.get() }));
  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate') onPress();
        }}
        style={[{ minHeight: 44, minWidth: 44 }, style, pressed]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/** Fills its parent; for laying a card face inside a SwipeCard or a DeckCard. */
export function CardFill({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[StyleSheet.absoluteFill, { borderRadius: radius.card }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  stamp: {
    position: 'absolute',
    borderWidth: 3.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  stampText: {
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: 1.5,
  },
  note: {
    alignSelf: 'center',
    maxWidth: '82%',
    paddingVertical: 10,
  },
  noteText: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    textAlign: 'center',
  },
});

/** Text on a card face never grows past this with the phone's text size; the card itself can't grow. */
export const CARD_TEXT_SCALE = fontScale.chrome;
