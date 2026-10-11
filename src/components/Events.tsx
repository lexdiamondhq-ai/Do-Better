import * as Haptics from 'expo-haptics';
import { useEffect, useEffectEvent } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUIT_INFO } from '@/engine/cards';
import { improves } from '@/engine/game';
import { HANDS } from '@/engine/poker';
import { useData, type GameEvent } from '@/lib/data';
import { cardFace, chip, space } from '@/theme/tokens';

import { CardBack } from './CardBack';
import { faceLabel, faceOfCourt, faceOfDay, PlayingCard, type CardFace } from './PlayingCard';
import { Body, Button, Display, Label } from './ui';

type DealShown = Extract<GameEvent, { kind: 'deal' }>;

/**
 * What the last check-in did, shown one moment at a time: today's card turning over at the top of the
 * screen, then any face card it earned in the Court, full screen. Several deals in a row collapse into
 * one, so swiping through the deck quickly doesn't queue a parade of toasts.
 */
export function GameEvents({ back }: { back: Parameters<typeof CardBack>[0]['back'] }) {
  const { events, dismissEvent } = useData();
  const first = events[0];
  if (!first) return null;
  if (first.kind === 'face') return <FaceEarned key={first.id} event={first} onDone={() => dismissEvent(first.id)} />;

  const run: DealShown[] = [];
  for (const e of events) {
    if (e.kind !== 'deal') break;
    run.push(e);
  }
  const last = run[run.length - 1];
  // Flip from the card before the whole run, unless a quiet step down in between makes that look like a loss.
  const was = improves(last.deal.card, run[0].deal.was) ? run[0].deal.was : last.deal.was;
  const shown: DealShown = { ...last, deal: { ...last.deal, was }, saved: run.find((e) => e.saved)?.saved ?? null };
  return <DealToast key={last.id} event={shown} back={back} onDone={() => run.forEach((e) => dismissEvent(e.id))} />;
}

function DealToast({ event, back, onDone }: { event: DealShown; back: Parameters<typeof CardBack>[0]['back']; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { card, was, hand, handWas } = event.deal;
  const face = faceOfDay(card);
  const y = useSharedValue(-180);
  const flip = useSharedValue(0);

  const finish = useEffectEvent(onDone);

  useEffect(() => {
    y.set(withSpring(0, { damping: 16, stiffness: 180 }));
    flip.set(withDelay(220, withTiming(1, { duration: 460 })));
    const leave = setTimeout(() => y.set(withTiming(-200, { duration: 240 })), 3000);
    const done = setTimeout(() => finish(), 3260);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [y, flip]);

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { rotateY: `${180 - flip.get() * 180}deg` }] }));
  const behind = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { rotateY: `${-flip.get() * 180}deg` }] }));

  const wentUp = was?.kind === 'card' && card.kind === 'card' && card.rank > was.rank;
  const title = card.kind === 'joker' ? 'A Joker!' : wentUp ? 'Today’s card went up' : 'Today’s card';
  const better = !!hand && !!handWas && hand.score > handWas.score;
  const handLine = !hand ? '' : !better ? `Your hand: ${hand.title}.` : hand.title === handWas?.title ? `Your ${hand.title} just got stronger.` : `Your hand is now ${hand.title}.`;
  const savedLine = event.saved ? ' Yesterday’s card was saved too.' : '';

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + space.sm, paddingHorizontal: space.lg }}>
      <Animated.View style={panel}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}: ${faceLabel(face)}. ${handLine}${savedLine}`}
          onPress={onDone}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, backgroundColor: '#17121F', borderRadius: 26, padding: space.md, paddingRight: space.lg, boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.35)' }}
        >
          <View style={{ width: 52, height: 74 }}>
            <Animated.View style={[{ position: 'absolute', backfaceVisibility: 'hidden' }, behind]}>
              {was ? <PlayingCard face={faceOfDay(was)} size="sm" /> : <CardBack back={back} size="sm" />}
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', backfaceVisibility: 'hidden' }, front]}>
              <PlayingCard face={face} size="sm" />
            </Animated.View>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Label color={chip.bg}>{title}</Label>
            <Display size={21} color={cardFace.bg} numberOfLines={1}>
              {faceLabel(face)}
            </Display>
            <Body size={13} weight="bold" color="rgba(255,253,248,0.75)" numberOfLines={2}>
              {`${handLine}${savedLine}`}
            </Body>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function FaceEarned({ event, onDone }: { event: Extract<GameEvent, { kind: 'face' }>; onDone: () => void }) {
  const info = SUIT_INFO[event.suit];
  const scale = useSharedValue(0.3);
  const rotate = useSharedValue(-28);
  const joker = useSharedValue(0);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.set(withSpring(1, { damping: 10 }));
    rotate.set(withDelay(80, withSpring(-4, { damping: 8 })));
    joker.set(withDelay(700, withSequence(withSpring(1.12, { damping: 6 }), withSpring(1))));
  }, [scale, rotate, joker]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }, { rotate: `${rotate.get()}deg` }] }));
  const jokerStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, joker.get()), transform: [{ scale: joker.get() }, { rotate: '9deg' }] }));
  const court: CardFace = faceOfCourt(event.suit, event.face);
  const who = event.identities.length ? event.identities.slice(0, 2).join(' and ') : `your ${info.part.toLowerCase()}`;

  return (
    <Modal transparent animationType="fade" onRequestClose={onDone}>
      <Pressable onPress={onDone} style={{ flex: 1, backgroundColor: 'rgba(10,8,14,0.96)', alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.xl }}>
        <Label color={chip.bg}>{`The Court · ${info.name} · ${info.part}`}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Animated.View style={cardStyle}>
            <PlayingCard face={court} size="xl" />
          </Animated.View>
          {event.joker ? (
            <Animated.View style={[{ marginLeft: -40, marginTop: 90 }, jokerStyle]}>
              <PlayingCard face={{ kind: 'joker' }} size="md" />
            </Animated.View>
          ) : null}
        </View>
        <View style={{ gap: space.sm, alignItems: 'center' }}>
          <Display size={34} color="#FFFFFF" style={{ textAlign: 'center' }}>{`${event.face.name} of ${info.name}`}</Display>
          <Display size={20} color={chip.bg} style={{ textAlign: 'center' }}>{`“${event.face.title}”`}</Display>
          <Body color="rgba(255,255,255,0.8)" style={{ textAlign: 'center' }}>
            {`${event.face.votes} kept days voted for ${who}. Face cards are never lost.`}
          </Body>
          {event.joker ? (
            <Body weight="bold" color="#FFFFFF" style={{ textAlign: 'center' }}>
              {`Today’s card turned into a Joker. It plays as whatever card makes your best hand, up to ${HANDS['five-of-a-kind'].name}.`}
            </Body>
          ) : null}
        </View>
        <Button label="Keep playing" onPress={onDone} colors={{ bg: chip.bg, fg: chip.ink }} style={{ alignSelf: 'stretch' }} />
      </Pressable>
    </Modal>
  );
}
