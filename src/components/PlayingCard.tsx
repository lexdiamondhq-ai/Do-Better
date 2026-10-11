import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { cardName, rankLabel, SUIT_INFO, type Card, type Rank, type Suit } from '@/engine/cards';
import type { FaceInfo } from '@/engine/court';
import type { DayCard } from '@/engine/deal';
import type { PlayedCard } from '@/engine/poker';
import { useTheme } from '@/theme/ThemeProvider';
import { cardFace, chip, fonts, suitColors } from '@/theme/tokens';

import { Star, SuitGlyph } from './Suit';

/** What a card shows: a rank and suit, or a Joker (and, inside a hand, the card it stands for). */
export type CardFace = { kind: 'card'; rank: Rank; suit: Suit; also?: readonly Suit[]; rescued?: boolean } | { kind: 'joker'; as?: Card };

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const CARD_SIZES: Record<CardSize, { w: number; h: number; rank: number; pip: number; index: number; radius: number }> = {
  xs: { w: 40, h: 56, rank: 17, pip: 14, index: 9, radius: 7 },
  sm: { w: 52, h: 74, rank: 18, pip: 26, index: 10, radius: 9 },
  md: { w: 74, h: 104, rank: 24, pip: 40, index: 12, radius: 12 },
  lg: { w: 128, h: 180, rank: 36, pip: 72, index: 17, radius: 17 },
  xl: { w: 190, h: 266, rank: 52, pip: 112, index: 24, radius: 24 },
};

/** A day's card. `playAs` shows it in the suit it plays in this week's hand, when it carries more than one. */
export function faceOfDay(card: DayCard, playAs?: Suit): CardFace {
  if (card.kind === 'joker') return { kind: 'joker' };
  const suit = playAs && card.suits.includes(playAs) ? playAs : card.suits[0];
  return { kind: 'card', rank: card.rank, suit, also: card.suits.filter((s) => s !== suit), rescued: card.rescued };
}

export function faceOfPlayed(card: PlayedCard): CardFace {
  return card.joker ? { kind: 'joker', as: { rank: card.rank, suit: card.suit } } : { kind: 'card', rank: card.rank, suit: card.suit };
}

const FACE_RANK: Record<FaceInfo['face'], Rank> = { jack: 11, queen: 12, king: 13, ace: 14 };

/** A Court face card as a playing card: the Queen of Hearts. */
export function faceOfCourt(suit: Suit, face: FaceInfo): CardFace {
  return { kind: 'card', rank: FACE_RANK[face.face], suit };
}

export function faceLabel(face: CardFace): string {
  if (face.kind === 'joker') return face.as ? `Joker, playing as the ${cardName(face.as)}` : 'Joker';
  return `${cardName(face)}${face.rescued ? ', rescued' : ''}`;
}

const JOKER_INK = '#17121F';
const JOKER_STRIPES: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
/** Where a letter sits on each suit shape, as a share of its height, so it lands on the widest part. */
const LETTER_AT: Record<Suit, number> = { hearts: 0.4, diamonds: 0.5, spades: 0.55, clubs: 0.47 };

type Props = { face: CardFace; size?: CardSize; highlight?: boolean; dim?: boolean; style?: StyleProp<ViewStyle> };

/** A cream playing card. Court cards wear their letter on a big suit shape; a Joker is ink with a gold star. */
export function PlayingCard({ face, size = 'md', highlight, dim, style }: Props) {
  const s = CARD_SIZES[size];
  const joker = face.kind === 'joker';
  return (
    <View
      accessible
      accessibilityLabel={faceLabel(face)}
      style={[
        {
          width: s.w,
          height: s.h,
          borderRadius: s.radius,
          opacity: dim ? 0.4 : 1,
          boxShadow: size === 'xs' ? undefined : `0px ${Math.round(s.w / 22)}px ${Math.round(s.w / 7)}px rgba(0, 0, 0, 0.22)`,
        },
        style,
      ]}
    >
      <View
        style={{
          flex: 1,
          borderRadius: s.radius,
          overflow: 'hidden',
          backgroundColor: joker ? JOKER_INK : cardFace.bg,
          borderWidth: highlight ? Math.max(2, Math.round(s.w / 24)) : 1,
          borderColor: highlight ? chip.bg : joker ? '#000000' : cardFace.edge,
        }}
      >
        {face.kind === 'joker' ? <JokerFace size={size} as={face.as} /> : <NumberFace face={face} size={size} />}
      </View>
    </View>
  );
}

function NumberFace({ face, size }: { face: Extract<CardFace, { kind: 'card' }>; size: CardSize }) {
  const s = CARD_SIZES[size];
  const ink = suitColors[face.suit].glyph;
  const label = rankLabel(face.rank);
  const court = face.rank >= 11 && face.rank <= 13;
  const rankStyle = { fontFamily: fonts.display, fontSize: s.rank, lineHeight: s.rank * 1.04, color: ink, letterSpacing: label === '10' ? -s.rank * 0.08 : 0 };

  if (size === 'xs') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Text style={rankStyle}>{label}</Text>
        <SuitGlyph suit={face.suit} size={s.pip} />
        {face.rescued ? <Rescued size={size} /> : null}
      </View>
    );
  }

  const pad = s.w * 0.08;
  const pip = face.rank === 14 ? s.pip * 1.15 : s.pip;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', top: pad * 0.6, left: pad, alignItems: 'center' }}>
        <Text style={rankStyle}>{label}</Text>
        <SuitGlyph suit={face.suit} size={s.index} />
      </View>
      <View style={{ position: 'absolute', bottom: pad * 0.6, right: pad, alignItems: 'center', transform: [{ rotate: '180deg' }] }}>
        <Text style={rankStyle}>{label}</Text>
        <SuitGlyph suit={face.suit} size={s.index} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: pip, height: pip }}>
          <SuitGlyph suit={face.suit} size={pip} />
          {court ? (
            <Text
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: pip * LETTER_AT[face.suit] - pip * 0.25,
                textAlign: 'center',
                fontFamily: fonts.display,
                fontSize: pip * 0.42,
                lineHeight: pip * 0.5,
                color: cardFace.bg,
              }}
            >
              {label}
            </Text>
          ) : null}
        </View>
      </View>
      {face.also?.length ? (
        <View style={{ position: 'absolute', bottom: pad * 0.8, left: pad, flexDirection: 'row', gap: 2 }}>
          {face.also.map((x) => (
            <SuitGlyph key={x} suit={x} size={s.index * 0.85} />
          ))}
        </View>
      ) : null}
      {face.rescued ? <Rescued size={size} /> : null}
    </View>
  );
}

/** A rescued card wears a dashed inner frame and a small tag: you came back for it. */
function Rescued({ size }: { size: CardSize }) {
  const s = CARD_SIZES[size];
  const inset = Math.max(2, s.w * 0.05);
  return (
    <>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: inset, left: inset, right: inset, bottom: inset, borderRadius: s.radius * 0.7, borderWidth: 1.2, borderStyle: 'dashed', borderColor: cardFace.faint }}
      />
      {size !== 'xs' && size !== 'sm' ? (
        <View style={{ position: 'absolute', top: s.h * 0.1, right: -s.w * 0.2, width: s.w * 0.75, alignItems: 'center', backgroundColor: JOKER_INK, paddingVertical: 2, transform: [{ rotate: '38deg' }] }}>
          <Text style={{ fontFamily: fonts.bodyHeavy, fontSize: Math.max(7, s.index * 0.55), color: cardFace.bg, letterSpacing: 1.2 }}>SAVED</Text>
        </View>
      ) : null}
    </>
  );
}

function JokerFace({ size, as }: { size: CardSize; as?: Card }) {
  const s = CARD_SIZES[size];
  const stripe = s.w / 4;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={s.w} height={s.h} style={{ position: 'absolute', top: 0, left: 0 }}>
        {JOKER_STRIPES.map((suit, i) => (
          <Path
            key={suit}
            d={`M${i * stripe - s.h * 0.6} ${s.h} L${i * stripe} 0 L${(i + 1) * stripe} 0 L${(i + 1) * stripe - s.h * 0.6} ${s.h} Z`}
            fill={suitColors[suit].glyph}
            opacity={0.42}
          />
        ))}
      </Svg>
      {/* Wrapped so it stacks above the absolutely placed stripes on the web too. */}
      <View>
        <Star size={size === 'xs' ? s.w * 0.62 : s.w * 0.52} color={chip.bg} />
      </View>
      {size !== 'xs' ? (
        <Text style={{ fontFamily: fonts.display, fontSize: Math.max(9, s.rank * 0.5), color: cardFace.bg, letterSpacing: s.rank * 0.08, marginTop: s.h * 0.01 }}>JOKER</Text>
      ) : null}
      {as && size !== 'xs' && size !== 'sm' ? (
        <View style={{ position: 'absolute', bottom: s.h * 0.06, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: cardFace.bg, borderRadius: 99, paddingHorizontal: s.w * 0.08, paddingVertical: 1 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: s.index * 0.85, color: suitColors[as.suit].glyph }}>{`as ${rankLabel(as.rank)}`}</Text>
          <SuitGlyph suit={as.suit} size={s.index * 0.8} />
        </View>
      ) : null}
    </View>
  );
}

/** The part of you a suit stands for, as a small inline label: "♣ MIND". */
export function SuitTag({ suit, color, size = 13, name }: { suit: Suit; color?: string; size?: number; name?: boolean }) {
  const t = useTheme();
  const info = SUIT_INFO[suit];
  const ink = color ?? (t.scheme === 'dark' ? suitColors[suit].bright : suitColors[suit].glyph);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <SuitGlyph suit={suit} size={size} color={ink} />
      <Text style={{ fontFamily: fonts.bodyHeavy, fontSize: size * 0.85, letterSpacing: 0.8, textTransform: 'uppercase', color: ink }}>
        {name ? `${info.name} · ${info.part}` : info.part}
      </Text>
    </View>
  );
}

/** An empty place for a card: dashed, with an optional mark in the middle. */
export function CardSlot({ size = 'md', color, dashed = true, children, style }: { size?: CardSize; color: string; dashed?: boolean; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = CARD_SIZES[size];
  return (
    <View
      style={[
        { width: s.w, height: s.h, borderRadius: s.radius, borderWidth: 1.5, borderStyle: dashed ? 'dashed' : 'solid', borderColor: color, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      {children}
    </View>
  );
}
