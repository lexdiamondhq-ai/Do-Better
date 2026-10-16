import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ask } from '@/components/Ask';
import { CardBack } from '@/components/CardBack';
import { ChipIcon, Chips, formatChips } from '@/components/Chips';
import { EXAMPLES, HandFan, HandRow, playedFaces } from '@/components/HandFan';
import { RulesButton } from '@/components/RulesSheet';
import { Body, Button, Display, Label, raisedStyle } from '@/components/ui';
import { addDays, type Day } from '@/engine/day';
import { CALLABLE, callChoices, type BackKey, type CallChoice, type Game } from '@/engine/game';
import { HANDS, makesCall, type HandKind } from '@/engine/poker';
import { useData } from '@/lib/data';
import { useDeck, useLook } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { shortDay, weekRange } from '@/lib/format';
import { callHistoryLine, callWindow, showdownWhen } from '@/lib/share';
import { playSound } from '@/lib/sound';
import { faintestAlpha, withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { cardFace, chip, fontScale, radius, space, TAP } from '@/theme/tokens';

const LABELS: Record<1 | 2 | 3, CallChoice['label']> = { 1: 'Safe', 2: 'Stretch', 3: 'Long shot' };
const SWIPE = 90;
/** How long the called card stays on screen before the sheet closes, so you see what you called. */
const CALLED_MS = 1100;
/** The shortest a call card gets, on the shortest phones, so the Other hands heading still shows under it. */
const MIN_CARD = 216;
/** A phone this short gets the shorter words at the top. */
const SHORT_SCREEN = 700;
/** The quieter ink on a cream call card, as faint as it can be and still read at 4.5:1. */
const CARD_QUIET = withAlpha(cardFace.ink, faintestAlpha(cardFace.ink, cardFace.bg, 4.5, 0.6));

/** A call on offer: one of the three dealt choices, or any other hand that pays at least once over. */
type Offer = { kind: HandKind; label: string; multiplier: 0 | 1 | 2 | 3; payout: number; line: string };

function offerOf(game: Game, kind: HandKind, label?: string): Offer | null {
  const price = game.callOdds[kind];
  if (!price || price.multiplier === 0) return null;
  const m = price.multiplier as 1 | 2 | 3;
  return { kind, label: label ?? LABELS[m], multiplier: m, payout: HANDS[kind].chips * m, line: callHistoryLine(kind, game.weeks) };
}

/** The dealt choice a hand was offered as this week ("Stretch"), or null for a hand picked from the others. */
function dealtLabel(game: Game, kind: HandKind): CallChoice['label'] | null {
  const dealt = callChoices(game);
  return [dealt.safe, dealt.stretch, dealt.longShot].find((c) => c?.kind === kind)?.label ?? null;
}

/**
 * Call this week's hand. Three calls are dealt: a Safe one that pays once over, a Stretch that pays
 * twice and a Long shot that pays three times. Swipe the card up, or press the button, to call it.
 * Make that hand or better by Sunday midnight and it pays again; miss and nothing is lost.
 */
export default function Call() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const deck = useDeck();
  const { back } = useLook();
  const { callHand, today } = useData();
  const [picked, setPicked] = useState<HandKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [others, setOthers] = useState(false);
  const [called, setCalled] = useState<Offer | null>(null);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The pinned footer, measured, so large text never lets it cover the end of the list.
  const [measured, setMeasured] = useState(0);
  // The screen and where the card starts on it, measured, so the card is sized to leave Other hands in view.
  const [viewH, setViewH] = useState(0);
  const [stackTop, setStackTop] = useState(0);

  useEffect(
    () => () => {
      if (leave.current) clearTimeout(leave.current);
    },
    [],
  );
  if (!deck) return null;

  const { game } = deck;
  const current = game.current.call;
  const dealt = callChoices(game);
  const choices = [dealt.safe, dealt.stretch, dealt.longShot].flatMap((c) => (c ? [offerOf(game, c.kind, c.label)!] : []));
  // Your call if you made one, otherwise the Safe one: the first call should feel like a promise you can keep.
  // A call with no price on offer (a sure thing, or one from the old rules) can't be shown as a card, so the
  // Safe one is shown instead, under a line naming the call you have.
  const currentOffer = current ? offerOf(game, current, 'Your call') : null;
  const fallback = (currentOffer ? current : null) ?? choices[0]?.kind ?? null;
  const kind = picked ?? fallback;
  const offer = kind ? (choices.find((c) => c.kind === kind) ?? offerOf(game, kind, current === kind ? 'Your call' : 'Your pick')) : null;
  const index = choices.findIndex((c) => c.kind === kind);
  // Somewhere for a sideways swipe to go: another dealt call, or back to them from one of the other hands.
  const canStep = choices.length > 1 || (choices.length === 1 && index < 0);
  // Every other hand that pays, without the three already dealt above.
  const rest = CALLABLE.filter((k) => offerOf(game, k) && !choices.some((c) => c.kind === k)).reverse();
  const closes = callWindow(game.current);
  const short = height < SHORT_SCREEN;

  const choose = (k: HandKind) => {
    if (k === kind) return;
    feel.tick();
    setPicked(k);
  };
  const step = (by: 1 | -1) => {
    if (!choices.length) return;
    const next = choices[(Math.max(0, index) + by + choices.length) % choices.length];
    choose(next.kind);
  };

  async function confirm(): Promise<boolean> {
    if (!offer) return false;
    if (offer.kind === current) {
      router.back();
      return true;
    }
    setBusy(true);
    try {
      await callHand(offer.kind);
      feel.ceiling();
      playSound('call');
      // A moment to see it land before the sheet closes.
      setCalled(offer);
      AccessibilityInfo.announceForAccessibility(`Called ${HANDS[offer.kind].name}. ${offer.payout ? `${formatChips(offer.payout)} chips if you make it.` : ''}`);
      leave.current = setTimeout(() => router.back(), CALLED_MS);
      return true;
    } catch (e) {
      ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
      setBusy(false);
      return false;
    }
  }

  const footer = measured || 80 + insets.bottom;
  const behind = Math.min(2, Math.max(0, choices.length - 1));
  // As tall as the screen allows with the Other hands heading still in view above the button, never
  // shorter than MIN_CARD or taller than 380. Until it's measured, a guess from the window.
  const room = viewH && stackTop ? viewH - footer - stackTop - (behind * 10 + 8) - space.lg - TAP - space.sm : height - insets.top - footer - 330;
  const cardH = Math.round(Math.max(MIN_CARD, Math.min(380, room)));

  if (!game.callOpen) return <Closed game={game} back={back} today={today} onClose={() => router.back()} onHands={() => router.dismissTo('/hands')} />;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }} onLayout={(e) => setViewH(e.nativeEvent.layout.height)}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xl + space.sm, paddingBottom: footer + space.xl, gap: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
          <Label numberOfLines={1} style={{ flexShrink: 1 }}>
            {weekRange(game.current.start)}
          </Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <RulesButton topic="call" />
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" style={{ minHeight: TAP, justifyContent: 'center' }}>
              <Body weight="heavy" color={t.textSecondary}>
                Close
              </Body>
            </Pressable>
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <Display size={34} header>
            Call this week’s hand
          </Display>
          <Body color={t.textSecondary}>
            {short ? 'Make it or better by Sunday and it pays again. Miss and you lose nothing. ' : 'Pick the hand you think this week will make. Make it or better by Sunday midnight and it pays again. Miss and you lose nothing. '}
            <Body weight="heavy" color={t.text}>
              {closes.line}
            </Body>
          </Body>
          {current && !currentOffer ? <Body weight="bold">{`Your call: ${HANDS[current].name}. Pick another to change it.`}</Body> : null}
        </View>

        {choices.length > 1 ? (
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: radius.pill, padding: 4, gap: 4 }}>
            {choices.map((c) => {
              const on = c.kind === kind;
              return (
                <Pressable
                  key={c.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${c.label}, pays times ${c.multiplier}: ${HANDS[c.kind].name}`}
                  onPress={() => choose(c.kind)}
                  style={{ flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.text : 'transparent', paddingHorizontal: space.xs }}
                >
                  <Body size={14} weight="heavy" color={on ? t.bg : t.text} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome}>
                    {`${c.label} ×${c.multiplier}`}
                  </Body>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {offer ? (
          <View onLayout={(e) => setStackTop(e.nativeEvent.layout.y)}>
            <Stack key={offer.kind} offer={offer} behind={behind} height={cardH} onUp={confirm} onSide={step} canSide={canStep} mine={offer.kind === current} tabbed={choices.length > 1 && index >= 0} />
          </View>
        ) : (
          <Body weight="bold" color={t.textSecondary}>
            Nothing can be called this week yet. Keep a habit and check back.
          </Body>
        )}

        {rest.length ? (
          <View style={{ gap: space.sm }}>
            <Pressable
              onPress={() => setOthers((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: others }}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: TAP }}
            >
              <Display size={22}>{choices.length ? 'Other hands' : 'Hands you can call'}</Display>
              <Body weight="heavy" color={t.textSecondary}>
                {others ? 'Hide' : `Show ${rest.length}`}
              </Body>
            </Pressable>
            {others
              ? rest.map((k) => {
                  const o = offerOf(game, k)!;
                  const on = k === kind;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => choose(k)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${HANDS[k].name}, pays times ${o.multiplier}, ${o.payout} chips. ${o.line}`}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        borderRadius: radius.md,
                        backgroundColor: t.bgRaised,
                        borderWidth: 2,
                        borderColor: on ? t.text : 'transparent',
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <HandRow faces={EXAMPLES[k]} size="xs" overlap={0.4} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Display size={17} numberOfLines={1}>
                          {HANDS[k].name}
                        </Display>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Body size={13} weight="heavy">{`×${o.multiplier} ·`}</Body>
                          <ChipIcon size={13} />
                          <Body size={13} weight="heavy">{`+${formatChips(o.payout)}`}</Body>
                        </View>
                        <Body size={12} weight="bold" color={t.textSecondary} numberOfLines={3}>
                          {o.line}
                        </Body>
                      </View>
                    </Pressable>
                  );
                })
              : null}
          </View>
        ) : null}
      </ScrollView>

      {offer ? (
        <View
          onLayout={(e) => setMeasured(Math.ceil(e.nativeEvent.layout.height))}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.lg, gap: space.xs, backgroundColor: t.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }}>
          <Button
            label={offer.kind === current ? `Keep my call: ${HANDS[offer.kind].name}` : `Call it: ${HANDS[offer.kind].name}`}
            busy={busy}
            onPress={() => void confirm()}
            hint={offer.kind === current ? undefined : 'Or swipe the card up'}
          />
        </View>
      ) : null}

      {called ? <Called offer={called} /> : null}
    </View>
  );
}

/**
 * The call, landed: the hand you called, what it pays and a check, held for a beat over the sheet before
 * it closes, so a swipe that sends the card away still shows what it called.
 */
function Called({ offer }: { offer: Offer }) {
  const t = useTheme();
  const show = useSharedValue(0);
  const check = useSharedValue(0);
  useEffect(() => {
    show.set(withSpring(1, { damping: 13, stiffness: 210 }));
    check.set(withDelay(160, withSpring(1, { damping: 9, stiffness: 260 })));
  }, [show, check]);
  const ticket = useAnimatedStyle(() => ({ opacity: Math.min(1, show.get() * 1.6), transform: [{ translateY: (1 - show.get()) * 60 }, { scale: 0.86 + 0.14 * show.get() }, { rotate: `${(1 - show.get()) * -6}deg` }] }));
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: check.get() }] }));
  const veil = useAnimatedStyle(() => ({ opacity: Math.min(1, show.get() * 2) }));
  return (
    <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl }, veil]}>
      <Animated.View style={[{ alignItems: 'center', gap: space.md, alignSelf: 'stretch', maxWidth: 360, borderRadius: 26, backgroundColor: cardFace.bg, borderWidth: 1, borderColor: cardFace.edge, paddingVertical: space.xxl, paddingHorizontal: space.xl, boxShadow: '0px 14px 34px rgba(0, 0, 0, 0.26)' }, ticket]}>
        <Body size={12} weight="heavy" color={cardFace.ink} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1.6, textTransform: 'uppercase' }}>
          {offer.multiplier ? `Called · pays ×${offer.multiplier}` : 'Called'}
        </Body>
        <HandFan faces={EXAMPLES[offer.kind]} size="sm" width={50} spread={0.5} tilt={8} />
        <Display size={30} color={cardFace.ink} maxFontSizeMultiplier={fontScale.graphic} numberOfLines={1} style={{ textAlign: 'center' }}>
          {HANDS[offer.kind].name}
        </Display>
        {offer.payout > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: chip.bg, borderRadius: radius.pill, paddingLeft: 6, paddingRight: 12, paddingVertical: 4 }}>
            <ChipIcon size={20} />
            <Body size={15} weight="heavy" color={chip.ink} maxFontSizeMultiplier={fontScale.graphic}>
              {`+${formatChips(offer.payout)} if you make it`}
            </Body>
          </View>
        ) : null}
        <Body size={13} weight="bold" color={CARD_QUIET} maxFontSizeMultiplier={fontScale.graphic} style={{ textAlign: 'center' }}>
          Make it or better by Sunday midnight.
        </Body>
        <Animated.View aria-hidden style={[{ position: 'absolute', top: -22, right: -10, width: 56, height: 56, borderRadius: 28, backgroundColor: cardFace.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: cardFace.bg }, badge]}>
          <Display size={28} color={cardFace.bg} maxFontSizeMultiplier={fontScale.graphic}>
            ✓
          </Display>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The dealt call, as a card on top of a small stack. Swipe it up to call it; swipe it sideways for the
 * next choice. A screen reader adjusts it up and down and activates it to call.
 */
function Stack({
  offer,
  behind,
  height,
  onUp,
  onSide,
  canSide,
  mine,
  tabbed,
}: {
  offer: Offer;
  behind: number;
  height: number;
  onUp: () => Promise<boolean>;
  onSide: (by: 1 | -1) => void;
  canSide: boolean;
  mine: boolean;
  /** The tabs above already name this choice, so a short card can leave its label off. */
  tabbed: boolean;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const enter = useSharedValue(0.94);

  useEffect(() => {
    enter.set(withSpring(1, { damping: 14, stiffness: 220 }));
  }, [enter]);

  const settle = () => {
    x.set(withSpring(0, { damping: 16 }));
    y.set(withSpring(0, { damping: 16 }));
  };
  const called = async () => {
    const ok = await onUp();
    if (!ok) settle();
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.set(e.translationX);
      y.set(Math.min(e.translationY, 24 + e.translationY * 0.2));
    })
    .onEnd((e) => {
      const dx = x.get();
      const dy = y.get();
      const vertical = Math.abs(dy) > Math.abs(dx);
      if (vertical && (dy < -SWIPE || e.velocityY < -900)) {
        y.set(withTiming(-900, { duration: 280, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) scheduleOnRN(called);
        }));
        return;
      }
      if (canSide && !vertical && (Math.abs(dx) > SWIPE || Math.abs(e.velocityX) > 900)) {
        const by = dx < 0 ? 1 : -1;
        x.set(withTiming(dx < 0 ? -500 : 500, { duration: 200 }, (done) => {
          if (done) scheduleOnRN(onSide, by);
        }));
        return;
      }
      x.set(withSpring(0, { damping: 16 }));
      y.set(withSpring(0, { damping: 16 }));
    });

  const top = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${x.get() / 18}deg` }, { scale: enter.get() + interpolate(-y.get(), [0, 120], [0, 0.04], 'clamp') }],
  }));
  const hint = useAnimatedStyle(() => ({ opacity: interpolate(-y.get(), [10, SWIPE], [0, 1], 'clamp') }));
  const rest = useAnimatedStyle(() => ({ opacity: interpolate(-y.get(), [0, SWIPE * 0.6], [1, 0], 'clamp') }));

  return (
    <View style={{ height: height + behind * 10 + 8, marginHorizontal: space.sm }}>
      {Array.from({ length: behind }, (_, i) => behind - i).map((d) => (
        <View
          key={d}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: d * 8,
            right: d * 8,
            top: d * 10,
            height,
            borderRadius: 26,
            backgroundColor: cardFace.bg,
            borderWidth: 1,
            borderColor: cardFace.edge,
            opacity: 1 - d * 0.18,
            transform: [{ rotate: `${d % 2 ? 2.5 : -2}deg` }],
            boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.18)',
          }}
        />
      ))}
      <GestureDetector gesture={pan}>
        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${offer.label}, pays times ${offer.multiplier}: ${HANDS[offer.kind].name}. ${formatChips(offer.payout)} chips if you make it. ${offer.line}`}
          accessibilityHint="Swipe up or down to see the other calls. Double tap to call it."
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate', label: 'Call it' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') onSide(1);
            else if (e.nativeEvent.actionName === 'decrement') onSide(-1);
            else void called();
          }}
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, height }, top]}
        >
          <ChoiceCard offer={offer} height={height} mine={mine} named={!tabbed} hinted />
          {/* At rest the card says how it's called, at its foot where the thumb is; dragged up, the top says let go. */}
          <Animated.View pointerEvents="none" aria-hidden style={[{ position: 'absolute', bottom: -13, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cardFace.bg, borderWidth: 1, borderColor: cardFace.edge, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 }, rest]}>
            <Body size={12} weight="heavy" color={cardFace.ink} maxFontSizeMultiplier={fontScale.graphic}>
              {mine ? '↑  Swipe up to keep it' : '↑  Swipe up to call it'}
            </Body>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -18, alignSelf: 'center', backgroundColor: cardFace.ink, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm }, hint]}>
            <Body weight="heavy" color={cardFace.bg} maxFontSizeMultiplier={fontScale.graphic}>
              Let go to call it
            </Body>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** A dealt call drawn as a big cream card: its pay in the corners, an example hand, and how often you make it. */
function ChoiceCard({ offer, height, mine, named = true, hinted = false }: { offer: Offer; height: number; mine: boolean; named?: boolean; hinted?: boolean }) {
  const ink = cardFace.ink;
  const compact = height < 340;
  // The shortest phones: everything a little closer together, and no label when the tabs above say it.
  const tight = height < 250;
  const label = !tight || named;
  const corner = (flip: boolean) => (
    <View style={{ position: 'absolute', alignItems: 'center', ...(flip ? { right: 16, bottom: 14, transform: [{ rotate: '180deg' }] } : { left: 16, top: 14 }) }}>
      <Display size={28} color={ink} maxFontSizeMultiplier={fontScale.graphic}>
        {offer.multiplier ? `×${offer.multiplier}` : '✓'}
      </Display>
    </View>
  );
  return (
    <View style={{ flex: 1, borderRadius: 26, backgroundColor: cardFace.bg, borderWidth: 1, borderColor: cardFace.edge, boxShadow: '0px 14px 34px rgba(0, 0, 0, 0.26)', overflow: 'hidden' }}>
      {corner(false)}
      {corner(true)}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: compact ? space.sm : space.md, paddingHorizontal: 56, paddingTop: tight ? space.md : space.lg, paddingBottom: tight ? (hinted ? space.xl : space.md) : space.lg }}>
        {label ? (
          <Body size={12} weight="heavy" color={ink} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1.6, textTransform: 'uppercase' }}>
            {mine && offer.label !== 'Your call' ? `${offer.label} · your call` : offer.label}
          </Body>
        ) : null}
        <HandFan faces={EXAMPLES[offer.kind]} size="sm" width={tight ? 36 : compact ? 40 : 50} spread={0.5} tilt={8} />
        <Display size={tight ? 24 : compact ? 26 : 30} color={ink} maxFontSizeMultiplier={fontScale.graphic} numberOfLines={1} style={{ textAlign: 'center' }}>
          {HANDS[offer.kind].name}
        </Display>
        {offer.payout > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: chip.bg, borderRadius: radius.pill, paddingLeft: 6, paddingRight: 12, paddingVertical: 4 }}>
            <ChipIcon size={20} />
            <Body size={15} weight="heavy" color={chip.ink} maxFontSizeMultiplier={fontScale.graphic}>
              {`+${formatChips(offer.payout)} if you make it`}
            </Body>
          </View>
        ) : null}
        <Body size={13} weight="bold" color={CARD_QUIET} maxFontSizeMultiplier={fontScale.graphic} numberOfLines={2} style={{ textAlign: 'center' }}>
          {offer.line}
        </Body>
      </View>
    </View>
  );
}

/**
 * Calls are closed. With a call, the call as a card: the tier it was dealt as, or "Your call" for a hand
 * picked from the others, and whether the week makes it so far. Without one, the next call face down on
 * the table with the day it opens, and this week's hand so far.
 */
function Closed({ game, back, today, onClose, onHands }: { game: Game; back: BackKey; today: Day; onClose: () => void; onHands: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { call, callMultiplier, hand, warmup, start } = game.current;
  // Named for what you did: the dealt choice it was, or simply your call, priced by what it pays.
  const label = call ? (dealtLabel(game, call) ?? 'Your call') : 'Your call';
  const offer: Offer | null = call
    ? (offerOf(game, call, label) ??
      (callMultiplier
        ? { kind: call, label, multiplier: callMultiplier, payout: HANDS[call].chips * callMultiplier, line: 'Your call for this week.' }
        : { kind: call, label: 'A sure thing', multiplier: 0, payout: 0, line: 'A sure thing, so it pays nothing extra.' }))
    : null;
  const made = call ? makesCall(hand, call) : false;
  const kept = game.current.slots.some((s) => s.card);
  const monday = addDays(start, 7);
  const cardH = Math.round(Math.max(MIN_CARD, Math.min(300, height - insets.top - insets.bottom - 470)));
  const backW = Math.round(Math.min(150, (width - space.xl * 2) * 0.42));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ flexGrow: 1, padding: space.xl, paddingTop: space.xl + space.sm, paddingBottom: insets.bottom + space.lg, gap: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
        <Label numberOfLines={1} style={{ flexShrink: 1 }}>
          {call ? 'This week’s call' : warmup ? 'Warm-up week' : 'Calls are closed'}
        </Label>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" style={{ minHeight: TAP, justifyContent: 'center' }}>
          <Body weight="heavy" color={t.textSecondary}>
            Close
          </Body>
        </Pressable>
      </View>

      <View style={{ gap: space.sm }}>
        <Display size={34} header>
          {call ? HANDS[call].name : warmup ? 'Calls start Monday' : 'Calls open Monday'}
        </Display>
        <Body color={t.textSecondary}>
          {call
            ? made
              ? 'Your hand already makes it. Hold on to it through Sunday and it pays again.'
              : 'Make it or better by Sunday midnight and it pays again. Miss and you lose nothing.'
            : warmup
              ? 'A warm-up week has no call. Your first full week starts on Monday, with three calls dealt to pick from.'
              : kept
                ? 'This week’s call closed when your first kept day ended. On Monday a new hand starts, with three new calls dealt.'
                : 'On Monday a new hand starts, with three new calls dealt to pick from.'}
        </Body>
      </View>

      {offer ? (
        <View style={{ height: cardH }}>
          <ChoiceCard offer={offer} height={cardH} mine={false} />
        </View>
      ) : (
        <NextCall back={back} width={backW} opens={shortDay(monday)} />
      )}

      {!warmup ? <SoFar game={game} today={today} /> : null}

      <View style={{ flex: 1 }} />
      <View style={{ gap: space.xs }}>
        <Button label="See this week’s hand" onPress={onHands} hint="Opens the Hands tab" />
        <Button label="Close" variant="quiet" onPress={onClose} />
      </View>
    </ScrollView>
  );
}

/** Next week's call, face down on the table: the player's own card back with the day it turns up. */
function NextCall({ back, width, opens }: { back: BackKey; width: number; opens: string }) {
  const t = useTheme();
  const h = Math.round((width * 180) / 128);
  return (
    <View accessible accessibilityLabel={`The next call opens ${opens}`} style={{ height: h + 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', transform: [{ translateX: 18 }, { rotate: '7deg' }], opacity: 0.55 }}>
        <CardBack back={back} size="lg" width={width} />
      </View>
      <View style={{ transform: [{ rotate: '-4deg' }], boxShadow: '0px 12px 28px rgba(0, 0, 0, 0.28)', borderRadius: 18 }}>
        <CardBack back={back} size="lg" width={width} />
      </View>
      <View style={{ position: 'absolute', bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.text, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Body size={14} weight="heavy" color={t.bg} maxFontSizeMultiplier={fontScale.chrome}>
          {`Next call · ${opens}`}
        </Body>
      </View>
    </View>
  );
}

/** This week's hand as it stands, with what it pays at least. */
function SoFar({ game, today }: { game: Game; today: Day }) {
  const t = useTheme();
  const { hand, chips } = game.current;
  return (
    <View style={[{ borderRadius: radius.lg, padding: space.lg, gap: space.sm }, raisedStyle(t)]}>
      <Label color={t.onRaisedSecondary}>This week so far</Label>
      {hand ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <HandRow faces={playedFaces(hand.cards)} size="xs" overlap={0.4} accessibilityLabel={hand.title} />
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="heavy" color={t.onRaised} numberOfLines={2}>
              {hand.title}
            </Body>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Body size={13} weight="bold" color={t.onRaisedSecondary}>
                Pays at least
              </Body>
              <Chips value={chips} size={13} color={t.onRaised} />
              <Body size={13} weight="bold" color={t.onRaisedSecondary}>
                {showdownWhen(today)}
              </Body>
            </View>
          </View>
        </View>
      ) : (
        <Body weight="bold" color={t.onRaised}>
          No cards yet this week. Keep any habit to deal the first one.
        </Body>
      )}
    </View>
  );
}
