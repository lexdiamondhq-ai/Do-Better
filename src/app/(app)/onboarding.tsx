import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ask } from '@/components/Ask';
import { Chips } from '@/components/Chips';
import { CardSlot, PlayingCard, SuitTag, type CardFace } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Chip, Display, Label, raisedStyle } from '@/components/ui';
import { SUIT_INFO, SUITS, type Suit } from '@/engine/cards';
import { RECIPES, suggestRecipes, type Recipe } from '@/engine/playbook';
import { useData } from '@/lib/data';
import * as feel from '@/lib/feel';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, cardFace, fontScale, fonts, INK, palette, radius, space, suitColors, TAP, typeScale, WHITE } from '@/theme/tokens';

/**
 * First run: three cards that teach the game, then who you're becoming, then a starter deck, all
 * dealt with one write. Opened with `?tour=1` (an older link), it shows only the three cards.
 */

type Kept = 'floor' | 'ceiling';

type TourCard = { felt: string; title: string; sub?: string; body: string };

const TOUR: readonly TourCard[] = [
  {
    felt: cardColors.pine.bg,
    title: 'Every habit is a card.',
    body: 'Each one has a Floor, the least that still counts, and a Ceiling, a great day. Reach either and the day is kept.',
  },
  {
    felt: palette.nightCard,
    title: 'Every day you keep anything deals a playing card.',
    sub: 'Every week plays as a poker hand.',
    body: 'The more you keep, the better the card can be. At Sunday midnight your best five cards pay out in chips.',
  },
  {
    felt: cardColors.sky.bg,
    title: 'Missing once is human.',
    sub: 'Nothing here resets to zero.',
    body: 'Kept nothing yesterday? Keep anything today and yesterday still gets a card. Only Sunday can’t be saved: the hand pays out at midnight.',
  },
];

/** What the practice card says, before and after a drag. */
const PRACTICE: Record<'idle' | 'sideways' | Kept, string> = {
  idle: 'Try it: drag Read down for the Floor or up for the Ceiling.',
  sideways: 'In the game, sideways sends a card to the back of today’s deck. Try down or up.',
  floor: 'Floor. The day is kept, and it deals a card.',
  ceiling: 'Ceiling. The day is kept, and it deals a card.',
};

/** Identities to start from, grouped by suit. */
const IDENTITIES: { suit: Suit; identities: string[] }[] = SUITS.map((suit) => ({
  suit,
  identities: [...new Set(RECIPES.filter((r) => r.suit === suit).map((r) => r.identity))],
}));

const SUIT_LINE = `Each part of you is a suit: ${SUITS.map((s) => `${SUIT_INFO[s].glyph} ${SUIT_INFO[s].part}`).join(' ')}`;

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function Onboarding() {
  const router = useRouter();
  const replay = useLocalSearchParams<{ tour?: string }>().tour === '1';
  const { createHabits, saveProfile } = useData();
  const [step, setStep] = useState(0);
  const [identities, setIdentities] = useState<string[]>([]);
  const [northStar, setNorthStar] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function finish(recipes: Recipe[]) {
    setBusy(true);
    try {
      // Each card takes its suit's colour, so a glance at the deck shows which part of you it builds. The
      // whole deck is one write, so trying again after a failure never makes a card twice. The why is left
      // for the player to write in their own words.
      await createHabits(
        recipes.map((r) => ({
          name: r.name,
          identity: r.identity,
          floorLabel: r.floor,
          ceilingLabel: r.ceiling,
          twoMinuteLabel: r.twoMinute,
          color: suitColors[r.suit].habit,
          suit: r.suit,
          anchor: r.anchor,
          whenWhere: '',
          why: '',
          recipeKey: r.key,
        })),
      );
      await saveProfile({ northStar: northStar.trim() || null, onboarded: true });
      feel.ceiling();
      router.replace('/');
      if (recipes.length === 0) router.push('/habit/edit');
    } catch (e) {
      ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
      setBusy(false);
    }
  }

  if (step < TOUR.length) {
    return (
      <Tour
        index={step}
        replay={replay}
        onMove={setStep}
        onFinish={() => (replay ? router.back() : setStep(TOUR.length))}
        onSkip={() => (replay ? router.back() : setStep(TOUR.length))}
      />
    );
  }

  if (step === TOUR.length) {
    return (
      <Identity
        identities={identities}
        onToggle={(id) => setIdentities((l) => toggle(l, id))}
        northStar={northStar}
        onNorthStar={setNorthStar}
        onBack={() => setStep(TOUR.length - 1)}
        onNext={() => {
          setPicked(
            suggestRecipes(identities, [], 3)
              .filter((r) => identities.includes(r.identity))
              .map((r) => r.key),
          );
          setStep(TOUR.length + 1);
        }}
      />
    );
  }

  return (
    <DeckStep
      suggestions={suggestRecipes(identities, [], 12)}
      picked={picked}
      onToggle={(key) => setPicked((l) => toggle(l, key))}
      busy={busy}
      onBack={() => setStep(TOUR.length)}
      onDeal={finish}
    />
  );
}

/* ---------------------------------------------------------------- the tour */

function Tour({ index, replay, onMove, onFinish, onSkip }: { index: number; replay: boolean; onMove: (i: number) => void; onFinish: () => void; onSkip: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const [practice, setPractice] = useState<'idle' | 'sideways' | Kept>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const card = TOUR[index];
  const last = index === TOUR.length - 1;

  function go(to: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (to < 0) return;
    if (to >= TOUR.length) {
      onFinish();
      return;
    }
    feel.tick();
    setPractice('idle');
    onMove(to);
  }

  function kept(level: Kept) {
    if (level === 'floor') feel.floor();
    else feel.ceiling();
    setPractice(level);
    AccessibilityInfo.announceForAccessibility(PRACTICE[level]);
    timer.current = setTimeout(() => go(1), 1700);
  }

  function sideways() {
    setPractice('sideways');
    AccessibilityInfo.announceForAccessibility(PRACTICE.sideways);
  }

  const done = practice === 'floor' || practice === 'ceiling' ? practice : null;

  const art = (scale: number): ReactNode => {
    if (index === 1) return <HandArt />;
    if (index === 2) return <ComebackArt />;
    return done ? <DealtArt level={done} /> : <PracticeArt scale={scale} onKept={kept} onSideways={sideways} />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.md, paddingHorizontal: space.lg, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TAP }}>
        <Label>{replay ? 'How it plays' : `${index + 1} of ${TOUR.length}`}</Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={replay ? 'Close' : 'Skip the tour'}
          onPress={onSkip}
          hitSlop={8}
          style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.6 : 1 })}
        >
          <Body weight="heavy" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
            {replay ? 'Close' : 'Skip the tour'}
          </Body>
        </Pressable>
      </View>

      <View style={{ flex: 1, borderRadius: radius.card, overflow: 'hidden', backgroundColor: t.bgRaised, borderWidth: t.edge === 'transparent' ? 0 : 1, borderColor: t.edge }}>
        <Pressable accessible={false} onPress={index === 0 ? undefined : () => go(index + 1)} style={{ flex: 1, minHeight: 150, overflow: 'hidden', backgroundColor: card.felt }}>
          <FitStage key={index} w={STAGE.w} h={STAGE.h}>
            {art}
          </FitStage>
        </Pressable>
        <Pressable
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={[card.title, card.sub, card.body, index === 0 ? PRACTICE[practice] : null].filter(Boolean).join(' ')}
          accessibilityHint="Swipe up or down to move between the cards."
          accessibilityValue={{ min: 1, max: TOUR.length, now: index + 1, text: `Card ${index + 1} of ${TOUR.length}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'decrement') go(index - 1);
            else go(index + 1);
          }}
          onPress={() => go(index + 1)}
          style={{ paddingHorizontal: compact ? space.lg : space.xl, paddingTop: compact ? space.lg : space.xl, paddingBottom: compact ? space.lg : space.xl, gap: compact ? space.xs : space.sm }}
        >
          <Display size={compact ? 26 : 30}>{card.title}</Display>
          {card.sub ? (
            <Display size={compact ? 20 : 24} color={t.textSecondary}>
              {card.sub}
            </Display>
          ) : null}
          <Body size={compact ? typeScale.text.md : 16} weight="semi" style={{ marginTop: space.xs }}>
            {card.body}
          </Body>
          {index === 0 ? (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', marginTop: space.xs }}>
              <Body size={compact ? typeScale.text.md : 16} weight="heavy" color={done ? t.text : t.textSecondary}>
                {done ? '✓' : practice === 'sideways' ? '↔' : '↕'}
              </Body>
              <Body size={compact ? typeScale.text.md : 16} weight="heavy" color={done ? t.text : t.textSecondary} style={{ flex: 1 }}>
                {PRACTICE[practice]}
              </Body>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <RoundButton glyph="‹" label="Previous card" disabled={index === 0} onPress={() => go(index - 1)} />
        <Progress index={index} />
        {last ? (
          <Button label={replay ? 'Back to the game' : 'Build my deck'} onPress={() => go(index + 1)} style={{ minWidth: 150 }} />
        ) : (
          <RoundButton glyph="›" label="Next card" onPress={() => go(index + 1)} />
        )}
      </View>
    </View>
  );
}

function RoundButton({ glyph, label, disabled, onPress }: { glyph: string; label: string; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: t.text,
        opacity: disabled ? 0.25 : pressed ? 0.6 : 1,
      })}
    >
      <Display size={30} maxFontSizeMultiplier={fontScale.graphic} style={{ marginTop: -3 }}>
        {glyph}
      </Display>
    </Pressable>
  );
}

/** Three little cards: the one you're on stands up. */
function Progress({ index }: { index: number }) {
  const t = useTheme();
  return (
    <View aria-hidden style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 6 }}>
      {TOUR.map((c, i) => (
        <View key={i} style={{ width: i === index ? 16 : 11, height: i === index ? 22 : 15, borderRadius: 4, backgroundColor: i <= index ? c.felt : 'transparent', borderWidth: 1.5, borderColor: i <= index ? c.felt : t.border }} />
      ))}
    </View>
  );
}

/** Every piece of art is drawn on this stage, then scaled to the room the card leaves it. */
const STAGE = { w: 300, h: 236 };

function FitStage({ w, h, children }: { w: number; h: number; children: (scale: number) => ReactNode }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
  };
  const scale = box ? Math.max(0.45, Math.min(1.35, box.w / w, (box.h - 12) / h)) : 0;
  return (
    <View onLayout={onLayout} style={{ flex: 1 }}>
      {box ? <View style={{ position: 'absolute', width: w, height: h, left: (box.w - w) / 2, top: (box.h - h) / 2, transform: [{ scale }] }}>{children(scale)}</View> : null}
    </View>
  );
}

/** Plays a little film once, from 0 to 1. Still at the end under Reduce Motion. */
function useFilm(ms: number): SharedValue<number> {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      p.set(1);
      return;
    }
    p.set(withTiming(1, { duration: ms, easing: Easing.out(Easing.quad) }));
    return () => cancelAnimation(p);
  }, [reduced, ms, p]);
  return p;
}

const HABIT = { w: 124, h: 168 };
const DISTANCE = 64;
const VELOCITY = 800;

/** The practice card: a Read card that goes down for its Floor or up for its Ceiling, and springs back from anything else. */
function PracticeArt({ scale, onKept, onSideways }: { scale: number; onKept: (level: Kept) => void; onSideways: () => void }) {
  const c = cardColors.lilac;
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const armed = useSharedValue(0);
  const nudge = useSharedValue(0);

  // A small bob up and down, now and then, until the card is touched: it can be dragged that way.
  useEffect(() => {
    if (reduced) return;
    nudge.set(withRepeat(withSequence(withDelay(1400, withTiming(-1, { duration: 260 })), withTiming(1, { duration: 360 }), withTiming(0, { duration: 260 })), -1, false));
    return () => cancelAnimation(nudge);
  }, [reduced, nudge]);

  const onArm = (on: boolean) => (on ? feel.arm() : feel.disarm());

  const pan = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(nudge);
      nudge.set(withTiming(0, { duration: 120 }));
    })
    .onUpdate((e) => {
      const dx = e.translationX / scale;
      const dy = e.translationY / scale;
      x.set(dx);
      y.set(dy);
      const over = Math.abs(dy) > DISTANCE && Math.abs(dy) > Math.abs(dx) ? 1 : 0;
      if (over !== armed.get()) {
        armed.set(over);
        scheduleOnRN(onArm, over === 1);
      }
    })
    .onEnd((e) => {
      const dx = x.get();
      const dy = y.get();
      const vertical = Math.abs(dy) > Math.abs(dx);
      armed.set(0);
      if (vertical && (Math.abs(dy) > DISTANCE || Math.abs(e.velocityY) > VELOCITY)) {
        const level: Kept = dy > 0 ? 'floor' : 'ceiling';
        x.set(withTiming(dx * 0.5, { duration: 240 }));
        y.set(
          withTiming(dy > 0 ? 320 : -340, { duration: 240, easing: Easing.in(Easing.quad) }, (finished) => {
            'worklet';
            if (finished) scheduleOnRN(onKept, level);
          }),
        );
        return;
      }
      x.set(withSpring(0, { damping: 13 }));
      y.set(withSpring(0, { damping: 13 }));
      if (!vertical && Math.abs(dx) > 36) scheduleOnRN(onSideways);
    });

  const card = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() + nudge.get() * 10 }, { rotate: `${-3 + x.get() / 14}deg` }],
  }));
  const down = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [14, DISTANCE], [0, 1], 'clamp') }));
  const up = useAnimatedStyle(() => ({ opacity: interpolate(-y.get(), [14, DISTANCE], [0, 1], 'clamp') }));
  const side = useAnimatedStyle(() => ({ opacity: Math.abs(y.get()) > Math.abs(x.get()) ? 0 : interpolate(Math.abs(x.get()), [14, 50], [0, 1], 'clamp') }));
  const hintUp = useAnimatedStyle(() => ({ opacity: interpolate(-y.get(), [0, DISTANCE], [0.9, 1], 'clamp'), transform: [{ scale: interpolate(-y.get(), [0, DISTANCE], [1, 1.15], 'clamp') }] }));
  const hintDown = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [0, DISTANCE], [0.9, 1], 'clamp'), transform: [{ scale: interpolate(y.get(), [0, DISTANCE], [1, 1.15], 'clamp') }] }));

  return (
    <View style={{ width: STAGE.w, height: STAGE.h }}>
      <Animated.View aria-hidden style={[{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }, hintUp]}>
        <Body size={12} weight="heavy" color={WHITE} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1.6 }}>
          ↑ CEILING
        </Body>
      </Animated.View>
      <Animated.View aria-hidden style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' }, hintDown]}>
        <Body size={12} weight="heavy" color={WHITE} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1.6 }}>
          ↓ FLOOR
        </Body>
      </Animated.View>
      {/* The rest of today's deck, waiting behind it. */}
      <View aria-hidden style={{ position: 'absolute', left: (STAGE.w - HABIT.w) / 2, top: (STAGE.h - HABIT.h) / 2, width: HABIT.w, height: HABIT.h, borderRadius: 22, backgroundColor: cardColors.tomato.bg, transform: [{ translateX: 22 }, { translateY: 4 }, { rotate: '8deg' }] }} />
      <View aria-hidden style={{ position: 'absolute', left: (STAGE.w - HABIT.w) / 2, top: (STAGE.h - HABIT.h) / 2, width: HABIT.w, height: HABIT.h, borderRadius: 22, backgroundColor: cardColors.sky.bg, transform: [{ translateX: -20 }, { translateY: 6 }, { rotate: '-7deg' }] }} />
      <GestureDetector gesture={pan}>
        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Practice card: Read. Ceiling, 20 pages. Floor, 1 page."
          accessibilityHint="Swipe down for the Floor or up for the Ceiling."
          accessibilityActions={[
            { name: 'decrement', label: 'Floor' },
            { name: 'increment', label: 'Ceiling' },
          ]}
          onAccessibilityAction={(e) => onKept(e.nativeEvent.actionName === 'decrement' ? 'floor' : 'ceiling')}
          style={[
            {
              position: 'absolute',
              left: (STAGE.w - HABIT.w) / 2,
              top: (STAGE.h - HABIT.h) / 2,
              width: HABIT.w,
              height: HABIT.h,
              borderRadius: 22,
              backgroundColor: c.bg,
              padding: 14,
              justifyContent: 'space-between',
              boxShadow: '0 14px 26px rgba(0, 0, 0, 0.3)',
              cursor: 'pointer',
            },
            card,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SuitGlyph suit="clubs" size={12} color={c.ink} />
            <Body size={10} weight="heavy" color={c.ink} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1 }}>
              MIND
            </Body>
          </View>
          <View style={{ gap: 2 }}>
            <Body size={12} weight="heavy" color={c.ink} maxFontSizeMultiplier={fontScale.graphic}>
              ↑ 20 pages
            </Body>
            <Display size={38} color={c.ink} maxFontSizeMultiplier={fontScale.graphic}>
              Read
            </Display>
            <Body size={12} weight="heavy" color={c.ink} maxFontSizeMultiplier={fontScale.graphic}>
              ↓ 1 page
            </Body>
          </View>
          <Stamp text="FLOOR" style={down} />
          <Stamp text="CEILING" style={up} />
          <Stamp text="LATER" style={side} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function Stamp({ text, style }: { text: string; style: ReturnType<typeof useAnimatedStyle> }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 54, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, transform: [{ rotate: '-9deg' }] }, style]}
    >
      <Display size={20} color={INK} maxFontSizeMultiplier={fontScale.graphic}>
        {text}
      </Display>
    </Animated.View>
  );
}

/** After the practice swipe: the day's card turns over where the habit card was. */
function DealtArt({ level }: { level: Kept }) {
  const p = useFilm(520);
  const face: CardFace = { kind: 'card', rank: level === 'floor' ? 7 : 10, suit: 'clubs' };
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(p.get(), [0, 1], [level === 'floor' ? -30 : 30, 0]) }, { scaleX: interpolate(p.get(), [0, 0.5, 1], [0.05, 0.6, 1]) }, { rotate: `${interpolate(p.get(), [0, 1], [-10, 4])}deg` }],
  }));
  const tag = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.6, 1], [0, 1], 'clamp') }));
  return (
    <View aria-hidden style={{ width: STAGE.w, height: STAGE.h, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={style}>
        <PlayingCard face={face} size="lg" width={112} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 6, backgroundColor: WHITE, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 3 }, tag]}>
        <Body size={12} weight="heavy" color={cardColors.pine.bg} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1.4 }}>
          {level === 'floor' ? 'FLOOR · KEPT' : 'CEILING · KEPT'}
        </Body>
      </Animated.View>
    </View>
  );
}

/** A week of seven cards, and the five that play: a Full house. */
const WEEK: { label: string; face: CardFace; plays: boolean }[] = [
  { label: 'M', face: { kind: 'card', rank: 11, suit: 'hearts' }, plays: true },
  { label: 'T', face: { kind: 'card', rank: 4, suit: 'diamonds' }, plays: true },
  { label: 'W', face: { kind: 'card', rank: 9, suit: 'clubs' }, plays: false },
  { label: 'T', face: { kind: 'card', rank: 11, suit: 'spades' }, plays: true },
  { label: 'F', face: { kind: 'card', rank: 2, suit: 'hearts' }, plays: false },
  { label: 'S', face: { kind: 'card', rank: 4, suit: 'hearts' }, plays: true },
  { label: 'S', face: { kind: 'card', rank: 11, suit: 'clubs' }, plays: true },
];
const HAND: CardFace[] = [WEEK[0].face, WEEK[3].face, WEEK[6].face, WEEK[1].face, WEEK[5].face];
const MINI = 30;
const FAN_W = 78;
const FAN_STEP = 42;

function HandArt() {
  const p = useFilm(1300);
  const caption = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.7, 1], [0, 1], 'clamp') }));
  const chip = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.8, 1], [0, 1], 'clamp'), transform: [{ rotate: '8deg' }, { scale: interpolate(p.get(), [0.8, 0.92, 1], [0.4, 1.12, 1], 'clamp') }] }));
  const stripLeft = (STAGE.w - (MINI * 7 + 6 * 6)) / 2;
  return (
    <View aria-hidden style={{ width: STAGE.w, height: STAGE.h }}>
      <View style={{ position: 'absolute', top: 0, left: stripLeft, flexDirection: 'row', gap: 6 }}>
        {WEEK.map((d, i) => (
          <View key={i} style={{ alignItems: 'center', gap: 2 }}>
            <Body size={10} weight="heavy" color={WHITE} maxFontSizeMultiplier={fontScale.graphic}>
              {d.label}
            </Body>
            <PlayingCard face={d.face} size="xs" width={MINI} dim={!d.plays} />
          </View>
        ))}
      </View>
      {HAND.map((face, i) => (
        <FanCard key={i} i={i} face={face} p={p} />
      ))}
      <Animated.View style={[{ position: 'absolute', top: 66, right: 4 }, chip]}>
        <Chips value={140} size={18} pill />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' }, caption]}>
        <Body size={13} weight="heavy" color={WHITE} maxFontSizeMultiplier={fontScale.graphic}>
          Full house: three Jacks and a pair of 4s.
        </Body>
      </Animated.View>
    </View>
  );
}

function FanCard({ i, face, p }: { i: number; face: CardFace; p: SharedValue<number> }) {
  const off = i - 2;
  const left = (STAGE.w - (FAN_W + FAN_STEP * 4)) / 2 + i * FAN_STEP;
  const top = 76 + 4 * off * off;
  const style = useAnimatedStyle(() => {
    const v = interpolate(p.get(), [i * 0.1, i * 0.1 + 0.5], [0, 1], 'clamp');
    return {
      opacity: interpolate(v, [0, 0.2], [0, 1], 'clamp'),
      transform: [{ translateX: interpolate(v, [0, 1], [(2 - i) * FAN_STEP, 0]) }, { translateY: interpolate(v, [0, 1], [-40, 0]) }, { rotate: `${interpolate(v, [0, 1], [0, off * 8])}deg` }],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left, top }, style]}>
      <PlayingCard face={face} size="md" width={FAN_W} />
    </Animated.View>
  );
}

/** Monday kept, Tuesday missed, Wednesday kept: Tuesday turns over a card of its own. */
const SAVED: CardFace = { kind: 'card', rank: 3, suit: null };
const DAY_W = 74;
const DAY_H = Math.round((DAY_W * 104) / 74);

function ComebackArt() {
  const p = useFilm(1900);
  const col = (i: number) => (STAGE.w - DAY_W * 3 - 24 * 2) / 2 + i * (DAY_W + 24);
  const top = 30;
  const today = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.12], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(p.get(), [0, 0.3, 0.36], [-46, 6, 0], 'clamp') }],
  }));
  const slot = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.46, 0.5], [1, 0], 'clamp') }));
  const saved = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0.46, 0.5], [0, 1], 'clamp'),
    transform: [{ scaleX: interpolate(p.get(), [0.46, 0.62], [0.05, 1], 'clamp') }, { scale: interpolate(p.get(), [0.62, 0.7, 0.78], [1, 1.08, 1], 'clamp') }],
  }));
  const tags = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.72, 0.9], [0, 1], 'clamp') }));
  const days = ['MON', 'TUE', 'WED'];
  return (
    <View aria-hidden style={{ width: STAGE.w, height: STAGE.h }}>
      {days.map((d, i) => (
        <View key={d} style={{ position: 'absolute', top: 0, left: col(i), width: DAY_W, alignItems: 'center' }}>
          <Body size={11} weight="heavy" color={WHITE} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1.4 }}>
            {d}
          </Body>
        </View>
      ))}
      <PlayingCard face={{ kind: 'card', rank: 8, suit: 'hearts' }} size="md" width={DAY_W} style={{ position: 'absolute', top, left: col(0), transform: [{ rotate: '-4deg' }] }} />
      <Animated.View style={[{ position: 'absolute', top, left: col(1) }, slot]}>
        <CardSlot size="md" color="rgba(255,255,255,0.75)" style={{ width: DAY_W, height: DAY_H }} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top, left: col(1) }, saved]}>
        <PlayingCard face={SAVED} size="md" width={DAY_W} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top, left: col(2) }, today]}>
        <PlayingCard face={{ kind: 'card', rank: 9, suit: 'spades' }} size="md" width={DAY_W} style={{ transform: [{ rotate: '4deg' }] }} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: top + DAY_H + 14, left: 0, right: 0 }, tags]}>
        <Tag left={col(1)} text="MISSED" />
        <Tag left={col(2)} text="TODAY" />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' }, tags]}>
        <Body size={13} weight="heavy" color={WHITE} maxFontSizeMultiplier={fontScale.graphic}>
          Wednesday kept, so Tuesday still gets a card.
        </Body>
      </Animated.View>
    </View>
  );
}

function Tag({ left, text }: { left: number; text: string }) {
  return (
    <View style={{ position: 'absolute', left, width: DAY_W, alignItems: 'center' }}>
      <View style={{ backgroundColor: WHITE, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
        <Body size={11} weight="heavy" color={cardColors.sky.bg} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1.2 }}>
          {text}
        </Body>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- who you're becoming */

function Identity({
  identities,
  onToggle,
  northStar,
  onNorthStar,
  onBack,
  onNext,
}: {
  identities: readonly string[];
  onToggle: (id: string) => void;
  northStar: string;
  onNorthStar: (s: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl, paddingHorizontal: space.xl, gap: space.xl }}>
        <BackLink onPress={onBack} label="Back to the tour" />
        <View style={{ gap: space.sm }}>
          <Label>Step 1 of 2</Label>
          <Display size={typeScale.display.xl} header>
            Who are you becoming?
          </Display>
        </View>

        <View accessible accessibilityLabel={SUIT_LINE} style={{ gap: space.sm }}>
          <Body weight="heavy">Each part of you is a suit:</Body>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {SUITS.map((suit, i) => (
              <View
                key={suit}
                style={{
                  flex: 1,
                  aspectRatio: 0.74,
                  maxHeight: 112,
                  backgroundColor: cardFace.bg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: cardFace.edge,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  transform: [{ rotate: `${(i - 1.5) * 2.5}deg` }],
                  boxShadow: '0 6px 14px rgba(0, 0, 0, 0.16)',
                }}
              >
                <SuitGlyph suit={suit} size={30} color={suitColors[suit].glyph} />
                <Display size={16} color={INK} maxFontSizeMultiplier={fontScale.chrome}>
                  {SUIT_INFO[suit].part}
                </Display>
              </View>
            ))}
          </View>
        </View>

        <Body size={typeScale.text.lg} weight="semi">
          Finish the sentence. Pick as many as feel true.
        </Body>

        {IDENTITIES.map((group) => (
          <View key={group.suit} style={{ gap: space.sm }}>
            <SuitTag suit={group.suit} size={14} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
              <Display size={typeScale.display.sm} color={t.textSecondary} aria-hidden>
                I’m…
              </Display>
              {group.identities.map((id) => (
                <Chip
                  key={id}
                  label={id}
                  accessibilityLabel={`I’m ${id}`}
                  active={identities.includes(id)}
                  color={suitColors[group.suit].glyph}
                  ink={WHITE}
                  onPress={() => {
                    feel.tick();
                    onToggle(id);
                  }}
                />
              ))}
            </View>
          </View>
        ))}

        <View style={[{ borderRadius: radius.lg, padding: space.xl, gap: space.sm }, raisedStyle(t)]}>
          <Label color={t.onRaisedSecondary}>Your north star · optional</Label>
          <TextInput
            value={northStar}
            onChangeText={onNorthStar}
            accessibilityLabel="Your north star, optional"
            placeholder="I’m becoming someone who…"
            placeholderTextColor={t.onRaisedSecondary}
            keyboardAppearance={t.scheme}
            multiline
            style={{ fontFamily: fonts.display, fontSize: typeScale.display.md, color: t.onRaised, minHeight: 64, textAlignVertical: 'top' }}
          />
          <Body size={typeScale.text.sm} color={t.onRaisedSecondary}>
            It sits at the top of You, so you see why on the hard days.
          </Body>
        </View>

        <Button label={identities.length ? 'Build my deck' : 'Show me every card'} onPress={onNext} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BackLink({ onPress, label }: { onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ minHeight: TAP, alignSelf: 'flex-start', justifyContent: 'center' }}>
      <Body weight="heavy" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
        ‹ Back
      </Body>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- the first deal */

function DeckStep({
  suggestions,
  picked,
  onToggle,
  busy,
  onBack,
  onDeal,
}: {
  suggestions: Recipe[];
  picked: readonly string[];
  onToggle: (key: string) => void;
  busy: boolean;
  onBack: () => void;
  onDeal: (recipes: Recipe[]) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const chosen = suggestions.filter((r) => picked.includes(r.key));
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + 170, paddingHorizontal: space.xl, gap: space.xl }}>
        <BackLink onPress={onBack} label="Back to who you’re becoming" />
        <View style={{ gap: space.sm }}>
          <Label>Step 2 of 2</Label>
          <Display size={typeScale.display.xl} header>
            Deal your first cards.
          </Display>
          <Body color={t.textSecondary}>Start with one to three. A small deck you keep beats a big one you don’t. You can change every word later.</Body>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {suggestions.map((r, i) => (
            <RecipeTile key={r.key} recipe={r} on={picked.includes(r.key)} tilt={i % 2 ? 2 : -2} onPress={() => onToggle(r.key)} />
          ))}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.lg, gap: space.sm, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.border }}>
        {chosen.length > 3 ? (
          <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }}>
            That’s a big deck to start. Fewer cards are easier to keep.
          </Body>
        ) : null}
        <Button label={chosen.length ? `Deal ${chosen.length} ${chosen.length === 1 ? 'card' : 'cards'}` : 'I’ll make my own'} busy={busy} onPress={() => onDeal(chosen)} />
      </View>
    </View>
  );
}

function RecipeTile({ recipe: r, on, tilt, onPress }: { recipe: Recipe; on: boolean; tilt: number; onPress: () => void }) {
  const t = useTheme();
  const col = cardColors[suitColors[r.suit].habit];
  const ink = on ? col.ink : t.text;
  const quiet = on ? col.ink : t.textSecondary;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${r.name}. ${SUIT_INFO[r.suit].part}. Ceiling, ${r.ceiling}. Floor, ${r.floor}.`}
      accessibilityState={{ checked: on }}
      onPress={() => {
        feel.tick();
        onPress();
      }}
      style={({ pressed }) => ({
        width: '47.5%',
        aspectRatio: 0.74,
        backgroundColor: on ? col.bg : t.bgRaised,
        borderRadius: radius.lg,
        borderWidth: on ? 0 : 1.5,
        borderColor: t.border,
        padding: space.lg,
        justifyContent: 'space-between',
        opacity: pressed ? 0.85 : 1,
        transform: [{ rotate: on ? `${tilt}deg` : '0deg' }, { scale: on ? 1.02 : 1 }],
        boxShadow: on ? '0 10px 20px rgba(0, 0, 0, 0.18)' : undefined,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <SuitGlyph suit={r.suit} size={13} color={on ? col.ink : t.scheme === 'dark' ? suitColors[r.suit].bright : suitColors[r.suit].glyph} />
          <Label color={quiet}>{SUIT_INFO[r.suit].part}</Label>
        </View>
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? col.ink : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: t.border }}>
          <Display size={16} color={on ? col.bg : t.textSecondary} maxFontSizeMultiplier={fontScale.graphic}>
            {on ? '✓' : '+'}
          </Display>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Display size={typeScale.display.md} color={ink}>
          {r.name}
        </Display>
        <Body size={typeScale.text.sm} weight="bold" color={quiet}>{`↑ ${r.ceiling}`}</Body>
        <Body size={typeScale.text.sm} weight="bold" color={quiet}>{`↓ ${r.floor}`}</Body>
      </View>
    </Pressable>
  );
}
