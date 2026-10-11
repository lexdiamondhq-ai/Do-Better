import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { HandKind, PlayedCard } from '@/engine/poker';

import { CARD_SIZES, faceOfPlayed, PlayingCard, type CardFace, type CardSize } from './PlayingCard';

/** A made-up hand of each kind, for the Hall of Hands and the call sheet. */
export const EXAMPLES: Record<HandKind, CardFace[]> = {
  'high-card': [c(14, 'spades'), c(11, 'hearts'), c(8, 'clubs'), c(5, 'diamonds'), c(3, 'spades')],
  pair: [c(13, 'hearts'), c(13, 'clubs'), c(9, 'spades'), c(6, 'diamonds'), c(2, 'hearts')],
  'two-pair': [c(12, 'spades'), c(12, 'diamonds'), c(7, 'hearts'), c(7, 'clubs'), c(4, 'spades')],
  'three-of-a-kind': [c(8, 'clubs'), c(8, 'hearts'), c(8, 'diamonds'), c(13, 'spades'), c(3, 'hearts')],
  straight: [c(9, 'diamonds'), c(8, 'spades'), c(7, 'hearts'), c(6, 'clubs'), c(5, 'diamonds')],
  flush: [c(14, 'clubs'), c(11, 'clubs'), c(9, 'clubs'), c(6, 'clubs'), c(3, 'clubs')],
  'full-house': [c(11, 'hearts'), c(11, 'spades'), c(11, 'clubs'), c(4, 'diamonds'), c(4, 'hearts')],
  'four-of-a-kind': [c(9, 'spades'), c(9, 'hearts'), c(9, 'diamonds'), c(9, 'clubs'), c(14, 'spades')],
  'straight-flush': [c(9, 'hearts'), c(8, 'hearts'), c(7, 'hearts'), c(6, 'hearts'), c(5, 'hearts')],
  'royal-flush': [c(14, 'diamonds'), c(13, 'diamonds'), c(12, 'diamonds'), c(11, 'diamonds'), c(10, 'diamonds')],
  'five-of-a-kind': [c(12, 'spades'), c(12, 'hearts'), c(12, 'diamonds'), c(12, 'clubs'), { kind: 'joker', as: { rank: 12, suit: 'spades' } }],
};

function c(rank: Extract<CardFace, { kind: 'card' }>['rank'], suit: Extract<CardFace, { kind: 'card' }>['suit']): CardFace {
  return { kind: 'card', rank, suit };
}

export function playedFaces(cards: readonly PlayedCard[]): CardFace[] {
  return cards.map(faceOfPlayed);
}

/** Cards held in a fan, the way you'd hold a hand at the table. */
export function HandFan({ faces, size = 'md', spread = 0.56, tilt = 9, style }: { faces: readonly CardFace[]; size?: CardSize; spread?: number; tilt?: number; style?: StyleProp<ViewStyle> }) {
  const s = CARD_SIZES[size];
  const count = faces.length;
  const step = s.w * spread;
  const mid = (count - 1) / 2;
  const width = s.w + step * Math.max(0, count - 1);
  const drop = s.h * 0.035;
  return (
    <View style={[{ width, height: s.h + drop * mid * mid + 4, alignSelf: 'center' }, style]}>
      {faces.map((face, i) => {
        const off = i - mid;
        return (
          <PlayingCard
            key={i}
            face={face}
            size={size}
            style={{ position: 'absolute', left: i * step, top: drop * off * off, transform: [{ rotate: `${mid ? (off / mid) * tilt : 0}deg` }] }}
          />
        );
      })}
    </View>
  );
}

/** Cards in a straight row, overlapping a little, for lists. */
export function HandRow({ faces, size = 'xs', overlap = 0.18, highlight }: { faces: readonly CardFace[]; size?: CardSize; overlap?: number; highlight?: boolean }) {
  const s = CARD_SIZES[size];
  return (
    <View style={{ flexDirection: 'row' }}>
      {faces.map((face, i) => (
        <PlayingCard key={i} face={face} size={size} highlight={highlight} style={{ marginLeft: i ? -s.w * overlap : 0 }} />
      ))}
    </View>
  );
}
