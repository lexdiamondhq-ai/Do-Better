import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import type { Suit } from '@/engine/cards';
import { addDays, weekday, type Day } from '@/engine/day';
import type { Slot } from '@/engine/deal';
import type { BackKey, Week } from '@/engine/game';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

import { CardBack } from './CardBack';
import { CARD_SIZES, CardSlot, faceLabel, faceOfDay, PlayingCard, type CardSize } from './PlayingCard';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function describe(slot: Slot, playAs: Suit | undefined, rescue: Day | null): string {
  if (slot.card) return `${faceLabel(faceOfDay(slot.card, playAs))}${playAs ? ', in your hand' : ''}`;
  if (slot.state === 'open') return 'not dealt yet';
  if (slot.state === 'future') return 'still to come';
  if (slot.state === 'blank') return slot.day === rescue ? 'missed, and can still be saved today' : 'missed';
  return 'no cards yet';
}

/** The whole week in one sentence, for VoiceOver: "Monday, 8 of Clubs. Tuesday, missed. Today, not dealt yet. 3 days to come." */
export function describeWeek(week: Week, rescue: Day | null): string {
  const played = new Map(week.hand?.cards.map((c): [Day, Suit | undefined] => [c.day, c.suit ?? undefined]) ?? []);
  const parts: string[] = [];
  let future = 0;
  for (const slot of week.slots) {
    if (slot.state === 'future') {
      future += 1;
      continue;
    }
    if (slot.state === 'before') continue;
    parts.push(`${slot.isToday ? 'Today' : NAMES[weekday(slot.day)]}, ${describe(slot, played.get(slot.day), rescue)}`);
  }
  if (future) parts.push(future === 1 ? '1 day to come' : `${future} days to come`);
  return `This week: ${parts.join('. ')}.`;
}

/** Today's empty place: an ink outline that breathes, with a question mark. */
function TodaySlot({ size }: { size: CardSize }) {
  const t = useTheme();
  const s = CARD_SIZES[size];
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.set(withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1, false, undefined, ReduceMotion.System));
  }, [glow]);
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.12 * glow.get() }] }));
  return (
    <View style={{ width: s.w, height: s.h, borderRadius: s.radius, borderWidth: 2, borderColor: t.text, backgroundColor: withAlpha(t.text, 0.06), alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 3px ${withAlpha(t.text, 0.12)}` }}>
      <Animated.Text style={[{ fontFamily: fonts.display, fontSize: Math.round(s.w * 0.5), color: t.text }, mark]}>?</Animated.Text>
    </View>
  );
}

/**
 * The week's seven cards, Monday to Sunday. Cards in the best hand are edged in gold; today waits as an
 * outline with a question mark, and days to come show the player's card back, faded. The strip reads
 * out as one sentence. `onYesterday` turns yesterday's empty place into a button, for logging a day
 * that was kept but never logged.
 */
export function WeekStrip({
  week,
  back,
  rescue,
  size = 'xs',
  onPress,
  onYesterday,
}: {
  week: Week;
  back: BackKey;
  rescue: Day | null;
  size?: CardSize;
  onPress?: () => void;
  onYesterday?: () => void;
}) {
  const t = useTheme();
  // Cards in the hand show the suit they play as, so a Flush in Spades looks like one.
  const played = new Map(week.hand?.cards.map((c): [Day, Suit | undefined] => [c.day, c.suit ?? undefined]) ?? []);
  const today = week.slots.find((s) => s.isToday)?.day ?? null;
  const yesterday = today ? addDays(today, -1) : null;
  const s = CARD_SIZES[size];

  const slots = week.slots.map((slot) => {
    const held = played.has(slot.day);
    const saving = slot.state === 'blank' && slot.day === rescue;
    const late = !!onYesterday && slot.day === yesterday && !slot.card;
    let card: ReactNode;
    if (slot.card) card = <PlayingCard face={faceOfDay(slot.card, played.get(slot.day))} size={size} highlight={held} />;
    else if (slot.state === 'future') card = <CardBack back={back} size={size} style={{ opacity: 0.45 }} />;
    else if (slot.state === 'open') card = <TodaySlot size={size} />;
    else if (late || saving)
      card = (
        <CardSlot size={size} color={t.text} style={{ backgroundColor: withAlpha(t.text, 0.08) }}>
          <Text style={{ fontFamily: fonts.display, fontSize: Math.round(s.w * 0.42), color: t.text }}>↺</Text>
          <Text style={{ fontFamily: fonts.bodyHeavy, fontSize: 8, letterSpacing: 0.6, color: t.text }}>{late ? 'LOG' : 'SAVE'}</Text>
        </CardSlot>
      );
    else card = <CardSlot size={size} color={slot.state === 'blank' ? t.dashed : t.border} dashed={slot.state === 'blank'} />;
    const letter = LETTERS[weekday(slot.day)];
    const body = (
      <>
        {card}
        <Text style={{ fontFamily: slot.isToday ? fonts.bodyHeavy : fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, color: slot.isToday ? t.text : t.textSecondary }}>{slot.isToday ? `${letter}•` : letter}</Text>
      </>
    );
    return { slot, late, body };
  });

  const strip = (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={describeWeek(week, rescue)}
      accessibilityHint={onPress ? 'Opens your hand' : undefined}
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
  if (!lateSlot || !onYesterday) return strip;
  const index = week.slots.indexOf(lateSlot.slot);
  // Yesterday's button sits over its place in the strip, so it can be found and pressed on its own.
  return (
    <View>
      {strip}
      <Pressable
        onPress={onYesterday}
        accessibilityRole="button"
        accessibilityLabel="Log yesterday"
        accessibilityHint="For a card you kept yesterday but never logged"
        hitSlop={6}
        testID="strip-yesterday"
        style={({ pressed }) => ({
          position: 'absolute',
          top: 0,
          left: `${(index / (week.slots.length - 1)) * 100}%`,
          marginLeft: -(s.w * index) / (week.slots.length - 1),
          alignItems: 'center',
          gap: 5,
          width: s.w,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {lateSlot.body}
      </Pressable>
    </View>
  );
}
