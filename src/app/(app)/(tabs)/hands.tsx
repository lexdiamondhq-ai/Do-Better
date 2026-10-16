import { useRouter } from 'expo-router';
import { useId, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { CardBack } from '@/components/CardBack';
import { Chips } from '@/components/Chips';
import { EXAMPLES, fanCardWidth, HandFan, HandRow, playedFaces, type FanItem } from '@/components/HandFan';
import { CARD_SIZES, CardSlot } from '@/components/PlayingCard';
import { RulesButton } from '@/components/RulesSheet';
import { SharePreview } from '@/components/ShareButton';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Display, Label, Page, PageTitle, raisedStyle, Section } from '@/components/ui';
import { WeekStrip } from '@/components/WeekStrip';
import { weekday } from '@/engine/day';
import { lastShowdown, weekReview, weekTotal, type BackKey, type Game, type HallEntry, type Week } from '@/engine/game';
import { HANDS, makesCall } from '@/engine/poker';
import { useData } from '@/lib/data';
import { useDeck, useLook } from '@/lib/deck';
import { shortDate, weekOf, weekRange } from '@/lib/format';
import { gameInput } from '@/lib/play';
import { usePrefs } from '@/lib/prefs';
import { callWindow, feltFor, firstShowdownDate, hallLine, handLines, riverLine, showdownWhen, type Felt } from '@/lib/share';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { fontScale, radius, space, suitColors } from '@/theme/tokens';

const PAGE = 8;
/** A non-breaking space, so a check never wraps onto a line of its own. */
const NBSP = ' ';

/** How long until Sunday night's Showdown, from today. */
function countdown(today: string): string {
  const left = 6 - weekday(today);
  if (left <= 0) return 'Showdown tonight at midnight';
  if (left === 1) return 'Showdown tomorrow night';
  return `Showdown in ${left} days`;
}

/**
 * The Hands tab: this week's hand as it stands on the felt, your call, any Showdowns played while you
 * were away, the Hall of Hands, and every finished week to replay or share.
 */
export default function Hands() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { back } = useLook();
  const { state, today, seed, refresh } = useData();
  const { prefs } = usePrefs();
  const [count, setCount] = useState(PAGE);
  const [sharing, setSharing] = useState<Week | null>(null);
  if (!deck) return null;

  const { game } = deck;
  const { current } = game;
  const finished = [...game.weeks].reverse().filter((w) => w.slots.some((s) => s.card));
  const weeks = finished.slice(0, count);
  const spotted = game.hall.filter((e) => e.count > 0).length;
  const lead = state.status === 'ready' && current.slots.some((s) => s.card) ? weekReview(current, gameInput(state, today, seed)).lead : null;

  // Showdowns that happened while you were away: newer than the last one you saw, older than the latest.
  const seen = prefs.showdownSeen[seed];
  const latest = lastShowdown(game);
  const away = seen && latest ? finished.filter((w) => w.hand && !w.warmup && w.start > seen && w.start < latest.start) : [];
  // A replay: its chips are in the stack already, so the Showdown plays again without paying again.
  const replay = (w: Week) => router.push({ pathname: '/showdown', params: { week: w.start, replay: '1' } });
  // Holding a Hall row shares the best week that ended on that hand.
  const shareBest = (entry: HallEntry) => {
    const best = entry.best && game.weeks.find((w) => w.start === entry.best?.week && w.hand && !w.warmup);
    return best ? () => setSharing(best) : undefined;
  };

  return (
    <Page header={<PageTitle eyebrow={weekOf(current.start)} title="Your hand" right={<RulesButton topic="week" />} />} onRefresh={refresh}>
      <ThisWeek game={game} back={back} felt={feltFor(t, lead)} today={today} />

      <CallPanel game={game} onCall={() => router.push('/call')} />

      {away.length ? (
        <Section title="While you were away">
          <Body size={14} color={t.textSecondary}>
            {away.length === 1 ? 'A Showdown played without you. Its chips are in your stack.' : `${away.length} Showdowns played without you. Their chips are in your stack.`}
          </Body>
          <View style={{ gap: space.sm }}>
            {away.map((w) => (
              <WeekRow key={w.start} week={w} onPress={() => replay(w)} onShare={() => setSharing(w)} />
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Hall of Hands" action={<Label>{`${spotted} of ${game.hall.length} spotted`}</Label>}>
        <Body size={14} color={t.textSecondary}>
          Every kind of hand your weeks have dealt. New card backs open as your best hand climbs. Hold one to share your best week of it.
        </Body>
        <View style={{ gap: space.sm }}>
          {[...game.hall].reverse().map((entry) => (
            <HallRow key={entry.kind} entry={entry} back={back} onShare={shareBest(entry)} />
          ))}
          <SuitedRow weeks={game.weeks.filter((w) => !w.warmup && w.hand?.suited).length} />
        </View>
      </Section>

      <Section title="Past weeks" action={<Chips value={game.stack} size={16} pill />}>
        {weeks.length === 0 ? (
          <Body color={t.textSecondary}>
            {current.warmup
              ? `Your first Showdown is ${firstShowdownDate(current.start)} at midnight, when your first full week ends. Every week you finish waits here, to replay or share.`
              : `Your first Showdown is ${weekday(today) === 6 ? 'tonight' : 'Sunday'} at midnight. Every week you finish waits here, to replay or share.`}
          </Body>
        ) : (
          <View style={{ gap: space.sm }}>
            {/* A warm-up week has no Showdown to replay and nothing to share, so it gets its own line. */}
            <Body size={13} weight="bold" color={t.textSecondary}>
              {weeks.some((w) => w.hand && !w.warmup) ? 'Tap a week to replay its Showdown. Press and hold to share it.' : 'Tap your warm-up week to see its cards.'}
            </Body>
            {weeks.map((w) => (
              <WeekRow key={w.start} week={w} onPress={() => replay(w)} onShare={w.hand && !w.warmup ? () => setSharing(w) : undefined} />
            ))}
            {finished.length > weeks.length ? <Button label={`Show ${Math.min(PAGE, finished.length - weeks.length)} more`} variant="quiet" onPress={() => setCount((c) => c + PAGE)} /> : null}
          </View>
        )}
      </Section>

      {sharing ? <SharePreview target={{ kind: 'hand', week: sharing }} visible onClose={() => setSharing(null)} /> : null}
    </Page>
  );
}

/**
 * This week on the felt: the hand as it stands, the river card it has earned (or how far off it is),
 * what it pays at the very least, and the seven days.
 */
function ThisWeek({ game, back, felt, today }: { game: Game; back: BackKey; felt: Felt; today: string }) {
  const { width } = useWindowDimensions();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { current } = game;
  const hand = current.hand;
  const draw = game.tips.find((tip) => tip.tone === 'draw');
  const inner = width - space.xl * 2 - space.lg * 2;
  const cardW = fanCardWidth(inner, 104);
  const faces: FanItem[] = hand ? playedFaces(hand.cards) : [];
  const lines = hand ? handLines(hand) : null;
  return (
    <ThemeScope theme={felt.theme}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: felt.bg, borderWidth: 1, borderColor: felt.theme.edge }}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`week${id}`} cx="50%" cy="28%" rx="85%" ry="60%" fx="50%" fy="28%">
              <Stop offset="0" stopColor={felt.glow} stopOpacity={1} />
              <Stop offset="1" stopColor={felt.bg} stopOpacity={1} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#week${id})`} />
        </Svg>
        <View style={{ padding: space.lg, gap: space.lg }}>
          <Label>{current.warmup ? 'Warm-up week' : countdown(today)}</Label>
          {current.warmup ? (
            <View style={{ gap: space.sm }}>
              <Display size={30}>Getting to know your deck.</Display>
              <Body weight="bold" color={felt.theme.textSecondary}>
                {`This week’s cards count in your Court and your kept days. Your first full hand is dealt on Monday, and its Showdown is ${firstShowdownDate(current.start)} at midnight.`}
              </Body>
            </View>
          ) : hand ? (
            <>
              <HandFan faces={faces} size="lg" width={cardW} spread={0.55} tilt={9} accessibilityLabel={`Your hand so far: ${hand.title}`} style={{ marginTop: space.sm }} />
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Display size={36} style={{ textAlign: 'center' }} header>
                  {lines!.name}
                </Display>
                {lines!.detail ? (
                  <Display size={18} color={felt.theme.textSecondary} style={{ textAlign: 'center' }}>
                    {lines!.detail}
                  </Display>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <Body weight="bold" color={felt.theme.textSecondary}>
                  Pays at least
                </Body>
                <Chips value={current.chips} size={16} pill />
                <Body weight="bold" color={felt.theme.textSecondary}>
                  {showdownWhen(today)}
                </Body>
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {[0, 1, 2].map((i) => (
                  <CardSlot key={i} size="md" color={felt.theme.dashed} />
                ))}
              </View>
              <Body weight="bold" style={{ textAlign: 'center' }}>
                Keep any habit to deal the week’s first card. Seven days, and your best five make the hand.
              </Body>
            </View>
          )}
          {!current.warmup ? <River week={current} back={back} today={today} /> : null}
          {draw ? (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: felt.theme.raised, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md }}>
              <Display size={16}>◆</Display>
              <Body size={14} weight="bold" style={{ flex: 1 }}>
                {draw.text}
              </Body>
            </View>
          ) : null}
          <View style={{ marginTop: space.xs }}>
            <WeekStrip week={current} back={back} rescue={game.rescue} />
          </View>
        </View>
      </View>
    </ThemeScope>
  );
}

/** The river card: earned by five days you kept something, and turned last at the Showdown. */
function River({ week, back, today }: { week: Week; back: BackKey; today: string }) {
  const t = useTheme();
  const { earned } = week.river;
  const line = riverLine(week, today);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }}>
      {earned ? (
        <View style={{ transform: [{ rotate: '-6deg' }] }}>
          <CardBack back={back} size="xs" />
          <View style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: 5, borderWidth: 2, borderColor: 'rgba(255, 253, 248, 0.85)' }} />
        </View>
      ) : (
        <CardSlot size="xs" color={t.dashed} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="heavy">{line.title}</Body>
        <Body size={14} color={t.textSecondary}>
          {line.detail}
        </Body>
      </View>
    </View>
  );
}

/** Your call for this week: what you called and whether the week makes it so far, or how to make one. */
function CallPanel({ game, onCall }: { game: Game; onCall: () => void }) {
  const t = useTheme();
  const { call, hand, warmup, callMultiplier } = game.current;
  if (warmup) return null;
  if (!call) {
    return (
      <View style={[{ borderRadius: radius.lg, padding: space.lg, gap: space.md }, raisedStyle(t)]}>
        <Label color={t.onRaisedSecondary}>Your call</Label>
        {game.callOpen ? (
          <>
            <Display size={24} color={t.onRaised}>
              Call this week’s hand.
            </Display>
            <Body weight="bold" color={t.onRaisedSecondary}>
              {`Pick the hand you think this week will make. Make it or better by Sunday and it pays again. Miss and you lose nothing. ${callWindow(game.current).line}`}
            </Body>
            <Button label="See this week’s calls" onPress={onCall} colors={{ bg: t.onRaised, fg: t.raised }} />
          </>
        ) : (
          <Body weight="bold" color={t.onRaisedSecondary}>
            No call this week. Calls open again on Monday.
          </Body>
        )}
      </View>
    );
  }
  const onTrack = makesCall(hand, call);
  const pays = HANDS[call].chips * callMultiplier;
  const closes = callWindow(game.current);
  return (
    <Pressable
      onPress={game.callOpen ? onCall : undefined}
      disabled={!game.callOpen}
      accessibilityRole={game.callOpen ? 'button' : undefined}
      accessibilityHint={game.callOpen ? `Change your call. ${closes.line}` : undefined}
      style={({ pressed }) => [{ borderRadius: radius.lg, padding: space.lg, gap: space.md, opacity: pressed ? 0.85 : 1 }, raisedStyle(t)]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
        <Label color={t.onRaisedSecondary}>Your call</Label>
        {pays > 0 ? <Chips value={pays} size={14} pill sign /> : null}
      </View>
      {/* The fan sits a little tighter and closer, so "Three of a kind" keeps to one line on a small phone and every card's corner still reads. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {/* The check means made: it waits until this week's hand makes the call. */}
        <HandRow faces={EXAMPLES[call]} size="xs" overlap={0.48} highlight={onTrack ? 'called' : undefined} />
        <View style={{ flex: 1, gap: 2 }}>
          <Display size={24} color={t.onRaised}>
            {HANDS[call].name}
          </Display>
          <Body size={14} weight="bold" color={t.onRaisedSecondary}>
            {callMultiplier > 1 ? `Pays ×${callMultiplier} if you make${NBSP}it` : callMultiplier === 1 ? `Pays again if you make${NBSP}it` : 'A sure thing, so it pays nothing extra'}
          </Body>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: onTrack ? t.onRaised : 'transparent', borderWidth: onTrack ? 0 : 1.5, borderColor: t.onRaisedSecondary, marginTop: 1 }}>
          {onTrack ? (
            <Body size={12} weight="heavy" color={t.raised} maxFontSizeMultiplier={fontScale.graphic}>
              ✓
            </Body>
          ) : null}
        </View>
        <Body size={14} weight="bold" color={t.onRaised} style={{ flex: 1 }}>
          {onTrack ? 'Your hand already makes it. Hold on to it through Sunday.' : `Not made yet. ${HANDS[call].how}`}
        </Body>
      </View>
      {game.callOpen ? (
        <Body size={13} weight="bold" color={t.onRaisedSecondary}>
          {`Tap to change it. ${closes.line}`}
        </Body>
      ) : null}
    </Pressable>
  );
}

function HallRow({ entry, back, onShare }: { entry: HallEntry; back: BackKey; onShare?: () => void }) {
  const t = useTheme();
  const info = HANDS[entry.kind];
  const spotted = entry.count > 0;
  const hidden = info.secret && !spotted;
  const said = hidden ? 'Secret hand. A Joker helps.' : hallLine(entry);
  const since = spotted && entry.first ? `. First spotted ${shortDate(entry.first)}` : '';
  return (
    <Pressable
      accessible
      accessibilityRole={onShare ? 'button' : 'text'}
      accessibilityLabel={`${hidden ? 'A secret hand' : info.name}. ${said}${since}. Pays ${info.chips} chips.`}
      onLongPress={onShare}
      accessibilityActions={onShare ? [{ name: 'longpress', label: 'Share your best week of it' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') onShare?.();
      }}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: space.sm, paddingRight: space.md, opacity: pressed ? 0.85 : 1 },
        spotted ? { backgroundColor: t.bgRaised } : { borderWidth: 1, borderColor: t.border },
      ]}
    >
      <View style={{ opacity: spotted ? 1 : 0.5 }}>
        {hidden ? (
          <View style={{ flexDirection: 'row' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <CardBack key={i} back={back} size="xs" style={{ marginLeft: i ? -CARD_SIZES.xs.w * 0.4 : 0 }} />
            ))}
          </View>
        ) : (
          <HandRow faces={entry.best ? playedFaces(entry.best.hand.cards) : EXAMPLES[entry.kind]} size="xs" overlap={0.4} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <Display size={17} color={spotted ? t.text : t.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>
            {hidden ? '? ? ?' : info.name}
          </Display>
          <Chips value={info.chips} size={13} color={spotted ? t.text : t.textSecondary} />
        </View>
        <Body size={12} weight="bold" color={t.textSecondary} numberOfLines={2}>
          {said}
        </Body>
      </View>
    </Pressable>
  );
}

/** Suited weeks pay nothing: the row says who showed up, not what it earned. */
function SuitedRow({ weeks }: { weeks: number }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Suited. ${weeks ? `${weeks} Suited ${weeks === 1 ? 'week' : 'weeks'}` : 'Not yet'}. Five Ceiling days in one suit. It pays nothing; it says who showed up.`}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: space.md }, weeks ? { backgroundColor: t.bgRaised } : { borderWidth: 1, borderColor: t.border }]}
    >
      <View style={{ width: 52, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
        {(['spades', 'hearts', 'diamonds', 'clubs'] as const).map((s) => (
          <SuitGlyph key={s} suit={s} size={20} color={t.scheme === 'dark' ? suitColors[s].bright : suitColors[s].glyph} />
        ))}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <Display size={17}>Suited</Display>
          <Label>{weeks ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'}` : 'Not yet'}</Label>
        </View>
        <Body size={12} weight="bold" color={t.textSecondary}>
          Five Ceiling days in one suit: one part of you, at its best. No chips, just the honour.
        </Body>
      </View>
    </View>
  );
}

/** A finished week: its dates and what it paid, then its hand, then the call. Tap to replay, hold to share. */
function WeekRow({ week, onPress, onShare }: { week: Week; onPress: () => void; onShare?: () => void }) {
  const t = useTheme();
  const total = weekTotal(week);
  const call = week.call ? `Called ${HANDS[week.call].name}${week.madeCall ? `${NBSP}✓` : ''}` : null;
  const title = week.warmup ? 'Warm-up week' : (week.hand?.title ?? 'No hand');
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onShare}
      accessibilityRole="button"
      accessibilityLabel={`${weekRange(week.start)}. ${title}.${call ? ` ${call.replace('✓', 'made')}.` : ''}${total ? ` ${total} chips.` : ''}`}
      accessibilityHint="Replays this week’s Showdown"
      accessibilityActions={onShare ? [{ name: 'longpress', label: 'Share this hand' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') onShare?.();
      }}
      style={({ pressed }) => ({ borderRadius: radius.md, padding: space.md, gap: space.sm, backgroundColor: t.bgRaised, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
        <Label>{weekRange(week.start)}</Label>
        {total ? <Chips value={total} size={14} sign /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        {week.hand ? <HandRow faces={playedFaces(week.hand.cards)} size="xs" overlap={0.4} highlight={week.madeCall ? 'called' : undefined} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Body size={15} weight="heavy" numberOfLines={2}>
            {title}
          </Body>
          {call ? (
            <Body size={12} weight="bold" color={t.textSecondary}>
              {call}
            </Body>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
