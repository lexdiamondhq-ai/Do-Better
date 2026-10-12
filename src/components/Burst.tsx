import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { chip } from '@/theme/tokens';

export type BurstKind = 'floor' | 'ceiling' | 'joker';

const COUNT = { floor: 10, ceiling: 16, joker: 22 } as const;

/** Fixed scatter per particle, so every burst of a kind looks alike and nothing random runs during render. */
function spread(i: number, n: number) {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const jitter = a - Math.floor(a);
  return { angle: (i / n) * Math.PI * 2 + jitter * 0.6, reach: 0.65 + jitter * 0.5, size: 6 + Math.round(jitter * 8) };
}

/**
 * What a check-in looks like besides the card leaving. A Floor lands with a ring pressed into the
 * felt and a puff of dust. A Ceiling throws gold up the screen. A Joker sparkles in every colour.
 * Mount with a new key to play it again; it clears itself.
 */
export function Burst({ kind, color, onDone }: { kind: BurstKind; color: string; onDone?: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => {
    const ms = kind === 'floor' ? 650 : kind === 'ceiling' ? 1000 : 1300;
    p.set(withTiming(1, { duration: ms, easing: Easing.out(Easing.cubic) }));
    const id = setTimeout(() => onDone?.(), ms + 50);
    return () => clearTimeout(id);
  }, [p, kind, onDone]);

  const n = COUNT[kind];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {kind === 'floor' ? <Ring p={p} color={color} /> : null}
      {kind !== 'floor' ? <Glow p={p} color={kind === 'joker' ? '#FFFFFF' : chip.bg} /> : null}
      {Array.from({ length: n }, (_, i) => (
        <Particle key={i} i={i} n={n} kind={kind} p={p} color={kind === 'joker' ? JOKER_COLORS[i % JOKER_COLORS.length] : kind === 'ceiling' ? (i % 3 ? chip.bg : '#FFFFFF') : color} />
      ))}
    </View>
  );
}

const JOKER_COLORS = ['#FF5B3A', '#FFC93D', '#3DDC97', '#4F7CFF', '#B7A4F7', '#FFFFFF'];

function Ring({ p, color }: { p: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.15, 1], [0, 0.55, 0]),
    transform: [{ scaleX: interpolate(p.get(), [0, 1], [0.3, 1.6]) }, { scaleY: interpolate(p.get(), [0, 1], [0.12, 0.5]) }],
  }));
  return <Animated.View style={[{ position: 'absolute', alignSelf: 'center', bottom: '8%', width: 260, height: 260, borderRadius: 130, borderWidth: 14, borderColor: color }, style]} />;
}

function Glow({ p, color }: { p: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.2, 1], [0, 0.35, 0]),
    transform: [{ scale: interpolate(p.get(), [0, 1], [0.4, 1.8]) }],
  }));
  return <Animated.View style={[{ position: 'absolute', alignSelf: 'center', top: '30%', width: 220, height: 220, borderRadius: 110, backgroundColor: color }, style]} />;
}

function Particle({ i, n, kind, p, color }: { i: number; n: number; kind: BurstKind; p: SharedValue<number>; color: string }) {
  const { angle, reach, size } = spread(i, n);
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
    return {
      opacity: interpolate(v, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${v * (kind === 'floor' ? 90 : 360) * (i % 2 ? 1 : -1)}deg` }, { scale: interpolate(v, [0, 0.2, 1], [0.4, 1, 0.6]) }],
    };
  });
  const diamond = kind !== 'floor';
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: '50%',
          top: kind === 'floor' ? '86%' : kind === 'ceiling' ? '62%' : '45%',
          width: size,
          height: size,
          marginLeft: -size / 2,
          borderRadius: diamond ? 2 : size / 2,
          backgroundColor: color,
          transform: diamond ? [{ rotate: '45deg' }] : undefined,
        },
        style,
      ]}
    />
  );
}
