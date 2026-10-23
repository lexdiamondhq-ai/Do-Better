import { createContext, use, useId, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { Suit } from '@/engine/cards';
import { COMPACT_BELOW } from '@/engine/today';
import { creasePath, defaultGrip, ridgePath, scuffPath, thumbOval, wearArt, wearOf, type Corner, type Grip, type Scuff, type Size, type Wear } from '@/engine/wear';
import { useDeck, useGrips } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, INK, radius as radii, WHITE, type CardColor } from '@/theme/tokens';

import { SuitShape } from './Suit';

/**
 * The colours a card's wear is drawn in. Everything that can sit under words (the crease, the thumb mark,
 * the Heirloom's foil) leans away from the card's ink, so the words only ever read better over it: ink on
 * a white-ink card, white on an ink card. The edge layers (the softened corners and the gilt) never sit
 * under words, so they take whatever shows best there: the ink itself for the corners, as if the colour
 * were rubbing off, and gold for the gilt.
 */
export type WearInks = { edge: string; under: string; gilt: readonly string[]; foil: readonly string[] };

const GOLD_BRIGHT = ['#FFF4CC', '#F2C14E', '#FFE7A0', '#C9962E', '#FFF4CC'] as const;
const GOLD_DEEP = ['#7A4E00', '#B8862B', '#5C3A00', '#A87A1E', '#7A4E00'] as const;
/** A pale foil for a light card, every stop lighter than the card under it. */
const FOIL_PALE = ['#FFFFFF', '#FFF3C4', '#FFD6EC', '#D4F6FF', '#E6DCFF', '#FFFFFF'] as const;
/** A deep foil for a dark card, every stop darker than the card under it. */
const FOIL_DEEP = ['#2A1450', '#0B3B45', '#4A1238', '#13285E', '#3B2A05', '#2A1450'] as const;

/** How strongly the Heirloom's foil shows over the watermark. */
export const FOIL_ALPHA = 0.22;

/** The wear inks for a card face in `color`, or for the dark Comeback side (`'dark'`) on a table whose raised text is `onRaised`. */
export function wearInks(color: CardColor | 'dark', onRaised: string = WHITE): WearInks {
  if (color === 'dark') return { edge: onRaised, under: INK, gilt: GOLD_BRIGHT, foil: FOIL_DEEP };
  const ink = cardColors[color].ink;
  const inkCard = ink === INK;
  return { edge: ink, under: inkCard ? WHITE : INK, gilt: inkCard ? GOLD_DEEP : GOLD_BRIGHT, foil: inkCard ? FOIL_PALE : FOIL_DEEP };
}

/**
 * The scale a card is drawn at, for a picture of a card shrunk to fit (the You mini deck, the habit page's
 * worn-in picture). The wear keeps its lines as heavy on screen as they are on a full-size card, so a small
 * card still shows its corners, crease and thumb mark. No layer's opacity changes with it.
 */
export const WearScale = createContext(1);

/** How much wider the wear's lines are drawn on a card shown at `scale`, so they land about as wide on screen as at full size. */
export function wearLift(scale: number): number {
  return scale > 0 && scale < 1 ? Math.min(3, 1 / scale) : 1;
}

/** Where a corner's point is on a card `size` points across: where the colour rubs off first. */
export function cornerPoint(corner: Corner, size: Size): { x: number; y: number } {
  return { x: corner === 'tr' || corner === 'br' ? size.w : 0, y: corner === 'bl' || corner === 'br' ? size.h : 0 };
}

/** How far a scuff runs from its corner's point: round the curve and `reach` of the radius on along each edge. */
export function scuffSpan(s: Pick<Scuff, 'reach'>, size: Size, radius: number): number {
  const r = Math.max(2, Math.min(radius, size.w / 2, size.h / 2));
  return r * (1 + s.reach);
}

/** The layers a card draws: its wear, less on the dark side (scuffs and gilt only) and on cards deep in the deck (corners only). */
export function wearShown(wear: Wear, o: { dark?: boolean; depth?: number } = {}): { corners: boolean; crease: boolean; thumb: boolean; gilt: boolean; foil: boolean } {
  const full = (o.depth ?? 0) <= 1;
  const face = full && !o.dark;
  return { corners: wear.corners > 0, crease: face && wear.crease > 0, thumb: face && wear.thumb > 0, gilt: full && wear.gilt > 0, foil: face && wear.foil };
}

/**
 * Whether a card face `h` points tall is drawn compact, with its smaller suit watermark lower down, as
 * HabitCard draws it: what the card says when it says, otherwise Today's own rule (its card height, rounded
 * the way Today measures it, under `COMPACT_BELOW`).
 */
export function drawnCompact(h: number, compact?: boolean): boolean {
  return compact ?? Math.round(h) < COMPACT_BELOW;
}

/**
 * The wear on a card face: soft corners, a crease, the thumb mark, a gilt edge, an Heirloom's foil suit.
 * It fills the card (absolute fill, no touches) and sits right after the suit watermark. On the dark
 * Comeback side (`dark`) it shows scuffs and gilt only. `depth` is the card's place in the deck (0 is the front):
 * the front card and the one behind it draw full wear, cards further back draw corners only.
 *
 * The thumb mark sits where this player's thumb holds the card (`prefs.grips`, on this phone), or at the
 * card's seeded place before any swipe is saved. The card's colour and suit come from the deck unless
 * given; `grip` and `radius` are for pictures of a card drawn outside the deck. `compact` says which
 * layout the card face uses, so the Heirloom's foil lands on its watermark; without it, the height decides.
 */
export function CardWear({
  habitId,
  kept,
  dark = false,
  depth = 0,
  color,
  suit,
  grip,
  radius = radii.card,
  compact,
}: {
  habitId: string;
  kept: number;
  dark?: boolean;
  depth?: number;
  color?: CardColor;
  suit?: Suit;
  grip?: Grip;
  radius?: number;
  compact?: boolean;
}): ReactNode {
  const t = useTheme();
  const deck = useDeck();
  const grips = useGrips();
  const [size, setSize] = useState<Size | null>(null);
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const lift = wearLift(use(WearScale));

  const wear = wearOf(kept);
  if (wear.stage === 'new') return null;
  const habit = deck?.cards.find((c) => c.habit.id === habitId)?.habit;
  const cardColor = color ?? habit?.color;
  const cardSuit = suit ?? habit?.suit;
  // Without its colour a bright face can't be sure which way is away from its ink, so it keeps to its edges.
  const shown = wearShown(wear, { dark, depth });
  const known = dark || !!cardColor;
  const inks = wearInks(dark ? 'dark' : (cardColor ?? 'sun'), t.onRaised);
  const art = wearArt(habitId, wear, grip ?? grips[habitId] ?? defaultGrip(habitId));

  return (
    <View
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (!size || Math.abs(size.w - w) > 0.5 || Math.abs(size.h - h) > 0.5) setSize({ w, h });
      }}
    >
      {size && size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            {/* Each corner's rub: strongest at the corner's point, gone by the end of its reach along the edges. */}
            {shown.corners
              ? art.scuffs.map((sc) => {
                  const p = cornerPoint(sc.corner, size);
                  return (
                    <RadialGradient key={sc.corner} id={`${uid}e${sc.corner}`} gradientUnits="userSpaceOnUse" cx={p.x} cy={p.y} fx={p.x} fy={p.y} r={scuffSpan(sc, size, radius) * 1.04}>
                      <Stop offset="0" stopColor={inks.edge} stopOpacity={1} />
                      <Stop offset="0.4" stopColor={inks.edge} stopOpacity={0.85} />
                      <Stop offset="1" stopColor={inks.edge} stopOpacity={0} />
                    </RadialGradient>
                  );
                })
              : null}
            {shown.thumb ? (
              <RadialGradient id={`${uid}t`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={inks.under} stopOpacity={1} />
                <Stop offset="0.6" stopColor={inks.under} stopOpacity={0.55} />
                <Stop offset="1" stopColor={inks.under} stopOpacity={0} />
              </RadialGradient>
            ) : null}
            {shown.crease ? (
              <LinearGradient id={`${uid}c`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={inks.under} stopOpacity={0} />
                <Stop offset="0.18" stopColor={inks.under} stopOpacity={1} />
                <Stop offset="0.82" stopColor={inks.under} stopOpacity={1} />
                <Stop offset="1" stopColor={inks.under} stopOpacity={0} />
              </LinearGradient>
            ) : null}
            {shown.gilt ? (
              <LinearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
                {inks.gilt.map((c, i) => (
                  <Stop key={i} offset={i / (inks.gilt.length - 1)} stopColor={c} />
                ))}
              </LinearGradient>
            ) : null}
            {shown.foil && known ? (
              // In the suit's own 100-point box, so one sheen runs across every lobe of a club instead of one per lobe.
              <LinearGradient id={`${uid}f`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
                {inks.foil.map((c, i) => (
                  <Stop key={i} offset={i / (inks.foil.length - 1)} stopColor={c} />
                ))}
              </LinearGradient>
            ) : null}
          </Defs>

          {/* The Heirloom's foil lies over the suit watermark, in the same place and turn. */}
          {shown.foil && known && cardSuit ? <Foil suit={cardSuit} size={size} compact={drawnCompact(size.h, compact)} fill={`url(#${uid}f)`} /> : null}

          {/*
            Softened corners: the colour rubbed thin round each corner, strongest at its point and fading out along
            the edges, never a line round the card. Just inside it, a few frayed nicks (the card's seeded dashes)
            fade out sooner still.
          */}
          {shown.corners ? (
            <G opacity={wear.corners}>
              {art.scuffs.map((sc) => {
                const band = sc.width * 1.5 * lift;
                return (
                  <G key={sc.corner}>
                    <Path d={scuffPath(sc, size, radius)} stroke={`url(#${uid}e${sc.corner})`} strokeWidth={band} strokeLinecap="round" fill="none" />
                    <Path
                      d={scuffPath({ ...sc, inset: sc.inset + band / 2 + 1.4 * lift, reach: sc.reach * 0.6 }, size, radius)}
                      stroke={`url(#${uid}e${sc.corner})`}
                      strokeWidth={0.9 * lift}
                      strokeDasharray={sc.dash.map((d) => d * lift)}
                      strokeLinecap="round"
                      fill="none"
                      opacity={0.5}
                    />
                  </G>
                );
              })}
            </G>
          ) : null}

          {/* The crease: a soft fold across the card, fading out before the edges, with its shadow beside it. */}
          {shown.crease && known && art.crease ? (
            <G opacity={wear.crease}>
              <Path d={creasePath(art.crease, size, 2 * lift)} stroke={`url(#${uid}c)`} strokeWidth={6 * lift} strokeLinecap="round" fill="none" opacity={0.45} />
              <Path d={creasePath(art.crease, size)} stroke={`url(#${uid}c)`} strokeWidth={1.4 * lift} strokeLinecap="round" fill="none" />
            </G>
          ) : null}

          {/* The thumb mark: a soft oval where the thumb holds the card, with the ridges of a print round it. */}
          {shown.thumb && known && art.thumb ? <Thumb art={art.thumb} size={size} ink={inks.under} fill={`url(#${uid}t)`} opacity={wear.thumb} lift={lift} /> : null}

          {/* The gilt edge: a gold rule round the card and a finer one inside it, as on an old deck. */}
          {shown.gilt ? (
            <G opacity={wear.gilt}>
              <Rect x={2} y={2} width={size.w - 4} height={size.h - 4} rx={Math.max(0, radius - 2)} stroke={`url(#${uid}g)`} strokeWidth={3.5 * lift} fill="none" />
              <Rect x={8} y={8} width={size.w - 16} height={size.h - 16} rx={Math.max(0, radius - 8)} stroke={`url(#${uid}g)`} strokeWidth={1.2 * lift} fill="none" />
            </G>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

function Thumb({ art, size, ink, fill, opacity, lift }: { art: NonNullable<ReturnType<typeof wearArt>['thumb']>; size: Size; ink: string; fill: string; opacity: number; lift: number }) {
  const o = thumbOval(art, size);
  return (
    <G opacity={opacity}>
      <Ellipse cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} fill={fill} transform={`rotate(${art.angle} ${o.cx} ${o.cy})`} />
      {art.ridges.map((r, i) => (
        <Path key={i} d={ridgePath(art, r, size)} stroke={ink} strokeWidth={1.2 * lift} strokeLinecap="round" fill="none" opacity={0.9} />
      ))}
    </G>
  );
}

/** The Heirloom's foil suit, laid exactly over the card's watermark (HabitCard draws it at the lower right, turned -12°). */
function Foil({ suit, size, compact, fill }: { suit: Suit; size: Size; compact: boolean; fill: string }) {
  const box = compact ? 180 : 250;
  const cx = size.w + 30 - box / 2;
  const cy = size.h + (compact ? 46 : 34) - box / 2;
  return (
    <G opacity={FOIL_ALPHA} transform={`rotate(-12 ${cx} ${cy})`}>
      <SuitShape suit={suit} x={cx} y={cy} size={box} fill={fill} />
    </G>
  );
}
