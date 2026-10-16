import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { BackKey } from '@/engine/game';
import type { HandKind, PlayedCard } from '@/engine/poker';

import { CardBack } from './CardBack';
import { CARD_SIZES, faceOfPlayed, PlayingCard, type CardFace, type CardHighlight, type CardSize } from './PlayingCard';

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

/** A card in a fan: a face, or a card still face down (the river before the Showdown). */
export type FanItem = CardFace | { kind: 'back'; back: BackKey };

export type FanSpot = { left: number; top: number; rotate: number };

/**
 * Where each card of a fan sits: spread `spread` card widths apart, tilted up to `tilt` degrees at the
 * ends and dropping a little toward them, the way a hand is held. The Showdown flies cards into these
 * same spots, so the fan it lands on and the fan drawn here match exactly.
 */
export function fanLayout(count: number, cardW: number, cardH: number, spread = 0.56, tilt = 9): { width: number; height: number; spots: FanSpot[] } {
  const step = cardW * spread;
  const mid = (count - 1) / 2;
  const drop = cardH * 0.035;
  const spots = Array.from({ length: count }, (_, i) => {
    const off = i - mid;
    return { left: i * step, top: drop * off * off, rotate: mid ? (off / mid) * tilt : 0 };
  });
  return { width: cardW + step * Math.max(0, count - 1), height: cardH + drop * mid * mid + 4, spots };
}

/** The widest card a fan of five can use and still fit `space` points across, never above `max`. */
export function fanCardWidth(space: number, max = 150, spread = 0.55): number {
  return Math.floor(Math.min(max, space / (1 + 4 * spread + 0.05)));
}

/**
 * Cards held in a fan, the way you'd hold a hand at the table. `width` draws each card that many points
 * wide (in the layout of `size`), so a fan can be sized to fit the screen. With `accessibilityLabel`
 * the fan reads as one picture, instead of five card names in a row.
 */
export function HandFan({
  faces,
  size = 'md',
  width,
  spread = 0.56,
  tilt = 9,
  highlight,
  accessibilityLabel,
  style,
}: {
  faces: readonly FanItem[];
  size?: CardSize;
  width?: number;
  spread?: number;
  tilt?: number;
  highlight?: CardHighlight;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const base = CARD_SIZES[size];
  const w = width ?? base.w;
  const h = (w * base.h) / base.w;
  const fan = fanLayout(faces.length, w, h, spread, tilt);
  const grouped = !!accessibilityLabel;
  return (
    <View
      accessible={grouped}
      accessibilityRole={grouped ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[{ width: fan.width, height: fan.height, alignSelf: 'center' }, style]}
    >
      {faces.map((face, i) => {
        const spot = fan.spots[i];
        const at: ViewStyle = { position: 'absolute', left: spot.left, top: spot.top, transform: [{ rotate: `${spot.rotate}deg` }] };
        return face.kind === 'back' ? (
          <CardBack key={i} back={face.back} size={size} width={w} style={at} />
        ) : (
          <PlayingCard key={i} face={face} size={size} width={w} highlight={highlight} style={at} />
        );
      })}
    </View>
  );
}

/** Cards in a straight row, overlapping a little, for lists. */
export function HandRow({
  faces,
  size = 'xs',
  overlap = 0.18,
  highlight,
  accessibilityLabel,
}: {
  faces: readonly CardFace[];
  size?: CardSize;
  overlap?: number;
  highlight?: boolean | CardHighlight;
  accessibilityLabel?: string;
}) {
  const s = CARD_SIZES[size];
  // A called hand wears one check, on its last card, rather than five.
  const mark = (i: number) => (highlight === 'called' ? (i === faces.length - 1 ? 'called' : undefined) : highlight);
  const grouped = !!accessibilityLabel;
  return (
    <View accessible={grouped} accessibilityRole={grouped ? 'image' : undefined} accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row' }}>
      {faces.map((face, i) => (
        <PlayingCard key={i} face={face} size={size} highlight={mark(i)} style={{ marginLeft: i ? -s.w * overlap : 0 }} />
      ))}
    </View>
  );
}
