import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { SUIT_INFO } from '@/engine/cards';
import type { BackKey } from '@/engine/game';
import { improves } from '@/engine/game';
import { grouped, momentOf, receiptCopy, type Moment } from '@/engine/today';
import { useData, useEvents, type GameEvent } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { useReviewAsk } from '@/lib/review';
import { playSound, type SoundName } from '@/lib/sound';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { chip, fontScale, radius, space, TAP } from '@/theme/tokens';

import { Burst } from './Burst';
import { CardBack } from './CardBack';
import { faceLabel, faceOfCourt, faceOfDay, PlayingCard, type CardFace, type CardSize } from './PlayingCard';
import { SaveDeckCard } from './SaveDeckCard';
import { ShareButton } from './ShareButton';
import { SuitGlyph } from './Suit';
import { Body, Button, Display, Label, raisedStyle } from './ui';

type Deal = Extract<GameEvent, { kind: 'deal' }>;

/** The night behind a big moment, and the light text on it. */
const NIGHT = 'rgba(10, 8, 14, 0.95)';
const MOON = '#FFFDF8';
const MOON_SOFT = 'rgba(255, 253, 248, 0.78)';

/**
 * What the last check-in did, one moment at a time and never a stack: a face card earned in the Court,
 * the very first card, a kept-days milestone, or else a receipt that drops in at the top. Everything
 * waiting is folded into that one moment, and closing it clears them all. Today keeps its own coach mark
 * and reminder question back while a moment is up.
 */
export function GameEvents({ back }: { back: BackKey }) {
  const { events, dismissEvent, markShown } = useEvents();
  const moment = momentOf(events);
  const shown = moment?.ids.join(',') ?? '';

  useEffect(() => {
    if (!shown) return;
    for (const id of shown.split(',')) markShown(Number(id));
  }, [shown, markShown]);

  if (!moment) return null;
  const done = () => moment.ids.forEach(dismissEvent);
  const { main } = moment;
  const milestone = moment.also.find((e): e is Extract<GameEvent, { kind: 'milestone' }> => e.kind === 'milestone');
  const alsoLine = milestone && main.kind !== 'milestone' ? `And that makes ${grouped(milestone.count)} kept days.` : null;

  if (main.kind === 'face') return <FaceEarned key={main.id} event={main} also={alsoLine} onDone={done} />;
  if (main.kind === 'first') return <FirstCard key={main.id} event={main} back={back} also={alsoLine} onDone={done} />;
  if (main.kind === 'milestone') return <Milestone key={main.id} count={main.count} onDone={done} />;
  return <ReceiptBanner key={main.id} moment={moment} back={back} onDone={done} />;
}

// Receipts --------------------------------------------------------------------------------------------

/** A card turning over from the one before (or the card back) to the new one. */
function Flip({ from, to, back, size = 'sm', delay = 220 }: { from: CardFace | null; to: CardFace; back: BackKey; size?: CardSize; delay?: number }) {
  const turn = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    turn.set(withDelay(delay, withTiming(1, { duration: reduced ? 1 : 460, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never })));
  }, [turn, delay, reduced]);
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 700 }, { rotateY: `${180 - turn.get() * 180}deg` }] }));
  const behind = useAnimatedStyle(() => ({ transform: [{ perspective: 700 }, { rotateY: `${-turn.get() * 180}deg` }] }));
  return (
    <View aria-hidden style={{ width: size === 'xl' ? 190 : size === 'lg' ? 128 : 52, height: size === 'xl' ? 266 : size === 'lg' ? 180 : 74 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: 'hidden' }, behind]}>{from ? <PlayingCard face={from} size={size} /> : <CardBack back={back} size={size} />}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: 'hidden' }, front]}>
        <PlayingCard face={to} size={size} />
      </Animated.View>
    </View>
  );
}

/**
 * The receipt for a check-in: today's card turning over, what the hand is now, and whether yesterday
 * was saved. Drops in at the top, leaves on its own after a few seconds (longer with a screen reader),
 * and can be flicked away upward or closed. A late log carries its own Undo.
 */
function ReceiptBanner({ moment, back, onDone }: { moment: Moment<GameEvent>; back: BackKey; onDone: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const deck = useDeck();
  const { undoCheckIn } = useData();
  const main = moment.main;
  const y = useSharedValue(-240);
  const finish = useEffectEvent(onDone);

  let card: { from: CardFace | null; to: CardFace } | null = null;
  let glyph: ReactNode = null;
  let copy: { eyebrow: string; title: string; line: string };
  let sound: SoundName = 'flip';
  let joker = false;
  let undo: (() => void) | null = null;
  const nameOf = (id: string) => deck?.cards.find((c) => c.habit.id === id)?.habit.name ?? null;

  if (main.kind === 'deal') {
    // A run of deals shows as one: flipped from the card before the run, unless a step down in between makes that look like a loss.
    const run = [main, ...moment.also].filter((e): e is Deal => e.kind === 'deal').sort((a, b) => a.id - b.id);
    const firstWas = run[0]?.deal.was ?? null;
    const was = improves(main.deal.card, firstWas) ? firstWas : main.deal.was;
    const wentUp = !!was && was.kind === 'card' && main.deal.card.kind === 'card' && main.deal.card.rank > was.rank;
    joker = main.deal.card.kind === 'joker';
    card = { from: was ? faceOfDay(was) : null, to: faceOfDay(main.deal.card) };
    copy = receiptCopy({
      kind: 'deal',
      level: main.level,
      joker,
      wentUp,
      first: !was,
      dropped: main.deal.handDropped,
      hand: main.deal.hand,
      handWas: run[0]?.deal.handWas ?? main.deal.handWas,
      saved: run.some((e) => !!e.saved),
    });
    const name = nameOf(main.habitId);
    if (name) copy = { ...copy, eyebrow: `${copy.eyebrow} · ${name}` };
    sound = joker ? 'joker' : main.deal.handDropped ? 'flip' : wentUp ? 'cardUp' : 'flip';
  } else if (main.kind === 'backfill') {
    card = { from: null, to: faceOfDay(main.deal.card) };
    copy = receiptCopy({ kind: 'backfill', level: main.level, hand: main.deal.hand });
    sound = 'cardUp';
    const { habitId, day } = main;
    undo = () => {
      feel.tick();
      undoCheckIn(habitId, day).catch(() => {});
      onDone();
    };
  } else if (main.kind === 'rung') {
    const info = SUIT_INFO[main.suit];
    glyph = <SuitGlyph suit={main.suit} size={40} color={t.onRaised} />;
    copy = receiptCopy({ kind: 'rung', suit: info.name, part: info.part, days: main.days });
    sound = 'cardUp';
  } else {
    copy = { eyebrow: '', title: '', line: '' };
  }
  // The card itself leads the line: "Seven of Spades. Your hand is now a Pair of Sevens."
  const line = card && !joker ? `${faceLabel(card.to)}. ${copy.line}`.trim() : copy.line;
  const spoken = `${copy.eyebrow}. ${copy.title}. ${line}`;

  useEffect(() => {
    const end = () => finish();
    y.set(withSpring(0, { damping: 16, stiffness: 180, reduceMotion: ReduceMotion.System }));
    playSound(sound, 200);
    if (joker) feel.joker();
    else feel.flip();
    AccessibilityInfo.announceForAccessibility(spoken);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const leave = () =>
      y.set(
        withTiming(-240, { duration: 240, reduceMotion: ReduceMotion.Never }, (ok) => {
          'worklet';
          if (ok) scheduleOnRN(end);
        }),
      );
    AccessibilityInfo.isScreenReaderEnabled()
      .catch(() => false)
      .then((reader) => {
        if (alive) timer = setTimeout(leave, reader && Platform.OS !== 'web' ? 8000 : 5000);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [y, sound, joker, spoken]);

  const close = () => onDone();
  const flick = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      y.set(Math.min(0, e.translationY) + Math.max(0, e.translationY) * 0.15);
    })
    .onEnd((e) => {
      if (e.translationY < -24 || e.velocityY < -600) {
        y.set(
          withTiming(-240, { duration: 160, reduceMotion: ReduceMotion.Never }, (ok) => {
            'worklet';
            if (ok) scheduleOnRN(close);
          }),
        );
      } else y.set(withSpring(0, { damping: 16, stiffness: 200 }));
    });
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + space.sm, paddingHorizontal: space.md }}>
      {joker ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 440 }}>
          <Burst kind="joker" color="#FFFFFF" />
        </View>
      ) : null}
      <GestureDetector gesture={flick}>
        <Animated.View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={spoken}
          accessibilityActions={[{ name: 'escape', label: 'Close' }]}
          onAccessibilityEscape={close}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'escape') close();
          }}
          style={[
            { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: 26, padding: space.md, paddingRight: space.sm, boxShadow: '0 14px 34px rgba(10, 8, 14, 0.38)' },
            raisedStyle(t),
            panel,
          ]}
        >
          {card ? <Flip from={card.from} to={card.to} back={back} /> : <View style={{ width: 52, height: 64, alignItems: 'center', justifyContent: 'center' }}>{glyph}</View>}
          <View style={{ flex: 1, gap: 1 }}>
            <Label color={t.onRaisedSecondary} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome}>
              {copy.eyebrow}
            </Label>
            <Display size={20} color={t.onRaised} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome}>
              {copy.title}
            </Display>
            {line ? (
              <Body size={13} weight="bold" color={t.onRaised} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 17 }}>
                {line}
              </Body>
            ) : null}
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            {undo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Undo the late log"
                onPress={undo}
                style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: t.onRaised, opacity: pressed ? 0.8 : 1 })}
              >
                <Body size={13} weight="heavy" color={t.raised} maxFontSizeMultiplier={fontScale.chrome}>
                  Undo
                </Body>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={close}
                hitSlop={4}
                style={({ pressed }) => ({ width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: TAP / 2, opacity: pressed ? 0.6 : 1 })}
              >
                <Body size={20} weight="heavy" color={t.onRaisedSecondary} maxFontSizeMultiplier={1}>
                  ×
                </Body>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// Big moments -----------------------------------------------------------------------------------------

/**
 * A full-screen moment over the night. It ignores touches for a moment, so the finger that swiped the
 * card can't close it by accident, and closes with its button or a swipe down. The dimmed night behind
 * is only a picture: it isn't a button and isn't read out.
 */
function Stage({ label, onClose, children }: { label: string; onClose: () => void; children: (ready: boolean) => ReactNode }) {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const y = useSharedValue(0);
  const finish = useEffectEvent(() => AccessibilityInfo.announceForAccessibility(label));

  useEffect(() => {
    finish();
    const id = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(id);
  }, []);

  const close = () => onClose();
  const swipe = Gesture.Pan()
    .enabled(ready)
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        y.set(withTiming(900, { duration: 220, reduceMotion: ReduceMotion.Never }));
        scheduleOnRN(close);
      } else y.set(withSpring(0, { damping: 18, stiffness: 200 }));
    });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }], opacity: 1 - Math.min(0.6, y.get() / 600) }));

  return (
    <Modal transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { backgroundColor: NIGHT }]} />
        <GestureDetector gesture={swipe}>
          <Animated.View
            accessibilityViewIsModal
            role="dialog"
            aria-modal
            aria-label={label}
            style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.xl, gap: space.lg }, slide]}
          >
            {children(ready)}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function FaceEarned({ event, also, onDone }: { event: Extract<GameEvent, { kind: 'face' }>; also: string | null; onDone: () => void }) {
  const info = SUIT_INFO[event.suit];
  const askReview = useReviewAsk();
  const scale = useSharedValue(0.3);
  const rotate = useSharedValue(-28);
  const joker = useSharedValue(0);
  const withJoker = event.joker;

  useEffect(() => {
    feel.joker();
    playSound('face');
    if (withJoker) playSound('joker', 700);
    scale.set(withSpring(1, { damping: 10, reduceMotion: ReduceMotion.System }));
    rotate.set(withDelay(80, withSpring(-4, { damping: 8, reduceMotion: ReduceMotion.System })));
    joker.set(withDelay(700, withSequence(withSpring(1.12, { damping: 6 }), withSpring(1))));
  }, [scale, rotate, joker, withJoker]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }, { rotate: `${rotate.get()}deg` }] }));
  const jokerStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, joker.get()), transform: [{ scale: joker.get() }, { rotate: '9deg' }] }));
  const court: CardFace = faceOfCourt(event.suit, event.face);
  const who = event.identities.length ? event.identities.slice(0, 2).join(' and ') : `your ${info.part.toLowerCase()}`;
  const close = () => {
    onDone();
    if (event.face.face !== 'jack') askReview('face');
  };

  return (
    <Stage label={`${event.face.name} of ${info.name} earned`} onClose={close}>
      {(ready) => (
        <>
          <Label color={chip.bg} maxFontSizeMultiplier={fontScale.chrome}>{`The Court · ${info.name} · ${info.part}`}</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center' }} aria-hidden>
            <Animated.View style={cardStyle}>
              <PlayingCard face={court} size="xl" />
            </Animated.View>
            {withJoker ? (
              <Animated.View style={[{ marginLeft: -44, marginTop: 100 }, jokerStyle]}>
                <PlayingCard face={{ kind: 'joker' }} size="md" />
              </Animated.View>
            ) : null}
          </View>
          <View style={{ gap: space.sm, alignItems: 'center' }}>
            <Display size={34} color={MOON} header style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>{`${event.face.name} of ${info.name}`}</Display>
            <Display size={20} color={chip.bg} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>{`“${event.face.title}”`}</Display>
            <Body color={MOON_SOFT} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
              {`${grouped(event.face.votes)} kept days for ${who}. Once the day ends, face cards are never lost.`}
            </Body>
            {withJoker ? (
              <Body weight="bold" color={MOON} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
                Today’s card turned into a Joker. It plays as whatever card makes your best hand.
              </Body>
            ) : null}
            {also ? (
              <Body weight="bold" color={MOON_SOFT} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
                {also}
              </Body>
            ) : null}
          </View>
          <SaveDeckCard moment="face" />
          <View style={{ alignSelf: 'stretch', gap: space.sm }}>
            <Button label="Keep playing" onPress={close} disabled={!ready} colors={{ bg: MOON, fg: '#17121F' }} />
            <ShareButton target={{ kind: 'face', suit: event.suit, face: event.face, identities: event.identities, days: event.face.votes }} />
          </View>
        </>
      )}
    </Stage>
  );
}

/** The very first card: it turns over big, once, with what it starts. */
function FirstCard({ event, back, also, onDone }: { event: Extract<GameEvent, { kind: 'first' }>; back: BackKey; also: string | null; onDone: () => void }) {
  const deck = useDeck();
  const { undoCheckIn } = useData();
  const warmup = deck?.game.current.warmup ?? false;

  useEffect(() => {
    playSound('cardUp', 500);
    const id = setTimeout(() => feel.flip(), 500);
    return () => clearTimeout(id);
  }, []);

  const undo = () => {
    feel.tick();
    undoCheckIn(event.habitId).catch(() => {});
    onDone();
  };

  return (
    <Stage label="Your first card" onClose={onDone}>
      {(ready) => (
        <>
          <Label color={chip.bg} maxFontSizeMultiplier={fontScale.chrome}>
            Your first card
          </Label>
          <Flip from={null} to={faceOfDay(event.deal.card)} back={back} size="xl" delay={450} />
          <View style={{ gap: space.sm, alignItems: 'center' }}>
            <Display size={32} color={MOON} header style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
              {faceLabel(faceOfDay(event.deal.card))}
            </Display>
            <Body color={MOON_SOFT} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
              {warmup
                ? 'Every day you keep something deals a card. This is a warm-up week: your cards stack up, and your first full hand deals on Monday.'
                : 'Every day you keep something deals a card. By Sunday your cards make this week’s hand.'}
            </Body>
            {also ? (
              <Body weight="bold" color={MOON_SOFT} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
                {also}
              </Body>
            ) : null}
          </View>
          <View style={{ alignSelf: 'stretch', gap: space.xs }}>
            <Button label="Keep going" onPress={onDone} disabled={!ready} colors={{ bg: MOON, fg: '#17121F' }} />
            <Button label="Undo" variant="quiet" onPress={undo} disabled={!ready} colors={{ bg: 'transparent', fg: MOON_SOFT }} hint="Takes back this check-in" />
          </View>
        </>
      )}
    </Stage>
  );
}

/** A round number of kept days across every card. */
function Milestone({ count, onDone }: { count: number; onDone: () => void }) {
  const pop = useSharedValue(0.6);
  useEffect(() => {
    playSound('cardUp');
    feel.joker();
    pop.set(withSpring(1, { damping: 9, reduceMotion: ReduceMotion.System }));
  }, [pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <Stage label={`${grouped(count)} kept days`} onClose={onDone}>
      {(ready) => (
        <>
          <Animated.View style={[{ alignItems: 'center' }, style]}>
            <Display size={96} color={MOON} maxFontSizeMultiplier={1} style={{ lineHeight: 100 }}>
              {grouped(count)}
            </Display>
            <Label color={chip.bg} maxFontSizeMultiplier={fontScale.chrome}>
              Kept days
            </Label>
          </Animated.View>
          <Body color={MOON_SOFT} style={{ textAlign: 'center', maxWidth: 300 }} maxFontSizeMultiplier={fontScale.chrome}>
            Every one of them still counts. A day off never takes one back.
          </Body>
          <View style={{ alignSelf: 'stretch', borderTopWidth: 1, borderColor: withAlpha(MOON, 0.16), paddingTop: space.lg }}>
            <Button label="Keep going" onPress={onDone} disabled={!ready} colors={{ bg: MOON, fg: '#17121F' }} />
          </View>
        </>
      )}
    </Stage>
  );
}
