import { createContext, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type PropsWithChildren, type ReactNode, type Ref, type RefObject } from 'react';
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
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { comebackExit, LIGHT_SOLID, lightOrigin, lightReach, turnNote, type Point } from '@/engine/comeback';
import { densityFor } from '@/engine/today';
import type { Grip } from '@/engine/wear';
import * as feel from '@/lib/feel';
import { withAlpha } from '@/theme/color';
import { fontScale, fonts, INK, radius } from '@/theme/tokens';

import { Burst } from './Burst';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/**
 * What a commit knows about the hand that made it: `grip`, where the thumb took the card (0..1 across and
 * down its face, on swipes only), and `at`, the card's centre in window coordinates as it went.
 */
export type CommitInfo = { grip?: Grip; at?: Point };

/**
 * Sends the card on its way from a button or a key: the same exit, sound and haptics as a swipe.
 * `turnover` is where a Comeback card's warm light starts (Done it's centre), for a card with a `backFace`.
 */
export type Fling = (dir: SwipeDirection, opts?: { note?: string; tag?: string; turnover?: Point }) => void;
export type SwipeHandle = { fling: Fling };

/** The bright side a dark card turns to: its colour, its ink and its soft tint. */
export type TurnFace = { bg: string; ink: string; soft: string };

/** The light's circle on the card face, in the card's own coordinates. */
type Glow = { x: number; y: number; r: number };

/**
 * What a card that turns over shares with the face inside it. The dark face draws the warm light
 * (`TurnLight`) and says what its bright side looks like; Done it says where it is, so a key press can
 * start the light from it; a button says where the finger was.
 */
type Turnover = {
  light: SharedValue<number>;
  glow: SharedValue<Glow>;
  setFace: (face: TurnFace) => void;
  setDone: (button: RefObject<View | null> | null) => void;
  noteTap: (at: Point) => void;
};

const TurnContext = createContext<Turnover | null>(null);

/** The card this face is turning on, when it is the front of the deck. Null anywhere else. */
export function useTurnover(): Turnover | null {
  return useContext(TurnContext);
}

/** The bright side's density, so it matches the deck's other cards on a short screen. */
const BackDensity = createContext<{ compact: boolean } | null>(null);

/** Whether the card face is drawn inside a turnover's bright side, and at what density. */
export function useBackDensity(): { compact: boolean } | null {
  return useContext(BackDensity);
}

/** A tap counts as the finger behind a fling this soon after it. */
const TAP_FRESH_MS = 800;

/**
 * The turnover's warm light: a disc in the card's own colour that grows from where the light starts until
 * it covers the face. Drawn by the dark face, under its words, and clipped by it. Nothing on any other card.
 */
export function TurnLight({ color }: { color: string }) {
  const turnover = useTurnover();
  return turnover ? <Light turnover={turnover} color={color} /> : null;
}

function Light({ turnover, color }: { turnover: Turnover; color: string }) {
  const id = `light${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { light, glow } = turnover;
  const style = useAnimatedStyle(() => {
    const g = glow.get();
    const l = light.get();
    return {
      opacity: l > 0 ? 1 : 0,
      left: g.x - g.r,
      top: g.y - g.r,
      width: g.r * 2,
      height: g.r * 2,
      transform: [{ scale: Math.max(0.001, l) }],
    };
  });
  return (
    <Animated.View pointerEvents="none" aria-hidden style={[{ position: 'absolute' }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={id} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset={String(LIGHT_SOLID)} stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** How far a card has to travel before letting go counts. */
export const DISTANCE = 110;
/** A flick this fast counts even when it is short. */
const VELOCITY = 900;
/** How far toward the front the cards behind come while the front card is pulled all the way. */
export const LIFT = 0.6;
/**
 * A card just dealt to the front ignores taps on its buttons this long, so the second tap of a double tap
 * on Floor can't keep the next card too. Swipes, keys and VoiceOver actions work at once: each is its own act.
 */
export const SETTLE_MS = 400;

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
  backFace,
}: PropsWithChildren<{
  ref?: Ref<SwipeHandle>;
  /** Fires at the first frame of the exit. `info` is filled in by stream 2 (grip and centre). */
  onCommit?: (dir: SwipeDirection, tag?: string, info?: CommitInfo) => void;
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
  /**
   * The bright side a Comeback card turns to as it leaves, for the way it went. With it, a keep up or down
   * runs the turnover: warm light spreads from the finger, the card turns over to this side, holds while
   * it bursts, then leaves the normal way. Mounted only during the exit.
   */
  backFace?: (dir: SwipeDirection) => ReactNode;
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
  const [settled, setSettled] = useState(false);
  const p = pull ?? own;
  const up = !!allow.up;
  const down = !!allow.down;
  const left = !!allow.left;
  const right = !!allow.right;

  // The turnover ---------------------------------------------------------------------------------------
  const turns = !!backFace;
  const timing = comebackExit({ firstMove: false, reduced });
  // The card's size, and where it sits in the window at rest, for the grip, the centre and the light.
  const cardW = useSharedValue(0);
  const cardH = useSharedValue(0);
  const rest = useSharedValue<Point | null>(null);
  const grip = useSharedValue<Grip | null>(null);
  // Where a button or key asked the light to start, on the card, for the exit about to run.
  const asked = useSharedValue<Point | null>(null);
  const doneAt = useSharedValue<Point | null>(null);
  const light = useSharedValue(0);
  const glow = useSharedValue<Glow>({ x: 0, y: 0, r: 0 });
  const cross = useSharedValue(0);
  const lifting = useSharedValue(0);
  const slam = useSharedValue(0);
  const wait = useSharedValue(0);
  // While it turns, the card holds both its sides as they were when it was kept, so nothing on it reflows
  // as the day it just kept updates the screen behind it.
  const [turning, setTurning] = useState<{ dir: 'up' | 'down'; face: TurnFace | null; compact: boolean; front: ReactNode; back: ReactNode } | null>(null);
  const [burst, setBurst] = useState(false);
  const view = useRef<View>(null);
  const face = useSharedValue<TurnFace | null>(null);
  const doneButton = useRef<RefObject<View | null> | null>(null);
  const tap = useRef<(Point & { at: number }) | null>(null);

  const turnover = useMemo<Turnover>(
    () => ({
      light,
      glow,
      setFace: (f) => {
        face.set(f);
      },
      setDone: (button) => {
        doneButton.current = button;
      },
      noteTap: (at) => {
        tap.current = { ...at, at: Date.now() };
      },
    }),
    [light, glow, face],
  );

  /** Where the card and its Done it sit in the window, measured once it is still. */
  const measure = () => {
    view.current?.measureInWindow((x, y, w, h) => {
      if (!w || !h) return;
      const centre = { x: x + w / 2, y: y + h / 2 };
      rest.set(centre);
      doneButton.current?.current?.measureInWindow((dx, dy, dw, dh) => {
        if (dw && dh) doneAt.set(toCard({ x: dx + dw / 2, y: dy + dh / 2 }, centre));
      });
    });
  };

  /** A window point on the card face, from the card's centre at rest and its own size. */
  const toCard = (at: Point, centre: Point): Point => ({ x: at.x - (centre.x - cardW.get() / 2), y: at.y - (centre.y - cardH.get() / 2) });

  useEffect(() => {
    if (ghost) return;
    const id = setTimeout(() => {
      setSettled(true);
      measure();
    }, SETTLE_MS);
    return () => clearTimeout(id);
    // `measure` only reads refs and sets shared values when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost]);

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

  const commit = (dir: SwipeDirection, tag?: string, info?: CommitInfo) => {
    if (onCommit) onCommit(dir, tag, info);
  };

  /** The bright side comes in under the turning card: mounted now, shown once the card is past its edge. */
  const beginTurn = (dir: 'up' | 'down') => {
    const h = cardH.get();
    const compact = densityFor({ cardHeight: h || height, windowHeight: height, fontScale: 1, screenReader: false }).mode === 'compact';
    setTurning({ dir, face: face.get(), compact, front: children, back: backFace?.(dir) ?? null });
    setNote((n) => turnNote(dir, n));
  };

  // Worklets capture what they call when they are made, so each comes after the ones it calls.
  /** The card leaves the way it went: a Floor drops, a Ceiling sails up, later slides off the side. */
  const leave = (dir: SwipeDirection, vx: number, vy: number) => {
    'worklet';
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

  /**
   * A kept Comeback card turns back over in your hand: it comes back to rest as warm light in its own colour
   * spreads from the finger (or the edge it was swiped toward), turns to its bright side, holds while it
   * bursts and its note lands, then leaves the normal way. With Reduce Motion it crossfades in place.
   */
  const turnOver = (dir: 'up' | 'down', tag?: string) => {
    'worklet';
    const w = cardW.get();
    const h = cardH.get();
    const g = grip.get();
    const origin = lightOrigin({ w, h, dir, at: asked.get(), x: tag === 'swipe' && g ? g.x * w : null });
    asked.set(null);
    glow.set({ x: origin.x, y: origin.y, r: lightReach(origin, w, h) });
    const never = { reduceMotion: ReduceMotion.Never };
    const hold = () => {
      'worklet';
      scheduleOnRN(setBurst, true);
      slam.set(1);
      noteIn.set(withSpring(1, { damping: 13, stiffness: 320, mass: 0.7, ...never }));
      wait.set(
        withDelay(
          timing.holdMs,
          withTiming(1, { duration: 1, ...never }, (finished) => {
            'worklet';
            if (finished) leave(dir, 0, 0);
          }),
        ),
      );
    };
    if (reduced) {
      cross.set(
        withTiming(1, { duration: timing.crossfadeMs, ...never }, (finished) => {
          'worklet';
          if (finished) hold();
        }),
      );
      return;
    }
    // Back into the hand, so it turns where you can see it.
    const settle = { damping: 20, stiffness: 240, mass: 0.8, ...never };
    x.set(withSpring(0, settle));
    y.set(withSpring(0, settle));
    spin.set(withSpring(0, settle));
    scale.set(withSpring(1, settle));
    lifting.set(1);
    light.set(0);
    light.set(withTiming(1, { duration: timing.lightMs, easing: Easing.out(Easing.cubic), ...never }));
    turn.set(0);
    turn.set(
      withDelay(
        timing.lightMs,
        withTiming(2, { duration: timing.flipMs, easing: Easing.inOut(Easing.cubic), ...never }, (finished) => {
          'worklet';
          if (finished) hold();
        }),
      ),
    );
  };

  const exit = (dir: SwipeDirection, vx: number, vy: number, tag?: string) => {
    'worklet';
    gone.set(true);
    const centre = rest.get();
    const info: CommitInfo = { at: centre ? { x: centre.x + x.get(), y: centre.y + y.get() } : undefined, grip: tag === 'swipe' ? (grip.get() ?? undefined) : undefined };
    if (turns && (dir === 'up' || dir === 'down')) scheduleOnRN(beginTurn, dir);
    scheduleOnRN(commit, dir, tag, info);
    // The deck behind comes forward as this one goes.
    p.set(withTiming(1, { duration: 180, reduceMotion: ReduceMotion.Never }));
    if (turns && (dir === 'up' || dir === 'down')) {
      turnOver(dir, tag);
      return;
    }
    leave(dir, vx, vy);
  };

  /** Where on the card a button or key starts the light: Done it's centre, the finger, or nowhere (the edge). */
  const lightFrom = (opts?: { tag?: string; turnover?: Point }): Point | null => {
    const centre = rest.get();
    if (opts?.turnover && centre) return toCard(opts.turnover, centre);
    if (opts?.tag === 'first' && doneAt.get()) return doneAt.get();
    const finger = tap.current;
    if (finger && centre && Date.now() - finger.at < TAP_FRESH_MS) return toCard(finger, centre);
    return null;
  };

  const fling: Fling = (dir, opts) => {
    const over = turns && (dir === 'up' || dir === 'down');
    if (opts?.note) {
      setNote(opts.note);
      // On a card that turns over, the note waits for the bright side.
      if (!over) noteIn.set(withTiming(1, { duration: 140, reduceMotion: ReduceMotion.Never }));
    }
    if (over) asked.set(lightFrom(opts));
    tap.current = null;
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
    .onBegin((e) => {
      // Where the thumb took the card, across and down its face: the card wears in there.
      const w = cardW.get();
      const h = cardH.get();
      if (w > 0 && h > 0) grip.set({ x: Math.min(1, Math.max(0, e.x / w)), y: Math.min(1, Math.max(0, e.y / h)) });
    })
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
    // Past its edge (beyond a quarter turn) the card shows its other side, coming round to face you.
    const angle = (t > 1 ? t - 2 : t) * 90;
    // A card turning over in the hand lifts toward you and leans a little as it goes.
    const arc = lifting.get() ? Math.sin((Math.PI * Math.min(2, Math.max(0, t))) / 2) : 0;
    return {
      opacity: fade.get(),
      transform: [
        { perspective: 900 },
        { translateX: x.get() },
        { translateY: y.get() + pose.translateY - 14 * arc },
        { rotate: `${pose.rotate + tilt + spin.get() - 3 * arc}deg` },
        { rotateY: `${angle}deg` },
        { scale: scale.get() * pose.scale * (1 + 0.07 * arc) },
      ],
    };
  });
  // The dark side until the card is past its edge, then the bright one. With Reduce Motion the bright side
  // fades in over the dark one, which stays solid underneath so nothing behind the card shows through.
  const frontStyle = useAnimatedStyle(() => ({ opacity: turn.get() > 1 || cross.get() >= 1 ? 0 : 1 }));
  const backStyle = useAnimatedStyle(() => ({ opacity: turn.get() > 1 ? 1 : cross.get() }));

  // Each style reads the shared values itself: Reanimated only re-runs a style for values read in its own body.
  const stamp = (dir: SwipeDirection, dx: number, dy: number, note: number) => {
    'worklet';
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const along = dir === 'up' ? (vertical ? -dy : 0) : dir === 'down' ? (vertical ? dy : 0) : dir === 'left' ? (vertical ? 0 : -dx) : vertical ? 0 : dx;
    return interpolate(along, [24, DISTANCE], [0, 1], 'clamp') * (1 - note);
  };
  // Each stamp comes from the edge its way leads to: the Ceiling drops from the top, the Floor rises from the bottom.
  const upStyle = useAnimatedStyle(() => {
    const v = stamp('up', x.get(), y.get(), noteIn.get());
    return { opacity: v, transform: [{ translateY: -14 * (1 - v) }, { rotate: '-9deg' }, { scale: 0.84 + 0.16 * v }] };
  });
  const downStyle = useAnimatedStyle(() => {
    const v = stamp('down', x.get(), y.get(), noteIn.get());
    return { opacity: v, transform: [{ translateY: 14 * (1 - v) }, { rotate: '7deg' }, { scale: 0.84 + 0.16 * v }] };
  });
  const leftStyle = useAnimatedStyle(() => {
    const v = stamp('left', x.get(), y.get(), noteIn.get());
    return { opacity: v, transform: [{ rotate: '-12deg' }, { scale: 0.84 + 0.16 * v }] };
  });
  const rightStyle = useAnimatedStyle(() => {
    const v = stamp('right', x.get(), y.get(), noteIn.get());
    return { opacity: v, transform: [{ rotate: '12deg' }, { scale: 0.84 + 0.16 * v }] };
  });
  // On the bright side the note is pressed on like a stamp: it lands big and settles.
  const noteStyle = useAnimatedStyle(() => {
    const n = noteIn.get();
    const slammed = slam.get() > 0;
    return { opacity: Math.min(1, slammed ? n * 5 : n), transform: [{ rotate: '-6deg' }, { scale: slammed ? 1.35 - 0.35 * n : 0.8 + 0.2 * n }] };
  });
  const turnStampStyle = useAnimatedStyle(() => {
    const n = noteIn.get();
    return { opacity: Math.min(1, n * 5), transform: [{ rotate: '-9deg' }, { scale: 1.35 - 0.35 * n }] };
  });

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

  const bright = turning?.face;
  const noteInk = bright ? bright.ink : ink;
  const noteWash = bright ? withAlpha(bright.bg, 0.94) : wash;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        ref={view}
        testID={testID}
        // A card turning over takes the touches meant for the card under it until it has gone.
        pointerEvents={ghost && !turning ? 'none' : 'auto'}
        aria-hidden={ghost || undefined}
        importantForAccessibility={ghost ? 'no-hide-descendants' : 'auto'}
        style={[StyleSheet.absoluteFill, card]}
        accessibilityLabel={ghost ? undefined : label}
        accessibilityActions={ghost ? undefined : offered.map((d) => ({ name: d, label: actions?.[d] ?? labels[d] }))}
        onAccessibilityAction={ghost ? undefined : onAction}
        onLayout={(e) => {
          cardW.set(e.nativeEvent.layout.width);
          cardH.set(e.nativeEvent.layout.height);
          if (settled && !ghost) measure();
        }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, turns ? frontStyle : null]} pointerEvents={settled && !ghost ? 'box-none' : 'none'}>
          {turns ? <TurnContext.Provider value={turnover}>{turning ? turning.front : children}</TurnContext.Provider> : children}
        </Animated.View>
        {turning ? (
          <Animated.View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, backStyle]}>
            <BackDensity.Provider value={{ compact: turning.compact }}>{turning.back}</BackDensity.Provider>
            {burst ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.card, overflow: 'hidden' }]}>
                <Burst kind="comeback" color={bright?.soft ?? withAlpha(INK, 0.4)} />
              </View>
            ) : null}
          </Animated.View>
        ) : null}
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
            style={[styles.stamp, styles.note, { top: '32%', borderColor: noteInk, backgroundColor: noteWash }, noteStyle]}
          >
            <Text allowFontScaling={false} style={[styles.noteText, { color: noteInk }]}>
              {note}
            </Text>
          </Animated.View>
        ) : null}
        {turning?.dir === 'up' && labels.up ? (
          // A Ceiling keeps its stamp, pressed onto the bright side.
          <Animated.View
            pointerEvents="none"
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.stamp, { top: '30%', alignSelf: 'center', borderColor: noteInk, backgroundColor: noteWash }, turnStampStyle]}
          >
            <Text allowFontScaling={false} style={[styles.stampText, { color: noteInk }]}>
              {labels.up}
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
  ref,
  onPress,
  label,
  hint,
  style,
  pressedScale = 0.96,
  children,
  testID,
}: {
  ref?: Ref<View>;
  onPress: () => void;
  label: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  children: ReactNode;
  testID?: string;
}) {
  const turnover = useTurnover();
  const down = useSharedValue(0);
  // On a card that turns over, the finger is where its light starts.
  const pressed = (x: number, y: number) => {
    turnover?.noteTap({ x, y });
    onPress();
  };
  const tap = Gesture.Tap()
    .maxDistance(10)
    .onBegin(() => {
      down.set(withTiming(1, { duration: 70 }));
    })
    .onFinalize((e, success) => {
      down.set(withTiming(0, { duration: 160 }));
      if (success) scheduleOnRN(pressed, e.absoluteX, e.absoluteY);
    });
  const press = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - pressedScale) * down.get() }], opacity: 1 - 0.15 * down.get() }));
  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        ref={ref}
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate') onPress();
        }}
        style={[{ minHeight: 44, minWidth: 44 }, style, press]}
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
