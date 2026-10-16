import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { SUIT_INFO } from '@/engine/cards';
import { useData } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import * as feel from '@/lib/feel';
import type { Habit } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, edgeBorder, fontScale, radius, space, TAP, typeScale } from '@/theme/tokens';

import { ask } from './Ask';
import { SuitGlyph } from './Suit';
import { Body, Button, Display, Label } from './ui';

/** One row of the list, tall enough for two lines and the buttons. */
const ROW = 76;

/**
 * The order cards come up in Today. Drag a card by its handle, or move it a place at a time with the
 * arrows (which is also what a screen reader offers). Saved when the sheet closes, in one write.
 */
export function ArrangeDeck({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // A swipe down on the sheet, or Android's back button, closes it the way Save does: a new order is kept, not lost.
  const closeRef = useRef<(() => void) | null>(null);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={() => (closeRef.current ?? onClose)()}>
      {visible ? <ArrangeBody onClose={onClose} closeRef={closeRef} /> : null}
    </Modal>
  );
}

function ArrangeBody({ onClose, closeRef }: { onClose: () => void; closeRef: RefObject<(() => void) | null> }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const deck = useDeck();
  const { updatePositions } = useData();
  const cards = deck?.cards.map((c) => c.habit) ?? [];
  const start = cards.map((h) => h.id);
  const [order, setOrder] = useState<string[]>(start);
  const [busy, setBusy] = useState(false);
  // The card being dragged, the place it would drop into, and how far it has moved.
  const from = useSharedValue(-1);
  const hover = useSharedValue(-1);
  const dy = useSharedValue(0);

  const byId = new Map(cards.map((h) => [h.id, h]));
  // Cards archived while the sheet is open drop out; cards made meanwhile join at the end.
  const list = [...order.filter((id) => byId.has(id)), ...start.filter((id) => !order.includes(id))];
  const changed = list.join() !== start.join();

  // Once the new order is on screen, the dragged card and the cards it pushed aside stand still again.
  useLayoutEffect(() => {
    from.set(-1);
    hover.set(-1);
    dy.set(0);
  }, [order, from, hover, dy]);

  const move = (a: number, b: number) => {
    if (b < 0 || b >= list.length || a === b) return;
    feel.tick();
    const next = [...list];
    const [id] = next.splice(a, 1);
    next.splice(b, 0, id);
    setOrder(next);
  };

  async function done() {
    if (busy) return;
    if (!changed) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await updatePositions(list);
      onClose();
    } catch (e) {
      ask('The new order didn’t save', e instanceof Error ? e.message : 'Try again.');
      setBusy(false);
    }
  }

  useEffect(() => {
    closeRef.current = done;
    return () => {
      closeRef.current = null;
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: Platform.OS === 'ios' ? space.lg : insets.top + space.md, paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
          <Display size={typeScale.display.lg} header style={{ flexShrink: 1 }}>
            Arrange your deck
          </Display>
          <Pressable accessibilityRole="button" accessibilityLabel={changed ? 'Save the order' : 'Done'} onPress={done} disabled={busy} hitSlop={8} style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed || busy ? 0.6 : 1 })}>
            <Body weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
              {changed ? 'Save' : 'Done'}
            </Body>
          </Pressable>
        </View>
        <Body size={typeScale.text.md} color={t.textSecondary}>
          Today deals your cards top to bottom. Put the one that gets the others going first.
        </Body>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: insets.bottom + space.xxxl, gap: space.lg }}>
        <View style={{ height: list.length * ROW }}>
          {list.map((id, i) => {
            const habit = byId.get(id);
            return habit ? <Row key={id} habit={habit} index={i} count={list.length} from={from} hover={hover} dy={dy} onMove={move} /> : null;
          })}
        </View>
        {changed ? <Button label="Save the order" busy={busy} onPress={done} /> : null}
      </ScrollView>
    </View>
  );
}

function Row({
  habit,
  index,
  count,
  from,
  hover,
  dy,
  onMove,
}: {
  habit: Habit;
  index: number;
  count: number;
  from: SharedValue<number>;
  hover: SharedValue<number>;
  dy: SharedValue<number>;
  onMove: (a: number, b: number) => void;
}) {
  const t = useTheme();
  const c = cardColors[habit.color];

  const pan = Gesture.Pan()
    .onStart(() => {
      from.set(index);
      hover.set(index);
      dy.set(0);
      scheduleOnRN(feel.arm);
    })
    .onUpdate((e) => {
      dy.set(e.translationY);
      hover.set(Math.max(0, Math.min(count - 1, index + Math.round(e.translationY / ROW))));
    })
    .onEnd(() => {
      const to = hover.get();
      if (to === index) {
        dy.set(
          withTiming(0, { duration: 140 }, () => {
            'worklet';
            from.set(-1);
            hover.set(-1);
          }),
        );
        return;
      }
      dy.set(withTiming((to - index) * ROW, { duration: 90 }));
      scheduleOnRN(onMove, index, to);
    });

  const style = useAnimatedStyle(() => {
    const f = from.get();
    if (f === index) return { zIndex: 10, transform: [{ translateY: dy.get() }, { scale: 1.03 }] };
    if (f < 0) return { zIndex: 0, transform: [{ translateY: 0 }, { scale: 1 }] };
    const h = hover.get();
    const shift = f < index && index <= h ? -ROW : h <= index && index < f ? ROW : 0;
    return { zIndex: 0, transform: [{ translateY: withTiming(shift, { duration: 140 }) }, { scale: 1 }] };
  });

  return (
    <Animated.View
      accessible
      accessibilityLabel={`${habit.name}, ${index + 1} of ${count}`}
      accessibilityActions={[
        { name: 'up', label: 'Move up' },
        { name: 'down', label: 'Move down' },
      ]}
      onAccessibilityAction={(e) => onMove(index, index + (e.nativeEvent.actionName === 'up' ? -1 : 1))}
      style={[{ position: 'absolute', left: 0, right: 0, top: index * ROW, height: ROW - space.sm }, style]}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.bgRaised, borderRadius: radius.md, paddingLeft: space.sm, paddingRight: space.xs, ...edgeBorder(t) }}>
        <View style={{ width: 40, height: 54, borderRadius: 9, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }} aria-hidden>
          <SuitGlyph suit={habit.suit} size={18} color={c.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="heavy" numberOfLines={1}>
            {habit.name}
          </Body>
          <Label numberOfLines={1}>{`${index + 1} · ${SUIT_INFO[habit.suit].part}`}</Label>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Arrow glyph="↑" label={`Move ${habit.name} up`} disabled={index === 0} onPress={() => onMove(index, index - 1)} />
          <Arrow glyph="↓" label={`Move ${habit.name} down`} disabled={index === count - 1} onPress={() => onMove(index, index + 1)} />
        </View>
        <GestureDetector gesture={pan}>
          <View accessible={false} style={{ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <View style={{ gap: 4 }} aria-hidden>
              {[0, 1, 2].map((k) => (
                <View key={k} style={{ width: 20, height: 2.5, borderRadius: 2, backgroundColor: t.textSecondary }} />
              ))}
            </View>
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

function Arrow({ glyph, label, disabled, onPress }: { glyph: string; label: string; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      // The row itself offers Move up and Move down to a screen reader.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.25 : pressed ? 0.5 : 1 })}
    >
      <Display size={20} color={t.text} maxFontSizeMultiplier={fontScale.graphic}>
        {glyph}
      </Display>
    </Pressable>
  );
}
