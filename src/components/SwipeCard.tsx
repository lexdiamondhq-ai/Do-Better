import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { fonts } from '@/theme/tokens';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

const DISTANCE = 110;
const VELOCITY = 900;

/**
 * The front card of the deck. Drag it up, down or sideways; past the threshold it flies off and
 * reports the direction. Released early, it springs back. Remount it (with a new key) for the next card.
 */
export function SwipeCard({
  children,
  onSwipe,
  onTap,
  allow = { up: true, down: true, left: true, right: true },
  labels,
}: PropsWithChildren<{
  onSwipe: (dir: SwipeDirection) => void;
  onTap?: () => void;
  allow?: Partial<Record<SwipeDirection, boolean>>;
  labels: Partial<Record<SwipeDirection, string>>;
}>) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const up = !!allow.up;
  const down = !!allow.down;
  const sideways = !!(allow.left || allow.right);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.set(e.translationX);
      y.set(up || down ? e.translationY : e.translationY * 0.2);
    })
    .onEnd((e) => {
      const dx = x.get();
      const dy = y.get();
      const vertical = Math.abs(dy) > Math.abs(dx);
      let dir: SwipeDirection | null = null;
      if (vertical && up && (dy < -DISTANCE || e.velocityY < -VELOCITY)) dir = 'up';
      else if (vertical && down && (dy > DISTANCE || e.velocityY > VELOCITY)) dir = 'down';
      else if (!vertical && sideways && (Math.abs(dx) > DISTANCE || Math.abs(e.velocityX) > VELOCITY)) dir = dx > 0 ? 'right' : 'left';
      if (!dir) {
        x.set(withSpring(0, { damping: 16 }));
        y.set(withSpring(0, { damping: 16 }));
        return;
      }
      const done = dir;
      x.set(withTiming(dir === 'left' ? -700 : dir === 'right' ? 700 : dx * 1.4, { duration: 230 }));
      y.set(
        withTiming(dir === 'up' ? -1100 : dir === 'down' ? 1100 : dy, { duration: 230 }, (finished) => {
          if (finished) scheduleOnRN(onSwipe, done);
        }),
      );
    });

  const tap = Gesture.Tap().onEnd((_e, success) => {
    if (success && onTap) scheduleOnRN(onTap);
  });

  const card = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${-2 + x.get() / 16}deg` }],
  }));
  const upStyle = useAnimatedStyle(() => ({ opacity: interpolate(-y.get(), [20, DISTANCE], [0, 1], 'clamp') }));
  const downStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [20, DISTANCE], [0, 1], 'clamp') }));
  const sideStyle = useAnimatedStyle(() => ({ opacity: Math.abs(y.get()) > Math.abs(x.get()) ? 0 : interpolate(Math.abs(x.get()), [20, DISTANCE], [0, 1], 'clamp') }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View style={[StyleSheet.absoluteFill, card]}>
        {children}
        {labels.up ? <Animated.Text style={[styles.verdict, upStyle]}>{labels.up}</Animated.Text> : null}
        {labels.down ? <Animated.Text style={[styles.verdict, downStyle]}>{labels.down}</Animated.Text> : null}
        {labels.left ? <Animated.Text style={[styles.verdict, sideStyle]}>{labels.left}</Animated.Text> : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  verdict: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    fontFamily: fonts.display,
    fontSize: 34,
    color: '#17121F',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 14,
    overflow: 'hidden',
    transform: [{ rotate: '-8deg' }],
  },
});
