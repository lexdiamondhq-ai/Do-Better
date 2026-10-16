import Svg, { Circle, G, Path } from 'react-native-svg';

import type { Suit } from '@/engine/cards';
import { suitColors } from '@/theme/tokens';

/**
 * The four suit shapes, drawn rather than typed: the text glyphs vary by font and iOS can swap
 * them for emoji. All four sit in a 100 by 100 box.
 */
const HEART = 'M50 90 C46 86 6 60 6 33 C6 17 18 7 31 7 C40 7 46 12 50 20 C54 12 60 7 69 7 C82 7 94 17 94 33 C94 60 54 86 50 90 Z';
const DIAMOND = 'M50 3 C60 20 74 37 90 50 C74 63 60 80 50 97 C40 80 26 63 10 50 C26 37 40 20 50 3 Z';
const SPADE =
  'M50 5 C56 16 92 36 92 60 C92 74 82 82 70 82 C62 82 56 78 53 72 C54 82 58 89 66 95 L34 95 C42 89 46 82 47 72 C44 78 38 82 30 82 C18 82 8 74 8 60 C8 36 44 16 50 5 Z';
const CLUB_STEM = 'M46 58 C46 74 42 86 33 95 L67 95 C58 86 54 74 54 58 Z';

/** One suit shape, for drawing inside another SVG: centred on (x, y) and `size` across. */
export function SuitShape({ suit, x, y, size, fill, opacity, flip }: { suit: Suit; x: number; y: number; size: number; fill: string; opacity?: number; flip?: boolean }) {
  const s = size / 100;
  const turn = flip ? ` rotate(180 50 50)` : '';
  return (
    <G transform={`translate(${r2(x - size / 2)} ${r2(y - size / 2)}) scale(${r2(s, 4)})${turn}`} fill={fill} opacity={opacity}>
      {suit === 'hearts' ? <Path d={HEART} /> : null}
      {suit === 'diamonds' ? <Path d={DIAMOND} /> : null}
      {suit === 'spades' ? <Path d={SPADE} /> : null}
      {suit === 'clubs' ? (
        <>
          <Circle cx={50} cy={27} r={19} />
          <Circle cx={27} cy={57} r={19} />
          <Circle cx={73} cy={57} r={19} />
          <Circle cx={50} cy={50} r={12} />
          <Path d={CLUB_STEM} />
        </>
      ) : null}
    </G>
  );
}

const r2 = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places;

export function SuitGlyph({ suit, size = 20, color }: { suit: Suit; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SuitShape suit={suit} x={50} y={50} size={100} fill={color ?? suitColors[suit].glyph} />
    </Svg>
  );
}

/** The King's crown, in the 100 by 100 box: five points on a band. Jewels sit at (14, 31), (50, 22) and (86, 31). */
export const CROWN = 'M10 74 L14 36 L32 57 L50 27 L68 57 L86 36 L90 74 Z M10 79 H90 V89 H10 Z';

/** The Queen's tiara: a low curved band rising to three points, the middle one tallest. */
const TIARA = 'M12 78 C30 70 70 70 88 78 L82 50 L67 62 L50 30 L33 62 L18 50 Z M12 84 C30 76 70 76 88 84 L88 91 C70 83 30 83 12 91 Z';

/** The Jack's crest: a shield. Its chevron is cut out of it in the card's face colour. */
const CREST = 'M18 10 H82 V46 C82 70 64 85 50 93 C36 85 18 70 18 46 Z';
const CHEVRON = 'M28 30 L50 50 L72 30 L72 44 L50 64 L28 44 Z';

export type CourtFace = 'jack' | 'queen' | 'king' | 'ace';

/**
 * The mark of a court card, centred on (x, y) and `size` across: a chevron crest for the Jack, a tiara
 * for the Queen, a crown for the King. (The Ace's mark is a ring round its pip, drawn by the card.)
 * `cutout` is the colour the crest's chevron and the jewels are cut in, normally the card face.
 */
export function CourtMark({ face, x, y, size, fill, cutout, flip }: { face: Exclude<CourtFace, 'ace'>; x: number; y: number; size: number; fill: string; cutout: string; flip?: boolean }) {
  const s = size / 100;
  const turn = flip ? ` rotate(180 50 50)` : '';
  return (
    <G transform={`translate(${r2(x - size / 2)} ${r2(y - size / 2)}) scale(${r2(s, 4)})${turn}`}>
      {face === 'king' ? (
        <>
          <Path d={CROWN} fill={fill} />
          <Circle cx={14} cy={31} r={7} fill={fill} />
          <Circle cx={50} cy={22} r={7} fill={fill} />
          <Circle cx={86} cy={31} r={7} fill={fill} />
          <Circle cx={50} cy={84} r={3} fill={cutout} />
          <Circle cx={30} cy={84} r={3} fill={cutout} />
          <Circle cx={70} cy={84} r={3} fill={cutout} />
        </>
      ) : null}
      {face === 'queen' ? (
        <>
          <Path d={TIARA} fill={fill} />
          <Circle cx={50} cy={24} r={7} fill={fill} />
          <Circle cx={18} cy={45} r={5.5} fill={fill} />
          <Circle cx={82} cy={45} r={5.5} fill={fill} />
          <Circle cx={50} cy={62} r={5} fill={cutout} />
        </>
      ) : null}
      {face === 'jack' ? (
        <>
          <Path d={CREST} fill={fill} />
          <Path d={CHEVRON} fill={cutout} />
        </>
      ) : null}
    </G>
  );
}

/** The points of a five-pointed star in the 100 by 100 box, as a path. */
export function starPath(cx = 50, cy = 52, outer = 48, inner = 21): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${points.join(' L')} Z`;
}

/** A five-pointed star, for the Joker. */
export function Star({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={starPath()} fill={color} />
    </Svg>
  );
}

/**
 * The saved day's mark for the smallest cards: an arrow that rises on the right, turns over the top and
 * comes back down on the left with its head. Its head sits on the left, so it still reads as an arrow
 * (never as a letter) when the next card in a row covers the right of the card. Fits a `size` square
 * centred on (cx, cy), as a stroked path and a filled head.
 */
export function uTurnArrow(cx: number, cy: number, size: number): { path: string; head: string } {
  const r = size * 0.3;
  const top = cy - size * 0.06;
  const path = `M${r2(cx + r)} ${r2(top + size * 0.36)} L${r2(cx + r)} ${r2(top)} A${r2(r)} ${r2(r)} 0 0 0 ${r2(cx - r)} ${r2(top)} L${r2(cx - r)} ${r2(top + size * 0.12)}`;
  const w = size * 0.2;
  const base = top + size * 0.1;
  const head = `M${r2(cx - r - w)} ${r2(base)} L${r2(cx - r + w)} ${r2(base)} L${r2(cx - r)} ${r2(base + size * 0.26)} Z`;
  return { path, head };
}

/**
 * An open circle with an arrowhead, turning back on itself: the mark of a saved day. Centred on
 * (cx, cy) with radius `r`, as a stroked arc and a filled head.
 */
export function circleArrow(cx: number, cy: number, r: number): { arc: string; head: string } {
  // The arc runs anticlockwise from just right of the top round to the right side, leaving a gap.
  const from = -60;
  const to = -60 - 290;
  const pt = (deg: number, rad = r) => [cx + rad * Math.cos((deg * Math.PI) / 180), cy + rad * Math.sin((deg * Math.PI) / 180)];
  const [x0, y0] = pt(from);
  const [x1, y1] = pt(to);
  const arc = `M${r2(x0)} ${r2(y0)} A${r2(r)} ${r2(r)} 0 1 0 ${r2(x1)} ${r2(y1)}`;
  // The head points the way the arc travels at its end.
  const tangent = ((to - 90) * Math.PI) / 180;
  const tip = [x1 + Math.cos(tangent) * r * 0.42, y1 + Math.sin(tangent) * r * 0.42];
  const [ox, oy] = pt(to, r + r * 0.32);
  const [ix, iy] = pt(to, r - r * 0.32);
  const head = `M${r2(tip[0])} ${r2(tip[1])} L${r2(ox)} ${r2(oy)} L${r2(ix)} ${r2(iy)} Z`;
  return { arc, head };
}
