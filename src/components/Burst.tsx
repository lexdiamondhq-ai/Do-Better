import { useEffect, useEffectEvent } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { chip } from '@/theme/tokens';

export type BurstKind = 'floor' | 'ceiling' | 'joker';

const COUNT = { floor: 12, ceiling: 18, joker: 24 } as const;
const LENGTH = { floor: 700, ceiling: 1050, joker: 1350 } as const;
const JOKER_COLORS = ['#FF5B3A', '#FFC93D', '#3DDC97', '#4F7CFF', '#B7A4F7', '#FFFFFF'];

/** Fixed scatter per particle, so every burst of a kind looks alike and nothing random runs during render. */
function spread(i: number, n: number) {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const jitter = a - Math.floor(a);
  return { angle: (i / n) * Math.PI * 2 + jitter * 0.6, reach: 0.65 + jitter * 0.5, size: 6 + Math.round(jitter * 8) };
}

/**
 * What a check-in looks like besides the card leaving. A Floor lands with a ring pressed into the
 * felt and a puff of dust in the card's colour. A Ceiling throws gold up the screen. A Joker sparkles
 * in every colour. With Reduce Motion it is only a soft glow that fades. Mount with a new key to play
 * it again; it calls `onDone` when it has finished.
 */
export function Burst({ kind, color, onDone }: { kind: BurstKind; color: string; onDone?: () => void }) {
  const p = useSharedValue(0);
  const reduced = useReducedMotion();
  const finish = useEffectEvent(() => onDone?.());

  useEffect(() => {
    const end = () => finish();
    p.set(
      withTiming(1, { duration: reduced ? 420 : LENGTH[kind], easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }, (done) => {
        'worklet';
        if (done) scheduleOnRN(end);
      }),
    );
  }, [p, kind, reduced]);

  if (reduced) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Glow p={p} color={kind === 'floor' ? color : kind === 'joker' ? '#FFFFFF' : chip.bg} still />
      </View>
    );
  }

  const n = COUNT[kind];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {kind === 'floor' ? <Ring p={p} color={color} /> : <Glow p={p} color={kind === 'joker' ? '#FFFFFF' : chip.bg} />}
      {Array.from({ length: n }, (_, i) => (
        <Particle key={i} i={i} n={n} kind={kind} p={p} color={kind === 'joker' ? JOKER_COLORS[i % JOKER_COLORS.length] : kind === 'ceiling' ? (i % 3 ? chip.bg : '#FFFFFF') : color} />
      ))}
    </View>
  );
}

function Ring({ p, color }: { p: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.12, 1], [0, 0.6, 0]),
    transform: [{ scaleX: interpolate(p.get(), [0, 1], [0.3, 1.7]) }, { scaleY: interpolate(p.get(), [0, 1], [0.12, 0.5]) }],
  }));
  return <Animated.View style={[{ position: 'absolute', alignSelf: 'center', bottom: '6%', width: 260, height: 260, borderRadius: 130, borderWidth: 14, borderColor: color }, style]} />;
}

function Glow({ p, color, still = false }: { p: SharedValue<number>; color: string; still?: boolean }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.2, 1], [0, still ? 0.28 : 0.38, 0]),
    transform: [{ scale: still ? 1.4 : interpolate(p.get(), [0, 1], [0.4, 1.9]) }],
  }));
  return <Animated.View style={[{ position: 'absolute', alignSelf: 'center', top: '30%', width: 220, height: 220, borderRadius: 110, backgroundColor: color }, style]} />;
}

function Particle({ i, n, kind, p, color }: { i: number; n: number; kind: BurstKind; p: SharedValue<number>; color: string }) {
  const { angle, reach, size } = spread(i, n);
  const diamond = kind !== 'floor';
  const style = useAnimatedStyle(() => {
    const v = p.get();
    let x: number;
    let y: number;
    if (kind === 'floor') {
      // Dust kicks out sideways along the felt and settles.
      x = Math.cos(angle) * 170 * reach * v;
      y = -Math.abs(Math.sin(angle)) * 50 * reach * Math.sin(Math.PI * v);
    } else if (kind === 'ceiling') {
      // Gold flies up and fans out, slowing near the top.
      x = Math.cos(angle) * 120 * reach * v;
      y = -(260 + 240 * reach) * v + Math.abs(Math.sin(angle)) * 40 * v;
    } else {
      // Joker sparks go every way and drift down a little.
      x = Math.cos(angle) * 190 * reach * v;
      y = Math.sin(angle) * 190 * reach * v + 60 * v * v;
    }
    // Diamonds keep their quarter turn inside the animated transform, so it isn't lost.
    const turn = (diamond ? 45 : 0) + v * (kind === 'floor' ? 90 : 360) * (i % 2 ? 1 : -1);
    return {
      opacity: interpolate(v, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${turn}deg` }, { scale: interpolate(v, [0, 0.2, 1], [0.4, 1, 0.6]) }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: '50%',
          top: kind === 'floor' ? '88%' : kind === 'ceiling' ? '62%' : '45%',
          width: size,
          height: size,
          marginLeft: -size / 2,
          borderRadius: diamond ? 2 : size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
