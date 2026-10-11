import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AchievementCard } from '@/components/AchievementCard';
import { HabitCard, NeverTwiceCard } from '@/components/HabitCard';
import { SwipeCard, type SwipeDirection } from '@/components/SwipeCard';
import { Body, Button, Display, Label } from '@/components/ui';
import { recentDays } from '@/engine/kept';
import { useData } from '@/lib/data';
import { useDeck, type HabitView } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, radius, space } from '@/theme/tokens';

const DATE = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

function dateLabel(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return DATE.format(new Date(y, m - 1, d));
}

type Item = { view: HabitView; kind: 'never-twice' | 'card' };

export default function Today() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const deck = useDeck();
  const { checkIn, undoCheckIn, recordPrompt } = useData();
  // Cards swiped sideways go to the back of the deck for the rest of the session.
  const [deferred, setDeferred] = useState<string[]>([]);
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

  // Record that the Comeback card was shown, once per missed day.
  useEffect(() => {
    if (front?.kind !== 'never-twice' || !front.view.neverTwice) return;
    const key = `${front.view.habit.id}:${front.view.neverTwice}`;
    if (shown.current.has(key)) return;
    shown.current.add(key);
    recordPrompt(front.view.habit.id, front.view.neverTwice, null).catch(() => shown.current.delete(key));
  }, [front, recordPrompt]);

  if (!deck) return null;

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
    // The first move keeps the day: the comeback is about showing up, not the amount.
    checkIn(item.view.habit.id, 'floor').catch(fail);
    recordPrompt(item.view.habit.id, missed, 'two_minute').catch(fail);
  }

  function onPill(view: HabitView) {
    const name = view.habit.name;
    if (!view.today) return;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (view.today === 'floor') buttons.push({ text: `Reach the Ceiling: ${view.habit.ceilingLabel}`, onPress: () => checkIn(view.habit.id, 'ceiling').catch(fail) });
    else buttons.push({ text: `Make it a Floor day`, onPress: () => checkIn(view.habit.id, 'floor').catch(fail) });
    buttons.push({ text: 'Undo today', style: 'destructive', onPress: () => undoCheckIn(view.habit.id).catch(fail) });
    buttons.push({ text: 'Open card', onPress: () => router.push(`/habit/${view.habit.id}`) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(name, view.today === 'floor' ? 'Floor kept today.' : 'Ceiling reached today.', buttons);
  }

  const total = deck.cards.length;
  const behind = queue.slice(1, 3);

  return (
    <View style={{ flex: 1, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + 92 }}>
      <View style={{ paddingHorizontal: space.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ gap: 4, flex: 1 }}>
          <Label>{dateLabel(deck.today)}</Label>
          <Display size={40}>Today</Display>
        </View>
        {total > 0 ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Display size={30}>{`${deck.keptToday}/${total}`}</Display>
            <Label>kept</Label>
          </View>
        ) : null}
      </View>

      {total > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: space.lg }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
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
                  paddingVertical: 9,
                  paddingHorizontal: 14,
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
      ) : null}

      <View style={{ flex: 1, marginHorizontal: space.xl, marginTop: space.xl, marginBottom: space.md }}>
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
          <AllKept />
        )}
      </View>

      <Body size={13} weight="bold" color={t.textSecondary} style={{ textAlign: 'center', paddingHorizontal: space.xl }}>
        {front?.kind === 'never-twice'
          ? 'Swipe down for the Floor. Swipe sideways for not today.'
          : front
            ? 'Down for the Floor, up for the Ceiling, sideways for later.'
            : ' '}
      </Body>
    </View>
  );
}

function EmptyDeck({ onCreate }: { onCreate: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: radius.card, borderWidth: 2, borderStyle: 'dashed', borderColor: t.dashed, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>
      <Display size={36} style={{ textAlign: 'center' }}>Your deck is empty.</Display>
      <Body color={t.textSecondary} style={{ textAlign: 'center' }}>Make a card with a Floor you can do on your worst day and a Ceiling for your best.</Body>
      <Button label="Make a card" onPress={onCreate} />
    </View>
  );
}

function AllKept() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  if (!deck) return null;
  const next = deck.closest[0];
  const ceilings = deck.cards.filter((c) => c.today === 'ceiling').length;
  return (
    <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.lg }} showsVerticalScrollIndicator={false}>
      <View style={{ borderRadius: radius.card, borderWidth: 2, borderStyle: 'dashed', borderColor: t.dashed, padding: space.xl, gap: space.sm }}>
        <Display size={44}>{deck.cards.length === 1 ? 'Kept.' : `All ${deck.cards.length} kept.`}</Display>
        <Body color={t.textSecondary}>
          {ceilings > 0 ? `${ceilings} reached the Ceiling. ` : ''}
          {`${deck.cards.length} more ${deck.cards.length === 1 ? 'card' : 'cards'} on the pile. Tomorrow is a new deal.`}
        </Body>
      </View>

      <Pressable onPress={() => router.push('/playbook')} style={{ backgroundColor: t.cardBack, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
        <Label color={t.onCardBack} style={{ opacity: 0.6 }}>{`Today's idea · ${deck.idea.reason}`}</Label>
        <Display size={26} color={t.onCardBack}>{deck.idea.principle.title}</Display>
        <Body color={t.onCardBack} style={{ opacity: 0.85 }}>{deck.idea.principle.tryThis}</Body>
      </Pressable>

      {next ? (
        <Pressable onPress={() => router.push('/achievements')} style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
          <View style={{ width: 92 }}>
            <AchievementCard state={next} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>Next card for your collection</Label>
            <Display size={22}>{next.achievement.title}</Display>
            <Body size={14} color={t.textSecondary}>{`${next.achievement.description} ${next.progress} of ${next.achievement.target}.`}</Body>
          </View>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
