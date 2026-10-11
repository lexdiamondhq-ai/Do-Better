import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips } from '@/components/Chips';
import { HabitCard, NeverTwiceCard } from '@/components/HabitCard';
import { faceOfDay, PlayingCard } from '@/components/PlayingCard';
import { SwipeCard, type SwipeDirection } from '@/components/SwipeCard';
import { Body, Button, Display, Label } from '@/components/ui';
import { WeekStrip } from '@/components/WeekStrip';
import { TIERS } from '@/engine/deal';
import type { Game, TipTone } from '@/engine/game';
import { recentDays } from '@/engine/kept';
import { atLeast, HANDS } from '@/engine/poker';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { useDeck, useLook, type Deck, type HabitView } from '@/lib/deck';
import { longDate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, chip, radius, space } from '@/theme/tokens';

type Item = { view: HabitView; kind: 'never-twice' | 'card' };

const TIP_MARK: Record<TipTone, string> = { joker: '★', face: '♛', rescue: '↺', deal: '✦', climb: '↑', draw: '◆', call: '◎', showdown: '☾', done: '✓' };

export default function Today() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const deck = useDeck();
  const { demo } = useAuth();
  const { back } = useLook();
  const { checkIn, undoCheckIn, recordPrompt } = useData();
  // Cards swiped sideways go to the back of the deck for the rest of the session.
  const [deferred, setDeferred] = useState<string[]>([]);
  const [tipTurn, setTipTurn] = useState(0);
  const shown = useRef(new Set<string>());

  const queue: Item[] = [];
  if (deck) {
    const pending = deck.cards.filter((c) => !c.today);
    // Not deferred (-1) first, then deferred cards in the order they were pushed back.
    pending.sort((a, b) => deferred.indexOf(a.habit.id) - deferred.indexOf(b.habit.id));
    for (const c of pending.filter((c) => c.neverTwice)) queue.push({ view: c, kind: 'never-twice' });
    for (const c of pending.filter((c) => !c.neverTwice)) queue.push({ view: c, kind: 'card' });
  }
  const front = queue[0];

  // Record that the Never Twice card was shown, once per missed day.
  useEffect(() => {
    if (front?.kind !== 'never-twice' || !front.view.neverTwice) return;
    const key = `${front.view.habit.id}:${front.view.neverTwice}`;
    if (shown.current.has(key)) return;
    shown.current.add(key);
    recordPrompt(front.view.habit.id, front.view.neverTwice, null).catch(() => shown.current.delete(key));
  }, [front, recordPrompt]);

  if (!deck) return null;
  const { game } = deck;

  const fail = (e: unknown) => Alert.alert('That didn’t save', e instanceof Error ? e.message : 'Check your connection and try again.');

  function onSwipe(item: Item, dir: SwipeDirection) {
    const id = item.view.habit.id;
    const missed = item.view.neverTwice;
    if (dir === 'left' || dir === 'right') {
      Haptics.selectionAsync();
      setDeferred((d) => [...d.filter((x) => x !== id), id]);
      if (item.kind === 'never-twice' && missed) recordPrompt(id, missed, 'dismissed').catch(fail);
      return;
    }
    const level = dir === 'up' ? 'ceiling' : 'floor';
    Haptics.notificationAsync(level === 'ceiling' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    checkIn(id, level).catch(fail);
    if (item.kind === 'never-twice' && missed) recordPrompt(id, missed, 'floor_only').catch(fail);
  }

  function onTwoMinutes(item: Item) {
    const missed = item.view.neverTwice;
    if (!missed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // The two-minute version keeps the day: Never Twice is about showing up, not the amount.
    checkIn(item.view.habit.id, 'floor').catch(fail);
    recordPrompt(item.view.habit.id, missed, 'two_minute').catch(fail);
  }

  function onPill(view: HabitView) {
    if (!view.today) return;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (view.today === 'floor') buttons.push({ text: `Reach the Ceiling: ${view.habit.ceilingLabel}`, onPress: () => checkIn(view.habit.id, 'ceiling').catch(fail) });
    else buttons.push({ text: 'Make it a Floor day', onPress: () => checkIn(view.habit.id, 'floor').catch(fail) });
    buttons.push({ text: 'Undo today', style: 'destructive', onPress: () => undoCheckIn(view.habit.id).catch(fail) });
    buttons.push({ text: 'Open card', onPress: () => router.push(`/habit/${view.habit.id}`) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(view.habit.name, view.today === 'floor' ? 'Floor kept today.' : 'Ceiling reached today.', buttons);
  }

  const total = deck.cards.length;
  const behind = queue.slice(1, 3);
  const tip = game.tips.length ? game.tips[tipTurn % game.tips.length] : null;

  return (
    <View style={{ flex: 1, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + 92 }}>
      <View style={{ paddingHorizontal: space.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
          <Label numberOfLines={1}>{longDate(deck.today)}</Label>
          {demo ? (
            <View style={{ backgroundColor: t.accent, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
              <Body size={10} weight="heavy" color={t.onAccent}>DEMO</Body>
            </View>
          ) : null}
        </View>
        <Pressable onPress={() => router.push('/you')} accessibilityRole="button" accessibilityHint="Your stack and tables" hitSlop={8}>
          <Chips value={game.stack} size={15} pill />
        </Pressable>
      </View>

      {total > 0 ? (
        <>
          <View style={{ paddingHorizontal: space.xl, marginTop: space.md }}>
            <WeekStrip week={game.current} back={back} rescue={game.rescue} onPress={() => router.push('/hands')} />
          </View>

          <View style={{ marginHorizontal: space.xl, marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Pressable onPress={() => router.push('/hands')} accessibilityRole="button" style={{ flex: 1, gap: 2 }}>
              <Label>{game.current.hand ? `Your hand · pays ${game.current.chips}` : 'Your hand'}</Label>
              <Display size={22} numberOfLines={1}>{game.current.hand?.title ?? 'No cards yet this week'}</Display>
            </Pressable>
            <CallBadge game={game} onPress={() => router.push('/call')} />
          </View>

          {tip ? (
            <Pressable
              onPress={() => setTipTurn((n) => n + 1)}
              accessibilityRole="button"
              accessibilityHint={game.tips.length > 1 ? 'Shows the next tip' : undefined}
              style={{ marginHorizontal: space.xl, marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: t.surface, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md }}
            >
              <Display size={16} color={tip.tone === 'joker' || tip.tone === 'face' ? t.text : t.textSecondary}>{TIP_MARK[tip.tone]}</Display>
              <Body size={13} weight="bold" style={{ flex: 1 }} numberOfLines={2}>{tip.text}</Body>
              {game.tips.length > 1 ? <Body size={11} weight="heavy" color={t.textFaint}>{`${(tipTurn % game.tips.length) + 1}/${game.tips.length}`}</Body> : null}
            </Pressable>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: space.md }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
            {deck.cards.map((c) => {
              const col = cardColors[c.habit.color];
              return (
                <Pressable
                  key={c.habit.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.habit.name}, ${c.today ? `${c.today} kept` : 'not yet'}`}
                  onPress={() => (c.today ? onPill(c) : router.push(`/habit/${c.habit.id}`))}
                  style={{
                    flexDirection: 'row',
                    gap: 8,
                    alignItems: 'center',
                    borderRadius: radius.pill,
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    backgroundColor: c.today ? col.bg : 'transparent',
                    borderWidth: c.today ? 0 : 1.5,
                    borderStyle: 'dashed',
                    borderColor: c.neverTwice ? t.text : t.dashed,
                  }}
                >
                  <Body weight="heavy" size={13} color={c.today ? col.ink : t.text}>{c.habit.name}</Body>
                  {c.today ? <Body weight="heavy" size={11} color={col.ink} style={{ opacity: 0.8 }}>{c.today === 'ceiling' ? '↑ Ceiling' : '↓ Floor'}</Body> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <View style={{ flex: 1, marginHorizontal: space.xl, marginTop: space.lg, marginBottom: space.sm }}>
        {front ? (
          <>
            {behind
              .slice()
              .reverse()
              .map((b, i, arr) => {
                const depth = arr.length - i;
                return (
                  <View
                    key={b.view.habit.id}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: radius.card,
                      backgroundColor: b.kind === 'never-twice' ? t.cardBack : cardColors[b.view.habit.color].bg,
                      transform: [{ translateY: -10 * depth }, { scale: 1 - 0.06 * depth }, { rotate: `${depth % 2 ? 4 : -5}deg` }],
                    }}
                  />
                );
              })}
            <SwipeCard
              key={`${front.view.habit.id}:${front.kind}:${deck.today}`}
              onSwipe={(dir) => onSwipe(front, dir)}
              onTap={front.kind === 'never-twice' && front.view.habit.twoMinuteLabel ? () => onTwoMinutes(front) : undefined}
              allow={front.kind === 'never-twice' ? { down: true, left: true, right: true } : undefined}
              labels={{ up: 'CEILING', down: 'FLOOR', left: front.kind === 'never-twice' ? 'NOT TODAY' : 'LATER' }}
            >
              {front.kind === 'never-twice' ? (
                <NeverTwiceCard
                  habit={front.view.habit}
                  saving={!!game.rescue}
                  week={recentDays(deck.today, 6, front.view.habit.startedOn, front.view.checkIns).map(({ day, status }) =>
                    day === deck.today ? 'today' : status === 'ceiling' ? 'ceiling' : status === 'floor' ? 'kept' : status === 'missed' ? 'missed' : 'none',
                  )}
                />
              ) : (
                <HabitCard habit={front.view.habit} level={front.view.today} subtitle={queue.length === 1 ? 'Last one for today.' : `${queue.length} left today.`} />
              )}
            </SwipeCard>
          </>
        ) : total === 0 ? (
          <EmptyDeck onCreate={() => router.push('/habit/edit')} />
        ) : (
          <AllKept deck={deck} />
        )}
      </View>

      <Body size={12} weight="bold" color={t.textSecondary} style={{ textAlign: 'center', paddingHorizontal: space.xl }}>
        {front?.kind === 'never-twice'
          ? 'Swipe down for the Floor. Swipe sideways for not today.'
          : front
            ? 'Down for the Floor, up for the Ceiling, sideways for later.'
            : ' '}
      </Body>
    </View>
  );
}

/** This week's call, if any, and whether the hand already makes it. Calls are made on Monday. */
function CallBadge({ game, onPress }: { game: Game; onPress: () => void }) {
  const t = useTheme();
  const { call, hand } = game.current;
  if (!call && !game.callOpen) return null;
  if (!call) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={{ backgroundColor: chip.bg, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 }}>
        <Body size={13} weight="heavy" color={chip.ink}>Call your hand</Body>
      </Pressable>
    );
  }
  const onTrack = !!hand && atLeast(hand.kind, call);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`You called ${HANDS[call].name}${onTrack ? ', and your hand already makes it' : ''}`}
      style={{ alignItems: 'flex-end', borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: onTrack ? chip.bg : 'transparent', borderWidth: onTrack ? 0 : 1.5, borderColor: t.border }}
    >
      <Body size={10} weight="heavy" color={onTrack ? chip.ink : t.textSecondary} style={{ letterSpacing: 0.8 }}>{onTrack ? 'CALL MADE ✓' : 'YOUR CALL'}</Body>
      <Body size={14} weight="heavy" color={onTrack ? chip.ink : t.text}>{HANDS[call].name}</Body>
    </Pressable>
  );
}

function EmptyDeck({ onCreate }: { onCreate: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: radius.card, borderWidth: 2, borderStyle: 'dashed', borderColor: t.dashed, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>
      <Display size={36} style={{ textAlign: 'center' }}>Your deck is empty.</Display>
      <Body color={t.textSecondary} style={{ textAlign: 'center' }}>Make a card with a Floor you can do on your worst day and a Ceiling for your best. Every day you keep it deals you a playing card.</Body>
      <Button label="Make a card" onPress={onCreate} />
    </View>
  );
}

function AllKept({ deck }: { deck: Deck }) {
  const t = useTheme();
  const router = useRouter();
  const card = deck.todayCard;
  const tier = deck.todayTier;
  const count = deck.cards.length;
  return (
    <ScrollView style={{ marginHorizontal: -space.sm }} contentContainerStyle={{ gap: space.lg, paddingBottom: space.lg, paddingTop: space.md, paddingHorizontal: space.sm }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        {card ? <PlayingCard face={faceOfDay(card)} size="lg" style={{ transform: [{ rotate: '-5deg' }], marginLeft: space.sm }} /> : null}
        <View style={{ flex: 1, gap: space.sm }}>
          <Label>{tier ? TIERS[tier].label : 'Kept'}</Label>
          <Display size={32}>{count === 1 ? 'Kept.' : `All ${count} kept.`}</Display>
          <Body size={14} color={t.textSecondary}>
            {card?.kind === 'joker' ? 'Today’s card is a Joker. It plays as any card in this week’s hand.' : tier ? TIERS[tier].about : ''}
          </Body>
        </View>
      </View>

      <Pressable onPress={() => router.push('/playbook')} style={{ backgroundColor: t.cardBack, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
        <Label color={t.onCardBack} style={{ opacity: 0.6 }}>{`Today's idea · ${deck.idea.reason}`}</Label>
        <Display size={24} color={t.onCardBack}>{deck.idea.principle.title}</Display>
        <Body color={t.onCardBack} style={{ opacity: 0.85 }}>{deck.idea.principle.tryThis}</Body>
        <Body size={12} weight="bold" color={t.onCardBack} style={{ opacity: 0.55 }}>{deck.idea.principle.source}</Body>
      </Pressable>
    </ScrollView>
  );
}
