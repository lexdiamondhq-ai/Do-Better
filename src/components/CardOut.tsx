import { useId, type Ref } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';

import { SUIT_INFO } from '@/engine/cards';
import type { BackKey } from '@/engine/game';
import { CARD_ASPECT_H, LEAVE_FORMATS, leaveLines, lockCardBox, type LeaveFormat, type LeaveLines } from '@/engine/leave';
import type { Habit } from '@/lib/types';
import { mix, withAlpha } from '@/theme/color';
import { cardColors, fonts, on } from '@/theme/tokens';

import { CardBack } from './CardBack';
import { SuitGlyph } from './Suit';

/** Print paper, and the faint grey of the cut and fold lines on it. */
const PAPER = '#FFFFFF';
const RULE = 'rgba(23, 18, 31, 0.35)';
/** The night a lock screen's card sits in, deepened from the card's own colour. */
const NIGHT = '#09080C';

/** The size a card leaves the phone at, laid out `width` points across in the shape of its picture. */
export function cardOutSize(format: LeaveFormat, width: number): { w: number; h: number } {
  const f = LEAVE_FORMATS[format];
  return { w: width, h: Math.round((width * f.h) / f.w) };
}

/** What a screen reader hears for the picture: the card's words, in the order they're printed. */
export function cardOutLabel(habit: Pick<Habit, 'name' | 'suit'>, lines: LeaveLines): string {
  return [`${lines.name}, ${SUIT_INFO[habit.suit].part}`, lines.plays, lines.floor.replace('↓ ', ''), lines.firstMove, lines.identity].filter(Boolean).join('. ') + '.';
}

/**
 * One card as it leaves the phone: a print (front and back side by side on paper, with a dashed line to
 * fold on) or a lock screen (the front lying in the lower part of a dark felt in its own colour, the top
 * left clear for the clock). Laid out `width` points across and captured at `LEAVE_FORMATS` pixels.
 * Only the card's own words go on it: no chips, no hands, no kept days. It is a picture, so its words
 * never grow with the phone's text size.
 */
export function CardOut({ habit, back, format, width, cardRef }: { habit: Habit; back: BackKey; format: LeaveFormat; width: number; cardRef?: Ref<View> }) {
  const lines = leaveLines(habit);
  const size = cardOutSize(format, width);
  const label = cardOutLabel(habit, lines);
  if (format === 'print') {
    // Two faces of a playing card's shape, with a hair of paper round them to cut along.
    const margin = Math.max(2, Math.round(size.w * 0.012));
    const faceW = size.w / 2 - margin * 2;
    const faceH = size.h - margin * 2;
    return (
      <View ref={cardRef} collapsable={false} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size.w, height: size.h, backgroundColor: PAPER, flexDirection: 'row' }}>
        <View style={{ width: size.w / 2, height: size.h, padding: margin }}>
          <CardFront habit={habit} lines={lines} w={faceW} h={faceH} />
        </View>
        <View style={{ width: size.w / 2, height: size.h, padding: margin }}>
          <View style={{ width: faceW, height: faceH, borderRadius: faceW * 0.06, overflow: 'hidden' }}>
            <CardBack back={back} size="md" width={faceW} style={{ borderRadius: faceW * 0.06, boxShadow: undefined }} />
          </View>
        </View>
        <FoldLine w={size.w} h={size.h} />
      </View>
    );
  }
  return <LockScreen habit={habit} lines={lines} size={size} label={label} cardRef={cardRef} />;
}

/** The fold, straight down the middle of the paper. */
function FoldLine({ w, h }: { w: number; h: number }) {
  const dash = Math.max(3, Math.round(w * 0.012));
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Line x1={w / 2} y1={0} x2={w / 2} y2={h} stroke={RULE} strokeWidth={Math.max(0.75, w / 900)} strokeDasharray={[dash, dash * 0.8]} />
    </Svg>
  );
}

function LockScreen({ habit, lines, size, label, cardRef }: { habit: Habit; lines: LeaveLines; size: { w: number; h: number }; label: string; cardRef?: Ref<View> }) {
  const id = `lock${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = cardColors[habit.color];
  const night = mix(c.bg, NIGHT, 0.82);
  const box = lockCardBox(size.w, size.h);
  return (
    <View ref={cardRef} collapsable={false} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size.w, height: size.h, backgroundColor: night, overflow: 'hidden' }}>
      {/* A pool of the card's colour under it, as if a lamp hung over the table. */}
      <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy={`${Math.round(((box.y + box.h / 2) / size.h) * 100)}%`} rx="75%" ry="42%" fx="50%" fy={`${Math.round(((box.y + box.h / 2) / size.h) * 100)}%`}>
            <Stop offset="0" stopColor={c.bg} stopOpacity={0.5} />
            <Stop offset="0.55" stopColor={c.bg} stopOpacity={0.16} />
            <Stop offset="1" stopColor={c.bg} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
      </Svg>
      <View style={{ position: 'absolute', left: box.x, top: box.y, transform: [{ rotate: '-3deg' }], boxShadow: `0 ${Math.round(box.w * 0.08)}px ${Math.round(box.w * 0.16)}px rgba(0, 0, 0, 0.5)`, borderRadius: box.w * 0.06 }}>
        <CardFront habit={habit} lines={lines} w={box.w} h={box.h} />
      </View>
    </View>
  );
}

/** Text on the picture: its own size, never the phone's. */
function T({ children, style, lines }: { children: string; style: TextStyle; lines?: number }) {
  return (
    <Text allowFontScaling={false} numberOfLines={lines} adjustsFontSizeToFit={!!lines} minimumFontScale={0.7} style={style}>
      {children}
    </Text>
  );
}

/** The front of the card on its own, `width` points across in a playing card's shape: for a preview of a card not ready to leave yet. */
export function CardOutFront({ habit, width }: { habit: Habit; width: number }) {
  const lines = leaveLines(habit);
  return <CardFront habit={habit} lines={lines} w={width} h={Math.round(width * CARD_ASPECT_H)} />;
}

/**
 * The front of the card, `w` × `h` points: its colour edge to edge, a fine frame, a suit in two corners
 * the way a playing card has its index, the part of you it deals for, its name and when it plays, then
 * the Floor and the First move, who it says you are, and Do Better at the foot.
 */
function CardFront({ habit, lines, w, h }: { habit: Habit; lines: LeaveLines; w: number; h: number }) {
  const c = cardColors[habit.color];
  const ink = c.ink;
  const quiet = on(c.bg).secondary;
  const u = w / 100;
  const pad = 10 * u;
  const corner = 9 * u;
  const radius = 6 * u;
  return (
    <View style={{ width: w, height: h, borderRadius: radius, backgroundColor: c.bg, overflow: 'hidden' }}>
      {/* The big suit, faint, lower right, as on the card in the app. */}
      <View style={{ position: 'absolute', right: -14 * u, bottom: -10 * u, opacity: 0.1, transform: [{ rotate: '-12deg' }] }}>
        <SuitGlyph suit={habit.suit} size={86 * u} color={ink} />
      </View>
      {/* A fine frame inside the edge. */}
      <View style={{ position: 'absolute', left: 3.5 * u, top: 3.5 * u, right: 3.5 * u, bottom: 3.5 * u, borderRadius: radius - 2.5 * u, borderWidth: Math.max(0.5, 0.45 * u), borderColor: withAlpha(ink, 0.32) }} />
      {/* The suit in two corners, the second upside down. */}
      <View style={{ position: 'absolute', left: 7 * u, top: 7 * u }}>
        <SuitGlyph suit={habit.suit} size={corner} color={ink} />
      </View>
      <View style={{ position: 'absolute', right: 7 * u, bottom: 7 * u, transform: [{ rotate: '180deg' }] }}>
        <SuitGlyph suit={habit.suit} size={corner} color={ink} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: pad, paddingTop: 20 * u, paddingBottom: 16 * u, justifyContent: 'space-between' }}>
        <View style={{ gap: 2.5 * u }}>
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 4.6 * u, letterSpacing: 0.5 * u, textTransform: 'uppercase', color: quiet }}>{SUIT_INFO[habit.suit].part}</T>
          <T lines={2} style={{ fontFamily: fonts.display, fontSize: (lines.name.length > 12 ? 13 : 16) * u, lineHeight: (lines.name.length > 12 ? 14 : 17) * u, letterSpacing: -0.15 * u, color: ink }}>
            {lines.name}
          </T>
          {lines.plays ? (
            <View style={{ alignSelf: 'flex-start', maxWidth: '100%', marginTop: 1.5 * u, borderRadius: 99, backgroundColor: ink, paddingVertical: 1.3 * u, paddingHorizontal: 3.2 * u }}>
              <T lines={2} style={{ fontFamily: fonts.bodyHeavy, fontSize: 4.4 * u, lineHeight: 5.6 * u, color: c.bg }}>
                {lines.plays}
              </T>
            </View>
          ) : (
            <View style={{ alignSelf: 'flex-start', marginTop: 1.5 * u, borderRadius: 99, borderWidth: Math.max(0.75, 0.5 * u), borderStyle: 'dashed', borderColor: quiet, paddingVertical: 1.1 * u, paddingHorizontal: 3.2 * u }}>
              <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 4.4 * u, lineHeight: 5.6 * u, color: quiet }}>When it plays</T>
            </View>
          )}
        </View>

        <View style={{ gap: 2.2 * u }}>
          <View style={{ height: Math.max(0.5, 0.4 * u), backgroundColor: withAlpha(ink, 0.3), marginBottom: 1.2 * u }} />
          <T lines={2} style={{ fontFamily: fonts.bodyHeavy, fontSize: 5.4 * u, lineHeight: 6.8 * u, color: ink }}>
            {lines.floor}
          </T>
          {lines.firstMove ? (
            <T lines={2} style={{ fontFamily: fonts.bodyBold, fontSize: 4.8 * u, lineHeight: 6.2 * u, color: ink }}>
              {lines.firstMove}
            </T>
          ) : null}
          {lines.identity ? (
            <T lines={2} style={{ fontFamily: fonts.displaySemi, fontSize: 6.4 * u, lineHeight: 7.6 * u, color: ink, marginTop: 1.4 * u }}>
              {lines.identity}
            </T>
          ) : null}
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 3.4 * u, letterSpacing: 0.45 * u, textTransform: 'uppercase', color: quiet, marginTop: 1.6 * u }}>Do Better</T>
        </View>
      </View>
    </View>
  );
}

