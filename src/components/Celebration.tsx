import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { SUITS } from '@/engine/achievements';
import { useData } from '@/lib/data';
import { space } from '@/theme/tokens';

import { AchievementCard } from './AchievementCard';
import { Body, Button, Display, Label } from './ui';

/** Deals a newly earned achievement onto the table, one at a time. */
export function Celebration() {
  const { celebrations, dismissCelebration } = useData();
  const current = celebrations[0];
  if (!current) return null;
  return <Dealt key={current.id} id={current.id} onDone={dismissCelebration} remaining={celebrations.length - 1} />;
}

function Dealt({ id, onDone, remaining }: { id: string; onDone: () => void; remaining: number }) {
  const { celebrations } = useData();
  const achievement = celebrations.find((a) => a.id === id);
  const scale = useSharedValue(0.4);
  const rotate = useSharedValue(-24);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.set(withSpring(1, { damping: 11 }));
    rotate.set(withDelay(60, withSpring(-3, { damping: 9 })));
  }, [scale, rotate]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }, { rotate: `${rotate.get()}deg` }] }));
  if (!achievement) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onDone}>
      <Pressable onPress={onDone} style={{ flex: 1, backgroundColor: 'rgba(10,8,14,0.82)', alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.xl }}>
        <Label color="#FFFFFF">{`New card · ${SUITS[achievement.suit].name}`}</Label>
        <Animated.View style={style}>
          <AchievementCard size="large" state={{ achievement, progress: achievement.target, unlockedOn: 'now' }} />
        </Animated.View>
        <View style={{ gap: space.sm, alignItems: 'center' }}>
          <Display size={30} color="#FFFFFF" style={{ textAlign: 'center' }}>Added to your collection.</Display>
          <Body color="rgba(255,255,255,0.75)" style={{ textAlign: 'center' }}>Nothing can take it away.</Body>
        </View>
        <Button label={remaining > 0 ? `Next card (${remaining} more)` : 'Keep going'} onPress={onDone} colors={{ bg: '#FFFFFF', fg: '#17121F' }} style={{ alignSelf: 'stretch' }} />
      </Pressable>
    </Modal>
  );
}
