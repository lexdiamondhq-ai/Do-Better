import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { chip, fonts } from '@/theme/tokens';

/** 1240 → "1,240". Done by hand so it reads the same on every phone. */
export function formatChips(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A gold poker chip: a rim with six edge marks around a dashed inner ring. */
export function ChipIcon({ size = 18 }: { size?: number }) {
  const marks = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    const x = 50 + Math.cos(a) * 41;
    const y = 50 + Math.sin(a) * 41;
    const dx = Math.cos(a + Math.PI / 2) * 8;
    const dy = Math.sin(a + Math.PI / 2) * 8;
    const ox = Math.cos(a) * 7;
    const oy = Math.sin(a) * 7;
    return `M${x - dx - ox} ${y - dy - oy} L${x + dx - ox} ${y + dy - oy} L${x + dx + ox} ${y + dy + oy} L${x - dx + ox} ${y - dy + oy} Z`;
  }).join(' ');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={50} cy={50} r={48} fill={chip.rim} />
      <Circle cx={50} cy={50} r={44} fill={chip.bg} />
      <Path d={marks} fill="#FFFFFF" opacity={0.95} />
      <Circle cx={50} cy={50} r={27} fill="none" stroke={chip.rim} strokeWidth={4} strokeDasharray="7 6" />
      <Circle cx={50} cy={50} r={19} fill={chip.rim} opacity={0.35} />
    </Svg>
  );
}

/** A count of chips with the chip beside it: on a gold pill, or bare on the table. */
export function Chips({ value, size = 16, pill, color, sign, style }: { value: number; size?: number; pill?: boolean; color?: string; sign?: boolean; style?: StyleProp<ViewStyle> }) {
  const label = `${sign && value > 0 ? '+' : ''}${formatChips(value)}`;
  return (
    <View
      accessible
      accessibilityLabel={`${label} chips`}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: size * 0.35 },
        pill ? { backgroundColor: chip.bg, borderRadius: 999, paddingLeft: size * 0.3, paddingRight: size * 0.7, paddingVertical: size * 0.25 } : null,
        style,
      ]}
    >
      <ChipIcon size={size * 1.25} />
      <Text style={{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.15, color: pill ? chip.ink : color, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}
