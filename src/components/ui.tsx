import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

type TextProps = PropsWithChildren<{ style?: StyleProp<TextStyle>; size?: number; color?: string; numberOfLines?: number }>;

/** Fredoka: names, numbers and headings. */
export function Display({ children, style, size = 28, color, numberOfLines }: TextProps) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.05, letterSpacing: -size * 0.01, color: color ?? t.text }, style]}>
      {children}
    </Text>
  );
}

/** Nunito: everything you read. */
export function Body({ children, style, size = 16, color, numberOfLines, weight = 'medium' }: TextProps & { weight?: 'medium' | 'semi' | 'bold' | 'heavy' }) {
  const t = useTheme();
  const family = { medium: fonts.body, semi: fonts.bodySemi, bold: fonts.bodyBold, heavy: fonts.bodyHeavy }[weight];
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: family, fontSize: size, lineHeight: size * 1.4, color: color ?? t.text }, style]}>
      {children}
    </Text>
  );
}

/** Small uppercase label. */
export function Label({ children, style, color }: TextProps) {
  const t = useTheme();
  return <Text style={[{ fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: color ?? t.textSecondary }, style]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  style,
  colors,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'quiet';
  /** Overrides for buttons sitting on a coloured card or a dark overlay. */
  colors?: { bg: string; fg: string };
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = colors?.bg ?? (variant === 'primary' ? t.accent : 'transparent');
  const fg = colors?.fg ?? (variant === 'primary' ? t.onAccent : variant === 'ghost' ? t.text : t.textSecondary);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: variant === 'quiet' ? space.sm : space.lg,
          paddingHorizontal: space.xl,
          alignItems: 'center',
          borderWidth: variant === 'ghost' ? 1.5 : 0,
          borderColor: fg,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Body weight="heavy" size={16} color={fg}>{label}</Body>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color, ink }: { label: string; active?: boolean; onPress?: () => void; color?: string; ink?: string }) {
  const t = useTheme();
  const bg = active ? (color ?? t.text) : 'transparent';
  const fg = active ? (ink ?? t.bg) : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={{ backgroundColor: bg, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1.5, borderColor: active ? bg : t.border }}
    >
      <Body weight="heavy" size={13} color={fg}>{label}</Body>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  multiline,
  autoFocus,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.bgRaised, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, gap: 4 }}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textFaint}
        multiline={multiline}
        autoFocus={autoFocus}
        style={{ fontFamily: fonts.bodyBold, fontSize: 17, color: t.text, paddingVertical: 4, minHeight: multiline ? 60 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
      />
      {hint ? <Body size={13} color={t.textSecondary}>{hint}</Body> : null}
    </View>
  );
}

/** A scrolling page on the table with the safe-area top inset and room for the tab bar. */
export function Page({ children, header, bottomInset = 120 }: PropsWithChildren<{ header?: ReactNode; bottomInset?: number }>) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: insets.bottom + bottomInset, gap: space.xl }}>
      {header}
      {children}
    </ScrollView>
  );
}

export function PageTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
      <View style={{ flex: 1, gap: 6 }}>
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <Display size={38}>{title}</Display>
      </View>
      {right}
    </View>
  );
}

export function Section({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Display size={22}>{title}</Display>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Centered({ children }: PropsWithChildren) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>{children}</View>;
}
