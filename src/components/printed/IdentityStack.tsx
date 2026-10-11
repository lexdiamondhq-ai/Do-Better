import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { identityLevel, votesToNextLevel } from '@/engine/identity';
import { cardColors, radius, space, type CardColor } from '@/theme/tokens';

import { Body, Display, Label } from '../ui';

export const STACK_HEIGHT = 118;

/**
 * The stack a printed card lands on: who the card makes you, how many cards say so, and how far
 * the next rank is. `fill` is the bar from 0 to 1 and `pop` the stack's scale; whoever drops the
 * card drives both, so the bar can fill before the rank changes.
 */
export function IdentityStack({ identity, color, count, fill, pop }: { identity: string; color: CardColor; count: number; fill: SharedValue<number>; pop: SharedValue<number> }) {
  const c = cardColors[color];
  const level = identityLevel(count);
  const next = votesToNextLevel(count);
  const cards = count === 1 ? 'card' : 'cards';
  const bar = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.get())) * 100}%` }));
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <Animated.View
      accessible
      accessibilityLabel={`I’m ${identity}. ${level.label}. ${count} ${cards}.${next ? ` ${next.needed} more to ${next.next.label}.` : ''}`}
      style={[{ height: STACK_HEIGHT, backgroundColor: c.bg, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: space.lg, justifyContent: 'space-between' }, scale]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Label color={c.ink} style={{ opacity: 0.75 }}>{level.label}</Label>
          <Display size={20} color={c.ink} numberOfLines={2}>{`I’m ${identity}`}</Display>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Display size={30} color={c.ink}>{count}</Display>
          <Label color={c.ink} style={{ opacity: 0.75 }}>{cards}</Label>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(23,18,31,0.18)', overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', backgroundColor: c.ink }, bar]} />
        </View>
        <Body size={12} weight="bold" color={c.ink} style={{ opacity: 0.8 }}>{next ? `${next.needed} more to “${next.next.label}”` : 'This is who you are now.'}</Body>
      </View>
    </Animated.View>
  );
}
