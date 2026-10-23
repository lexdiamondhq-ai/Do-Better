import { Pressable, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import type { Day } from '@/engine/day';
import type { CalendarDay } from '@/engine/kept';
import { useTheme } from '@/theme/ThemeProvider';
import { mix } from '@/theme/color';
import { cardColors, fontScale, INK, type CardColor, type Theme } from '@/theme/tokens';

import { Body } from './ui';

/**
 * A habit's days as small cards in its colour: solid for a Ceiling, pale for a Floor, a dashed gap for a
 * day not kept. On a dark table the Ceiling takes the colour's lifted `onDark` shade and the Floor a dim
 * wash of it, so the Ceiling always stands out most. Days before the habit started are left blank in the
 * calendar and hold a small dot in the weeks grid.
 */
export function pileColors(t: Theme, color: CardColor) {
  const c = cardColors[color];
  if (t.scheme === 'dark') {
    return { ceiling: { bg: c.onDark, ink: INK }, floor: { bg: mix(t.bg, c.onDark, 0.34), ink: t.text } };
  }
  return { ceiling: { bg: c.bg, ink: c.ink }, floor: { bg: c.soft, ink: INK } };
}

const UTC = (day: Day) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const letterFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });

/** The weekday's initial, in the phone's language, worked out from the date itself. */
export const weekdayLetter = (day: Day) => letterFormat.format(UTC(day));

/** An up or down arrow, the way the cards draw Ceiling and Floor. */
export function Arrow({ up, color, size }: { up: boolean; color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d={up ? 'M10 16 V4 M4.5 9.5 L10 4 L15.5 9.5' : 'M10 4 V16 M4.5 10.5 L10 16 L15.5 10.5'} stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function Plus({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 20 20">
      <Line x1={10} y1={4} x2={10} y2={16} stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      <Line x1={4} y1={10} x2={16} y2={10} stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

const GAP = 6;

/**
 * The last weeks as a Monday-to-Sunday calendar, each day a small card with its date. Today is ringed,
 * and the rest of this week waits in faint outline, like the slots of this week's hand. A day that can
 * still be logged late (yesterday, when `canLogLate` allows it) shows a plus and calls `onLogLate`.
 */
export function DayCalendar({
  weeks,
  color,
  today,
  canLogLate,
  onLogLate,
  lateLabel,
}: {
  weeks: CalendarDay[][];
  color: CardColor;
  today: Day;
  canLogLate?: (day: Day) => boolean;
  onLogLate?: (day: Day) => void;
  /** Read out for the day that can be logged late. */
  lateLabel?: string;
}) {
  const t = useTheme();
  const fill = pileColors(t, color);
  const header = weeks[0] ?? [];
  return (
    <View style={{ gap: GAP }}>
      <View aria-hidden style={{ flexDirection: 'row', gap: GAP }}>
        {header.map((cell) => (
          <Body key={cell.day} weight="heavy" size={11} color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic} style={{ flex: 1, textAlign: 'center', letterSpacing: 0.6 }}>
            {weekdayLetter(cell.day)}
          </Body>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].day} style={{ flexDirection: 'row', gap: GAP }}>
          {week.map((cell) => {
            const isToday = cell.day === today;
            const date = Number(cell.day.slice(8));
            const base = { flex: 1, aspectRatio: 0.78, borderRadius: 9, padding: 4 } as const;
            const number = (colour: string, weight: 'bold' | 'heavy' = 'bold') => (
              <Body aria-hidden weight={weight} size={10} color={colour} maxFontSizeMultiplier={fontScale.graphic} style={{ lineHeight: 12 }}>
                {date === 1 ? `${monthFormat.format(UTC(cell.day))} 1` : String(date)}
              </Body>
            );
            const ring = isToday ? { borderWidth: 2.5, borderColor: t.text } : null;
            // A card made yesterday and not kept reads as "before" (its first day only counts once kept),
            // but yesterday can still be logged late, so it gets the plus like any other day not kept.
            const late = (cell.status === 'missed' || cell.status === 'before') && !!onLogLate && !!canLogLate?.(cell.day);
            if (!late && (cell.status === 'outside' || cell.status === 'before')) return <View key={cell.day} style={base} />;
            if (cell.status === 'later') {
              return (
                <View key={cell.day} style={[base, { borderWidth: 1, borderColor: t.border }]}>
                  {number(t.textFaint)}
                </View>
              );
            }
            if (cell.status === 'ceiling' || cell.status === 'floor') {
              const f = cell.status === 'ceiling' ? fill.ceiling : fill.floor;
              return (
                <View key={cell.day} style={[base, { backgroundColor: f.bg }, ring]}>
                  {number(f.ink)}
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 6 }}>
                    <Arrow up={cell.status === 'ceiling'} color={f.ink} size={16} />
                  </View>
                </View>
              );
            }
            if (cell.status === 'open') {
              return (
                <View key={cell.day} style={[base, { borderWidth: 2.5, borderColor: t.text }]}>
                  {number(t.text, 'heavy')}
                </View>
              );
            }
            // A day not kept. Yesterday may still be logged late.
            if (late && onLogLate) {
              return (
                <Pressable
                  key={cell.day}
                  accessibilityRole="button"
                  accessibilityLabel={lateLabel ?? 'Yesterday, not logged. Log it late'}
                  onPress={() => onLogLate(cell.day)}
                  style={({ pressed }) => [base, { borderWidth: 2, borderStyle: 'dashed', borderColor: t.text, opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
                >
                  {number(t.text, 'heavy')}
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 6 }}>
                    <Plus color={t.text} />
                  </View>
                </Pressable>
              );
            }
            return (
              <View key={cell.day} style={[base, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.dashed }]}>
                {number(t.textSecondary)}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Many weeks at a glance: one column per week, Monday at the top, the newest week on the right and today
 * ringed. A short month name marks the week each month begins.
 */
export function WeeksGrid({ weeks, color, today, label }: { weeks: CalendarDay[][]; color: CardColor; today: Day; label: string }) {
  const t = useTheme();
  const fill = pileColors(t, color);
  const gap = 4;
  const first = weeks[0] ?? [];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ gap }}>
      <View style={{ flexDirection: 'row', gap }}>
        <View style={{ width: 14 }} />
        {weeks.map((week, i) => {
          const starts = week.find((c) => c.day.endsWith('-01'));
          const show = starts || i === 0;
          return (
            <View key={week[0].day} style={{ flex: 1, overflow: 'visible' }}>
              {show ? (
                <Body aria-hidden weight="heavy" size={10} color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic} numberOfLines={1} style={{ width: 40 }}>
                  {monthFormat.format(UTC((starts ?? week[0]).day))}
                </Body>
              ) : null}
            </View>
          );
        })}
      </View>
      {first.map((_, row) => (
        <View key={row} style={{ flexDirection: 'row', gap, alignItems: 'center' }}>
          <Body aria-hidden weight="heavy" size={9} color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic} style={{ width: 14 }}>
            {row % 2 === 0 ? weekdayLetter(first[row].day) : ''}
          </Body>
          {weeks.map((week) => {
            const cell = week[row];
            const ring = cell.day === today ? { borderWidth: 2, borderColor: t.text } : null;
            const base = { flex: 1, aspectRatio: 1, borderRadius: 5 } as const;
            if (cell.status === 'ceiling') return <View key={cell.day} style={[base, { backgroundColor: fill.ceiling.bg }, ring]} />;
            if (cell.status === 'floor') return <View key={cell.day} style={[base, { backgroundColor: fill.floor.bg }, ring]} />;
            if (cell.status === 'missed') return <View key={cell.day} style={[base, { borderWidth: 1, borderColor: t.border }]} />;
            if (cell.status === 'open') return <View key={cell.day} style={[base, ring]} />;
            // Days before the card was in the deck hold a small dot, so its first weeks read as not yet started, not as a gap.
            if (cell.status === 'before') {
              return (
                <View key={cell.day} style={[base, { alignItems: 'center', justifyContent: 'center' }]}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.border }} />
                </View>
              );
            }
            return <View key={cell.day} style={base} />;
          })}
        </View>
      ))}
    </View>
  );
}

export function PileLegend({ color }: { color: CardColor }) {
  const t = useTheme();
  const fill = pileColors(t, color);
  const item = (swatch: object, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={[{ width: 10, height: 13, borderRadius: 3 }, swatch]} />
      <Body size={12} weight="bold" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
        {label}
      </Body>
    </View>
  );
  return (
    <View aria-hidden style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
      {item({ backgroundColor: fill.ceiling.bg }, 'Ceiling')}
      {item({ backgroundColor: fill.floor.bg }, 'Floor')}
    </View>
  );
}
