import { useId, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { Suit } from '@/engine/cards';
import type { BackKey } from '@/engine/game';
import { suitColors } from '@/theme/tokens';

import { CARD_SIZES, type CardSize } from './PlayingCard';
import { CROWN, starPath, SuitShape } from './Suit';

/** Each back's own colours. Backs look the same on every table. */
export const BACK_COLORS: Record<BackKey, { bg: string; fg: string; accent: string }> = {
  classic: { bg: '#1F2A5C', fg: '#F6EFE0', accent: '#F6EFE0' },
  pinstripe: { bg: '#7A1F2B', fg: '#F6EFE0', accent: '#F2C14E' },
  checker: { bg: '#17614B', fg: '#0E4636', accent: '#F6EFE0' },
  chevron: { bg: '#E5452A', fg: '#FFE7DE', accent: '#FFE7DE' },
  ladder: { bg: '#2F5FE0', fg: '#E6EDFF', accent: '#FFC93D' },
  velvet: { bg: '#3B1541', fg: '#FF8FB1', accent: '#7A3184' },
  houndstooth: { bg: '#F3EBDD', fg: '#17121F', accent: '#17121F' },
  lattice: { bg: '#0E3B2C', fg: '#F2C14E', accent: '#F2C14E' },
  sunburst: { bg: '#FFC93D', fg: '#F2A900', accent: '#17121F' },
  crown: { bg: '#0B0A08', fg: '#E8C15A', accent: '#E8C15A' },
  aurora: { bg: '#2B0D2F', fg: '#FFFFFF', accent: '#FFFFFF' },
};

const n = (v: number) => Math.round(v * 100) / 100;

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${n(x + r)} ${n(y)} H${n(x + w - r)} A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)} V${n(y + h - r)} A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)} H${n(x + r)} A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)} V${n(y + r)} A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)} Z`;
}

/** Both families of 45 degree lines, `step` apart along the top edge. */
function diagonals(w: number, h: number, step: number, which: 'both' | 'down' | 'up' = 'both'): string {
  let d = '';
  for (let k = Math.floor(-h / step) - 1; k * step < w + h + step; k++) {
    const x = k * step;
    if (which !== 'up') d += `M${n(x)} 0 L${n(x + h)} ${n(h)} `;
    if (which !== 'down') d += `M${n(x)} 0 L${n(x - h)} ${n(h)} `;
  }
  return d;
}

/** Small diamonds where the diagonal lines cross. */
function crossings(w: number, h: number, step: number, r: number): string {
  let d = '';
  const half = step / 2;
  for (let a = 0; a * half <= w + half; a++) {
    for (let b = 0; b * half <= h + half; b++) {
      if ((a + b) % 2) continue;
      const x = a * half;
      const y = b * half;
      d += `M${n(x)} ${n(y - r)} L${n(x + r)} ${n(y)} L${n(x)} ${n(y + r)} L${n(x - r)} ${n(y)} Z `;
    }
  }
  return d;
}

/** Real houndstooth: four dark and four light threads woven in a 2/2 twill. */
function houndstooth(w: number, h: number, cell: number): string {
  let d = '';
  for (let i = 0; i * cell < w; i++) {
    for (let j = 0; j * cell < h; j++) {
      const warpDark = i % 8 < 4;
      const weftDark = j % 8 < 4;
      const warpOnTop = (i + j) % 4 < 2;
      const dark = warpDark === weftDark ? warpDark : warpOnTop ? warpDark : weftDark;
      if (dark) d += `M${n(i * cell)} ${n(j * cell)} h${n(cell)} v${n(cell)} h${n(-cell)} Z `;
    }
  }
  return d;
}

const FLUSH_SUITS: Suit[] = ['hearts', 'hearts', 'hearts', 'hearts', 'hearts'];
const STARS: readonly [number, number, number][] = [
  [0.22, 0.18, 0.09],
  [0.74, 0.12, 0.06],
  [0.58, 0.34, 0.11],
  [0.18, 0.52, 0.07],
  [0.82, 0.5, 0.08],
  [0.4, 0.66, 0.06],
  [0.7, 0.8, 0.1],
  [0.26, 0.86, 0.07],
];

function Pattern({ back, w, h, uid }: { back: BackKey; w: number; h: number; uid: string }): ReactNode {
  const c = BACK_COLORS[back];
  const cx = w / 2;
  const cy = h / 2;
  const line = Math.max(0.8, w / 90);
  switch (back) {
    case 'classic':
      return (
        <>
          <Path d={diagonals(w, h, w / 5)} stroke={c.fg} strokeWidth={line} opacity={0.22} />
          <Circle cx={cx} cy={cy} r={w * 0.25} fill={c.fg} />
          <Circle cx={cx} cy={cy} r={w * 0.25 - line * 2.5} fill="none" stroke={c.bg} strokeWidth={line} opacity={0.5} />
          {(['spades', 'hearts', 'clubs', 'diamonds'] as Suit[]).map((suit, i) => {
            const a = (Math.PI / 2) * i - Math.PI / 2;
            return <SuitShape key={suit} suit={suit} x={cx + Math.cos(a) * w * 0.11} y={cy + Math.sin(a) * w * 0.11} size={w * 0.11} fill={suitColors[suit].glyph} />;
          })}
        </>
      );
    case 'pinstripe': {
      let thin = '';
      let thick = '';
      const step = w / 12;
      for (let i = 0; i * step <= w; i++) {
        const seg = `M${n(i * step)} 0 V${n(h)} `;
        if (i % 3 === 0) thick += seg;
        else thin += seg;
      }
      return (
        <>
          <Path d={thin} stroke={c.fg} strokeWidth={line} opacity={0.35} />
          <Path d={thick} stroke={c.accent} strokeWidth={line * 1.6} opacity={0.75} />
        </>
      );
    }
    case 'checker': {
      const step = w / 7;
      let d = '';
      for (let i = 0; i * step < w; i++) for (let j = 0; j * step < h; j++) if ((i + j) % 2 === 0) d += `M${n(i * step)} ${n(j * step)} h${n(step)} v${n(step)} h${n(-step)} Z `;
      return (
        <>
          <Path d={d} fill={c.fg} />
          <Circle cx={cx} cy={cy} r={w * 0.16} fill={c.bg} stroke={c.accent} strokeWidth={line * 1.4} />
          <SuitShape suit="spades" x={cx} y={cy} size={w * 0.16} fill={c.accent} />
        </>
      );
    }
    case 'chevron': {
      const rowStep = h / 9;
      const colStep = w / 6;
      let d = '';
      for (let y = -rowStep; y < h + rowStep; y += rowStep) {
        d += `M${n(-colStep)} ${n(y)} `;
        for (let x = -colStep, up = true; x <= w + colStep; x += colStep, up = !up) d += `L${n(x)} ${n(up ? y : y + rowStep * 0.5)} `;
      }
      return <Path d={d} stroke={c.fg} strokeWidth={Math.max(1.2, w / 34)} fill="none" opacity={0.9} strokeLinejoin="round" />;
    }
    case 'ladder': {
      const left = w * 0.3;
      const right = w * 0.7;
      const step = h / 12;
      let rungs = '';
      let faint = '';
      for (let y = step / 2; y < h; y += step) {
        rungs += `M${n(left)} ${n(y)} H${n(right)} `;
        faint += `M0 ${n(y)} H${n(left)} M${n(right)} ${n(y)} H${n(w)} `;
      }
      return (
        <>
          <Path d={faint} stroke={c.fg} strokeWidth={line} opacity={0.2} />
          <Path d={rungs} stroke={c.fg} strokeWidth={Math.max(1.2, w / 40)} opacity={0.85} />
          <Path d={`M${n(left)} 0 V${n(h)} M${n(right)} 0 V${n(h)}`} stroke={c.accent} strokeWidth={Math.max(1.6, w / 26)} />
        </>
      );
    }
    case 'velvet':
      return (
        <>
          <Defs>
            <RadialGradient id={`v${uid}`} cx="50%" cy="45%" r="65%">
              <Stop offset="0" stopColor={c.accent} />
              <Stop offset="1" stopColor={c.bg} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={w} height={h} fill={`url(#v${uid})`} />
          <Path d={diagonals(w, h, w / 9, 'up')} stroke={c.fg} strokeWidth={line} opacity={0.12} />
          {FLUSH_SUITS.map((suit, i) => {
            // A fan of five, spaced so no two suits touch.
            const a = ((i - 2) * Math.PI) / 6;
            return <SuitShape key={i} suit={suit} x={cx + Math.sin(a) * w * 0.29} y={cy + w * 0.1 - Math.cos(a) * w * 0.29} size={w * 0.13} fill={c.fg} opacity={0.95} />;
          })}
        </>
      );
    case 'houndstooth':
      return <Path d={houndstooth(w, h, Math.max(1.5, w / 30))} fill={c.fg} />;
    case 'lattice': {
      const step = w / 4;
      return (
        <>
          <Path d={diagonals(w, h, step)} stroke={c.fg} strokeWidth={line} opacity={0.5} />
          <Path d={crossings(w, h, step, Math.max(1.5, w / 30))} fill={c.fg} />
        </>
      );
    }
    case 'sunburst': {
      const rays = 24;
      const r = Math.hypot(w, h);
      let d = '';
      for (let i = 0; i < rays; i += 2) {
        const a0 = (2 * Math.PI * i) / rays;
        const a1 = (2 * Math.PI * (i + 1)) / rays;
        d += `M${n(cx)} ${n(cy)} L${n(cx + Math.cos(a0) * r)} ${n(cy + Math.sin(a0) * r)} L${n(cx + Math.cos(a1) * r)} ${n(cy + Math.sin(a1) * r)} Z `;
      }
      const star = w * 0.26;
      return (
        <>
          <Path d={d} fill={c.fg} />
          <Circle cx={cx} cy={cy} r={w * 0.19} fill={c.bg} stroke={c.accent} strokeWidth={line * 1.5} />
          <G transform={`translate(${n(cx - star / 2)} ${n(cy - star / 2)}) scale(${n(star / 100)})`}>
            <Path d={starPath()} fill={c.accent} />
          </G>
        </>
      );
    }
    case 'crown': {
      const size = w * 0.52;
      return (
        <>
          <Path d={diagonals(w, h, w / 8)} stroke={c.fg} strokeWidth={line} opacity={0.14} />
          <G transform={`translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${n(size / 100)})`} fill={c.fg}>
            <Path d={CROWN} />
            <Circle cx={14} cy={31} r={6} />
            <Circle cx={50} cy={22} r={6} />
            <Circle cx={86} cy={31} r={6} />
          </G>
        </>
      );
    }
    case 'aurora':
      return (
        <>
          <Defs>
            <LinearGradient id={`a${uid}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={suitColors.hearts.glyph} />
              <Stop offset="0.36" stopColor={suitColors.clubs.glyph} />
              <Stop offset="0.68" stopColor={suitColors.diamonds.glyph} />
              <Stop offset="1" stopColor={suitColors.spades.glyph} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={w} height={h} fill={`url(#a${uid})`} />
          {STARS.map(([x, y, s], i) => (
            <G key={i} transform={`translate(${n(x * w - (s * w) / 2)} ${n(y * h - (s * w) / 2)}) scale(${n((s * w) / 100)})`}>
              <Path d={starPath()} fill={c.fg} opacity={0.9} />
            </G>
          ))}
        </>
      );
  }
}

/** A light edge on every back, so a dark back never melts into a dark table. */
const BACK_EDGE = 'rgba(255, 253, 248, 0.16)';

/**
 * The back of a card, in the design the player picked. Future days in the week show it. It is a
 * picture: nothing on it grows with the phone's text size.
 */
export function CardBack({ back, size = 'md', width, style }: { back: BackKey; size?: CardSize; width?: number; style?: StyleProp<ViewStyle> }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const base = CARD_SIZES[size];
  const w = width ?? base.w;
  const h = width ? (width * base.h) / base.w : base.h;
  const radius = width ? (width * base.radius) / base.w : base.radius;
  const c = BACK_COLORS[back];
  const m = Math.max(2.5, w * 0.07);
  const inner = roundedRect(m, m, w - m * 2, h - m * 2, Math.max(1, radius * 0.55));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Card still to come"
      style={[
        { width: w, height: h, borderRadius: radius, overflow: 'hidden', backgroundColor: c.bg, borderWidth: 1, borderColor: BACK_EDGE, boxShadow: size === 'xs' ? undefined : '0px 4px 12px rgba(0, 0, 0, 0.2)' },
        style,
      ]}
    >
      <Svg width={w} height={h} style={{ position: 'absolute', top: -1, left: -1 }}>
        <Pattern back={back} w={w} h={h} uid={uid} />
        <Path d={`M0 0 H${n(w)} V${n(h)} H0 Z ${inner}`} fill={c.bg} fillRule="evenodd" />
        <Path d={inner} fill="none" stroke={back === 'houndstooth' || back === 'checker' ? c.accent : c.fg} strokeWidth={Math.max(0.8, w / 110)} opacity={0.7} />
      </Svg>
    </View>
  );
}
