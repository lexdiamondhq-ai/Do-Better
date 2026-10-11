import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CardBack } from '@/components/CardBack';
import { Chips } from '@/components/Chips';
import { EXAMPLES, HandFan, HandRow, playedFaces } from '@/components/HandFan';
import { CardSlot } from '@/components/PlayingCard';
import { Body, Button, Display, Label, Page, PageTitle, Section } from '@/components/ui';
import { WeekStrip } from '@/components/WeekStrip';
import { HAND_KINDS, HANDS, atLeast } from '@/engine/poker';
import type { Game, HallEntry, Week } from '@/engine/game';
import { useDeck, useLook } from '@/lib/deck';
import { shortDate, weekOf, weekRange } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { chip, radius, space } from '@/theme/tokens';

/** The week's hand as it stands, your call, the Hall of Hands, and every finished week. */
export default function Hands() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { back } = useLook();
  const [allWeeks, setAllWeeks] = useState(false);
  if (!deck) return null;

  const { game } = deck;
  const { current } = game;
  const draw = game.tips.find((tip) => tip.tone === 'draw');
  const finished = [...game.weeks].reverse().filter((w) => w.slots.some((s) => s.card));
  const weeks = allWeeks ? finished : finished.slice(0, 8);
  const made = game.hall.filter((e) => e.count > 0).length;

  return (
    <Page header={<PageTitle eyebrow={`${weekOf(current.start)} · Showdown Sunday at midnight`} title="Your hand" />}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        {current.hand ? (
          <>
            <HandFan faces={playedFaces(current.hand.cards)} size="lg" spread={0.4} tilt={10} />
            <Display size={30} style={{ textAlign: 'center' }}>{current.hand.title}</Display>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Body weight="bold" color={t.textSecondary}>If the week ended now it would pay</Body>
              <Chips value={current.chips} size={16} color={t.text} />
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {[0, 1, 2].map((i) => (
                <CardSlot key={i} size="md" color={t.dashed} />
              ))}
            </View>
            <Body color={t.textSecondary} style={{ textAlign: 'center' }}>Keep any habit to deal the week’s first card. Seven days, best five cards.</Body>
          </>
        )}
        {draw ? (
          <View style={{ backgroundColor: t.surface, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md }}>
            <Body size={13} weight="bold">{`◆ ${draw.text}`}</Body>
          </View>
        ) : null}
      </View>

      <WeekStrip week={current} back={back} rescue={game.rescue} />

      <CallPanel game={game} onCall={() => router.push('/call')} />

      <Section title="Hall of Hands" action={<Label>{`${made} of ${HAND_KINDS.length} made`}</Label>}>
        <Body size={14} color={t.textSecondary}>Every kind of hand you have finished a week with. Card backs unlock as your best hand climbs.</Body>
        <View style={{ gap: space.sm }}>
          {[...game.hall].reverse().map((entry) => (
            <HallRow key={entry.kind} entry={entry} back={back} />
          ))}
        </View>
      </Section>

      <Section title="Past weeks" action={<Chips value={game.stack} size={15} color={t.text} />}>
        {weeks.length === 0 ? (
          <Body color={t.textSecondary}>Your first Showdown is this Sunday at midnight.</Body>
        ) : (
          <View style={{ gap: space.sm }}>
            {weeks.map((w) => (
              <WeekRow key={w.start} week={w} onPress={() => router.push({ pathname: '/showdown', params: { week: w.start } })} />
            ))}
            {finished.length > weeks.length ? <Button label={`Show all ${finished.length} weeks`} variant="quiet" onPress={() => setAllWeeks(true)} /> : null}
          </View>
        )}
      </Section>
    </Page>
  );
}

function CallPanel({ game, onCall }: { game: Game; onCall: () => void }) {
  const t = useTheme();
  const { call, hand } = game.current;
  if (!call) {
    return (
      <View style={{ backgroundColor: t.bgRaised, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
        <Label>Your call</Label>
        {game.callOpen ? (
          <>
            <Body weight="bold">Call the hand you’ll make this week. Make it by Sunday and its chips pay twice.</Body>
            <Button label={`Call your hand · try ${HANDS[game.suggestedCall].name}`} onPress={onCall} colors={{ bg: chip.bg, fg: chip.ink }} />
          </>
        ) : (
          <Body color={t.textSecondary}>No call this week. Calls open every Monday until midnight.</Body>
        )}
      </View>
    );
  }
  const onTrack = !!hand && atLeast(hand.kind, call);
  return (
    <Pressable
      onPress={game.callOpen ? onCall : undefined}
      disabled={!game.callOpen}
      style={{ backgroundColor: onTrack ? chip.bg : t.bgRaised, borderRadius: radius.lg, padding: space.lg, gap: space.xs }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label color={onTrack ? chip.ink : t.textSecondary}>{game.callOpen ? 'Your call · tap to change until midnight' : 'Your call'}</Label>
        <Chips value={HANDS[call].chips} size={14} sign color={onTrack ? chip.ink : t.text} />
      </View>
      <Display size={26} color={onTrack ? chip.ink : t.text}>{HANDS[call].name}</Display>
      <Body size={14} weight="bold" color={onTrack ? chip.ink : t.textSecondary}>
        {onTrack ? 'Your hand already makes it. Hold on to it through Sunday.' : `Not made yet. ${HANDS[call].how}`}
      </Body>
    </Pressable>
  );
}

function HallRow({ entry, back }: { entry: HallEntry; back: Parameters<typeof CardBack>[0]['back'] }) {
  const t = useTheme();
  const info = HANDS[entry.kind];
  const madeIt = entry.count > 0;
  const hidden = info.secret && !madeIt;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: madeIt ? t.bgRaised : 'transparent', borderWidth: madeIt ? 0 : 1, borderColor: t.border, borderRadius: radius.md, padding: space.sm, paddingRight: space.md }}>
      <View style={{ opacity: madeIt ? 1 : 0.45 }}>
        {hidden ? (
          <View style={{ flexDirection: 'row' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <CardBack key={i} back={back} size="xs" width={26} style={{ marginLeft: i ? -6 : 0 }} />
            ))}
          </View>
        ) : (
          <HandRow faces={entry.best ? playedFaces(entry.best.hand.cards) : EXAMPLES[entry.kind]} size="xs" overlap={0.35} />
        )}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Display size={17} color={madeIt ? t.text : t.textSecondary}>{hidden ? '? ? ?' : info.name}</Display>
        <Body size={12} weight="bold" color={t.textSecondary} numberOfLines={2}>
          {hidden ? 'A secret hand. Earn a face card in the Court to get close.' : madeIt ? `Made ${entry.count}× · first ${entry.first ? shortDate(entry.first) : ''}` : 'Not made yet'}
        </Body>
      </View>
      <Chips value={info.chips} size={13} color={madeIt ? t.text : t.textFaint} />
    </View>
  );
}

function WeekRow({ week, onPress }: { week: Week; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Replays this week’s Showdown" style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.sm, paddingRight: space.md }}>
      {week.hand ? <HandRow faces={playedFaces(week.hand.cards)} size="xs" overlap={0.35} highlight={week.madeCall} /> : <View style={{ width: 120 }} />}
      <View style={{ flex: 1, gap: 1 }}>
        <Label>{weekRange(week.start)}</Label>
        <Body size={14} weight="heavy" numberOfLines={3}>{week.hand?.title ?? 'No hand'}</Body>
        {week.call ? <Body size={12} weight="bold" color={t.textSecondary}>{week.madeCall ? `Called ${HANDS[week.call].name} ✓` : `Called ${HANDS[week.call].name}`}</Body> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Chips value={week.chips + week.bonus} size={14} sign color={t.text} />
      </View>
    </Pressable>
  );
}
