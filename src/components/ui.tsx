import { useScrollToTop } from 'expo-router';
import { isValidElement, useId, useState, type PropsWithChildren, type ReactNode, type Ref, type RefObject } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollView,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedRef, useAnimatedStyle, useScrollOffset } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import * as feel from '@/lib/feel';
import { useTheme } from '@/theme/ThemeProvider';
import { DISPLAY_SEMI_AT, edgeBorder, fontScale, fonts, radius, space, TAP, typeScale, type Theme } from '@/theme/tokens';

type TextProps = PropsWithChildren<{
  style?: StyleProp<TextStyle>;
  size?: number;
  color?: string;
  numberOfLines?: number;
  /**
   * How far this text may grow with the phone's text size. Defaults suit a scrolling page; pass
   * `fontScale.chrome` for fixed chrome such as pills and bars.
   */
  maxFontSizeMultiplier?: number;
  /** Text can't be selected unless asked for, so a long press or a drag never highlights a label. */
  selectable?: boolean;
  /** Read out as a heading, so VoiceOver users can jump between sections. */
  header?: boolean;
  /** Hidden from screen readers, for a visible copy of something read out elsewhere. */
  'aria-hidden'?: boolean;
}>;

/**
 * How far a Display size may grow. Big type is already big: a 44 pt title at double size would not fit
 * a phone, so the larger the size, the less it grows.
 */
function displayGrowth(size: number): number {
  if (size >= typeScale.display.xl) return fontScale.chrome;
  if (size >= typeScale.display.md) return 1.6;
  return fontScale.page;
}

/** Fredoka: names, numbers and headings. 600 weight at 20 pt and under, where 700 clots. */
export function Display({ children, style, size = 28, color, numberOfLines, maxFontSizeMultiplier, selectable = false, header, 'aria-hidden': hidden }: TextProps) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? displayGrowth(size)}
      selectable={selectable}
      accessibilityRole={header ? 'header' : undefined}
      aria-hidden={hidden}
      style={[
        {
          fontFamily: size <= DISPLAY_SEMI_AT ? fonts.displaySemi : fonts.display,
          fontSize: size,
          lineHeight: Math.round(size * 1.08),
          letterSpacing: -size * 0.01,
          color: color ?? t.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Nunito: everything you read. */
export function Body({
  children,
  style,
  size = 16,
  color,
  numberOfLines,
  weight = 'medium',
  maxFontSizeMultiplier = fontScale.page,
  selectable = false,
  header,
  'aria-hidden': hidden,
}: TextProps & { weight?: 'medium' | 'semi' | 'bold' | 'heavy' }) {
  const t = useTheme();
  const family = { medium: fonts.body, semi: fonts.bodySemi, bold: fonts.bodyBold, heavy: fonts.bodyHeavy }[weight];
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      selectable={selectable}
      accessibilityRole={header ? 'header' : undefined}
      aria-hidden={hidden}
      style={[{ fontFamily: family, fontSize: size, lineHeight: Math.round(size * 1.4), color: color ?? t.text }, style]}
    >
      {children}
    </Text>
  );
}

/** Small uppercase label. */
export function Label({ children, style, color, numberOfLines, maxFontSizeMultiplier = fontScale.page, selectable = false, header, 'aria-hidden': hidden }: TextProps) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      selectable={selectable}
      accessibilityRole={header ? 'header' : undefined}
      aria-hidden={hidden}
      style={[{ fontFamily: fonts.bodyHeavy, fontSize: typeScale.label, letterSpacing: 1.2, textTransform: 'uppercase', color: color ?? t.textSecondary }, style]}
    >
      {children}
    </Text>
  );
}

/**
 * A button. Primary is a solid pill in the table's text colour: gold and the accent colour are kept
 * for chips and winnings, so a button never looks like money.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  style,
  colors,
  icon,
  hint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'quiet';
  /** Overrides for buttons sitting on a coloured card or a dark overlay. */
  colors?: { bg: string; fg: string };
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Drawn before the label, in the label's colour. */
  icon?: ReactNode;
  /** What happens when you press it, read out after the label when it isn't obvious. */
  hint?: string;
}) {
  const t = useTheme();
  const bg = colors?.bg ?? (variant === 'primary' ? t.text : 'transparent');
  const fg = colors?.fg ?? (variant === 'primary' ? t.bg : variant === 'ghost' ? t.text : t.textSecondary);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: TAP,
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: variant === 'quiet' ? space.sm : space.lg,
          paddingHorizontal: space.xl,
          flexDirection: 'row',
          gap: space.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: variant === 'ghost' ? 1.5 : 0,
          borderColor: fg,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Body weight="heavy" size={16} color={fg} maxFontSizeMultiplier={fontScale.chrome} style={{ textAlign: 'center', flexShrink: 1 }}>
            {label}
          </Body>
        </>
      )}
    </Pressable>
  );
}

/** A choice in a row of choices. At least 44 points tall, with an optional icon before the label. */
export function Chip({
  label,
  active,
  onPress,
  color,
  ink,
  icon,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  ink?: string;
  /** Drawn before the label. */
  icon?: ReactNode;
  /** Read out instead of the label, when the label leans on a symbol. */
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const bg = active ? (color ?? t.text) : 'transparent';
  const fg = active ? (ink ?? t.bg) : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TAP,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: space.lg,
        borderWidth: 1.5,
        borderColor: active ? bg : t.border,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {icon}
      <Body weight="heavy" size={typeScale.text.sm} color={fg} maxFontSizeMultiplier={fontScale.chrome}>
        {label}
      </Body>
    </Pressable>
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  /** Lets a form move focus on to the next field from its return key. */
  inputRef?: Ref<TextInput>;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'style' | 'ref'>;

/** How wide a field's focus ring is: always there, and clear until the field has focus, so nothing shifts. */
const FIELD_RING = 2;

/**
 * A labelled text field. The label and hint are given to the input itself, so a screen reader reads
 * "Name, text field, Small enough to do on your worst day" in one stop; the visible copies are hidden
 * from it. The keyboard matches the table, light or dark.
 */
export function Field({ label, hint, value, onChangeText, inputRef, multiline, onFocus, onBlur, ...input }: FieldProps) {
  const t = useTheme();
  // The field itself shows where typing goes: its rounded edge darkens while it has focus. The browser's own
  // square ring around the bare input inside it is turned off, so the two never disagree.
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        backgroundColor: t.bgRaised,
        borderRadius: radius.md,
        borderWidth: FIELD_RING,
        borderColor: focused ? t.text : 'transparent',
        paddingHorizontal: space.lg - FIELD_RING,
        paddingVertical: space.md - FIELD_RING,
        gap: 4,
      }}
    >
      <Label aria-hidden>{label}</Label>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={t.textFaint}
        keyboardAppearance={t.scheme}
        selectionColor={t.text}
        cursorColor={t.text}
        multiline={multiline}
        maxFontSizeMultiplier={fontScale.page}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: typeScale.text.lg,
          color: t.text,
          paddingVertical: 4,
          minHeight: multiline ? 60 : 32,
          textAlignVertical: multiline ? 'top' : 'center',
          outlineWidth: 0,
        }}
      />
      {hint ? (
        <Body aria-hidden size={typeScale.text.sm} color={t.textSecondary}>
          {hint}
        </Body>
      ) : null}
    </View>
  );
}

/** The raised surface of a panel on the table: a lit edge and a highlight along its top in the dark. */
export function raisedStyle(t: Theme): ViewStyle {
  return {
    backgroundColor: t.raised,
    ...edgeBorder(t),
    boxShadow: `inset 0 1px 0 ${t.highlight}`,
  };
}

/**
 * A panel raised off the table: the North Star, the Comeback, the Playbook's tips. Text on it uses
 * `t.onRaised`, and `t.onRaisedSecondary` for quieter lines (never `onRaised` faded with opacity).
 */
export function Raised({ style, children, ...rest }: PropsWithChildren<ViewProps & { style?: StyleProp<ViewStyle> }>) {
  const t = useTheme();
  return (
    <View {...rest} style={[{ borderRadius: radius.lg }, raisedStyle(t), style]}>
      {children}
    </View>
  );
}

const FELT = require('@/assets/felt.png');

/** An id safe to use inside an SVG `url(#...)`. */
function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * The table itself, behind a page: a fine grain like felt or leather and a soft vignette at the edges.
 * The kitchen table is plain. Fills its parent; draw it first.
 */
export function TableSurface({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const id = useSvgId('vignette');
  if (!t.felt && !t.vignette) return null;
  return (
    <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, style]}>
      {t.felt ? <Image source={FELT} resizeMode="repeat" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: t.felt }]} /> : null}
      {t.vignette ? (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="38%" rx="80%" ry="70%" fx="50%" fy="38%">
              <Stop offset="0.45" stopColor="#000000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={t.vignette} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Fades the page into the table under the floating tab bar, so rows slide away under it instead of being cut. */
function BottomFade({ height }: { height: number }) {
  const t = useTheme();
  const id = useSvgId('fade');
  return (
    <View pointerEvents="none" aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.bg} stopOpacity={0} />
            <Stop offset="0.6" stopColor={t.bg} stopOpacity={0.85} />
            <Stop offset="1" stopColor={t.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

type PageProps = PropsWithChildren<{
  /** A custom heading. A `<PageTitle>` here also names the compact bar. */
  header?: ReactNode;
  /** The page's large title, drawn as a `<PageTitle>` when there's no `header`. */
  title?: string;
  eyebrow?: string;
  right?: ReactNode;
  /** Room left at the bottom for the floating tab bar. Zero for a page with no tab bar. */
  bottomInset?: number;
  /** Pull down to refresh. The spinner shows until the promise settles. */
  onRefresh?: () => unknown;
}>;

const COMPACT_BAR = 44;

function titleOf(header: ReactNode): string | undefined {
  if (isValidElement<{ title?: unknown }>(header) && header.type === PageTitle && typeof header.props.title === 'string') return header.props.title;
  return undefined;
}

/**
 * A scrolling page on the table. Its large title scrolls away and a compact bar with the same title
 * fades in under the status bar. Tapping the current tab again scrolls back to the top. Taps on
 * buttons work while the keyboard is up, and dragging the page down puts the keyboard away.
 */
export function Page({ children, header, title, eyebrow, right, bottomInset = 120, onRefresh }: PageProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(scrollRef);
  useScrollToTop(scrollRef as unknown as RefObject<ScrollView>);
  const [refreshing, setRefreshing] = useState(false);

  const compactTitle = title ?? titleOf(header);
  const head = header ?? (title ? <PageTitle eyebrow={eyebrow} title={title} right={right} /> : null);

  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [36, 72], [0, 1], Extrapolation.CLAMP),
  }));

  async function refresh() {
    if (!onRefresh) return;
    feel.tick();
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <TableSurface />
      <Animated.ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.text} colors={[t.text]} progressBackgroundColor={t.bgRaised} progressViewOffset={insets.top} />
          ) : undefined
        }
        contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: insets.bottom + bottomInset, gap: space.xl }}
      >
        {head}
        {children}
      </Animated.ScrollView>
      {bottomInset > 0 ? <BottomFade height={insets.bottom + Math.min(bottomInset, 96)} /> : null}
      <Animated.View
        pointerEvents="none"
        aria-hidden
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + COMPACT_BAR,
            paddingTop: insets.top,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.bg,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: t.border,
          },
          barStyle,
        ]}
      >
        {compactTitle ? (
          <Body weight="heavy" size={typeScale.text.lg} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} style={{ paddingHorizontal: space.xxxl }}>
            {compactTitle}
          </Body>
        ) : null}
      </Animated.View>
    </View>
  );
}

export function PageTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
      <View style={{ flex: 1, gap: 6 }}>
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <Display size={typeScale.display.lg} header>
          {title}
        </Display>
      </View>
      {right}
    </View>
  );
}

/** A small round "i" that explains the section it sits beside. */
function InfoButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`About ${label}`}
      onPress={onPress}
      hitSlop={(TAP - 24) / 2}
      style={({ pressed }) => ({ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: t.textSecondary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Body weight="heavy" size={13} color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic} style={{ lineHeight: 16 }}>
        i
      </Body>
    </Pressable>
  );
}

export function Section({ title, action, onInfo, children }: PropsWithChildren<{ title: string; action?: ReactNode; onInfo?: () => void }>) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
          <Display size={typeScale.display.md} header style={{ flexShrink: 1 }}>
            {title}
          </Display>
          {onInfo ? <InfoButton label={title} onPress={onInfo} /> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Centered({ children }: PropsWithChildren) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>{children}</View>;
}
