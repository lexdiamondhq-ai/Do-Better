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
export function SuitShape({ suit, x, y, size, fill, opacity }: { suit: Suit; x: number; y: number; size: number; fill: string; opacity?: number }) {
  const s = size / 100;
  return (
    <G transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`} fill={fill} opacity={opacity}>
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

export function SuitGlyph({ suit, size = 20, color }: { suit: Suit; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SuitShape suit={suit} x={50} y={50} size={100} fill={color ?? suitColors[suit].glyph} />
    </Svg>
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
