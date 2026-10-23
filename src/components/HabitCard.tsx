import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { SUIT_INFO } from '@/engine/cards';
import type { Point } from '@/engine/comeback';
import type { Level } from '@/engine/kept';
import { ownWhy } from '@/engine/playbook';
import { comebackCopy, grouped, identityLine, whenLine, type ComebackGap } from '@/engine/today';
import type { Habit } from '@/lib/types';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, chip, fontScale, fonts, INK, on, radius, space, TAP, type Theme } from '@/theme/tokens';

import { CardWear } from './CardWear';
import { SuitGlyph } from './Suit';
import { CardButton } from './SwipeCard';
import { Body, Label } from './ui';

/** The shadow and edge every card on the table wears, so even a pale card stands clear of its own felt. */
export function cardShadow(edge: string): ViewStyle {
  return { borderWidth: 1, borderColor: edge, boxShadow: '0 18px 36px rgba(23, 18, 31, 0.26), 0 3px 8px rgba(23, 18, 31, 0.12)' };
}

/** The colours that sit on a habit's card: its ink, a quieter ink that still reads, and a tint for tiles. */
function inksOf(habit: Habit) {
  const c = cardColors[habit.color];
  const o = on(c.bg);
  return { c, ink: c.ink, quiet: o.secondary, tile: withAlpha(INK, 0.1), edge: withAlpha(INK, 0.14) };
}

/** A big name or headline that shrinks to fit its lines instead of being cut off. Never grows past chrome size. */
function Fit({ children, size, color, lines = 2, style }: { children: ReactNode; size: number; color: string; lines?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      numberOfLines={lines}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      maxFontSizeMultiplier={fontScale.chrome}
      selectable={false}
      style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: Math.round(size * 1.06), letterSpacing: -size * 0.012, color }, style]}
    >
      {children}
    </Text>
  );
}

/** A tappable row on a card, or the same row as a picture when there is nothing to tap. */
function Press({ onPress, label, hint, style, children, testID }: { onPress?: () => void; label: string; hint?: string; style?: StyleProp<ViewStyle>; children: ReactNode; testID?: string }) {
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <CardButton onPress={onPress} label={label} hint={hint} style={style} testID={testID}>
      {children}
    </CardButton>
  );
}

/**
 * The card's ⋯, top right: opens the card's own page (its calendar, numbers, Edit and Rest). It takes 28
 * points of the row and reaches a full 44 for the finger. With no handler it is only a picture, so the
 * cards behind the front one keep the same shape.
 */
function OpenButton({ name, onOpen, dot, ring }: { name: string; onOpen?: () => void; dot: string; ring: string }) {
  return (
    <Press onPress={onOpen} label={`Open ${name}`} hint="Shows its calendar and numbers, and lets you edit it" testID="card-open" style={{ width: 44, height: 44, margin: -8, alignItems: 'center', justifyContent: 'center' }}>
      <View aria-hidden style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ring, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dot }} />
        ))}
      </View>
    </Press>
  );
}

/** A big round arrow: the way to swipe, drawn inside the button that does the same. */
function Arrow({ arrow, fg, bg, size = 48 }: { arrow: string; fg: string; bg: string; size?: number }) {
  return (
    <View aria-hidden style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text allowFontScaling={false} style={{ fontFamily: fonts.display, fontSize: Math.round(size * 0.52), lineHeight: Math.round(size * 0.62), color: fg }}>
        {arrow}
      </Text>
    </View>
  );
}

/**
 * "♣ MIND · YOU'RE A READER": the part of you this card deals for, and who it says you are, on up to two
 * lines so a longer identity is read whole. `end` sits at the far end of the row (the card's ⋯).
 */
function Identity({ habit, color, end }: { habit: Habit; color: string; end?: ReactNode }) {
  const who = identityLine(habit.identity);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <SuitGlyph suit={habit.suit} size={14} color={color} />
      <Label color={color} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ flex: 1 }}>
        {`${SUIT_INFO[habit.suit].part}${who ? ` · ${who.replace(/\.$/, '')}` : ''}`}
      </Label>
      {end}
    </View>
  );
}

/** A headline's size from its length, so a long identity still fits its lines without being cut. */
function headSize(text: string, big: number): number {
  const n = text.length;
  return n > 34 ? Math.round(big * 0.68) : n > 24 ? Math.round(big * 0.82) : big;
}

function nameSize(name: string, compact: boolean): number {
  const n = name.trim().length;
  if (compact) return n > 14 ? 30 : n > 9 ? 36 : 42;
  return n > 14 ? 42 : n > 9 ? 50 : 60;
}

/**
 * The face of a habit card: the Ceiling on top, the name in the middle, the Floor at the bottom, the way
 * the card swipes. Both ways are buttons too, so a tap does what a swipe does. `compact` folds both into
 * one row at the bottom, for short screens. With no handlers it is a picture, as in the edit preview and
 * the cards waiting behind the front one. `onOpen` adds the ⋯ that opens the card's page (`null` draws
 * it as a picture, for the cards behind the front one).
 */
export function HabitCard({
  habit,
  level,
  kept = 0,
  wearDepth = 0,
  subtitle,
  tag,
  compact = false,
  onFloor,
  onCeiling,
  onOpen,
  style,
}: {
  habit: Habit;
  level?: Level | null;
  /** Kept days on this card so far, for its wear. */
  kept?: number;
  /** Where the card sits in the deck (0 is the front), so cards further back draw lighter wear. */
  wearDepth?: number;
  subtitle?: string;
  /** A small note on the card, such as "Plays tonight". */
  tag?: string | null;
  compact?: boolean;
  onFloor?: () => void;
  onCeiling?: () => void;
  onOpen?: (() => void) | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, ink, quiet, tile, edge } = inksOf(habit);
  const when = whenLine(habit.anchor, habit.whenWhere, tag ?? null);
  const floorKept = level === 'floor';
  const ceilingLabel = `Reach the Ceiling: ${habit.ceilingLabel}`;
  const floorLabel = `Keep the Floor: ${habit.floorLabel}`;

  const watermark = (
    <View pointerEvents="none" aria-hidden style={{ position: 'absolute', right: -30, bottom: compact ? -46 : -34, opacity: 0.09, transform: [{ rotate: '-12deg' }] }}>
      <SuitGlyph suit={habit.suit} size={compact ? 180 : 250} color={ink} />
    </View>
  );
  const wear = <CardWear habitId={habit.id} kept={kept} depth={wearDepth} />;

  const middle = (
    <View style={{ gap: compact ? 4 : space.sm }}>
      <Identity habit={habit} color={quiet} end={onOpen !== undefined ? <OpenButton name={habit.name} onOpen={onOpen ?? undefined} dot={ink} ring={tile} /> : null} />
      <Fit size={nameSize(habit.name, compact)} color={ink}>
        {habit.name}
      </Fit>
      {subtitle ? (
        <Body weight="bold" size={15} color={ink} maxFontSizeMultiplier={fontScale.chrome}>
          {subtitle}
        </Body>
      ) : null}
      {tag || when ? (
        // "Plays tonight" then "after getting into bed": the tag and the anchor read as one phrase.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
          {tag ? (
            <View style={{ borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 10, backgroundColor: ink }}>
              <Body size={12} weight="heavy" color={c.bg} maxFontSizeMultiplier={fontScale.chrome}>
                {tag}
              </Body>
            </View>
          ) : null}
          {when ? (
            <Body size={14} weight="semi" color={quiet} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} style={{ flexShrink: 1 }}>
              {when}
            </Body>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const floorDone = (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: ink, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14, maxWidth: '100%' }}>
      <Body weight="heavy" size={14} color={c.bg} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} style={{ flexShrink: 1 }}>
        {`✓ Floor kept · ${habit.floorLabel}`}
      </Body>
    </View>
  );

  if (compact) {
    const half = (arrow: string, word: string, value: string, label: string, onPress?: () => void, testID?: string) => (
      <Press
        onPress={onPress}
        label={label}
        testID={testID}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: tile, borderRadius: radius.lg, padding: 6, paddingRight: space.sm }}
      >
        <Arrow arrow={arrow} fg={c.bg} bg={ink} size={40} />
        <View style={{ flex: 1 }}>
          <Label color={quiet} maxFontSizeMultiplier={fontScale.chrome}>
            {word}
          </Label>
          <Body weight="heavy" size={14} color={ink} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 18 }}>
            {value}
          </Body>
        </View>
      </Press>
    );
    return (
      <View style={[{ flex: 1, backgroundColor: c.bg, borderRadius: radius.card, padding: space.lg, paddingTop: space.xl, justifyContent: 'space-between', overflow: 'hidden', ...cardShadow(edge) }, style]}>
        {watermark}
        {wear}
        {middle}
        {floorKept ? (
          <View style={{ gap: space.sm }}>
            {floorDone}
            <View style={{ flexDirection: 'row' }}>{half('↑', 'Ceiling', habit.ceilingLabel, ceilingLabel, onCeiling, 'card-ceiling')}</View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {half('↓', 'Floor', habit.floorLabel, floorLabel, onFloor, 'card-floor')}
            {half('↑', 'Ceiling', habit.ceilingLabel, ceilingLabel, onCeiling, 'card-ceiling')}
          </View>
        )}
      </View>
    );
  }

  const row = (arrow: string, word: string, value: string, label: string, onPress?: () => void, testID?: string) => (
    <Press
      onPress={onPress}
      label={label}
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: tile, borderRadius: radius.pill, padding: 7, paddingRight: space.lg }}
    >
      <Arrow arrow={arrow} fg={c.bg} bg={ink} />
      <View style={{ flex: 1 }}>
        <Label color={quiet} maxFontSizeMultiplier={fontScale.chrome}>
          {word}
        </Label>
        <Body weight="heavy" size={17} color={ink} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 22 }}>
          {value}
        </Body>
      </View>
    </Press>
  );

  return (
    <View style={[{ flex: 1, backgroundColor: c.bg, borderRadius: radius.card, padding: space.lg, justifyContent: 'space-between', gap: space.md, overflow: 'hidden', ...cardShadow(edge) }, style]}>
      {watermark}
      {wear}
      {row('↑', floorKept ? 'Still in reach · Ceiling' : 'Ceiling', habit.ceilingLabel, ceilingLabel, onCeiling, 'card-ceiling')}
      <View style={{ paddingHorizontal: space.sm }}>{middle}</View>
      {floorKept ? <View style={{ paddingHorizontal: space.sm }}>{floorDone}</View> : row('↓', 'Floor', habit.floorLabel, floorLabel, onFloor, 'card-floor')}
    </View>
  );
}

/** The dark side of a card, raised off the table, with its lit edge. */
function darkCard(t: Theme): ViewStyle {
  return {
    flex: 1,
    backgroundColor: t.raised,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: t.scheme === 'light' ? withAlpha(INK, 0.4) : t.edge,
    overflow: 'hidden',
    boxShadow: `inset 0 1px 0 ${t.highlight}, 0 18px 36px rgba(10, 8, 14, 0.32)`,
  };
}

/**
 * The card's other side, the day after a miss: an easier way back in. It leads with who the player is
 * becoming and the kept days that prove it, then offers the first move, which keeps today on its own.
 * Nothing on it keeps a day by accident: only Done it, the Floor and Ceiling buttons, or a swipe.
 * `compact` keeps only the first move, Done it and the Floor (with a small Ceiling arrow); logging
 * yesterday stays on the card only when the screen passes `onLogYesterday`, and is always on the week strip.
 * The why is the player's own line only (`ownWhy`), the same rule as the habit's page and its editor.
 */
export function ComebackCard({
  habit,
  kept,
  wearDepth = 0,
  gap,
  saving,
  compact = false,
  lean = false,
  tight = false,
  tiny = false,
  roomy = false,
  onFirstMove,
  onFloor,
  onCeiling,
  onLogYesterday,
  onOpen,
  style,
}: {
  habit: Habit;
  /** Kept days on this card so far. */
  kept: number;
  /** Where the card sits in the deck (0 is the front), so cards further back draw lighter wear. */
  wearDepth?: number;
  gap: ComebackGap;
  /** Keeping anything today also saves yesterday's card. */
  saving?: boolean;
  compact?: boolean;
  /** Folded with a little less room: the evidence line stays, the why goes. */
  lean?: boolean;
  /** Folded on a short screen too: no room even for the evidence line. */
  tight?: boolean;
  /** Shorter still: the first move drops its label line, so the headline above it stays whole. */
  tiny?: boolean;
  /** Folded, but with room to spare: the words get it (a bigger headline, "Yesterday got away", more of the why). */
  roomy?: boolean;
  /** Your plan for this card, as one line ("Too tired? Put on your shoes."). Stream 2 shows it in place of the First move. */
  plan?: string | null;
  /** Done it. `at` is the button's centre in window coordinates, where the turnover's light starts. */
  onFirstMove?: (at?: Point) => void;
  onFloor?: () => void;
  onCeiling?: () => void;
  /** Yesterday can still be logged, for "Did it, forgot to log". Left out where there's no room; the week strip has it too. */
  onLogYesterday?: () => void;
  /** The ⋯ that opens the card's page; `null` draws it as a picture. */
  onOpen?: (() => void) | null;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const c = cardColors[habit.color];
  const copy = comebackCopy({ name: habit.name, identity: habit.identity, kept, gap });
  const firstMove = habit.twoMinuteLabel?.trim() || null;
  const ink = t.onRaised;
  const quiet = t.onRaisedSecondary;
  const accent = c.onDark;
  const line = withAlpha(t.onRaised, 0.22);
  const why = ownWhy(habit);

  const doneIt = (
    <Press
      onPress={firstMove ? onFirstMove : onFloor}
      label={firstMove ? `Done it: ${firstMove}. Keeps today.` : `Keep the Floor: ${habit.floorLabel}`}
      testID="comeback-done"
      style={{ flex: firstMove ? undefined : 1, minHeight: 48, borderRadius: radius.pill, backgroundColor: accent, paddingVertical: space.md, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
    >
      <Body weight="heavy" size={16} color={INK} maxFontSizeMultiplier={fontScale.chrome} numberOfLines={1}>
        {firstMove ? 'Done it' : '↓ Keep the Floor'}
      </Body>
    </Press>
  );

  const floorButton = (
    <Press
      onPress={onFloor}
      label={`Keep the Floor: ${habit.floorLabel}`}
      testID="comeback-floor"
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, borderRadius: radius.pill, borderWidth: 1.5, borderColor: line, paddingVertical: 5, paddingLeft: 5, paddingRight: space.md }}
    >
      <Arrow arrow="↓" fg={INK} bg={accent} size={36} />
      <View style={{ flex: 1 }}>
        <Label color={quiet} maxFontSizeMultiplier={fontScale.chrome}>
          Floor
        </Label>
        <Body weight="heavy" size={14} color={ink} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 18 }}>
          {habit.floorLabel}
        </Body>
      </View>
    </Press>
  );

  /** The Ceiling, as a round arrow beside the Floor: still a full way in, never the loudest. */
  const ceilingButton = (
    <Press
      onPress={onCeiling}
      label={`Reach the Ceiling: ${habit.ceilingLabel}`}
      testID="comeback-ceiling"
      style={{ alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48, borderRadius: radius.pill, borderWidth: 1.5, borderColor: line, padding: 5 }}
    >
      <Arrow arrow="↑" fg={INK} bg={withAlpha(accent, 0.85)} size={36} />
    </Press>
  );

  const yesterday = onLogYesterday ? (
    <Press onPress={onLogYesterday} label="Did it yesterday, forgot to log" testID="comeback-yesterday" style={{ alignSelf: 'center', justifyContent: 'center', paddingHorizontal: space.md, minHeight: TAP }}>
      <Body weight="heavy" size={14} color={ink} maxFontSizeMultiplier={fontScale.chrome} style={{ textDecorationLine: 'underline', textDecorationColor: line }}>
        ↺ Did it, forgot to log
      </Body>
    </Press>
  ) : null;

  const eyebrow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <SuitGlyph suit={habit.suit} size={14} color={accent} />
      <Label color={quiet} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} style={{ flex: 1 }}>
        {`Comeback · ${habit.name}`}
      </Label>
      {onOpen !== undefined ? <OpenButton name={habit.name} onOpen={onOpen ?? undefined} dot={ink} ring={withAlpha(t.onRaised, 0.12)} /> : null}
    </View>
  );

  /** The hero of the card: the first move, with Done it beside it. */
  const move = (big: boolean) => (
    <View
      style={{
        gap: big ? space.sm : 6,
        backgroundColor: withAlpha(accent, 0.12),
        borderRadius: radius.lg,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: withAlpha(accent, 0.7),
        padding: big ? space.md : space.sm,
        paddingLeft: big ? space.lg : space.md,
      }}
    >
      {tiny ? null : (
        <Label color={accent} maxFontSizeMultiplier={fontScale.chrome}>
          {firstMove ? 'First move · counts today' : 'The way back in'}
        </Label>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Fit size={big ? 24 : 19} color={ink} lines={big && !compact ? 3 : 2} style={{ flex: 1 }}>
          {firstMove ?? habit.floorLabel}
        </Fit>
        {firstMove ? doneIt : null}
      </View>
    </View>
  );

  const watermark = (
    <View pointerEvents="none" aria-hidden style={{ position: 'absolute', right: -40, top: compact ? 30 : 60, opacity: 0.1, transform: [{ rotate: '14deg' }] }}>
      <SuitGlyph suit={habit.suit} size={compact ? 200 : 260} color={accent} />
    </View>
  );
  const wear = <CardWear habitId={habit.id} kept={kept} depth={wearDepth} dark />;

  if (compact) {
    // Folded: who you are, the first move and Done it, then the Floor. Yesterday is logged from the week strip.
    // With room to spare the words get it: "Yesterday got away", a bigger headline, more of the why. There is
    // room to spare on a roomy card, or when nothing sits under the evidence line (no why of the person's own,
    // no line about saving yesterday). Whatever is still left over sits evenly above and below the words,
    // never as one gap over the way in.
    const spare = !lean && !tight && (roomy || (!why && !saving));
    // The bigger headline only on a roomy card: at 38 a headline that fit one line at 34 can take two.
    const bigHead = roomy && !lean && !tight;
    return (
      <View style={[darkCard(t), { padding: 14, paddingHorizontal: space.lg, gap: space.sm }, style]}>
        {tight ? null : watermark}
        {wear}
        {/* If a long name ever needs more room than the card has, these lines give way, never the way in below them. */}
        <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', gap: tight ? 2 : space.xs }}>
          {eyebrow}
          {tight ? null : <View style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }} />}
          <View style={{ flexShrink: 1, minHeight: 0, gap: tight ? 2 : space.xs }}>
            {spare ? (
              <Body size={14} weight="heavy" color={quiet} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome}>
                {`${copy.eyebrow}.`}
              </Body>
            ) : null}
            <Fit size={tight ? headSize(copy.headline, 24) : headSize(copy.headline, bigHead ? 38 : 34)} color={accent} lines={2}>
              {copy.headline}
            </Fit>
            {tight ? null : (
              <Body size={14} weight="bold" color={ink} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 19 }}>
                {/* Straight after who you are, so "say so" backs the headline; "One day off" already names the miss. */}
                {copy.evidence}
              </Body>
            )}
            {tight || lean ? null : saving ? (
              <Body size={13} weight="bold" color={quiet} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 17 }}>
                Keep it today and yesterday still gets its card.
              </Body>
            ) : why ? (
              <Body size={13} weight="semi" color={quiet} numberOfLines={bigHead ? 3 : 2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 17 }}>
                {`Why: ${why}`}
              </Body>
            ) : null}
          </View>
          {tight ? null : <View style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }} />}
        </View>
        {/* The way in stays together at the bottom, under the thumb. */}
        <View style={{ gap: space.sm }}>
          {move(!tight)}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {firstMove ? floorButton : doneIt}
            {ceilingButton}
          </View>
          {yesterday}
        </View>
      </View>
    );
  }

  return (
    <View style={[darkCard(t), { padding: space.xl, paddingTop: space.lg, paddingBottom: space.lg, justifyContent: 'space-between', gap: space.md }, style]}>
      {watermark}
      {wear}
      <View style={{ gap: space.sm, flexShrink: 1, minHeight: 0, overflow: 'hidden' }}>
        {eyebrow}
        <Body size={14} weight="heavy" color={quiet} maxFontSizeMultiplier={fontScale.chrome}>
          {`${copy.eyebrow}.`}
        </Body>
        <Fit size={headSize(copy.headline, 40)} color={accent} lines={2}>
          {copy.headline}
        </Fit>
        <Body size={15} weight="bold" color={ink} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 20 }}>
          {copy.evidence}
        </Body>
        {saving ? (
          <Body size={13} weight="bold" color={quiet} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 18 }}>
            Keep it today and yesterday still gets its card.
          </Body>
        ) : why ? (
          <Body size={13} weight="semi" color={quiet} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 18 }}>
            {`Why: ${why}`}
          </Body>
        ) : null}
      </View>
      <View style={{ gap: space.sm }}>
        {move(true)}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {firstMove ? floorButton : doneIt}
          {ceilingButton}
        </View>
        {yesterday}
      </View>
    </View>
  );
}

/**
 * The card in front of the deck after a few days away. It checks nothing in: any swipe, or its button,
 * just opens the deck. It says what is still here, never how long the player was gone.
 */
export function WelcomeCard({ kept, faces, chips: stack, compact = false, onOpen }: { kept: number; faces: number; chips: number; compact?: boolean; onOpen?: () => void }) {
  const t = useTheme();
  const ink = t.onRaised;
  const quiet = t.onRaisedSecondary;
  const stats: { n: string; what: string; color: string }[] = [
    { n: grouped(kept), what: kept === 1 ? 'kept day' : 'kept days', color: ink },
    { n: grouped(faces), what: faces === 1 ? 'face card' : 'face cards', color: ink },
    { n: grouped(stack), what: 'chips', color: chip.bg },
  ];
  return (
    <View style={[darkCard(t), { padding: compact ? space.lg : space.xl, justifyContent: 'space-between', gap: space.md }]}>
      <View style={{ gap: space.sm }}>
        <Label color={quiet} maxFontSizeMultiplier={fontScale.chrome}>
          Welcome back
        </Label>
        <Fit size={compact ? 28 : 38} color={ink} lines={compact ? 2 : 3}>
          Everything you built is still here.
        </Fit>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {stats.map((s) => (
          <View key={s.what} style={{ flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: withAlpha(ink, 0.18), paddingVertical: compact ? space.sm : space.md, paddingHorizontal: space.sm, gap: 2 }}>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.display, fontSize: compact ? 24 : 30, color: s.color }}>
              {s.n}
            </Text>
            <Body size={12} weight="heavy" color={quiet} maxFontSizeMultiplier={fontScale.chrome}>
              {s.what}
            </Body>
          </View>
        ))}
      </View>
      <View style={{ gap: space.md }}>
        {/* "Nothing was lost." is the line under the deck, so it isn't said twice here. */}
        {compact ? null : (
          <Body size={15} weight="bold" color={ink} maxFontSizeMultiplier={fontScale.chrome}>
            Pick one card to start with; the rest can wait.
          </Body>
        )}
        {onOpen ? (
          <Press onPress={onOpen} label="Show my cards" testID="welcome-open" style={{ minHeight: 48, borderRadius: radius.pill, backgroundColor: ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl }}>
            <Body weight="heavy" size={16} color={t.raised} maxFontSizeMultiplier={fontScale.chrome}>
              Show my cards
            </Body>
          </Press>
        ) : null}
      </View>
    </View>
  );
}

