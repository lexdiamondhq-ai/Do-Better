import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { rankName, type Suit } from '@/engine/cards';
import { addDays, weekday, type Day } from '@/engine/day';
import type { DayCard, Slot } from '@/engine/deal';
import type { BackKey, Week } from '@/engine/game';
import type { PlayedCard } from '@/engine/poker';
import { aCard, weekDealSlot } from '@/engine/today';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

import { CardBack } from './CardBack';
import { CARD_SIZES, CardSlot, faceLabel, faceOfDay, faceOfPlayed, PlayingCard, type CardSize } from './PlayingCard';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** The ↺ badge's own box on yesterday's top-right corner: how big it is, how far it rises above the card, and how far it reaches past its edge. */
const BADGE_BOX = 28;
const BADGE_REACH = 10;
const BADGE_OUT = 6;
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Days to come sit face down a little smaller than a dealt card, still in the deck. */
const BACK_SCALE = 0.86;
/** Yesterday's saved card shows face up but faint until it is yours. */
const SAVED_OPACITY = 0.7;

/** A window rectangle, as `measureInWindow` reports it. */
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Today's deal as the strip shows it. `flying` while a card arcs in from the table: today's place is an
 * empty frame waiting for it, and yesterday's saved card (`savedDay`) stays faint until it lands.
 * `landed` once it is in: the saved card snaps solid. `n` counts deals, so each one snaps once.
 */
export type StripArc = { phase: 'flying' | 'landed'; savedDay: Day | null; n: number };

/** "a Jack": yesterday's saved card by rank. Saved cards have no suit. */
const savedName = (card: DayCard) => (card.kind === 'card' ? aCard(rankName(card.rank)) : 'a Joker');

/** The saved slot read out on its own: "Yesterday, a Jack, waits to be saved. Keep any habit today and it’s yours." */
export function savedLine(card: DayCard): string {
  return `Yesterday, ${savedName(card)}, waits to be saved. Keep any habit today and it’s yours.`;
}

function describe(slot: Slot, played: PlayedCard | undefined, rescue: Day | null): string {
  if (slot.card) {
    // Every card the hand uses is in your hand: a Joker, a saved day and a suited card alike.
    if (!played) return faceLabel(faceOfDay(slot.card));
    const face = slot.card.kind === 'joker' ? faceOfPlayed(played) : faceOfDay(slot.card, played.suit);
    return `${faceLabel(face)}, in your hand`;
  }
  if (slot.state === 'open') return 'not dealt yet';
  if (slot.state === 'future') return 'still to come';
  if (slot.state === 'blank') return slot.day === rescue ? 'no card yet, and it can still be saved today' : 'no card';
  return 'no cards yet';
}

/**
 * The whole week in one sentence, for VoiceOver: "Monday, 8 of Clubs. Yesterday, a Jack, waits to be saved.
 * Today, not dealt yet. 3 cards to come." `saved` is yesterday's card when the strip shows it face up.
 */
export function describeWeek(week: Week, rescue: Day | null, saved: DayCard | null = null): string {
  const played = new Map(week.hand?.cards.map((c): [Day, PlayedCard] => [c.day, c]) ?? []);
  const parts: string[] = [];
  let future = 0;
  for (const slot of week.slots) {
    if (slot.state === 'future') {
      future += 1;
      continue;
    }
    if (slot.state === 'before') continue;
    if (saved && slot.state === 'blank' && slot.day === rescue) {
      parts.push(`Yesterday, ${savedName(saved)}, waits to be saved`);
      continue;
    }
    parts.push(`${slot.isToday ? 'Today' : NAMES[weekday(slot.day)]}, ${describe(slot, played.get(slot.day), rescue)}`);
  }
  if (future) parts.push(future === 1 ? '1 card to come' : `${future} cards to come`);
  return `This week: ${parts.join('. ')}.`;
}

/** Today's empty place: an ink outline that breathes, with a question mark. While a card flies in, an empty frame lit for it. */
function TodaySlot({ size, waiting }: { size: CardSize; waiting?: boolean }) {
  const t = useTheme();
  const s = CARD_SIZES[size];
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.set(withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1, false, undefined, ReduceMotion.System));
  }, [glow]);
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.12 * glow.get() }] }));
  return (
    <View
      style={{
        width: s.w,
        height: s.h,
        borderRadius: s.radius,
        borderWidth: 2,
        borderColor: t.text,
        backgroundColor: withAlpha(t.text, waiting ? 0.12 : 0.06),
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 0 0 ${waiting ? 5 : 3}px ${withAlpha(t.text, waiting ? 0.2 : 0.12)}`,
      }}
    >
      {waiting ? null : <Animated.Text style={[{ fontFamily: fonts.display, fontSize: Math.round(s.w * 0.5), color: t.text }, mark]}>?</Animated.Text>}
    </View>
  );
}

/** Snaps in once on mount: yesterday's saved card going solid as today's card lands. */
function Snap({ children }: { children: ReactNode }) {
  const pop = useSharedValue(1.22);
  useEffect(() => {
    pop.set(withSpring(1, { mass: 1, damping: 11, stiffness: 320, reduceMotion: ReduceMotion.System }));
  }, [pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Turns over once on mount, from the card back to the card: today's Joker after its face card's night. */
function TurnOver({ back, size, children }: { back: BackKey; size: CardSize; children: ReactNode }) {
  const turn = useSharedValue(1);
  useEffect(() => {
    turn.set(withDelay(160, withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System })));
  }, [turn]);
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 500 }, { rotateY: `${turn.get() * 180}deg` }] }));
  const behind = useAnimatedStyle(() => ({ transform: [{ perspective: 500 }, { rotateY: `${turn.get() * 180 - 180}deg` }] }));
  const s = CARD_SIZES[size];
  return (
    <View style={{ width: s.w, height: s.h }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden' }, behind]}>
        <CardBack back={back} size={size} />
      </Animated.View>
      <Animated.View style={[{ backfaceVisibility: 'hidden' }, front]}>{children}</Animated.View>
    </View>
  );
}

/**
 * A day still to come, face down in the player's back. On the week's first look the backs deal into the
 * strip one after another: `dealt` runs 0 to 1 over the whole deal, and this back flies in during its own
 * part of it, from the deck below, turning and dropping into place.
 */
function FutureBack({ back, size, dealt, index, count }: { back: BackKey; size: CardSize; dealt?: SharedValue<number>; index: number; count: number }) {
  const { startMs, endMs } = weekDealSlot(index, count);
  const totalMs = weekDealSlot(count - 1, count).endMs || 1;
  const style = useAnimatedStyle(() => {
    const p = dealt ? dealt.get() : 1;
    const at = p * totalMs;
    const u = Math.min(1, Math.max(0, (at - startMs) / Math.max(1, endMs - startMs)));
    // Out, with a little overshoot as each card seats itself.
    const k = 1.7;
    const e = u >= 1 ? 1 : 1 + (k + 1) * Math.pow(u - 1, 3) + k * Math.pow(u - 1, 2);
    return {
      opacity: u <= 0 ? 0 : Math.min(1, u * 3),
      transform: [{ translateY: (1 - e) * 120 }, { translateX: (1 - e) * -28 * (index % 2 ? -1 : 1) }, { rotate: `${(1 - e) * (index % 2 ? 22 : -22)}deg` }, { scale: BACK_SCALE * (1 + 0.25 * (1 - e)) }],
    };
  });
  return (
    <Animated.View style={style}>
      <CardBack back={back} size={size} style={{ opacity: 0.8 }} />
    </Animated.View>
  );
}

/**
 * The week's seven cards, Monday to Sunday. Cards in the best hand are edged in gold; today waits as an
 * outline with a question mark, and days to come sit face down in the player's card back. When the whole of
 * yesterday got away, its place shows the card a keep today would save, face up and faint. The strip reads
 * out as one sentence. `onYesterday` turns yesterday's empty place into a button, for logging a day that
 * was kept but never logged.
 *
 * `onTodayLayout` reports today's place in window coordinates, so a kept card can arc into it; `arc` says
 * where that deal is. `dealt` deals the week's backs in (0 to 1). `turnToday` turns today's card over once
 * each time it changes.
 */
export function WeekStrip({
  week,
  back,
  rescue,
  saved = null,
  size = 'xs',
  arc = null,
  dealt,
  turnToday = 0,
  onPress,
  onYesterday,
  onTodayLayout,
}: {
  week: Week;
  back: BackKey;
  rescue: Day | null;
  /** The card yesterday would be saved as (`game.rescueCard`). */
  saved?: DayCard | null;
  size?: CardSize;
  arc?: StripArc | null;
  dealt?: SharedValue<number>;
  turnToday?: number;
  onPress?: () => void;
  onYesterday?: () => void;
  onTodayLayout?: (rect: Rect) => void;
}) {
  const t = useTheme();
  const todayRef = useRef<View>(null);
  // Cards in the hand show the suit they play as, so a hand built on Spades reads as one.
  const played = new Map(week.hand?.cards.map((c): [Day, Suit | undefined] => [c.day, c.suit ?? undefined]) ?? []);
  const today = week.slots.find((s) => s.isToday)?.day ?? null;
  const yesterday = today ? addDays(today, -1) : null;
  const s = CARD_SIZES[size];
  const futures = week.slots.filter((x) => x.state === 'future').map((x) => x.day);
  const flying = arc?.phase === 'flying';

  const measureToday = () => {
    if (!onTodayLayout) return;
    todayRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0) onTodayLayout({ x, y, width, height });
    });
  };

  const slots = week.slots.map((slot) => {
    const held = played.has(slot.day);
    const saving = slot.state === 'blank' && slot.day === rescue;
    const late = !!onYesterday && slot.day === yesterday && !slot.card;
    // Yesterday's card, just saved by the keep now flying in: it stays faint until today's card lands.
    const savingNow = !!slot.card && arc?.savedDay === slot.day;
    let card: ReactNode;
    if (slot.isToday && flying) card = <TodaySlot size={size} waiting />;
    else if (slot.card) {
      const face = <PlayingCard face={faceOfDay(slot.card, played.get(slot.day))} size={size} highlight={held} dashed={savingNow && flying} style={savingNow && flying ? { opacity: SAVED_OPACITY } : undefined} />;
      if (savingNow && arc?.phase === 'landed') card = <Snap key={`snap:${arc.n}`}>{face}</Snap>;
      else if (slot.isToday && turnToday > 0) {
        card = (
          <TurnOver key={`turn:${turnToday}`} back={back} size={size}>
            {face}
          </TurnOver>
        );
      } else card = face;
    } else if (slot.state === 'future') card = <FutureBack back={back} size={size} dealt={dealt} index={futures.indexOf(slot.day)} count={futures.length} />;
    else if (slot.state === 'open') card = <TodaySlot size={size} />;
    else if (saving && saved) card = <PlayingCard face={faceOfDay(saved)} size={size} dashed style={{ opacity: SAVED_OPACITY }} />;
    else if (late || saving)
      card = (
        <CardSlot size={size} color={t.text} style={{ backgroundColor: withAlpha(t.text, 0.08) }}>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.display, fontSize: Math.round(s.w * 0.42), color: t.text }}>
            ↺
          </Text>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.bodyHeavy, fontSize: 8, letterSpacing: 0.6, color: t.text }}>
            {late ? 'LOG' : 'SAVE'}
          </Text>
        </CardSlot>
      );
    else card = <CardSlot size={size} color={slot.state === 'blank' ? t.dashed : t.border} dashed={slot.state === 'blank'} />;
    const letter = LETTERS[weekday(slot.day)];
    const body = (
      <>
        {slot.isToday ? (
          <View ref={todayRef} collapsable={false} onLayout={measureToday}>
            {card}
          </View>
        ) : (
          card
        )}
        <Text allowFontScaling={false} style={{ fontFamily: slot.isToday ? fonts.bodyHeavy : fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, color: slot.isToday ? t.text : t.textSecondary }}>
          {slot.isToday ? `${letter}•` : letter}
        </Text>
      </>
    );
    return { slot, late, saving, body };
  });

  const strip = (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={describeWeek(week, rescue, saved)}
      accessibilityHint={onPress ? 'Opens your hand' : undefined}
      onLayout={measureToday}
      style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', opacity: pressed ? 0.8 : 1 })}
    >
      {slots.map(({ slot, late, body }) => (
        <View key={slot.day} style={{ alignItems: 'center', gap: 5, opacity: late ? 0 : 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {body}
        </View>
      ))}
    </Pressable>
  );

  const lateSlot = slots.find((x) => x.late);
  // Yesterday already has a card from another habit: a small ↺ on its corner still logs one that was kept but never logged.
  const keptYesterday = onYesterday && !lateSlot ? week.slots.find((x) => x.day === yesterday && x.card) : undefined;
  if (!onYesterday || (!lateSlot && !keptYesterday)) return strip;
  const target = lateSlot?.slot ?? keptYesterday!;
  const index = week.slots.indexOf(target);
  const place = { left: `${(index / (week.slots.length - 1)) * 100}%` as const, marginLeft: -(s.w * index) / (week.slots.length - 1) };
  // The saved card face up says what a keep today wins; a tap on it still logs yesterday, for a card kept but never logged.
  const showsSaved = !!lateSlot?.saving && !!saved;
  // Yesterday's button sits over its place in the strip, so it can be found and pressed on its own.
  return (
    <View>
      {strip}
      {lateSlot ? (
        <Pressable
          onPress={onYesterday}
          accessibilityRole="button"
          accessibilityLabel={showsSaved && saved ? savedLine(saved) : 'Log yesterday'}
          accessibilityHint={showsSaved ? 'Or log a card you kept yesterday but never logged' : 'For a card you kept yesterday but never logged'}
          hitSlop={6}
          testID="strip-yesterday"
          style={({ pressed }) => ({ position: 'absolute', top: 0, ...place, alignItems: 'center', gap: 5, width: s.w, opacity: pressed ? 0.7 : 1 })}
        >
          {lateSlot.body}
        </Pressable>
      ) : (
        // Only the small badge on yesterday's corner logs it; the rest of yesterday's card opens the hand
        // like every other card. The badge's box stays off today's place; the finger gets more room above and left.
        <Pressable
          onPress={onYesterday}
          accessibilityRole="button"
          accessibilityLabel="Log yesterday"
          accessibilityHint="For a card you kept yesterday but never logged"
          testID="strip-yesterday"
          hitSlop={{ top: 12, left: 12, bottom: 6, right: 0 }}
          style={({ pressed }) => ({ position: 'absolute', top: -BADGE_REACH, ...place, transform: [{ translateX: s.w - BADGE_BOX + BADGE_OUT }], width: BADGE_BOX, height: BADGE_BOX, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.text, borderWidth: 2, borderColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text allowFontScaling={false} style={{ fontFamily: fonts.display, fontSize: 13, lineHeight: 15, color: t.bg }}>
              ↺
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
