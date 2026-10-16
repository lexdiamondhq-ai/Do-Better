import { View, type StyleProp, type ViewStyle } from 'react-native';

import { SUIT_INFO } from '@/engine/cards';
import type { Level } from '@/engine/kept';
import { playsLine } from '@/engine/playbook';
import type { Habit } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, radius, space } from '@/theme/tokens';

import { SuitGlyph } from './Suit';
import { Body, Display, Label, raisedStyle } from './ui';

/** "♣ MIND · I'm a reader": the part of you this card deals for, and who it says you are. */
function Identity({ habit, ink }: { habit: Habit; ink: string }) {
  const who = habit.identity ? ` · I'm ${habit.identity.replace(/^(i am|i'm)\s+/i, '')}` : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <SuitGlyph suit={habit.suit} size={14} color={ink} />
      <Label color={ink} style={{ opacity: 0.8, flexShrink: 1 }}>{`${SUIT_INFO[habit.suit].part}${who}`}</Label>
    </View>
  );
}

function Direction({ arrow, label, value, ink, circleBg, circleFg }: { arrow: string; label: string; value: string; ink: string; circleBg: string; circleFg: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: circleBg, alignItems: 'center', justifyContent: 'center' }}>
        <Display size={20} color={circleFg}>{arrow}</Display>
      </View>
      <View style={{ flex: 1 }}>
        <Label color={ink} style={{ opacity: 0.7 }}>{label}</Label>
        <Body weight="bold" size={15} color={ink} numberOfLines={2}>{value}</Body>
      </View>
    </View>
  );
}

/** The face of a habit card: Ceiling on top, the name in the middle, the Floor at the bottom. */
export function HabitCard({ habit, level, subtitle, style }: { habit: Habit; level?: Level | null; subtitle?: string; style?: StyleProp<ViewStyle> }) {
  const c = cardColors[habit.color];
  const upgraded = level === 'floor';
  return (
    <View style={[{ flex: 1, backgroundColor: c.bg, borderRadius: radius.card, padding: space.xl, justifyContent: 'space-between' }, style]}>
      <Direction arrow="↑" label={upgraded ? 'Swipe up · reach the Ceiling' : 'Swipe up · Ceiling'} value={habit.ceilingLabel} ink={c.ink} circleBg="#17121F" circleFg={c.bg} />
      <View style={{ gap: space.sm }}>
        <Identity habit={habit} ink={c.ink} />
        <Display size={habit.name.length > 12 ? 44 : 58} color={c.ink} numberOfLines={3}>{habit.name}</Display>
        {subtitle ? <Body weight="bold" size={15} color={c.ink} style={{ opacity: 0.85 }}>{subtitle}</Body> : null}
        {habit.anchor ? <Body size={14} color={c.ink} style={{ opacity: 0.8 }}>{playsLine(habit.anchor)}{habit.whenWhere ? ` · ${habit.whenWhere}` : ''}</Body> : null}
      </View>
      {upgraded ? (
        <View style={{ alignSelf: 'flex-start', backgroundColor: '#17121F', borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Body weight="heavy" size={13} color={c.bg}>Floor kept ✓ {habit.floorLabel}</Body>
        </View>
      ) : (
        <Direction arrow="↓" label="Swipe down · Floor" value={habit.floorLabel} ink={c.ink} circleBg="#17121F" circleFg={c.bg} />
      )}
    </View>
  );
}

/** The dark side of a card, shown the morning after a miss. */
export function NeverTwiceCard({ habit, week, saving, style }: { habit: Habit; week: ('kept' | 'ceiling' | 'missed' | 'today' | 'none')[]; saving?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const c = cardColors[habit.color];
  return (
    <View style={[{ flex: 1, ...raisedStyle(t), borderRadius: radius.card, padding: space.xl, justifyContent: 'space-between' }, style]}>
      <View style={{ gap: space.md }}>
        <Label color={t.onRaisedSecondary}>{`Comeback · ${habit.name}`}</Label>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {week.map((w, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                aspectRatio: 0.75,
                borderRadius: 6,
                backgroundColor: w === 'ceiling' ? c.bg : w === 'kept' ? c.bg : 'transparent',
                opacity: w === 'kept' ? 0.55 : 1,
                borderWidth: w === 'missed' || w === 'today' || w === 'none' ? 1.5 : 0,
                borderStyle: w === 'today' ? 'solid' : 'dashed',
                borderColor: w === 'today' ? t.onCardBack : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Display size={48} color={c.onDark}>Yesterday got away.</Display>
        <Body weight="bold" size={16} color={t.onCardBack}>
          {saving ? 'One day off changes nothing. Keep this today and yesterday still gets its card.' : 'One day off changes nothing. Here is the easy way back in.'}
        </Body>
      </View>
      <View style={{ gap: space.md }}>
        {habit.twoMinuteLabel ? (
          <View style={{ borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <Body weight="bold" size={14} color={t.onCardBack} style={{ flexShrink: 0 }}>Tap for your first move</Body>
            <Body size={14} color={t.onCardBack} style={{ opacity: 0.7, flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>{habit.twoMinuteLabel}</Body>
          </View>
        ) : null}
        <Direction arrow="↓" label="Swipe down · Floor" value={habit.floorLabel} ink={t.onCardBack} circleBg={c.onDark} circleFg="#17121F" />
      </View>
    </View>
  );
}
