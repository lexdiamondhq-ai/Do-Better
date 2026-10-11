import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { Day } from '@/engine/day';
import type { Level } from '@/engine/kept';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, palette, type CardColor } from '@/theme/tokens';

import { Body, Display, Label } from '../ui';
import { rgb, SURFACE } from './surface';

/** Width ÷ height of a printed card. */
export const PRINT_ASPECT = 0.7;

/** One kept day, as it is printed. */
export type Print = { name: string; did: string; level: Level; color: CardColor; number: number; day: Day; identity: string | null };

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

const INSET = 9;

function Keyline({ radius, color }: { radius: number; color: string }) {
  return <View pointerEvents="none" style={{ position: 'absolute', top: INSET, left: INSET, right: INSET, bottom: INSET, borderRadius: radius - INSET, borderWidth: 1.5, borderColor: color, opacity: 0.35 }} />;
}

/**
 * The face of a printed card: its number, the date as the picture, and what was kept.
 * A Floor prints matte on the habit's soft colour; a Ceiling prints foil on its full colour.
 * `stamp` runs from 0 to 1 as the card is stamped with who it makes you; without it the stamp is simply there.
 */
export function PrintedCard({ print, width, tiltX, tiltY, stamp }: { print: Print; width: number; tiltX: SharedValue<number>; tiltY: SharedValue<number>; stamp?: SharedValue<number> }) {
  const height = width / PRINT_ASPECT;
  const radius = width * 0.085;
  const foil = print.level === 'ceiling';
  const c = cardColors[print.color];
  const paper = foil ? c.bg : c.soft;
  const ink = foil ? c.ink : palette.ink;
  const base = rgb(paper);
  const uniforms = useDerivedValue(() => ({ size: [width, height], tilt: [tiltX.get(), tiltY.get()], base, foil: foil ? 1 : 0 }));
  const stamped = useAnimatedStyle(() => {
    const s = stamp ? stamp.get() : 1;
    return { opacity: s, transform: [{ rotate: '-8deg' }, { scale: 1 + (1 - s) * 0.7 }] };
  });

  const [y, m, d] = print.day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = WEEKDAY.format(date);
  const month = MONTH.format(date);
  const levelName = foil ? 'Ceiling' : 'Floor';

  return (
    <View
      accessible
      accessibilityLabel={`${print.name}, ${levelName} card number ${print.number}. ${weekday} ${d} ${month}. ${print.did}.${print.identity ? ` I’m ${print.identity}.` : ''}`}
      style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: paper }}
    >
      {SURFACE ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Fill>
            <Shader source={SURFACE} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
      <Keyline radius={radius} color={ink} />
      <View style={{ flex: 1, padding: INSET + 16, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label color={ink} style={{ opacity: 0.8 }}>{`No. ${print.number}`}</Label>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: ink, alignItems: 'center', justifyContent: 'center' }}>
            <Display size={18} color={paper}>{foil ? '↑' : '↓'}</Display>
          </View>
        </View>
        <View>
          <Display size={width * 0.5} color={ink} style={{ lineHeight: width * 0.5 }}>{d}</Display>
          <Body weight="heavy" size={15} color={ink}>{weekday}</Body>
          <Body weight="bold" size={13} color={ink} style={{ opacity: 0.75 }}>{month}</Body>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ height: 1.5, backgroundColor: ink, opacity: 0.3 }} />
          <Label color={ink} style={{ opacity: 0.8 }}>{levelName}</Label>
          <Display size={26} color={ink} numberOfLines={1}>{print.name}</Display>
          <Body weight="bold" size={14} color={ink} style={{ opacity: 0.85 }} numberOfLines={1}>{print.did}</Body>
        </View>
      </View>
      {print.identity ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: INSET + 12, top: height * 0.56, maxWidth: width * 0.46, borderWidth: 2, borderColor: ink, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9 }, stamped]}>
          <Label color={ink} style={{ textAlign: 'center' }}>{`I’m ${print.identity}`}</Label>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The back of a printed card, seen while it feeds out. */
export function PrintedBack({ width }: { width: number }) {
  const t = useTheme();
  const radius = width * 0.085;
  return (
    <View style={{ width, height: width / PRINT_ASPECT, borderRadius: radius, backgroundColor: t.cardBack, alignItems: 'center', justifyContent: 'center' }}>
      <Keyline radius={radius} color={t.onCardBack} />
      <Display size={22} color={t.onCardBack}>Do Better</Display>
    </View>
  );
}
