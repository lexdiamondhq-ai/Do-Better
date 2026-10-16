import { usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { SUIT_INFO } from '@/engine/cards';
import { weekday } from '@/engine/day';
import type { BackKey } from '@/engine/game';
import { improves } from '@/engine/game';
import { eventStale, grouped, JOKER_LINE, momentOf, receiptCopy, type JokerMove, type Moment, type ReceiptCopy, type RungNote } from '@/engine/today';
import { useData, useEvents, type GameEvent } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { useReviewAsk } from '@/lib/review';
import { identityPhrase } from '@/lib/share';
import { playSound, type SoundName } from '@/lib/sound';
import { withAlpha } from '@/theme/color';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { chip, fontScale, radius, space, TAP, themeOn } from '@/theme/tokens';

import { Burst } from './Burst';
import { CardBack } from './CardBack';
import { faceLabel, faceOfCourt, faceOfDay, PlayingCard, type CardFace, type CardSize } from './PlayingCard';
import { SaveDeckCard } from './SaveDeckCard';
import { ShareButton } from './ShareButton';
import { SuitGlyph } from './Suit';
import { Body, Button, Display, Label, raisedStyle } from './ui';

type Deal = Extract<GameEvent, { kind: 'deal' }>;
type Backfill = Extract<GameEvent, { kind: 'backfill' }>;
type Rung = Extract<GameEvent, { kind: 'rung' }>;

/** The night behind a big moment, and the light text on it. */
const NIGHT = 'rgba(10, 8, 14, 0.95)';
const MOON = '#FFFDF8';
const MOON_SOFT = 'rgba(255, 253, 248, 0.78)';
/** The night as a solid colour, for controls drawn from the theme (such as Share) to pick light text. */
const NIGHT_SOLID = '#0A080E';
/** Below this window height a big moment shows its card one size smaller, so its buttons stay on screen. */
const SHORT_SCREEN = 760;
/**
 * A big moment waits this long after the check-in that caused it, so the card can finish leaving the
 * table, its stamp ("First move done") can be read and the burst can play before the night comes down.
 */
const MOMENT_DELAY_MS = 520;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** The tab screens. Anything else (a habit's page) has its own header across the top, which a receipt must not cover. */
const TAB_PATHS = new Set(['/', '/hands', '/you', '/playbook']);

/** A card's name without the other suits it also carries: "Ten of Clubs". */
const shortName = (face: CardFace) => faceLabel(face.kind === 'card' ? { ...face, also: undefined } : face);

/** "And 150 days of Mind in the Court." for a rung reached by the same check-in as a bigger moment. */
const rungLine = (rung: Rung) => `And ${grouped(rung.days)} days of ${SUIT_INFO[rung.suit].part} in the Court.`;

/**
 * What the last check-in did, one moment at a time and never a stack: a face card earned in the Court,
 * the very first card, a kept-days milestone, or else a receipt that drops in at the top. Everything
 * waiting is folded into that one moment, and closing it clears them all. Today keeps its own coach mark
 * and reminder question back while a moment is up.
 */
export function GameEvents({ back }: { back: BackKey }) {
  const { events, dismissEvent, markShown } = useEvents();
  const { undoCheckIn } = useData();
  const deck = useDeck();
  // A receipt whose check-in was undone or changed since (from the Undo chip, a pill or a habit's page)
  // goes at once, so nothing celebrates a card that is no longer there.
  const stale = deck
    ? events.filter((e) =>
        eventStale(e, deck.today, {
          level: (habitId, day) => deck.cards.find((c) => c.habit.id === habitId)?.checkIns.get(day) ?? null,
          suitDays: (suit) => deck.court.find((c) => c.suit === suit)?.votes ?? 0,
        }),
      )
    : [];
  const live = stale.length ? events.filter((e) => !stale.includes(e)) : events;
  const moment = momentOf(live);
  const shown = moment?.ids.join(',') ?? '';
  const gone = stale.map((e) => e.id).join(',');

  useEffect(() => {
    if (!shown) return;
    for (const id of shown.split(',')) markShown(Number(id));
  }, [shown, markShown]);

  useEffect(() => {
    if (!gone) return;
    for (const id of gone.split(',')) dismissEvent(Number(id));
  }, [gone, dismissEvent]);

  if (!moment) return null;
  const done = () => moment.ids.forEach(dismissEvent);
  const { main } = moment;
  const milestone = moment.also.find((e): e is Extract<GameEvent, { kind: 'milestone' }> => e.kind === 'milestone');
  const rung = moment.also.find((e): e is Rung => e.kind === 'rung');
  const alsoLine = [milestone && main.kind !== 'milestone' ? `And that makes ${grouped(milestone.count)} kept days.` : null, rung ? rungLine(rung) : null].filter(Boolean).join(' ') || null;
  // A day logged late that set off a bigger moment: the moment keeps the late log's Undo, which its receipt would have had.
  const late = moment.also.find((e): e is Backfill => e.kind === 'backfill') ?? null;
  const undoLate = late
    ? () => {
        feel.tick();
        undoCheckIn(late.habitId, late.day).catch(() => {});
        done();
      }
    : null;

  // A big moment rises once the card that caused it has left the table.
  if (main.kind === 'face')
    return (
      <Later key={main.id} ms={MOMENT_DELAY_MS}>
        <FaceEarned event={main} also={alsoLine} onUndoLate={undoLate} onDone={done} />
      </Later>
    );
  if (main.kind === 'first')
    return (
      <Later key={main.id} ms={MOMENT_DELAY_MS}>
        <FirstCard event={main} back={back} also={alsoLine} onDone={done} />
      </Later>
    );
  if (main.kind === 'milestone')
    return (
      <Later key={main.id} ms={MOMENT_DELAY_MS}>
        <Milestone count={main.count} also={rung ? rungLine(rung) : null} onUndoLate={undoLate} onDone={done} />
      </Later>
    );
  return <ReceiptBanner key={main.id} moment={moment} back={back} onDone={done} />;
}

/** Shows its children only after `ms`. Remount it with a new key to wait again. */
function Later({ ms, children }: { ms: number; children: ReactNode }) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDue(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return due ? children : null;
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
  // On a habit's page the receipt drops in under the page's own back and Edit buttons, never over them.
  const pushed = !TAB_PATHS.has(usePathname());
  const main = moment.main;
  const y = useSharedValue(-240);
  const finish = useEffectEvent(onDone);

  let card: { from: CardFace | null; to: CardFace } | null = null;
  let glyph: ReactNode = null;
  let copy: ReceiptCopy;
  let sound: SoundName = 'flip';
  let joker = false;
  let undo: (() => void) | null = null;
  const nameOf = (id: string) => deck?.cards.find((c) => c.habit.id === id)?.habit.name ?? null;
  const rungEvent = main.kind === 'rung' ? null : moment.also.find((e): e is Rung => e.kind === 'rung');
  const rung: RungNote | null = rungEvent ? { part: SUIT_INFO[rungEvent.suit].part, days: rungEvent.days } : null;

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
      card: shortName(card.to),
      joker,
      wentUp,
      first: !was,
      dropped: main.deal.handDropped,
      hand: main.deal.hand,
      handWas: run[0]?.deal.handWas ?? main.deal.handWas,
      saved: run.some((e) => !!e.saved),
      rung,
    });
    sound = joker ? 'joker' : main.deal.handDropped ? 'flip' : wentUp ? 'cardUp' : 'flip';
  } else if (main.kind === 'backfill') {
    const was = main.deal.was;
    joker = main.deal.card.kind === 'joker';
    const wentUp = !!was && was.kind === 'card' && main.deal.card.kind === 'card' && main.deal.card.rank > was.rank;
    card = { from: was ? faceOfDay(was) : null, to: faceOfDay(main.deal.card) };
    // Yesterday turned into a Joker with no face card earned now: the week's Joker moved there from today
    // (its face card now falls on yesterday, or yesterday became the week's first kept day), or a waiting one landed.
    let moved: JokerMove | null = null;
    if (joker && was?.kind !== 'joker' && deck) {
      const face = deck.game.faces.find((f) => f.day === main.day);
      moved = {
        day: WEEKDAYS[weekday(main.day)],
        face: face ? `${face.face.name} of ${SUIT_INFO[face.suit].name}` : null,
        today: deck.todayCard?.kind === 'card' ? shortName(faceOfDay(deck.todayCard)) : null,
      };
    }
    copy = receiptCopy({
      kind: 'backfill',
      level: main.level,
      card: shortName(card.to),
      joker,
      blank: !was,
      hand: main.deal.hand,
      handWas: main.deal.handWas,
      dropped: main.deal.handDropped,
      wentUp,
      moved,
      rung,
    });
    sound = main.deal.handDropped ? 'flip' : 'cardUp';
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
    copy = { eyebrow: '', title: '', lead: null, line: '', notes: [] };
  }
  if (main.kind === 'deal' || main.kind === 'backfill') {
    const name = nameOf(main.habitId);
    if (name) copy = { ...copy, eyebrow: `${copy.eyebrow} · ${name}` };
  }
  const spoken = [copy.eyebrow, copy.title, copy.lead, copy.line, ...copy.notes]
    .filter(Boolean)
    .map((part) => String(part).replace(/\.$/, ''))
    .join('. ')
    .concat('.');

  useEffect(() => {
    const end = () => finish();
    y.set(withSpring(0, { mass: 1, damping: 16, stiffness: 180, reduceMotion: ReduceMotion.System }));
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
      } else y.set(withSpring(0, { mass: 1, damping: 16, stiffness: 200 }));
    });
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + space.sm + (pushed ? TAP + space.sm : 0), paddingHorizontal: space.md }}>
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
          // The banner reads as one element, so its Undo is offered as an action too.
          accessibilityActions={undo ? [{ name: 'undo', label: 'Undo the late log' }, { name: 'escape', label: 'Close' }] : [{ name: 'escape', label: 'Close' }]}
          onAccessibilityEscape={close}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'escape') close();
            if (e.nativeEvent.actionName === 'undo' && undo) undo();
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
            {copy.lead ? (
              // The news that must never be cut leads: yesterday saved too, or a Joker that moved.
              <Body size={13} weight="heavy" color={t.onRaised} numberOfLines={3} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 17 }}>
                {copy.lead}
              </Body>
            ) : null}
            {copy.line ? (
              <Body size={13} weight="bold" color={t.onRaised} numberOfLines={3} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 17 }}>
                {copy.line}
              </Body>
            ) : null}
            {copy.notes.map((note) => (
              <Body key={note} size={12} weight="bold" color={t.onRaisedSecondary} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 16 }}>
                {note}
              </Body>
            ))}
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
  // When the moment is taller than the screen (a small phone, a guest's save card, large text) it scrolls,
  // and closes with its button instead of a swipe down, which would fight the scroll.
  const [room, setRoom] = useState({ view: 0, content: 0 });
  const tall = room.view > 0 && room.content > room.view + 1;
  const y = useSharedValue(0);
  const finish = useEffectEvent(() => AccessibilityInfo.announceForAccessibility(label));

  useEffect(() => {
    finish();
    const id = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(id);
  }, []);

  const close = () => onClose();
  const swipe = Gesture.Pan()
    .enabled(ready && !tall)
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        y.set(withTiming(900, { duration: 220, reduceMotion: ReduceMotion.Never }));
        scheduleOnRN(close);
      } else y.set(withSpring(0, { mass: 1, damping: 18, stiffness: 200 }));
    });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }], opacity: 1 - Math.min(0.6, y.get() / 600) }));

  return (
    <Modal transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      {/* The night is dark in either theme, so the clock and battery go light over it. */}
      <StatusBar style="light" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { backgroundColor: NIGHT }]} />
        <GestureDetector gesture={swipe}>
          <Animated.View accessibilityViewIsModal role="dialog" aria-modal aria-label={label} style={[{ flex: 1 }, slide]}>
            <ScrollView
              scrollEnabled={tall}
              showsVerticalScrollIndicator={tall}
              bounces={false}
              onLayout={(e) => {
                const view = e.nativeEvent.layout.height;
                setRoom((r) => (r.view === view ? r : { ...r, view }));
              }}
              onContentSizeChange={(_w, content) => setRoom((r) => (r.content === content ? r : { ...r, content }))}
              contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.xl, gap: space.lg }}
            >
              {children(ready)}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * The button that carries on from a big moment. Until the moment is ready it ignores presses (so the finger
 * that swiped can't close it by accident) but it already holds the keyboard's focus, so Enter never lands on
 * Share instead; once ready, Enter carries on.
 */
function MomentButton({ label, ready, onPress }: { label: string; ready: boolean; onPress: () => void }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (ref.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, [ready]);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !ready }}
      onPress={() => {
        if (ready) onPress();
      }}
      style={({ pressed }) => ({
        minHeight: TAP,
        backgroundColor: MOON,
        borderRadius: radius.pill,
        paddingVertical: space.lg,
        paddingHorizontal: space.xl,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: ready ? (pressed ? 0.75 : 1) : 0.4,
        transform: [{ scale: ready && pressed ? 0.98 : 1 }],
      })}
    >
      <Body weight="heavy" size={16} color="#17121F" maxFontSizeMultiplier={fontScale.chrome} style={{ textAlign: 'center' }}>
        {label}
      </Body>
    </Pressable>
  );
}

function FaceEarned({
  event,
  also,
  onUndoLate,
  onDone,
}: {
  event: Extract<GameEvent, { kind: 'face' }>;
  also: string | null;
  /** Takes back the day logged late that earned this face card, when one did. */
  onUndoLate: (() => void) | null;
  onDone: () => void;
}) {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const short = height < SHORT_SCREEN;
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
    // A firm spring: the card pops into place with only a small overshoot (about 3%), so it never grows over the
    // title below it. Every spring here names its mass: Reanimated 4 springs default to a mass of 4, which turns
    // these settings into a wobble that overshoots by a fifth.
    scale.set(withSpring(1, { mass: 1, damping: 20, stiffness: 210, reduceMotion: ReduceMotion.System }));
    rotate.set(withDelay(80, withSpring(-4, { mass: 1, damping: 14, stiffness: 160, reduceMotion: ReduceMotion.System })));
    joker.set(withDelay(700, withSequence(withSpring(1.06, { mass: 1, damping: 18, stiffness: 240, overshootClamping: true, reduceMotion: ReduceMotion.System }), withSpring(1, { mass: 1, damping: 18, stiffness: 200, reduceMotion: ReduceMotion.System }))));
  }, [scale, rotate, joker, withJoker]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }, { rotate: `${rotate.get()}deg` }] }));
  const jokerStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, joker.get()), transform: [{ scale: joker.get() }, { rotate: '9deg' }] }));
  const court: CardFace = faceOfCourt(event.suit, event.face);
  // "29 kept days. You’re a good friend." in the player's own words, or the part of them it built when they gave none.
  const who = identityPhrase(event.identities, 'you');
  const days = who ? `${grouped(event.face.votes)} kept days. ${who}.` : `${grouped(event.face.votes)} kept days of ${info.part}.`;
  // A Joker always lands on a day kept on the day itself, so it is today's card when it comes now. Otherwise, where it will.
  const jokerLine = withJoker
    ? `Today’s card turned into a Joker. ${JOKER_LINE}`
    : event.jokerLands === 'today'
      ? 'Keep any habit today and it’s dealt as a Joker.'
      : event.jokerLands === 'next-week'
        ? 'Its Joker waits for next week’s first kept day.'
        : null;
  const close = () => {
    onDone();
    if (event.face.face !== 'jack') askReview('face');
  };

  return (
    <Stage label={`${event.face.name} of ${info.name} earned`} onClose={close}>
      {(ready) => (
        <>
          <Label color={chip.bg} maxFontSizeMultiplier={fontScale.chrome}>{`The Court · ${info.name} · ${info.part}`}</Label>
          {/* A little room under the card, so its tilted corner stays clear of the title at the top of the pop. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.xs }} aria-hidden>
            <Animated.View style={cardStyle}>
              <PlayingCard face={court} size={short ? 'lg' : 'xl'} />
            </Animated.View>
            {withJoker ? (
              <Animated.View style={[short ? { marginLeft: -32, marginTop: 70 } : { marginLeft: -44, marginTop: 100 }, jokerStyle]}>
                <PlayingCard face={{ kind: 'joker' }} size={short ? 'sm' : 'md'} />
              </Animated.View>
            ) : null}
          </View>
          <View style={{ gap: space.sm, alignItems: 'center' }}>
            <Display size={short ? 30 : 34} color={MOON} header style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>{`${event.face.name} of ${info.name}`}</Display>
            <Display size={20} color={chip.bg} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>{`“${event.face.title}”`}</Display>
            <Body color={MOON_SOFT} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
              {`${days} Once the day ends, face cards are never lost.`}
            </Body>
            {jokerLine ? (
              <Body weight="bold" color={MOON} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
                {jokerLine}
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
            <MomentButton label="Keep playing" ready={ready} onPress={close} />
            {/* Share draws itself from the theme: on the night it needs the light text of a dark table. */}
            <ThemeScope theme={themeOn(NIGHT_SOLID, t)}>
              <ShareButton target={{ kind: 'face', suit: event.suit, face: event.face, identities: event.identities, days: event.face.votes }} />
            </ThemeScope>
            {onUndoLate ? <Button label="Undo the late log" variant="quiet" onPress={onUndoLate} disabled={!ready} colors={{ bg: 'transparent', fg: MOON_SOFT }} hint="Takes back yesterday’s check-in" /> : null}
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
  const { height } = useWindowDimensions();
  const warmup = deck?.game.current.warmup ?? false;

  useEffect(() => {
    playSound('cardUp', 500);
    const id = setTimeout(() => feel.flip(), 500);
    return () => clearTimeout(id);
  }, []);

  const undo = () => {
    feel.tick();
    // The first card can be yesterday's, logged late: the undo goes to the day it was dealt for.
    undoCheckIn(event.habitId, event.deal.card.day).catch(() => {});
    onDone();
  };

  return (
    <Stage label="Your first card" onClose={onDone}>
      {(ready) => (
        <>
          <Label color={chip.bg} maxFontSizeMultiplier={fontScale.chrome}>
            Your first card
          </Label>
          <Flip from={null} to={faceOfDay(event.deal.card)} back={back} size={height < SHORT_SCREEN ? 'lg' : 'xl'} delay={450} />
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
            <MomentButton label="Keep going" ready={ready} onPress={onDone} />
            <Button label="Undo" variant="quiet" onPress={undo} disabled={!ready} colors={{ bg: 'transparent', fg: MOON_SOFT }} hint="Takes back this check-in" />
          </View>
        </>
      )}
    </Stage>
  );
}

/** A round number of kept days across every card. `also` is a Court rung the same check-in reached. */
function Milestone({ count, also, onUndoLate, onDone }: { count: number; also: string | null; onUndoLate: (() => void) | null; onDone: () => void }) {
  const pop = useSharedValue(0.6);
  useEffect(() => {
    playSound('cardUp');
    feel.joker();
    pop.set(withSpring(1, { mass: 1, damping: 9, stiffness: 100, reduceMotion: ReduceMotion.System }));
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
          {also ? (
            <Body weight="bold" color={MOON_SOFT} style={{ textAlign: 'center', maxWidth: 300 }} maxFontSizeMultiplier={fontScale.chrome}>
              {also}
            </Body>
          ) : null}
          <View style={{ alignSelf: 'stretch', borderTopWidth: 1, borderColor: withAlpha(MOON, 0.16), paddingTop: space.lg, gap: space.xs }}>
            <MomentButton label="Keep going" ready={ready} onPress={onDone} />
            {onUndoLate ? <Button label="Undo the late log" variant="quiet" onPress={onUndoLate} disabled={!ready} colors={{ bg: 'transparent', fg: MOON_SOFT }} hint="Takes back yesterday’s check-in" /> : null}
          </View>
        </>
      )}
    </Stage>
  );
}
