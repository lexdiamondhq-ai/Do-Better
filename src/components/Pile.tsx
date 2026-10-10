import { View } from 'react-native';

import type { DayStatus } from '@/engine/kept';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, type CardColor } from '@/theme/tokens';

import { Body, Display } from './ui';

/**
 * Days as small cards in the habit's colour: solid for a Ceiling, pale for a Floor,
 * a dashed gap for a miss. Days before the habit started are left out entirely.
 */
export function Pile({ days, color, columns = 10, showArrows = true }: { days: { day: string; status: DayStatus }[]; color: CardColor; columns?: number; showArrows?: boolean }) {
  const t = useTheme();
  const c = cardColors[color];
  const rows: { day: string; status: DayStatus }[][] = [];
  for (let i = 0; i < days.length; i += columns) rows.push(days.slice(i, i + columns));
  return (
    <View style={{ gap: 5 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 5 }}>
          {Array.from({ length: columns }, (_, i) => {
            const cell = row[i];
            const base = { flex: 1, aspectRatio: 0.75, borderRadius: 6, alignItems: 'center' as const, justifyContent: 'center' as const };
            if (!cell || cell.status === 'before') return <View key={cell?.day ?? `pad-${i}`} style={base} />;
            if (cell.status === 'ceiling') return <View key={cell.day} style={[base, { backgroundColor: c.bg }]}>{showArrows ? <Display size={11} color={c.ink}>↑</Display> : null}</View>;
            if (cell.status === 'floor') return <View key={cell.day} style={[base, { backgroundColor: c.soft }]}>{showArrows ? <Display size={11} color="#17121F">↓</Display> : null}</View>;
            return <View key={cell.day} style={[base, { borderWidth: 1.5, borderStyle: cell.status === 'open' ? 'solid' : 'dashed', borderColor: cell.status === 'open' ? t.text : t.dashed }]} />;
          })}
        </View>
      ))}
    </View>
  );
}

export function PileLegend({ color }: { color: CardColor }) {
  const t = useTheme();
  const c = cardColors[color];
  const item = (swatch: object, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[{ width: 11, height: 15, borderRadius: 3 }, swatch]} />
      <Body size={12} weight="bold" color={t.textSecondary}>{label}</Body>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
      {item({ backgroundColor: c.bg }, 'Ceiling')}
      {item({ backgroundColor: c.soft }, 'Floor')}
      {item({ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.dashed }, 'Missed')}
    </View>
  );
}
