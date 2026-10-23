import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ask } from '@/components/Ask';
import { CardPicture } from '@/components/CardOut';
import { Arrow, PileLegend, pileColors, WeeksGrid } from '@/components/Pile';
import { CARD_SIZES, faceOfCourt, faceOfDay, PlayingCard } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Centered, Display, Label, raisedStyle, Section } from '@/components/ui';
import { cardName, SUIT_INFO } from '@/engine/cards';
import { planLine } from '@/engine/comeback';
import { cleanIdentity, type CourtSuit } from '@/engine/court';
import { addDays, canBackfill, daysBetween, weekStart, type Day } from '@/engine/day';
import type { Slot } from '@/engine/deal';
import { best30, calendarWeeks, keptBetween, MASTERY, type CalendarDay, type Level } from '@/engine/kept';
import { ownWhy, playsLine, PRINCIPLES, recipeFor, type EditField } from '@/engine/playbook';
import { GRIP_NOTE, wearLine, wearOf, type WearStage } from '@/engine/wear';
import { useData } from '@/lib/data';
import { useDeck, useKeep, type HabitView } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { monthDay, shortDay } from '@/lib/format';
import { usePlans } from '@/lib/plans';
import { playSound } from '@/lib/sound';
import { useTheme } from '@/theme/ThemeProvider';
import { mix, withAlpha } from '@/theme/color';
import { cardColors, fontScale, INK, radius, space, TAP, typeScale, WHITE } from '@/theme/tokens';

/** One card, turned over: keep it from here, see what it has added up to, and why you keep it. */
export default function HabitDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const deck = useDeck();
  const { undoCheckIn, refresh } = useData();
  const keepCard = useKeep();
  const plans = usePlans();
  const [refreshing, setRefreshing] = useState(false);
  const view = deck?.cards.find((c) => c.habit.id === id);

  if (!deck || !view) {
    return (
      <Centered>
        <Display size={typeScale.display.md} style={{ textAlign: 'center' }}>
          This card has left the deck.
        </Display>
        <Body color={t.textSecondary} style={{ textAlign: 'center' }}>
          Every day you kept it still counts.
        </Body>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Centered>
    );
  }

  const { habit, checkIns } = view;
  const today = deck.today;
  const c = cardColors[habit.color];
  const fill = pileColors(t, habit.color);
  const yesterday = addDays(today, -1);
  const edit = (focus?: EditField) => router.push({ pathname: '/habit/edit', params: focus ? { id: habit.id, focus } : { id: habit.id } });
  const fail = (e: unknown) => ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');

  /** The same keep as Today's, so a Comeback waiting on this card is answered here too. */
  const keep = (level: Level, day?: Day) => {
    if (level === 'ceiling') feel.ceiling();
    else feel.floor();
    playSound(level);
    keepCard(view, level, { day }).catch(fail);
  };

  function undo() {
    feel.tick();
    undoCheckIn(habit.id).catch(fail);
  }

  function logLate(day: Day) {
    feel.tick();
    ask('Did it, forgot to log?', `${shortDay(day)} can be logged until midnight tonight. It counts like any kept day.`, [
      { text: `Floor: ${habit.floorLabel}`, onPress: () => keep('floor', day) },
      { text: `Ceiling: ${habit.ceilingLabel}`, onPress: () => keep('ceiling', day) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pull() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const late = canBackfill(yesterday, today, habit, checkIns);
  const quarter = calendarWeeks(today, { weeks: 12 }, habit.startedOn, checkIns);
  // Counted from the grid itself, so the number always matches the squares under it.
  const quarterKept = gridCount(quarter);
  const age = daysBetween(habit.startedOn, today) + 1;
  const best = age >= 30 ? best30(habit.startedOn, today, checkIns) : null;
  const identity = cleanIdentity(habit.identity);
  const why = ownWhy(habit);
  const when = [habit.anchor?.trim(), habit.whenWhere?.trim()].filter(Boolean).join(' · ');
  const recipe = recipeFor(habit.recipeKey);
  const principle = recipe ? PRINCIPLES[recipe.principle] : null;
  const court = deck.court.find((s) => s.suit === habit.suit);
  const plan = plans[habit.id] ?? null;
  // This week's cards that this card helped deal: the days it was kept.
  const dealt = deck.game.current.slots.filter((s) => s.card && checkIns.has(s.day));
  const darkInk = c.ink === WHITE;
  // Ink on the pale tint of the card's colour; on a dark table, a dim wash of it so it doesn't glare.
  const idea = t.scheme === 'dark' ? { bg: mix(t.bg, c.onDark, 0.2), ink: t.text } : { bg: c.soft, ink: INK };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={darkInk ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl, gap: space.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={c.ink} colors={[INK]} progressViewOffset={insets.top} />}
      >
        {/* The card's colour runs on above the top, so pulling down never shows a seam. */}
        <View aria-hidden style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: c.bg }} />
        <Header view={view} insets={insets.top} onBack={() => router.back()} onEdit={() => edit()} best={best} onKeep={keep} onUndo={undo} />

        <View style={{ paddingHorizontal: space.xl, gap: space.xxl }}>
          <Tally view={view} />

          <View style={{ gap: space.md }}>
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={`Twelve weeks: ${quarterKept.keptDays} kept, ${quarterKept.ceilingDays} at the Ceiling.`}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexShrink: 1 }}>
                <Display size={typeScale.display.sm}>Twelve weeks</Display>
                <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary}>
                  {`${quarterKept.keptDays} kept`}
                </Body>
              </View>
              <PileLegend color={habit.color} />
            </View>
            <WeeksGrid
              weeks={quarter}
              color={habit.color}
              today={today}
              label={`The last twelve weeks: ${quarterKept.keptDays} days kept, ${quarterKept.ceilingDays} at the Ceiling, ${keptBetween(checkIns, weekStart(today), today)} this week.`}
            />
            {late ? <LateLog day={yesterday} onPress={() => logLate(yesterday)} /> : null}
          </View>

          <WeekCards view={view} slots={dealt} />

          <PartOfYou view={view} age={age} onRaise={() => edit('ceilingLabel')} />

          <WornIn view={view} />

          {court ? <CourtLine view={view} court={court} /> : null}

          <Section title="Why and when">
            {why ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Why it matters: ${why}`} accessibilityHint="Opens the card to change it" onPress={() => edit('why')}>
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <View style={{ width: 4, borderRadius: 2, backgroundColor: fill.ceiling.bg }} />
                  <Display size={typeScale.display.md} style={{ flex: 1, lineHeight: 31 }}>{`“${why}”`}</Display>
                </View>
              </Pressable>
            ) : (
              <Prompt title="Why does this one matter to you?" body="Tap to add a line. On a hard day, it’s what the card says back." onPress={() => edit('why')} />
            )}
            <View style={[{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: t.bgRaised }]}>
              <Row label="I’m" value={identity} empty="Who does it make you? Add it" onPress={() => edit('identity')} />
              <Row label="When it plays" value={when ? playsLine(when) : null} empty="Tie it to a moment. Add it" onPress={() => edit('anchor')} />
              <Row label="First move" value={habit.twoMinuteLabel} empty="The smallest way to start. Add it" onPress={() => edit('twoMinuteLabel')} last={!plan} />
              {plan ? (
                <Row
                  label="Your plan"
                  value={planLine(plan, habit)}
                  empty=""
                  hint="Opens your plan for this card’s next Comeback"
                  onPress={() => router.push({ pathname: '/plan', params: { habit: habit.id } })}
                  last
                />
              ) : null}
            </View>
            <LeaveLink view={view} onPress={() => router.push({ pathname: '/leave', params: { habit: habit.id } })} />
          </Section>

          {principle ? (
            <View style={{ backgroundColor: idea.bg, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
              <Label color={idea.ink}>The idea behind this card</Label>
              <Display size={typeScale.display.sm} color={idea.ink}>
                {principle.title}
              </Display>
              <Body color={idea.ink}>{principle.idea}</Body>
            </View>
          ) : null}

          <Body size={typeScale.text.sm} color={t.textSecondary} style={{ textAlign: 'center' }}>{`In your deck since ${monthDay(habit.startedOn, today)}.`}</Body>
        </View>
      </ScrollView>
    </View>
  );
}

/** Kept and Ceiling days among the cells of a calendar. */
function gridCount(weeks: CalendarDay[][]): { keptDays: number; ceilingDays: number } {
  let keptDays = 0;
  let ceilingDays = 0;
  for (const cell of weeks.flat()) {
    if (cell.status === 'floor' || cell.status === 'ceiling') keptDays++;
    if (cell.status === 'ceiling') ceilingDays++;
  }
  return { keptDays, ceilingDays };
}

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M15 5 L8 12 L15 19" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function Header({
  view,
  insets,
  best,
  onBack,
  onEdit,
  onKeep,
  onUndo,
}: {
  view: HabitView;
  insets: number;
  best: number | null;
  onBack: () => void;
  onEdit: () => void;
  onKeep: (level: Level) => void;
  onUndo: () => void;
}) {
  const { habit, window30, today: level } = view;
  const c = cardColors[habit.color];
  const identity = cleanIdentity(habit.identity);
  const suit = SUIT_INFO[habit.suit];
  const long = habit.name.length > 11;
  const since = window30.daysInWindow < 30;
  return (
    <View style={{ backgroundColor: c.bg, paddingTop: insets + space.sm, paddingHorizontal: space.xl, paddingBottom: space.xl, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, gap: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({ width: TAP, height: TAP, borderRadius: TAP / 2, borderWidth: 2, borderColor: c.ink, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Chevron color={c.ink} />
        </Pressable>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${habit.name}`}
          hitSlop={8}
          style={({ pressed }) => ({ minHeight: TAP, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 2, borderColor: c.ink, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Body weight="heavy" color={c.ink} maxFontSizeMultiplier={fontScale.chrome}>
            Edit card
          </Body>
        </Pressable>
      </View>

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SuitGlyph suit={habit.suit} size={15} color={c.ink} />
          <Label color={c.ink}>{suit.part}</Label>
          {view.mastered ? (
            <View style={{ marginLeft: space.sm, backgroundColor: c.ink, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Label color={c.bg}>Part of you</Label>
            </View>
          ) : null}
        </View>
        <Display size={long ? typeScale.display.xl : typeScale.display.hero} color={c.ink} header numberOfLines={3}>
          {habit.name}
        </Display>
        {identity ? (
          <Body weight="bold" size={typeScale.text.lg} color={c.ink}>
            {`I’m ${identity}.`}
          </Body>
        ) : null}
      </View>

      <View
        accessible
        accessibilityLabel={`${window30.keptDays} of the ${since ? `${window30.daysInWindow} days since you started` : 'last 30 days'} kept.${best !== null ? ` The most in any 30 days: ${best}.` : ''}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
      >
        <Display size={88} color={c.ink} maxFontSizeMultiplier={fontScale.graphic} style={{ lineHeight: 88, fontVariant: ['tabular-nums'] }}>
          {window30.keptDays}
        </Display>
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="heavy" size={typeScale.text.lg} color={c.ink} style={{ lineHeight: 21 }}>
            {since ? `of ${window30.daysInWindow} ${window30.daysInWindow === 1 ? 'day' : 'days'} since you started` : 'of the last 30 days kept'}
          </Body>
          {best !== null ? (
            <Body weight="semi" size={typeScale.text.sm} color={c.ink}>
              {`Most in any 30 days: ${best}`}
            </Body>
          ) : null}
        </View>
      </View>

      <KeepButtons view={view} level={level} onKeep={onKeep} onUndo={onUndo} />
    </View>
  );
}

/** Labels longer than this stack the two buttons, so each one reads in full across the card. */
const STACK_AT = 30;

/**
 * Floor and Ceiling, kept from here as well as from Today. Once kept, how it went and a way to take it
 * back. Every label is shown in full: a long one stacks the buttons, Ceiling on top like the swipe up.
 */
function KeepButtons({ view, level, onKeep, onUndo }: { view: HabitView; level: Level | null; onKeep: (level: Level) => void; onUndo: () => void }) {
  const { habit } = view;
  const c = cardColors[habit.color];
  const stacked = Math.max(habit.floorLabel.trim().length, habit.ceilingLabel.trim().length) > STACK_AT;
  const half = (kind: Level, title: string, value: string, done: boolean) => {
    const solid = kind === 'ceiling';
    const bg = solid ? c.ink : c.soft;
    const fg = solid ? c.bg : INK;
    const content = (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {done ? (
            <Body weight="heavy" size={typeScale.text.md} color={fg} maxFontSizeMultiplier={fontScale.chrome}>
              ✓
            </Body>
          ) : (
            <Arrow up={kind === 'ceiling'} color={fg} size={15} />
          )}
          <Label color={fg} maxFontSizeMultiplier={fontScale.chrome}>
            {title}
          </Label>
        </View>
        <Body weight="heavy" size={typeScale.text.md} color={fg} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 19 }}>
          {value}
        </Body>
      </>
    );
    const style = { flex: stacked ? undefined : 1, minHeight: stacked ? 64 : 84, borderRadius: 20, paddingHorizontal: space.lg, paddingVertical: space.md, gap: 4, backgroundColor: bg, justifyContent: 'center' as const };
    if (done) return <View style={style}>{content}</View>;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={kind === 'ceiling' ? `Reach the Ceiling: ${habit.ceilingLabel}` : `Keep the Floor: ${habit.floorLabel}`}
        onPress={() => onKeep(kind)}
        style={({ pressed }) => [style, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }, { rotate: pressed ? (kind === 'ceiling' ? '1deg' : '-1deg') : '0deg' }] }]}
      >
        {content}
      </Pressable>
    );
  };

  if (level === 'ceiling') {
    return (
      <View style={{ gap: space.sm }}>
        <View accessible accessibilityLabel={`Ceiling reached today: ${habit.ceilingLabel}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, borderRadius: 20, backgroundColor: c.ink, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          <Display size={typeScale.display.md} color={c.bg}>
            ✓
          </Display>
          <View style={{ flex: 1 }}>
            <Label color={c.bg}>Ceiling reached today</Label>
            <Body weight="heavy" size={typeScale.text.md} color={c.bg}>
              {habit.ceilingLabel}
            </Body>
          </View>
        </View>
        <UndoLink ink={c.ink} onPress={onUndo} />
      </View>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      {stacked ? (
        <View style={{ gap: space.sm }}>
          {half('ceiling', level === 'floor' ? 'Reach up' : 'Ceiling', habit.ceilingLabel, false)}
          {half('floor', level === 'floor' ? 'Floor kept' : 'Floor', habit.floorLabel, level === 'floor')}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {half('floor', level === 'floor' ? 'Floor kept' : 'Floor', habit.floorLabel, level === 'floor')}
          {half('ceiling', level === 'floor' ? 'Reach up' : 'Ceiling', habit.ceilingLabel, false)}
        </View>
      )}
      {level === 'floor' ? <UndoLink ink={c.ink} onPress={onUndo} /> : null}
    </View>
  );
}

function UndoLink({ ink, onPress }: { ink: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Undo today’s check-in" onPress={onPress} hitSlop={8} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Body weight="heavy" size={typeScale.text.sm} color={ink} style={{ textDecorationLine: 'underline' }}>
        Undo today
      </Body>
    </Pressable>
  );
}

/** What the card has added up to, in one sentence, marked the way its days are: Floor soft, Ceiling solid. Only what was kept. */
function Tally({ view }: { view: HabitView }) {
  const t = useTheme();
  const { habit, allTime } = view;
  const fill = pileColors(t, habit.color);
  const days = allTime.kept === 1 ? 'kept day' : 'kept days';
  // A thin space either side, so the marker sits round the number like a highlighter stroke.
  const mark = (n: number, ink: string, bg: string) => <Text style={{ color: ink, backgroundColor: bg, fontVariant: ['tabular-nums'] }}>{` ${n} `}</Text>;
  return (
    <View accessible accessibilityLabel={`${allTime.kept} ${days}, ${allTime.ceiling} at the Ceiling.`}>
      <Display size={typeScale.display.lg} style={{ lineHeight: typeScale.display.lg * 1.25 }}>
        {mark(allTime.kept, fill.floor.ink, fill.floor.bg)}
        {` ${days}, `}
        {mark(allTime.ceiling, fill.ceiling.ink, fill.ceiling.bg)}
        {' at the Ceiling.'}
      </Display>
    </View>
  );
}

/** Yesterday, not logged and still in reach: one tap to log it late. */
function LateLog({ day, onPress }: { day: Day; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Yesterday, ${shortDay(day)}, not logged. Did it? Log it late`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.md,
        minHeight: TAP,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: t.dashed,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Body weight="bold" size={typeScale.text.sm} color={t.textSecondary} style={{ flexShrink: 1 }}>
        {`Did it yesterday, ${shortDay(day)}?`}
      </Body>
      <Body weight="heavy" size={typeScale.text.sm}>
        Log it late
      </Body>
    </Pressable>
  );
}

const FAN = CARD_SIZES.md;
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
/** "Tue": short enough to sit under a card in the fan. The local calendar day at local midnight, as `@/lib/format` reads a day. */
const weekday = (day: Day) => {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAY.format(new Date(y, m - 1, d));
};
/** How far each card in the fan turns from the one before it. */
const FAN_TURN = 6;

/** The cards this card helped deal this week, held as a small fan, each with its day under it. */
function WeekCards({ view, slots }: { view: HabitView; slots: Slot[] }) {
  const t = useTheme();
  const { habit } = view;
  const [width, setWidth] = useState(0);
  const cards = slots.flatMap((s) => (s.card ? [{ day: s.day, face: faceOfDay(s.card, habit.suit) }] : []));
  const n = cards.length;
  const names = cards.map(({ day, face }) => `${shortDay(day)}, ${face.kind === 'joker' ? 'Joker' : cardName({ rank: face.rank, suit: face.suit })}`);
  const step = n > 1 ? Math.min(FAN.w * 0.8, (width - FAN.w - space.xl) / (n - 1)) : 0;
  const left = (width - (FAN.w + step * (n - 1))) / 2;
  const mid = (n - 1) / 2;
  return (
    <View style={{ gap: space.md }}>
      <Display size={typeScale.display.sm} header>
        This week’s cards
      </Display>
      {n ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`This week’s cards from ${habit.name}: ${names.join('; ')}.`}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{ height: FAN.h + 40 }}
        >
          {width
            ? cards.map(({ day, face }, i) => {
                const off = i - mid;
                return (
                  <View
                    key={day}
                    style={{ position: 'absolute', left: left + i * step, top: 6 + off * off * 2.2, alignItems: 'center', gap: 6, transform: [{ rotate: `${off * FAN_TURN}deg` }] }}
                  >
                    <PlayingCard face={face} size="md" />
                    <Body weight="heavy" size={12} color={t.textSecondary} maxFontSizeMultiplier={fontScale.graphic}>
                      {weekday(day)}
                    </Body>
                  </View>
                );
              })
            : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <View aria-hidden style={{ width: FAN.w * 0.7, height: FAN.h * 0.7, borderRadius: FAN.radius, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.dashed, alignItems: 'center', justifyContent: 'center' }}>
            <SuitGlyph suit={habit.suit} size={18} color={t.textSecondary} />
          </View>
          <Body size={typeScale.text.md} color={t.textSecondary} style={{ flex: 1 }}>
            No cards from this habit yet this week.
          </Body>
        </View>
      )}
    </View>
  );
}

const STAGES: readonly WearStage[] = ['new', 'worn', 'played', 'gilt', 'heirloom'];

/**
 * How the card has worn in with its kept days: the card itself, small, with its wear and thumb mark, the
 * wear line, a notch for each stage, and that the thumb mark lives only on this phone.
 */
function WornIn({ view }: { view: HabitView }) {
  const t = useTheme();
  const { habit, allTime } = view;
  const kept = allTime.kept;
  const stage = wearOf(kept).stage;
  const { title, line } = wearLine(kept);
  // The line reads "Well played · 34 kept days. Broken in…": the stage leads, the rest sits under it.
  const rest = line.slice(title.length + ' · '.length);
  const at = STAGES.indexOf(stage);
  return (
    <View accessible accessibilityLabel={`${line} ${GRIP_NOTE}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: radius.lg, padding: space.lg, paddingLeft: space.xl, backgroundColor: t.bgRaised }}>
      <View style={{ transform: [{ rotate: '-4deg' }], marginVertical: space.xs }}>
        <CardPicture habit={habit} kept={kept} width={104} />
      </View>
      <View style={{ flex: 1, gap: space.sm }}>
        <View style={{ gap: 2 }}>
          <Display size={typeScale.display.sm}>{title}</Display>
          <Body weight="bold" size={typeScale.text.md}>
            {rest}
          </Body>
        </View>
        <View aria-hidden style={{ flexDirection: 'row', gap: 4 }}>
          {STAGES.map((s, i) => (
            <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= at ? t.text : t.border }} />
          ))}
        </View>
        <Body size={typeScale.text.sm} color={t.textSecondary}>
          {GRIP_NOTE}
        </Body>
      </View>
    </View>
  );
}

/** Where this card's suit stands in the Court: its face card, and how many kept days to the next one. */
function CourtLine({ view, court }: { view: HabitView; court: CourtSuit }) {
  const t = useTheme();
  const { habit } = view;
  const suit = SUIT_INFO[court.suit];
  const next = court.next;
  const line = next ? `${suit.name} · ${next.needed} ${next.needed === 1 ? 'day' : 'days'} to the ${next.face.name}` : `${suit.name} · every face card earned`;
  const held = court.face ? `${court.face.name} of ${suit.name} · ${court.face.title}` : null;
  const about = `Every day you keep ${habit.name} counts for your ${suit.part.toLowerCase()}.${next ? ` The ${next.face.name} brings a Joker with it.` : ''}`;
  return (
    <View
      accessible
      accessibilityLabel={[line, held, about].filter(Boolean).join('. ')}
      style={[{ flexDirection: 'row', gap: space.lg, alignItems: 'center', borderRadius: radius.lg, padding: space.lg }, raisedStyle(t)]}
    >
      {court.face ? <PlayingCard face={faceOfCourt(court.suit, court.face)} size="md" /> : <EmptySeat suit={habit.suit} />}
      <View style={{ flex: 1, gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <SuitGlyph suit={court.suit} size={20} color={t.onRaised} />
          {/* The face's name wraps as one unit, so "to the Queen" never leaves "Queen" alone on a line. */}
          <Display size={typeScale.display.sm} color={t.onRaised} style={{ flexShrink: 1 }}>
            {line.replace(/ to the /, ' to the ')}
          </Display>
        </View>
        {held ? (
          <Body weight="heavy" size={typeScale.text.sm} color={t.onRaised}>
            {held.replace(/ · (.+)$/, (_, title: string) => ` · ${title.replace(/ /g, ' ')}`)}
          </Body>
        ) : null}
        <Body size={typeScale.text.sm} color={t.onRaisedSecondary}>
          {about}
        </Body>
      </View>
    </View>
  );
}

/** The way off the phone: this card as a print to fold or a lock screen. */
function LeaveLink({ view, onPress }: { view: HabitView; onPress: () => void }) {
  const t = useTheme();
  const { habit } = view;
  const c = cardColors[habit.color];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Leave it where it plays"
      accessibilityHint="Print this card to fold, or make it your lock screen"
      onPress={() => {
        feel.tick();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.lg,
        minHeight: 76,
        paddingVertical: space.md,
        paddingLeft: space.lg,
        paddingRight: space.lg,
        borderRadius: radius.lg,
        backgroundColor: t.bgRaised,
        opacity: pressed ? 0.75 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {/* A folded print behind, the card itself in front. */}
      <View aria-hidden style={{ width: 50, height: 52 }}>
        <View style={{ position: 'absolute', left: 14, top: 2, width: 32, height: 44, borderRadius: 5, backgroundColor: WHITE, borderWidth: 1, borderColor: withAlpha(INK, 0.25), transform: [{ rotate: '10deg' }] }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 21, borderTopWidth: 1, borderStyle: 'dashed', borderColor: withAlpha(INK, 0.4) }} />
        </View>
        <View style={{ position: 'absolute', left: 2, top: 6, width: 32, height: 44, borderRadius: 5, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-7deg' }], boxShadow: '0 2px 5px rgba(23, 18, 31, 0.25)' }}>
          <SuitGlyph suit={habit.suit} size={15} color={c.ink} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="heavy" size={typeScale.text.lg}>
          Leave it where it plays →
        </Body>
        <Body size={typeScale.text.sm} color={t.textSecondary}>
          Print it to fold, or make it your lock screen.
        </Body>
      </View>
    </Pressable>
  );
}

/** How close the card is to being part of you: 27 kept days and 15 Ceilings in the last 30. */
function PartOfYou({ view, age, onRaise }: { view: HabitView; age: number; onRaise: () => void }) {
  const t = useTheme();
  const { habit, window30 } = view;
  const c = cardColors[habit.color];
  if (!view.mastered && age < 14) return null;
  const bar = (value: number, goal: number, label: string) => (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${Math.min(value, goal)} of ${goal}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Body weight="heavy" size={typeScale.text.sm} color={t.onRaised}>
          {label}
        </Body>
        <Body weight="heavy" size={typeScale.text.sm} color={t.onRaisedSecondary} style={{ fontVariant: ['tabular-nums'] }}>
          {`${Math.min(value, goal)} of ${goal}`}
        </Body>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: withAlpha(t.onRaised, 0.16), overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(1, value / goal) * 100}%`, height: '100%', borderRadius: 5, backgroundColor: c.onDark }} />
      </View>
    </View>
  );
  return (
    <View style={[{ borderRadius: radius.lg, padding: space.xl, gap: space.lg }, raisedStyle(t)]}>
      <View style={{ gap: space.xs }}>
        <Label color={t.onRaisedSecondary}>Part of you</Label>
        <Display size={typeScale.display.md} color={view.mastered ? c.onDark : t.onRaised}>
          {view.mastered ? `${habit.name} is part of you now.` : `${habit.name} is on its way.`}
        </Display>
        <Body size={typeScale.text.md} color={t.onRaisedSecondary}>
          {view.mastered
            ? 'The Floor stays where it is, for the worst days. A higher Ceiling gives your best days somewhere to go.'
            : `Keep a card on ${MASTERY.kept} of ${MASTERY.days} days, ${MASTERY.ceilings} of them at the Ceiling, and it becomes part of you.`}
        </Body>
      </View>
      {view.mastered ? (
        <Button label="Raise the Ceiling →" onPress={onRaise} colors={{ bg: c.onDark, fg: INK }} />
      ) : (
        <>
          {bar(window30.keptDays, MASTERY.kept, 'Kept, last 30 days')}
          {bar(window30.ceilingDays, MASTERY.ceilings, 'At the Ceiling')}
        </>
      )}
    </View>
  );
}

/** The seat a suit's first face card will take, before it's earned. */
function EmptySeat({ suit }: { suit: HabitView['habit']['suit'] }) {
  const t = useTheme();
  return (
    <View style={{ width: 64, height: 90, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.onRaisedSecondary, alignItems: 'center', justifyContent: 'center' }}>
      <SuitGlyph suit={suit} size={22} color={t.onRaisedSecondary} />
    </View>
  );
}

/** A dashed invitation to write something the card is missing. */
function Prompt({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      onPress={onPress}
      style={({ pressed }) => ({ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.dashed, borderRadius: radius.lg, padding: space.xl, gap: space.xs, opacity: pressed ? 0.7 : 1 })}
    >
      <Display size={typeScale.display.sm}>{title}</Display>
      <Body size={typeScale.text.md} color={t.textSecondary}>
        {body}
      </Body>
    </Pressable>
  );
}

function Row({ label, value, empty, onPress, last, hint = 'Opens the card to change it' }: { label: string; value: string | null; empty: string; onPress: () => void; last?: boolean; hint?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : `${label}: ${empty}`}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Label>{label}</Label>
        <Body weight={value ? 'bold' : 'semi'} size={typeScale.text.md} color={value ? t.text : t.textSecondary}>
          {value ?? empty}
        </Body>
      </View>
      <Body weight="heavy" size={typeScale.text.lg} color={t.textSecondary} aria-hidden>
        {value ? '›' : '+'}
      </Body>
    </Pressable>
  );
}
