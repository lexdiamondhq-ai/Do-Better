import { View } from 'react-native';

import { SUITS, type EarnedState, type Suit } from '@/engine/achievements';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, radius, space, type CardColor } from '@/theme/tokens';

import { Body, Display } from './ui';

export const SUIT_COLOR: Record<Suit, CardColor> = { spades: 'pine', diamonds: 'tomato', clubs: 'sky', hearts: 'rose', joker: 'sun' };

/** A playing card for one achievement. Earned cards are face up in the suit's colour; the rest show progress. */
export function AchievementCard({ state, size = 'small' }: { state: EarnedState; size?: 'small' | 'large' }) {
  const t = useTheme();
  const { achievement: a, progress, unlockedOn } = state;
  const c = cardColors[SUIT_COLOR[a.suit]];
  const glyph = SUITS[a.suit].glyph;
  const large = size === 'large';
  const corner = (
    <View style={{ alignItems: 'center' }}>
      <Display size={large ? 26 : 16} color={unlockedOn ? c.ink : t.textSecondary}>{a.rank}</Display>
      <Display size={large ? 20 : 12} color={unlockedOn ? c.ink : t.textSecondary}>{glyph}</Display>
    </View>
  );
  return (
    <View
      accessible
      accessibilityLabel={`${a.title}. ${a.description} ${unlockedOn ? `Earned ${unlockedOn}.` : `${progress} of ${a.target}.`}`}
      style={{
        width: large ? 240 : '100%',
        aspectRatio: 0.7,
        borderRadius: large ? radius.lg : radius.sm + 4,
        padding: large ? space.lg : 10,
        backgroundColor: unlockedOn ? c.bg : large ? t.bg : 'transparent',
        borderWidth: unlockedOn ? 0 : 1.5,
        borderStyle: 'dashed',
        borderColor: t.dashed,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ alignSelf: 'flex-start' }}>{corner}</View>
      <View style={{ gap: 4, alignItems: 'center' }}>
        <Display size={large ? 26 : 13} color={unlockedOn ? c.ink : t.text} style={{ textAlign: 'center' }} numberOfLines={3}>{a.title}</Display>
        {large ? <Body size={15} weight="bold" color={unlockedOn ? c.ink : t.textSecondary} style={{ textAlign: 'center', opacity: 0.85 }}>{a.description}</Body> : null}
        {!unlockedOn ? (
          <View style={{ width: '80%', height: 5, borderRadius: 3, backgroundColor: t.border, overflow: 'hidden', marginTop: 4 }}>
            <View style={{ width: `${(progress / a.target) * 100}%`, height: '100%', backgroundColor: c.bg }} />
          </View>
        ) : null}
      </View>
      <View style={{ alignSelf: 'flex-end', transform: [{ rotate: '180deg' }] }}>{corner}</View>
    </View>
  );
}
