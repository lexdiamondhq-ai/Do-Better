import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ask } from '@/components/Ask';
import { ChipIcon, formatChips } from '@/components/Chips';
import { EXAMPLES, HandFan, HandRow } from '@/components/HandFan';
import { RulesButton } from '@/components/RulesSheet';
import { Body, Button, Display, Label } from '@/components/ui';
import { CALLABLE, callChoices, type CallChoice, type Game } from '@/engine/game';
import { HANDS, makesCall, type HandKind } from '@/engine/poker';
import { useData } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { playSound } from '@/lib/sound';
import { faintestAlpha, withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { cardFace, chip, fontScale, radius, space, TAP } from '@/theme/tokens';

const LABELS: Record<1 | 2 | 3, CallChoice['label']> = { 1: 'Safe', 2: 'Stretch', 3: 'Long shot' };
const SWIPE = 90;
/** The quieter ink on a cream call card, as faint as it can be and still read at 4.5:1. */
const CARD_QUIET = withAlpha(cardFace.ink, faintestAlpha(cardFace.ink, cardFace.bg, 4.5, 0.6));

/** A call on offer: one of the three dealt choices, or any other hand that pays at least once over. */
type Offer = { kind: HandKind; label: string; multiplier: 0 | 1 | 2 | 3; payout: number; line: string };

function offerOf(game: Game, kind: HandKind, label?: string): Offer | null {
  const price = game.callOdds[kind];
  if (!price || price.multiplier === 0) return null;
  const m = price.multiplier as 1 | 2 | 3;
  const line =
    price.of === 0
      ? 'No finished weeks yet, so it’s priced for a deck your size.'
      : price.of === 1
        ? price.made
          ? 'Made this or better last week.'
          : 'Not made last week.'
        : `Made this or better in ${price.made} of your last ${price.of} weeks.`;
  return { kind, label: label ?? LABELS[m], multiplier: m, payout: HANDS[kind].chips * m, line };
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
  const { callHand } = useData();
  const [picked, setPicked] = useState<HandKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [others, setOthers] = useState(false);
  // The pinned footer, measured, so large text never lets it cover the end of the list.
  const [measured, setMeasured] = useState(0);
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
  const rest = CALLABLE.filter((k) => offerOf(game, k)).reverse();

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
      router.back();
      return true;
    } catch (e) {
      ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
      setBusy(false);
      return false;
    }
  }

  const footer = measured || 132 + insets.bottom;
  const cardH = Math.round(Math.max(250, Math.min(380, height - insets.top - footer - 330)));

  if (!game.callOpen) return <Closed game={game} onClose={() => router.back()} />;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xl + space.sm, paddingBottom: footer + space.xl, gap: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
          <Label>{game.current.slots.some((s) => s.card) ? 'Calls close at midnight' : 'Open until your first kept day ends'}</Label>
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
          <Body color={t.textSecondary}>Pick the hand you think this week will make. Make it or better by Sunday midnight and it pays again. Miss and you lose nothing.</Body>
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
          <Stack key={offer.kind} offer={offer} behind={Math.min(2, Math.max(0, choices.length - 1))} height={cardH} onUp={confirm} onSide={step} canSide={canStep} mine={offer.kind === current} />
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
              <Display size={22}>Other hands</Display>
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
                        <Body size={12} weight="bold" color={t.textSecondary} numberOfLines={2}>
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
          <Button label={offer.kind === current ? `Keep my call: ${HANDS[offer.kind].name}` : `Call it: ${HANDS[offer.kind].name}`} busy={busy} onPress={() => void confirm()} />
          <Body size={12} weight="bold" color={t.textSecondary} style={{ textAlign: 'center' }} maxFontSizeMultiplier={fontScale.chrome}>
            {offer.kind === current ? 'You can change it until calls close.' : 'Or swipe the card up. You can change it until calls close.'}
          </Body>
        </View>
      ) : null}
    </View>
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
}: {
  offer: Offer;
  behind: number;
  height: number;
  onUp: () => Promise<boolean>;
  onSide: (by: 1 | -1) => void;
  canSide: boolean;
  mine: boolean;
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
          <ChoiceCard offer={offer} height={height} mine={mine} />
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
function ChoiceCard({ offer, height, mine }: { offer: Offer; height: number; mine: boolean }) {
  const ink = cardFace.ink;
  const compact = height < 340;
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: compact ? space.sm : space.md, paddingHorizontal: 56, paddingVertical: space.lg }}>
        <Body size={12} weight="heavy" color={ink} maxFontSizeMultiplier={fontScale.graphic} style={{ letterSpacing: 1.6, textTransform: 'uppercase' }}>
          {mine && offer.label !== 'Your call' ? `${offer.label} · your call` : offer.label}
        </Body>
        <HandFan faces={EXAMPLES[offer.kind]} size="sm" width={compact ? 40 : 50} spread={0.5} tilt={8} />
        <Display size={compact ? 26 : 30} color={ink} maxFontSizeMultiplier={fontScale.graphic} numberOfLines={1} style={{ textAlign: 'center' }}>
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

/** Calls are closed: the week's call, if there is one, or when the next one opens. */
function Closed({ game, onClose }: { game: Game; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { call, callMultiplier } = game.current;
  // Priced by what this week's call pays, so a sure thing or a call from the old rules still reads true.
  const offer: Offer | null = call
    ? (offerOf(game, call) ??
      (callMultiplier
        ? { kind: call, label: LABELS[callMultiplier], multiplier: callMultiplier, payout: HANDS[call].chips * callMultiplier, line: 'Your call for this week.' }
        : { kind: call, label: 'A sure thing', multiplier: 0, payout: 0, line: 'A sure thing, so it pays nothing extra.' }))
    : null;
  const made = call ? makesCall(game.current.hand, call) : false;
  const cardH = Math.round(Math.max(240, Math.min(320, height - insets.top - insets.bottom - 380)));
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ flexGrow: 1, padding: space.xl, paddingTop: space.xxl, paddingBottom: insets.bottom + space.lg, gap: space.lg }}
    >
      <View style={{ gap: space.sm }}>
        <Label>{call ? 'This week’s call' : 'Your call'}</Label>
        <Display size={30} header>
          {call ? HANDS[call].name : 'No call this week.'}
        </Display>
        <Body color={t.textSecondary}>
          {call
            ? made
              ? 'Your hand already makes it. Hold on to it through Sunday and it pays again.'
              : 'Make it or better by Sunday midnight and it pays again. Miss and you lose nothing.'
            : game.current.warmup
              ? 'Calls start with your first full week.'
              : 'Calls open again on Monday.'}
        </Body>
      </View>
      {offer ? (
        <View style={{ height: cardH }}>
          <ChoiceCard offer={offer} height={cardH} mine={false} />
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <Button label="Close" variant="ghost" onPress={onClose} />
    </ScrollView>
  );
}
