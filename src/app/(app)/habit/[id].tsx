import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ask } from '@/components/Ask';
import { Arrow, DayCalendar, PileLegend, pileColors, WeeksGrid } from '@/components/Pile';
import { faceOfCourt, PlayingCard } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Centered, Display, Label, raisedStyle, Section } from '@/components/ui';
import { SUIT_INFO } from '@/engine/cards';
import { cleanIdentity } from '@/engine/court';
import { addDays, canBackfill, daysBetween, weekStart, type Day } from '@/engine/day';
import { best30, bounceBacks, calendarWeeks, keptBetween, MASTERY, type CalendarDay, type Level } from '@/engine/kept';
import { ownWhy, playsLine, PRINCIPLES, recipeFor, type EditField } from '@/engine/playbook';
import { useData } from '@/lib/data';
import { useDeck, useKeep, type HabitView } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { monthDay, shortDay } from '@/lib/format';
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
  const window30 = view.window30;
  // Counted from the grid itself, so the number always matches the squares under it.
  const quarterKept = gridCount(quarter);
  const age = daysBetween(habit.startedOn, today) + 1;
  // A young card's calendar starts the week it was made, not with empty weeks before it.
  const young = age < 30;
  const month = calendarWeeks(today, { days: Math.max(1, Math.min(30, age)) }, habit.startedOn, checkIns);
  const monthTitle = young ? 'Since you started' : 'Last 30 days';
  const best = age >= 30 ? best30(habit.startedOn, today, checkIns) : null;
  const identity = cleanIdentity(habit.identity);
  const why = ownWhy(habit);
  const when = [habit.anchor?.trim(), habit.whenWhere?.trim()].filter(Boolean).join(' · ');
  const recipe = recipeFor(habit.recipeKey);
  const principle = recipe ? PRINCIPLES[recipe.principle] : null;
  const court = deck.court.find((s) => s.suit === habit.suit);
  const suit = SUIT_INFO[habit.suit];
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
          <View style={{ gap: space.md }}>
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={`${monthTitle}: ${window30.keptDays} kept, ${window30.ceilingDays} at the Ceiling.`}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}
            >
              <Display size={typeScale.display.sm}>{monthTitle}</Display>
              <PileLegend color={habit.color} />
            </View>
            <DayCalendar
              weeks={month}
              color={habit.color}
              today={today}
              canLogLate={(day) => late && day === yesterday}
              onLogLate={logLate}
              lateLabel={`Yesterday, ${shortDay(yesterday)}, not logged. Did it? Log it late`}
            />
            {late ? (
              <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary}>
                Did it yesterday and forgot to log? Tap its day.
              </Body>
            ) : null}
          </View>

          <Stats view={view} today={today} />

          <PartOfYou view={view} age={age} onRaise={() => edit('ceilingLabel')} />

          {court ? (
            <View style={[{ flexDirection: 'row', gap: space.lg, alignItems: 'center', borderRadius: radius.lg, padding: space.lg }, raisedStyle(t)]}>
              {court.face ? <PlayingCard face={faceOfCourt(court.suit, court.face)} size="md" /> : <EmptySeat suit={habit.suit} />}
              <View style={{ flex: 1, gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SuitGlyph suit={court.suit} size={13} color={t.onRaisedSecondary} />
                  <Label color={t.onRaisedSecondary}>{`Court of ${suit.name}`}</Label>
                </View>
                <Display size={typeScale.display.sm} color={t.onRaised}>
                  {court.face ? `${court.face.name} of ${suit.name} · ${court.face.title}` : `${court.votes} ${suit.part} ${court.votes === 1 ? 'day' : 'days'}`}
                </Display>
                <Body size={typeScale.text.sm} color={t.onRaisedSecondary}>
                  {`Every day you keep ${habit.name} counts for your ${suit.part.toLowerCase()}. `}
                  {court.next ? `${court.next.needed} more ${court.next.needed === 1 ? 'day earns' : 'days earn'} the ${court.next.face.name}, and a Joker with it.` : 'Every face card is earned.'}
                </Body>
              </View>
            </View>
          ) : null}

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
              <Row label="First move" value={habit.twoMinuteLabel} empty="The smallest way to start. Add it" onPress={() => edit('twoMinuteLabel')} last />
            </View>
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

          {young ? null : (
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md }}>
                <Display size={typeScale.display.sm} header>
                  Twelve weeks
                </Display>
                <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary}>
                  {`${quarterKept.keptDays} kept`}
                </Body>
              </View>
              <WeeksGrid
                weeks={quarter}
                color={habit.color}
                today={today}
                label={`The last twelve weeks: ${quarterKept.keptDays} days kept, ${quarterKept.ceilingDays} at the Ceiling, ${keptBetween(checkIns, weekStart(today), today)} this week.`}
              />
            </View>
          )}

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

/** What the card has added up to. No count of days missed: only what was kept. */
function Stats({ view, today }: { view: HabitView; today: Day }) {
  const t = useTheme();
  const { habit, checkIns, allTime } = view;
  const fill = pileColors(t, habit.color);
  const week = keptBetween(checkIns, weekStart(today), today);
  const tile = (n: number, label: string, extra?: object, ink?: string, big = false) => (
    <View key={label} accessible accessibilityLabel={`${n} ${label}`} style={[{ flex: 1, borderRadius: radius.md, padding: space.md, gap: 2, backgroundColor: t.bgRaised, justifyContent: 'flex-end', minHeight: big ? 112 : 84 }, extra]}>
      <Display size={big ? typeScale.display.xl : typeScale.display.md} color={ink} maxFontSizeMultiplier={fontScale.chrome} style={{ fontVariant: ['tabular-nums'] }}>
        {n}
      </Display>
      <Body weight="heavy" size={12} color={ink ?? t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
        {label}
      </Body>
    </View>
  );
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {tile(allTime.kept, allTime.kept === 1 ? 'kept day' : 'kept days', { flex: 2, backgroundColor: fill.ceiling.bg }, fill.ceiling.ink, true)}
        {tile(week, 'kept this week', undefined, undefined, true)}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {tile(allTime.ceiling, allTime.ceiling === 1 ? 'Ceiling' : 'Ceilings')}
        {tile(allTime.kept - allTime.ceiling, allTime.kept - allTime.ceiling === 1 ? 'Floor day' : 'Floor days')}
        {tile(bounceBacks(habit.startedOn, today, checkIns), 'comebacks')}
      </View>
    </View>
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

function Row({ label, value, empty, onPress, last }: { label: string; value: string | null; empty: string; onPress: () => void; last?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : `${label}: ${empty}`}
      accessibilityHint="Opens the card to change it"
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
