import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardBack } from '@/components/CardBack';
import { Chips } from '@/components/Chips';
import { HandFan, playedFaces } from '@/components/HandFan';
import { CardSlot, faceOfDay, PlayingCard, type CardFace } from '@/components/PlayingCard';
import { Body, Button, Display, Label } from '@/components/ui';
import type { Suit } from '@/engine/cards';
import type { Day } from '@/engine/day';
import { BACKS, lastShowdown, TABLES, unlocksFor, type BackKey, type TableKey } from '@/engine/game';
import { HANDS } from '@/engine/poker';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { useDeck, useLook } from '@/lib/deck';
import { weekOf } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { playSound } from '@/lib/sound';
import { useTheme } from '@/theme/ThemeProvider';
import { chip, radius, space, tables } from '@/theme/tokens';

const FLIP_GAP = 170;

/** A number that runs up to its target once `active` turns on. */
function useCountUp(target: number, active: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / 900);
      setValue(Math.round(target * (1 - (1 - p) ** 3)));
      if (p >= 1) clearInterval(id);
    }, 32);
    return () => clearInterval(id);
  }, [target, active]);
  return value;
}

function FlipCard({ face, back, delay, held, settle }: { face: CardFace; back: BackKey; delay: number; held: boolean; settle: SharedValue<number> }) {
  const flip = useSharedValue(0);
  useEffect(() => {
    flip.set(withDelay(delay, withTiming(1, { duration: 420 })));
  }, [flip, delay]);
  const wrap = useAnimatedStyle(() => ({ opacity: held ? 1 : 1 - 0.6 * settle.get(), transform: [{ translateY: held ? -12 * settle.get() : 0 }] }));
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { rotateY: `${180 - flip.get() * 180}deg` }] }));
  const behind = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { rotateY: `${-flip.get() * 180}deg` }] }));
  return (
    <Animated.View style={[{ width: 52, height: 74 }, wrap]}>
      <Animated.View style={[{ position: 'absolute', backfaceVisibility: 'hidden' }, behind]}>
        <CardBack back={back} size="sm" />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', backfaceVisibility: 'hidden' }, front]}>
        <PlayingCard face={face} size="sm" highlight={held} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Sunday midnight: the week's cards turn over one by one, the best five rise into a hand, and it pays
 * its chips into the stack, with the call bonus and anything the week unlocked.
 */
export default function Showdown() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { week: start } = useLocalSearchParams<{ week?: string }>();
  const deck = useDeck();
  const { seed } = useData();
  const { demo } = useAuth();
  const { prefs, setPrefs } = usePrefs();
  const look = useLook();
  const [phase, setPhase] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const settle = useSharedValue(0);
  const reveal = useSharedValue(0);

  const week = deck?.game.weeks.find((w) => w.start === start) ?? null;
  const dealt = week?.slots.filter((s) => s.card).length ?? 0;

  useEffect(() => {
    const first = 300 + dealt * FLIP_GAP + 450;
    const timers = [first, first + 700, first + 1500, first + 2100].map((ms, i) => setTimeout(() => setPhase((p) => Math.max(p, i + 1)), ms));
    // Each card snaps as it turns over.
    const flips = Array.from({ length: dealt }, (_, i) => setTimeout(() => playSound('flip'), 300 + i * FLIP_GAP + 150));
    return () => [...timers, ...flips].forEach(clearTimeout);
  }, [dealt]);

  const bonusPaid = (week?.bonus ?? 0) > 0;

  useEffect(() => {
    if (phase === 1) {
      settle.set(withTiming(1, { duration: 500 }));
      reveal.set(withSpring(1, { damping: 12 }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSound('ceiling');
    }
    if (phase === 2) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      playSound('chips');
    }
    if (phase === 3 && bonusPaid) playSound('call');
  }, [phase, settle, reveal, bonusPaid]);

  const chips = useCountUp(week?.chips ?? 0, phase >= 2);
  const bonus = useCountUp(week?.bonus ?? 0, phase >= 3);
  const fan = useAnimatedStyle(() => ({ opacity: reveal.get(), transform: [{ scale: 0.6 + 0.4 * reveal.get() }, { translateY: (1 - reveal.get()) * -40 }] }));

  if (!deck || !week) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, backgroundColor: t.bg }}>
        <Display size={26}>That week has no Showdown.</Display>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const { game } = deck;
  const unlocks = unlocksFor(game, week);
  const played = new Map(week.hand?.cards.map((c): [Day, Suit | undefined] => [c.day, c.suit ?? undefined]) ?? []);
  const dealtDays = week.slots.filter((s) => s.card).map((s) => s.day);

  const close = () => {
    if (!demo && lastShowdown(game)?.start === week.start) setPrefs({ showdownSeen: { ...prefs.showdownSeen, [seed]: week.start } });
    router.back();
  };

  // Skip jumps to the result rather than leaving, so the chips and unlocks are still seen.
  const skip = () => {
    setSkipped(true);
    playSound('chips');
    if (bonusPaid) playSound('call', 350);
    settle.set(withTiming(1, { duration: 300 }));
    reveal.set(withTiming(1, { duration: 300 }));
    setPhase(4);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg, gap: space.xl, alignItems: 'center' }}>
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label color={t.accent}>Showdown</Label>
          <Pressable onPress={phase >= 4 ? close : skip} hitSlop={12} accessibilityRole="button">
            <Body weight="heavy" color={t.textSecondary}>{phase >= 4 ? 'Done' : 'Skip'}</Body>
          </Pressable>
        </View>
        <Display size={34} style={{ textAlign: 'center' }}>{weekOf(week.start)}</Display>

        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          {week.slots.map((slot, i) => (
            <View key={slot.day} style={{ marginLeft: i ? -4 : 0 }}>
              {slot.card ? (
                <FlipCard face={faceOfDay(slot.card, played.get(slot.day))} back={look.back} delay={skipped ? 0 : 300 + dealtDays.indexOf(slot.day) * FLIP_GAP} held={played.has(slot.day)} settle={settle} />
              ) : (
                <CardSlot size="sm" color={t.dashed} />
              )}
            </View>
          ))}
        </View>

        {week.hand ? (
          <Animated.View style={[{ alignItems: 'center', gap: space.lg }, fan]}>
            <HandFan faces={playedFaces(week.hand.cards)} size="lg" spread={0.42} tilt={12} />
            <Display size={30} style={{ textAlign: 'center' }}>{week.hand.title}</Display>
          </Animated.View>
        ) : (
          <Body color={t.textSecondary} style={{ textAlign: 'center' }}>No cards this week. A new hand starts every Monday.</Body>
        )}

        {phase >= 2 && week.hand ? (
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <Chips value={chips} size={34} sign color={t.text} />
            <Body size={14} weight="bold" color={t.textSecondary}>{`${HANDS[week.hand.kind].name} pays ${week.chips}`}</Body>
          </View>
        ) : null}

        {phase >= 3 ? (
          <View style={{ alignSelf: 'stretch', borderRadius: radius.lg, padding: space.lg, gap: space.xs, backgroundColor: week.madeCall ? chip.bg : t.surface }}>
            {week.call ? (
              <>
                <Label color={week.madeCall ? chip.ink : t.textSecondary}>{`Your call: ${HANDS[week.call].name}`}</Label>
                {week.madeCall ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Display size={24} color={chip.ink}>Called it.</Display>
                    <Chips value={bonus} size={22} sign color={chip.ink} />
                  </View>
                ) : (
                  <Body weight="bold">Not this time. A missed call costs nothing, so call high when you feel it.</Body>
                )}
              </>
            ) : (
              <Body weight="bold" color={t.textSecondary}>No call this week. Call your hand on Monday and win its chips twice.</Body>
            )}
          </View>
        ) : null}

        {phase >= 4 ? (
          <View style={{ alignSelf: 'stretch', gap: space.md }}>
            {unlocks.firstOfKind && week.hand ? (
              <Unlock title={`Your first ${HANDS[week.hand.kind].name}`} body="It’s in your Hall of Hands now." />
            ) : null}
            {unlocks.backs.map((key) => (
              <Unlock
                key={key}
                art={<CardBack back={key} size="xs" />}
                title={`New card back: ${BACKS.find((b) => b.key === key)?.name}`}
                action={look.back === key ? undefined : { label: 'Use it', onPress: () => look.setLook({ back: key }) }}
              />
            ))}
            {unlocks.tables.map((key) => (
              <Unlock
                key={key}
                art={<TableSwatch table={key} />}
                title={`${TABLES.find((x) => x.key === key)?.name} is open`}
                body={TABLES.find((x) => x.key === key)?.about}
                action={look.table === key ? undefined : { label: 'Sit down', onPress: () => look.setLook({ table: key }) }}
              />
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xs }}>
              <Body weight="bold" color={t.textSecondary}>Your stack</Body>
              <Chips value={game.stack} size={20} color={t.text} />
            </View>
            <Button label={week.hand ? 'Rake it in' : 'Close'} onPress={close} style={{ marginTop: space.sm }} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function TableSwatch({ table }: { table: TableKey }) {
  const theme = table === 'kitchen' ? null : tables[table];
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme?.bg ?? '#ECE8F4', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme?.accent ?? '#17121F' }} />
    </View>
  );
}

function Unlock({ art, title, body, action }: { art?: ReactNode; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.bgRaised, borderRadius: radius.lg, padding: space.md }}>
      {art ?? (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: chip.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Display size={20} color={chip.ink}>★</Display>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Body weight="heavy">{title}</Body>
        {body ? <Body size={13} color={t.textSecondary}>{body}</Body> : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} style={{ backgroundColor: t.accent, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Body weight="heavy" size={13} color={t.onAccent}>{action.label}</Body>
        </Pressable>
      ) : null}
    </View>
  );
}

