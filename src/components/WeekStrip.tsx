import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Suit } from '@/engine/cards';
import type { Day } from '@/engine/day';
import type { Slot } from '@/engine/deal';
import type { BackKey, Week } from '@/engine/game';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

import { CardBack } from './CardBack';
import { CardSlot, faceLabel, faceOfDay, PlayingCard, type CardSize } from './PlayingCard';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function describe(slot: Slot, playAs: Suit | undefined, rescue: Day | null): string {
  if (slot.card) return `${faceLabel(faceOfDay(slot.card, playAs))}${playAs ? ', in your hand' : ''}`;
  if (slot.state === 'open') return 'today, not dealt yet';
  if (slot.state === 'future') return 'still to come';
  if (slot.state === 'blank') return slot.day === rescue ? 'missed, and can still be saved today' : 'missed';
  return 'no habits yet';
}

/**
 * The week's seven cards, Monday to Sunday. Cards in the best hand are edged in gold; today waits
 * face down with a question mark, and days to come show the player's card back.
 */
export function WeekStrip({ week, back, rescue, size = 'xs', onPress }: { week: Week; back: BackKey; rescue: Day | null; size?: CardSize; onPress?: () => void }) {
  const t = useTheme();
  // Cards in the hand show the suit they play as, so a Flush in Spades looks like one.
  const played = new Map(week.hand?.cards.map((c): [Day, Suit] => [c.day, c.suit]) ?? []);
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel="This week's cards" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {week.slots.map((slot, i) => {
        const held = played.has(slot.day);
        const saving = slot.state === 'blank' && slot.day === rescue;
        let card: ReactNode;
        if (slot.card) card = <PlayingCard face={faceOfDay(slot.card, played.get(slot.day))} size={size} highlight={held} />;
        else if (slot.state === 'future') card = <CardBack back={back} size={size} />;
        else if (slot.state === 'open')
          card = (
            <CardSlot size={size} color={t.text}>
              <Text style={{ fontFamily: fonts.display, fontSize: 20, color: t.text }}>?</Text>
            </CardSlot>
          );
        else if (saving)
          card = (
            <CardSlot size={size} color={t.accent} style={{ backgroundColor: t.surface }}>
              <Text style={{ fontFamily: fonts.bodyHeavy, fontSize: 8, letterSpacing: 0.6, color: t.text }}>SAVE</Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 16, color: t.text }}>↺</Text>
            </CardSlot>
          );
        else card = <CardSlot size={size} color={slot.state === 'blank' ? t.dashed : t.border} dashed={slot.state === 'blank'} />;
        return (
          <View key={slot.day} accessible accessibilityLabel={`${NAMES[i]}: ${describe(slot, played.get(slot.day), rescue)}`} style={{ alignItems: 'center', gap: 5 }}>
            {card}
            <Text style={{ fontFamily: slot.isToday ? fonts.bodyHeavy : fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, color: slot.isToday ? t.text : t.textFaint }}>
              {slot.isToday ? `${LETTERS[i]}•` : LETTERS[i]}
            </Text>
          </View>
        );
      })}
    </Pressable>
  );
}
