import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { rankLabel, rankName, SUIT_INFO, type Rank, type Suit } from '@/engine/cards';
import type { FaceInfo } from '@/engine/court';
import type { DayCard } from '@/engine/deal';
import type { PlayedCard } from '@/engine/poker';
import type { Stamp } from '@/engine/showdown';
import { mix } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { cardFace, chip, fontScale, fonts, INK, suitColors } from '@/theme/tokens';

import { circleArrow, CourtMark, Star, SuitGlyph, SuitShape, uTurnArrow } from './Suit';

/** A card with a rank and maybe a suit: a saved day, the river card and a Joker's stand-in can have none. */
export type FaceCard = { rank: Rank; suit: Suit | null };

/**
 * What a card shows: a rank and suit, or a Joker (and, inside a hand, the card it stands for).
 * `suit: null` is a card with no suit: a saved day (pale, with a turning arrow) or the river card.
 * `also` lists the other suits a day carries, shown small under the corner index.
 */
export type CardFace =
  | { kind: 'card'; rank: Rank; suit: Suit | null; also?: readonly Suit[]; rescued?: boolean; river?: boolean }
  | { kind: 'joker'; as?: FaceCard };

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * How a card is marked: `held` lifts it with a ring (in your hand this week); `called` pins a small
 * ink check on it (you called this hand). `true` means held, for older callers.
 */
export type CardHighlight = 'held' | 'called';

export const CARD_SIZES: Record<CardSize, { w: number; h: number; rank: number; pip: number; index: number; radius: number }> = {
  xs: { w: 40, h: 56, rank: 17, pip: 14, index: 9, radius: 7 },
  sm: { w: 52, h: 74, rank: 15, pip: 22, index: 9, radius: 9 },
  md: { w: 74, h: 104, rank: 14, pip: 13.5, index: 9, radius: 12 },
  lg: { w: 128, h: 180, rank: 22, pip: 21, index: 13, radius: 17 },
  xl: { w: 190, h: 266, rank: 31, pip: 31, index: 19, radius: 24 },
};

/** A day's card. `playAs` shows it in the suit it plays in this week's hand, when it carries more than one. */
export function faceOfDay(card: DayCard, playAs?: Suit | null): CardFace {
  if (card.kind === 'joker') return { kind: 'joker' };
  const suits: readonly Suit[] = card.suits;
  const suit = playAs && suits.includes(playAs) ? playAs : (suits[0] ?? null);
  return { kind: 'card', rank: card.rank, suit, also: suits.filter((s) => s !== suit), rescued: card.rescued, river: 'river' in card ? !!card.river : undefined };
}

/** A card as it plays in a hand: one suit (or none), or a Joker standing in for one. */
export function faceOfPlayed(card: PlayedCard): CardFace {
  const suit: Suit | null = card.suit ?? null;
  const river = 'river' in card ? !!card.river : undefined;
  return card.joker ? { kind: 'joker', as: { rank: card.rank, suit } } : { kind: 'card', rank: card.rank, suit, river };
}

const FACE_RANK: Record<FaceInfo['face'], Rank> = { jack: 11, queen: 12, king: 13, ace: 14 };

/** A Court face card as a playing card: the Queen of Hearts. */
export function faceOfCourt(suit: Suit, face: FaceInfo): CardFace {
  return { kind: 'card', rank: FACE_RANK[face.face], suit };
}

/** "Queen of Hearts", or "Queen" for a card with no suit. */
export function faceCardName(card: FaceCard): string {
  return card.suit ? `${rankName(card.rank)} of ${SUIT_INFO[card.suit].name}` : rankName(card.rank);
}

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** "a Seven", "an Eight", "an Ace". */
const aRank = (rank: Rank) => {
  const name = rankName(rank);
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
};

/** What a screen reader says for a card: "Queen of Hearts, also Clubs and Spades", "Seven, saved". */
export function faceLabel(face: CardFace): string {
  if (face.kind === 'joker') {
    if (!face.as) return 'Joker';
    return face.as.suit ? `Joker, playing as the ${faceCardName(face.as)}` : `Joker, playing as ${aRank(face.as.rank)}`;
  }
  const name = faceCardName(face);
  const also = face.also?.length ? `, also ${list(face.also.map((s) => SUIT_INFO[s].name))}` : '';
  const kind = face.river ? ', the river card' : face.rescued || !face.suit ? ', saved' : '';
  return `${name}${also}${kind}`;
}

/**
 * Everything a screen reader says for a card on the table: its face, how it's marked, and the day it came
 * from: "Nine of Clubs, in your hand, a Floor day".
 */
export function cardLabel(face: CardFace, mark?: CardHighlight | null, stamp?: Stamp): string {
  const marked = mark === 'held' ? ', in your hand' : mark === 'called' ? ', you called it' : '';
  const day = stamp === 'floor' ? ', a Floor day' : stamp === 'ceiling' ? ', a Ceiling day' : '';
  return `${faceLabel(face)}${marked}${day}`;
}

/**
 * Where a card's stamp sits, in the card's own points: low on the left, clear of the pips, the court
 * frame and the corner index, and inside the part of the card a fan leaves showing. The smallest card
 * takes a small seal in its bottom corner, under its centred rank and pip, so a week's stamps show on
 * every row that has them, not only the bigger ones.
 */
export function stampSpot(size: CardSize, width = CARD_SIZES[size].w): { x: number; y: number; r: number } | null {
  const g = geometry(size, width);
  if (TIER[size] === 'tiny') return { x: g.w * 0.16, y: g.h - g.w * 0.15, r: Math.max(4.5, g.w * 0.12) };
  const r = Math.max(6, g.w * (TIER[size] === 'small' ? 0.12 : 0.092));
  return { x: g.w * 0.14, y: g.h - g.w * 0.17, r };
}

/**
 * The stamp itself, pressed into the card like ink: ↓ for a Floor day, solid, the ground the hand stood
 * on; ↑ for a Ceiling day, an open ring. Drawn `r` points in radius, tilted the way a hand stamps.
 */
export function StampSeal({ stamp, r, onInk = false }: { stamp: Stamp; r: number; onInk?: boolean }) {
  const ink = onInk ? cardFace.bg : INK;
  const paper = onInk ? INK : cardFace.bg;
  const solid = stamp === 'floor';
  const arrow = stamp === 'floor' ? 'M50 25 V72 M31 55 L50 74 L69 55' : 'M50 75 V28 M31 45 L50 26 L69 45';
  return (
    <View pointerEvents="none" style={{ width: r * 2, height: r * 2, transform: [{ rotate: '-8deg' }] }}>
      <Svg width={r * 2} height={r * 2} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={46} fill={solid ? ink : paper} stroke={ink} strokeWidth={solid ? 0 : 8} />
        <Circle cx={50} cy={50} r={solid ? 38 : 34} fill="none" stroke={solid ? paper : ink} strokeWidth={3} opacity={solid ? 0.35 : 0.3} />
        <Path d={arrow} stroke={solid ? paper : ink} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

const JOKER_INK = INK;
/** A Joker's edge catches the light, so it never melts into a dark table. */
const JOKER_EDGE = 'rgba(255, 253, 248, 0.18)';
const JOKER_STRIPES: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

/** Where the pips of each number card sit, as [column, row] in a 0 to 1 field. Rows below the middle are drawn upside down. */
const PIPS: Record<number, readonly [number, number][]> = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

type Tier = 'tiny' | 'small' | 'full';
const TIER: Record<CardSize, Tier> = { xs: 'tiny', sm: 'small', md: 'full', lg: 'full', xl: 'full' };

/** Where everything sits on a card `w` wide, drawn in the layout of `size`. */
function geometry(size: CardSize, w: number) {
  const base = CARD_SIZES[size];
  const k = w / base.w;
  const h = base.h * k;
  // Pip columns sit just clear of the corner index; the field runs between the two indices.
  const col = { md: 0.35, lg: 0.335, xl: 0.33 }[size as 'md' | 'lg' | 'xl'] ?? 0.34;
  return {
    k,
    w,
    h,
    radius: base.radius * k,
    rank: base.rank * k,
    index: base.index * k,
    pip: base.pip * k,
    pad: Math.max(3, w * 0.065),
    top: Math.max(2, w * 0.04),
    colL: w * col,
    colR: w * (1 - col),
    rowT: h * 0.19,
    rowB: h * 0.81,
  };
}

type Geo = ReturnType<typeof geometry>;

type Props = {
  face: CardFace;
  size?: CardSize;
  /** Draws the card this many points wide in the layout of `size`, for a card sized to fit its space. */
  width?: number;
  highlight?: boolean | CardHighlight;
  dim?: boolean;
  /** ↓ for a Floor day or ↑ for a Ceiling day, stamped low on the card (a small seal on an `xs` card), and always said. */
  stamp?: Stamp;
  /**
   * How much of the card shows from its left edge, 0 to 1, when the next card in a fan lies over the rest.
   * A card with no suit centres its mark and its word ("RIVER", "SAVED") in what shows, so they stay whole.
   */
  peek?: number;
  /** What a screen reader says instead of the card's own name: a fan's caption for the card, say. */
  accessibilityLabel?: string;
  /**
   * A card that isn't in the hand yet: a dashed edge and no shadow. Yesterday's card waiting to be saved
   * in the week strip, or an out the hand is drawing to on Hands. Callers set its opacity with `style`.
   */
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A cream playing card. Number cards carry their real pips, court cards a crest, tiara or crown, an
 * Ace a ringed pip, and a saved day a pale face with a turning arrow and no suit. A Joker is ink with
 * a gold star. The card is a picture: its text never grows with the phone's text size.
 */
export function PlayingCard({ face, size = 'md', width, highlight, dim, dashed = false, stamp, peek, accessibilityLabel, style }: Props) {
  const t = useTheme();
  const g = geometry(size, width ?? CARD_SIZES[size].w);
  const mark: CardHighlight | null = highlight === true ? 'held' : highlight || null;
  const joker = face.kind === 'joker';
  const saved = face.kind === 'card' && !face.suit && !face.river;
  const lift = mark === 'held' ? Math.round(g.h * 0.06) : 0;
  const ring = Math.max(2, Math.round(g.w / 30));
  const label = accessibilityLabel ?? cardLabel(face, mark, stamp);
  const spot = stamp ? stampSpot(size, g.w) : null;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[{ width: g.w, height: g.h, opacity: dim ? 0.4 : 1 }, style]}>
      <View style={{ flex: 1, transform: lift ? [{ translateY: -lift }] : undefined }}>
        {mark === 'held' ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: -ring * 2, left: -ring * 2, right: -ring * 2, bottom: -ring * 2, borderRadius: g.radius + ring * 2, borderWidth: ring, borderColor: t.text }}
          />
        ) : null}
        <View
          style={{
            flex: 1,
            borderRadius: g.radius,
            overflow: 'hidden',
            backgroundColor: joker ? JOKER_INK : saved ? cardFace.saved : cardFace.bg,
            borderWidth: dashed ? Math.max(1.5, Math.round(g.w / 40)) : 1,
            borderStyle: dashed ? 'dashed' : 'solid',
            borderColor: joker ? JOKER_EDGE : dashed ? cardFace.faint : cardFace.edge,
            boxShadow: dashed || (size === 'xs' && !lift) ? undefined : `0px ${Math.round(g.w / 22) + lift / 2}px ${Math.round(g.w / 7) + lift}px rgba(0, 0, 0, ${lift ? 0.3 : 0.22})`,
          }}
        >
          {face.kind === 'joker' ? <JokerFace g={g} size={size} as={face.as} peek={peek} /> : <NumberFace face={face} size={size} g={g} peek={peek} />}
          {spot && stamp ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: spot.x - spot.r, top: spot.y - spot.r }}>
              <StampSeal stamp={stamp} r={spot.r} onInk={joker} />
            </View>
          ) : null}
        </View>
        {mark === 'called' ? <CalledPin g={g} /> : null}
      </View>
    </View>
  );
}

/** A small ink check pinned to the top corner: you called this hand. */
function CalledPin({ g }: { g: Geo }) {
  const d = Math.max(14, Math.round(g.w * 0.26));
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -d * 0.3,
        right: -d * 0.3,
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: INK,
        borderWidth: Math.max(1.5, d / 12),
        borderColor: cardFace.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={d * 0.56} height={d * 0.56} viewBox="0 0 100 100">
        <Path d="M18 54 L40 76 L84 28" stroke={chip.bg} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

const noScale = { allowFontScaling: false, maxFontSizeMultiplier: fontScale.graphic, selectable: false } as const;

/** The rank and suit in a corner. Turned upside down for the bottom corner, as on a real card. */
function Corner({ label, ink, suit, rank, glyph, also, at, flip }: { label: string; ink: string; suit: Suit | null; rank: number; glyph: number; also?: readonly Suit[]; at: ViewStyle; flip?: boolean }) {
  const rankStyle: TextStyle = { fontFamily: fonts.display, fontSize: rank, lineHeight: rank * 1.02, color: ink, letterSpacing: label === '10' ? -rank * 0.09 : 0, textAlign: 'center' };
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', alignItems: 'center' }, at, flip ? { transform: [{ rotate: '180deg' }] } : null]}>
      <Text {...noScale} style={rankStyle}>
        {label}
      </Text>
      {suit ? <SuitGlyph suit={suit} size={glyph} /> : null}
      {also?.length ? (
        <View style={{ alignItems: 'center', gap: Math.max(1, glyph * 0.12), marginTop: Math.max(1, glyph * 0.2) }}>
          {also.map((x) => (
            <SuitGlyph key={x} suit={x} size={glyph * 0.78} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function NumberFace({ face, size, g, peek }: { face: Extract<CardFace, { kind: 'card' }>; size: CardSize; g: Geo; peek?: number }) {
  const tier = TIER[size];
  const suit = face.suit;
  const saved = !suit && !face.river;
  const ink = suit ? suitColors[suit].glyph : saved ? cardFace.savedInk : cardFace.ink;
  const label = rankLabel(face.rank);
  const also = face.also?.length ? face.also : undefined;

  if (tier === 'tiny') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Text {...noScale} style={{ fontFamily: fonts.display, fontSize: g.rank, lineHeight: g.rank * 1.04, color: ink, letterSpacing: label === '10' ? -g.rank * 0.08 : 0 }}>
          {label}
        </Text>
        <Svg width={g.pip} height={g.pip}>
          {saved ? <TinySavedMark x={g.pip / 2} y={g.pip / 2} size={g.pip} ink={ink} /> : <Pip face={face} x={g.pip / 2} y={g.pip / 2} size={g.pip} ink={ink} />}
        </Svg>
        {also ? (
          <View style={{ position: 'absolute', top: g.top, right: Math.max(2, g.w * 0.05), gap: 1 }}>
            {also.map((x) => (
              <SuitGlyph key={x} suit={x} size={Math.max(6, g.w * 0.18)} />
            ))}
          </View>
        ) : null}
        {saved || (face.rescued && suit) ? <SavedFrame g={g} /> : null}
      </View>
    );
  }

  const glyph = g.index;
  return (
    <View style={{ flex: 1 }}>
      <Svg width={g.w} height={g.h} style={{ position: 'absolute', top: 0, left: 0 }}>
        {tier === 'small' ? <SmallArt face={face} g={g} ink={ink} peek={peek} /> : <FullArt face={face} g={g} ink={ink} peek={peek} />}
      </Svg>
      {saved || (face.rescued && suit) ? <SavedFrame g={g} /> : null}
      <Corner label={label} ink={ink} suit={suit} rank={g.rank} glyph={glyph} also={also} at={{ top: g.top, left: g.pad }} />
      <Corner label={label} ink={ink} suit={suit} rank={g.rank} glyph={glyph} at={{ bottom: g.top, right: g.pad }} flip />
      {tier === 'full' && (saved || face.river) ? <Caption g={g} text={saved ? 'SAVED' : 'RIVER'} ink={ink} peek={peek} /> : null}
    </View>
  );
}

/** The middle mark of a card with no suit: a turning arrow for a saved day, waves for the river card. */
function Pip({ face, x, y, size, ink, flip }: { face: Extract<CardFace, { kind: 'card' }>; x: number; y: number; size: number; ink: string; flip?: boolean }) {
  if (face.suit) return <SuitShape suit={face.suit} x={x} y={y} size={size} fill={ink} flip={flip} />;
  if (face.river) return <Waves x={x} y={y} size={size} ink={ink} />;
  const { arc, head } = circleArrow(x, y, size * 0.34);
  return (
    <G>
      <Path d={arc} stroke={ink} strokeWidth={size * 0.13} strokeLinecap="round" fill="none" />
      <Path d={head} fill={ink} strokeLinejoin="round" stroke={ink} strokeWidth={size * 0.04} />
    </G>
  );
}

/** A saved day's mark on the smallest card: a turning arrow whose head stays in view when the next card overlaps it. */
function TinySavedMark({ x, y, size, ink }: { x: number; y: number; size: number; ink: string }) {
  const { path, head } = uTurnArrow(x, y, size);
  return (
    <G>
      <Path d={path} stroke={ink} strokeWidth={size * 0.14} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={head} fill={ink} stroke={ink} strokeWidth={size * 0.04} strokeLinejoin="round" />
    </G>
  );
}

/** Three river waves, centred on (x, y) and `size` across. */
function Waves({ x, y, size, ink }: { x: number; y: number; size: number; ink: string }) {
  const w = size * 0.9;
  const amp = size * 0.07;
  const gap = size * 0.24;
  const wave = (cy: number) => {
    const x0 = x - w / 2;
    const q = w / 4;
    return `M${x0} ${cy} q${q / 2} ${-amp * 2} ${q} 0 t${q} 0 t${q} 0 t${q} 0`;
  };
  return (
    <G>
      {[-1, 0, 1].map((i) => (
        <Path key={i} d={wave(y + i * gap)} stroke={ink} strokeWidth={size * 0.1} strokeLinecap="round" fill="none" />
      ))}
    </G>
  );
}

/** The middle of a small card: one big pip, or a court card's mark over a small pip. */
function SmallArt({ face, g, ink, peek }: { face: Extract<CardFace, { kind: 'card' }>; g: Geo; ink: string; peek?: number }) {
  // A card with no suit centres its mark in the part of the card a fan leaves showing.
  const cx = face.suit ? g.w / 2 : shownMiddle(g, peek);
  const cy = g.h / 2;
  const court = courtOf(face.rank);
  if (court && court !== 'ace' && face.suit) {
    const markW = g.w * 0.5;
    return (
      <>
        <CourtMark face={court} x={cx} y={cy - g.h * 0.06} size={markW} fill={ink} cutout={cardFace.bg} />
        <SuitShape suit={face.suit} x={cx} y={cy + g.h * 0.17} size={g.w * 0.22} fill={ink} />
      </>
    );
  }
  if (court === 'ace' && face.suit) return <AceArt suit={face.suit} cx={cx} cy={cy} size={g.pip * 1.1} ink={ink} ring={g.w * 0.025} />;
  return <Pip face={face} x={cx} y={cy} size={face.suit ? g.pip : g.pip * 1.15} ink={ink} />;
}

function courtOf(rank: Rank): 'jack' | 'queen' | 'king' | 'ace' | null {
  return rank === 11 ? 'jack' : rank === 12 ? 'queen' : rank === 13 ? 'king' : rank === 14 ? 'ace' : null;
}

/** The Ace: one oversized pip inside a ring. */
function AceArt({ suit, cx, cy, size, ink, ring }: { suit: Suit; cx: number; cy: number; size: number; ink: string; ring: number }) {
  const r = size * 0.78;
  return (
    <>
      <Circle cx={cx} cy={cy} r={r} fill={mix(ink, cardFace.bg, 0.9)} stroke={ink} strokeWidth={ring} />
      <Circle cx={cx} cy={cy} r={r - ring * 2.2} fill="none" stroke={ink} strokeWidth={ring * 0.5} opacity={0.55} />
      <SuitShape suit={suit} x={cx} y={cy} size={size} fill={ink} />
    </>
  );
}

/** The middle of a medium or larger card: real pips, a framed court card, a ringed Ace, or a saved day's arrow. */
function FullArt({ face, g, ink, peek }: { face: Extract<CardFace, { kind: 'card' }>; g: Geo; ink: string; peek?: number }) {
  const cx = g.w / 2;
  const cy = g.h / 2;
  const court = courtOf(face.rank);
  const suit = face.suit;
  if (!suit) return <Pip face={face} x={shownMiddle(g, peek)} y={cy - g.h * 0.03} size={g.w * (peek ? 0.36 : 0.42)} ink={ink} />;
  if (court === 'ace') return <AceArt suit={suit} cx={cx} cy={cy} size={g.w * 0.4} ink={ink} ring={g.w * 0.022} />;
  if (court) {
    // A double-ended court card: the mark at the top and, upside down, at the bottom, inside a thin
    // frame tinted with the suit, and the suit's pip between them.
    const fx = g.colL - g.pip * 0.55;
    const fw = g.w - fx * 2;
    const fy = g.h * 0.1;
    const fh = g.h - fy * 2;
    const markW = fw * 0.66;
    const tint = mix(ink, cardFace.bg, 0.88);
    return (
      <>
        <Rect x={fx} y={fy} width={fw} height={fh} rx={g.w * 0.05} fill={tint} stroke={ink} strokeWidth={Math.max(0.8, g.w * 0.012)} />
        <Path d={`M${fx + fw * 0.14} ${cy} H${fx + fw * 0.86}`} stroke={ink} strokeWidth={Math.max(0.6, g.w * 0.008)} opacity={0.4} />
        <CourtMark face={court} x={cx} y={fy + fh * 0.22} size={markW} fill={ink} cutout={tint} />
        <CourtMark face={court} x={cx} y={fy + fh * 0.78} size={markW} fill={ink} cutout={tint} flip />
        <SuitShape suit={suit} x={cx} y={cy} size={fw * 0.36} fill={ink} />
      </>
    );
  }
  const spots = PIPS[face.rank] ?? [];
  return (
    <>
      {spots.map(([c, r], i) => {
        const x = g.colL + (g.colR - g.colL) * c;
        const y = g.rowT + (g.rowB - g.rowT) * r;
        return <SuitShape key={i} suit={suit} x={x} y={y} size={g.pip} fill={ink} flip={r > 0.5} />;
      })}
    </>
  );
}

/** A saved day wears a dashed inner frame: you came back for it. */
function SavedFrame({ g }: { g: Geo }) {
  const inset = Math.max(2, g.w * 0.05);
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: inset, left: inset, right: inset, bottom: inset, borderRadius: g.radius * 0.7, borderWidth: Math.max(1, g.w / 80), borderStyle: 'dashed', borderColor: cardFace.faint }}
    />
  );
}

/** The middle of what shows of a card: the whole card, or the strip a fan leaves uncovered. */
function shownMiddle(g: Geo, peek?: number): number {
  return peek && peek < 1 ? (g.w * Math.max(0.3, peek)) / 2 : g.w / 2;
}

/** A small word under the middle mark of a card with no suit, kept whole inside what a fan leaves showing. */
function Caption({ g, text, ink, peek }: { g: Geo; text: string; ink: string; peek?: number }) {
  const shown = peek && peek < 1 ? g.w * Math.max(0.3, peek) : g.w;
  const size = Math.max(7, g.w * 0.095);
  // A word that would run past what shows is left off: the waves or the arrow above it say it alone.
  if (text.length * (size * 0.7 + g.w * 0.02) > shown * 0.94) return null;
  return (
    // Centred on what shows, in a box as wide as the card, so the word never wraps.
    <View pointerEvents="none" style={{ position: 'absolute', left: shown / 2 - g.w / 2, width: g.w, top: g.h * 0.66, alignItems: 'center' }}>
      <Text {...noScale} style={{ fontFamily: fonts.bodyHeavy, fontSize: size, letterSpacing: g.w * 0.02, color: ink }}>
        {text}
      </Text>
    </View>
  );
}

function JokerFace({ g, size, as, peek }: { g: Geo; size: CardSize; as?: FaceCard; peek?: number }) {
  const stripe = g.w / 4;
  const shown = peek && peek < 1 ? g.w * Math.max(0.3, peek) : g.w;
  // In a fan only a strip shows, so the star and what the Joker plays as gather in that strip, the pill
  // under the star in place of the word, leaving the foot free for the card's stamp.
  const tight = shown < g.w && !!as && size !== 'xs' && size !== 'sm';
  const stripes = (
    <Svg width={g.w} height={g.h} style={{ position: 'absolute', top: 0, left: 0 }}>
      {JOKER_STRIPES.map((suit, i) => (
        <Path
          key={suit}
          d={`M${i * stripe - g.h * 0.6} ${g.h} L${i * stripe} 0 L${(i + 1) * stripe} 0 L${(i + 1) * stripe - g.h * 0.6} ${g.h} Z`}
          fill={suitColors[suit].glyph}
          opacity={0.42}
        />
      ))}
    </Svg>
  );
  const pill = (font: number, padX: number) =>
    as ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: cardFace.bg, borderRadius: 99, paddingHorizontal: padX, paddingVertical: 1 }}>
        <Text {...noScale} style={{ fontFamily: fonts.display, fontSize: font, color: as.suit ? suitColors[as.suit].glyph : cardFace.ink }}>{`as ${rankLabel(as.rank)}`}</Text>
        {as.suit ? <SuitGlyph suit={as.suit} size={Math.max(8, font * 0.92)} /> : null}
      </View>
    ) : null;
  if (tight) {
    return (
      <View style={{ flex: 1 }}>
        {stripes}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: shown, alignItems: 'center', justifyContent: 'center', gap: g.h * 0.03 }}>
          <View>
            <Star size={shown * 0.66} color={chip.bg} />
          </View>
          {pill(Math.max(9, g.w * 0.11), g.w * 0.04)}
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {stripes}
      {/* Wrapped so it stacks above the absolutely placed stripes on the web too. */}
      <View>
        <Star size={size === 'xs' ? g.w * 0.62 : g.w * 0.52} color={chip.bg} />
      </View>
      {size !== 'xs' ? (
        <Text {...noScale} style={{ fontFamily: fonts.display, fontSize: Math.max(9, g.w * 0.13), color: cardFace.bg, letterSpacing: g.w * 0.02, marginTop: g.h * 0.01 }}>
          JOKER
        </Text>
      ) : null}
      {as && size !== 'xs' && size !== 'sm' ? <View style={{ position: 'absolute', bottom: g.h * 0.06 }}>{pill(Math.max(9, g.w * 0.13), g.w * 0.08)}</View> : null}
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
      <Text maxFontSizeMultiplier={fontScale.chrome} selectable={false} style={{ fontFamily: fonts.bodyHeavy, fontSize: size * 0.85, letterSpacing: 0.8, textTransform: 'uppercase', color: ink }}>
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
