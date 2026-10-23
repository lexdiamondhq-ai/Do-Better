import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Point } from '@/engine/comeback';
import type { BackKey } from '@/engine/game';
import { arcAt, dealArc } from '@/engine/today';
import * as feel from '@/lib/feel';
import { playSound } from '@/lib/sound';

import { CardBack } from './CardBack';
import { CARD_SIZES, PlayingCard, type CardFace, type CardSize } from './PlayingCard';
import type { Rect } from './WeekStrip';

/**
 * One deal into the week: from where the kept card was (`from`, window coordinates) to today's place in
 * the strip (`to`, its window rectangle). `delayMs` holds it back while a Comeback card turns over first.
 */
export type Flight = { id: number; from: Point; to: Rect; delayMs: number; reduced: boolean };

const SIZE: CardSize = 'xs';

/**
 * The deal made physical: when a card is kept, today's card leaves it face down, arcs up into today's
 * place in the week, turns over there and settles, with a tick in the hand and the deal sound as it turns.
 * With Reduce Motion there is no flight: the card fades in where it lands.
 *
 * It draws over the whole table and takes no touches. `face` is today's card as the deck now has it (the
 * keep has already counted by the time it lands). `onLanded` fires once the card has settled, so the strip
 * can show its own card in that place again.
 */
export function DealArc({ flight, face, back, onLanded }: { flight: Flight | null; face: CardFace | null; back: BackKey; onLanded: (id: number) => void }) {
  const box = useRef<View>(null);
  const [origin, setOrigin] = useState<Point>({ x: 0, y: 0 });
  const t = useSharedValue(0);
  const turn = useSharedValue(1);
  const seat = useSharedValue(1);
  const shown = useSharedValue(0);
  const id = flight?.id ?? null;
  const reduced = !!flight?.reduced;
  const delayMs = flight?.delayMs ?? 0;
  const land = useEffectEvent((flightId: number) => onLanded(flightId));

  useEffect(() => {
    if (id === null) return;
    const timing = dealArc({ reduced });
    const turned = () => {
      feel.tick();
      playSound('deal');
    };
    const landed = () => land(id);
    const never = { reduceMotion: ReduceMotion.Never };
    if (reduced) {
      // Nothing flies: the card simply fades in, face up, in its place.
      t.set(1);
      turn.set(0);
      seat.set(1);
      shown.set(0);
      shown.set(
        withDelay(
          delayMs,
          withTiming(1, { duration: timing.settleMs, ...never }, (ok) => {
            'worklet';
            if (!ok) return;
            scheduleOnRN(turned);
            scheduleOnRN(landed);
          }),
        ),
      );
      return;
    }
    t.set(0);
    turn.set(1);
    seat.set(1);
    shown.set(0);
    shown.set(withDelay(delayMs, withTiming(1, { duration: 70, ...never })));
    t.set(
      withDelay(
        delayMs,
        withTiming(1, { duration: timing.flyMs, easing: Easing.bezier(0.3, 0.1, 0.25, 1), ...never }, (ok) => {
          'worklet';
          if (!ok) return;
          turn.set(
            withTiming(0, { duration: timing.flipMs, easing: Easing.out(Easing.cubic), ...never }, (done) => {
              'worklet';
              if (!done) return;
              scheduleOnRN(turned);
              seat.set(
                withSequence(
                  withTiming(1.14, { duration: 45, easing: Easing.out(Easing.quad), ...never }),
                  withTiming(1, { duration: timing.settleMs - 45, easing: Easing.out(Easing.back(2)), ...never }, (fin) => {
                    'worklet';
                    if (fin) scheduleOnRN(landed);
                  }),
                ),
              );
            }),
          );
        }),
      ),
    );
  }, [id, reduced, delayMs, t, turn, seat, shown]);

  const s = CARD_SIZES[SIZE];
  const from = flight ? { x: flight.from.x - origin.x, y: flight.from.y - origin.y } : { x: 0, y: 0 };
  const to = flight ? { x: flight.to.x + flight.to.width / 2 - origin.x, y: flight.to.y + flight.to.height / 2 - origin.y } : { x: 0, y: 0 };
  // The slot may be drawn a touch larger or smaller than the card here: land at exactly its size.
  const fit = flight ? flight.to.width / s.w : 1;

  const card = useAnimatedStyle(() => {
    const p = arcAt(t.get(), from, to);
    return {
      opacity: shown.get(),
      transform: [{ translateX: p.x - s.w / 2 }, { translateY: p.y - s.h / 2 }, { rotate: `${p.rotate}deg` }, { scale: p.scale * fit * seat.get() }],
    };
  });
  const faceUp = useAnimatedStyle(() => ({ transform: [{ perspective: 420 }, { rotateY: `${turn.get() * 180}deg` }] }));
  const faceDown = useAnimatedStyle(() => ({ transform: [{ perspective: 420 }, { rotateY: `${turn.get() * 180 - 180}deg` }] }));

  return (
    <View
      ref={box}
      collapsable={false}
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { zIndex: 20 }]}
      onLayout={() =>
        box.current?.measureInWindow((x, y) => {
          setOrigin((o) => (o.x === x && o.y === y ? o : { x, y }));
        })
      }
    >
      {flight ? (
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: s.w, height: s.h, borderRadius: s.radius, boxShadow: '0px 10px 22px rgba(10, 8, 14, 0.34)' }, card]}>
          <Animated.View style={[styles.side, { backfaceVisibility: 'hidden' }, faceDown]}>
            <CardBack back={back} size={SIZE} />
          </Animated.View>
          <Animated.View style={[styles.side, { backfaceVisibility: 'hidden' }, faceUp]}>{face ? <PlayingCard face={face} size={SIZE} /> : <CardBack back={back} size={SIZE} />}</Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  side: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
});
