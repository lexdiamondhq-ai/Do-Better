import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Image, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type View as ViewType } from 'react-native';
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { CardBack } from '@/components/CardBack';
import { ChipIcon, Chips, formatChips } from '@/components/Chips';
import { fanCardWidth, fanLayout, HandRow, playedFaces } from '@/components/HandFan';
import { CARD_SIZES, CardSlot, faceLabel, faceOfDay, PlayingCard, type CardFace } from '@/components/PlayingCard';
import { SaveDeckCard } from '@/components/SaveDeckCard';
import { ShareButton } from '@/components/ShareButton';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Display, Label, raisedStyle } from '@/components/ui';
import { SUIT_INFO, type Suit } from '@/engine/cards';
import { nextFace, suitDays } from '@/engine/court';
import { addDays, weekday, type Day } from '@/engine/day';
import { inDeck, type DayCard } from '@/engine/deal';
import { BACKS, chapterRecap, lastShowdown, TABLES, unlocksFor, weekReview, weekTotal, type BackKey, type Game, type TableKey, type Week, type WeekReview } from '@/engine/game';
import { indexCheckIns } from '@/engine/kept';
import { HANDS, type Hand, type PlayedCard } from '@/engine/poker';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { useDeck, useLook } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { weekOf, weekRange } from '@/lib/format';
import { courtHabits, dealHabits, gameInput } from '@/lib/play';
import { usePrefs } from '@/lib/prefs';
import { useReviewAsk } from '@/lib/review';
import { callLine, feltFor, handLines, suitedLine, weekLine, type Felt } from '@/lib/share';
import { playSound } from '@/lib/sound';
import type { Habit } from '@/lib/types';
import { mix, withAlpha } from '@/theme/color';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { cardColors, fontScale, radius, space, tables, TAP } from '@/theme/tokens';

/** How long the table waits for a tap before it turns the next card itself. */
const IDLE_MS = 1500;
/** How long the river waits to be held before it turns on its own, so nobody is left stuck. */
const RIVER_WAIT_MS = 4500;
const FLIP_MS = 420;
const GATHER_MS = 820;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FELT_GRAIN = require('@/assets/felt.png');

/** A card's centre, tilt and scale on the stage. */
type Spot = { x: number; y: number; r: number; s: number };

type StageItem = {
  key: string;
  index: number;
  face: CardFace;
  /** What a screen reader hears once it's turned. */
  label: string;
  day: string;
  arc: Spot;
  /** Its place in the fan, for the five cards that make the hand. */
  fan: Spot | null;
  /** Which of the five it is, left to right, so the fan overlaps in order. */
  at: number | null;
  river: boolean;
};

type Empty = { key: string; day: string; arc: Spot };

/**
 * Where everything sits: the week face down in a 4 + 3 arc with the river below it, and the fan the best
 * five fly into. Cards are drawn at fan size and scaled down in the arc, so they stay sharp as they grow.
 */
function stageGeometry(width: number, lift = 0, count = 5) {
  const gutter = space.xl;
  const fanW = fanCardWidth(width - gutter * 2);
  const ratio = CARD_SIZES.lg.h / CARD_SIZES.lg.w;
  const fanH = Math.round(fanW * ratio);
  // A week with fewer than five cards still fans them from the middle.
  const fan = fanLayout(Math.max(1, count), fanW, fanH, 0.55, 9);
  const fanLeft = (width - fan.width) / 2;
  const gap = 10;
  const aw = Math.min(80, Math.floor((width - gutter * 2 - gap * 3) / 4));
  const ah = Math.round(aw * ratio);
  const rowGap = 26;
  const rw = Math.round(aw * 1.16);
  const rh = Math.round(rw * ratio);
  const top = 6 + lift;
  const row = (i: number, n: number, y: number): Spot => {
    const off = i - (n - 1) / 2;
    return { x: width / 2 + off * (aw + gap), y: y + off * off * 3, r: off * 3, s: aw / fanW };
  };
  const days: Spot[] = [0, 1, 2, 3].map((i) => row(i, 4, top + ah / 2)).concat([0, 1, 2].map((i) => row(i, 3, top + ah * 1.5 + rowGap)));
  const riverY = top + ah * 2 + rowGap * 2 + 4 + rh / 2;
  const river: Spot = { x: width / 2, y: riverY, r: 0, s: rw / fanW };
  const fanSpots: Spot[] = fan.spots.map((p) => ({ x: fanLeft + p.left + fanW / 2, y: p.top + fanH / 2, r: p.rotate, s: 1 }));
  return {
    fanW,
    fanH,
    fanHeight: fan.height,
    fanSpots,
    aw,
    ah,
    days,
    river,
    rw,
    rh,
    revealHeight: riverY + rh / 2 + 40,
    deck: { x: width / 2, y: -40 },
  };
}

type Geometry = ReturnType<typeof stageGeometry>;

/** The cards on the stage: every dealt day, then the river, with the five that make the hand marked for the fan. */
function stageItems(week: Week, geo: Geometry): { items: StageItem[]; empty: Empty[] } {
  const hand = week.hand;
  const playedBy = new Map<string, { card: PlayedCard; at: number }>();
  hand?.cards.forEach((card, at) => playedBy.set(card.river ? 'river' : card.day, { card, at }));
  const items: StageItem[] = [];
  const empty: Empty[] = [];
  const faceFor = (card: DayCard, played: PlayedCard | undefined): CardFace =>
    card.kind === 'joker' && played ? { kind: 'joker', as: { rank: played.rank, suit: played.suit } } : faceOfDay(card, played?.suit ?? null);
  week.slots.forEach((slot, i) => {
    const day = DAY_NAMES[weekday(slot.day)];
    if (!slot.card) {
      empty.push({ key: slot.day, day, arc: geo.days[i] });
      return;
    }
    const played = playedBy.get(slot.day);
    const face = faceFor(slot.card, played?.card);
    items.push({ key: slot.day, index: items.length, face, label: `${day}: ${faceLabel(face)}`, day, arc: geo.days[i], fan: played ? geo.fanSpots[played.at] : null, at: played?.at ?? null, river: false });
  });
  const river = week.river.card;
  if (river) {
    const played = playedBy.get('river');
    const face = faceFor(river, played?.card);
    items.push({ key: 'river', index: items.length, face, label: `The river: ${faceLabel(face)}`, day: 'River', arc: geo.river, fan: played ? geo.fanSpots[played.at] : null, at: played?.at ?? null, river: true });
  }
  return { items, empty };
}

type Phase = 'turn' | 'gather' | 'result';

/**
 * Sunday night. The week's cards are dealt face down on the felt and turned one by one: a tap turns a card,
 * and a pause turns the next one anyway. The river card, earned by five days you kept something, is held
 * to turn, last. The best five fly into a fan, the hand stamps down and pays into the stack, and Behind
 * the hand says how the week went. Skip, Reduce Motion and screen readers go straight to the result.
 */
export default function Showdown() {
  const base = useTheme();
  const router = useRouter();
  const { week: start } = useLocalSearchParams<{ week?: string }>();
  const deck = useDeck();
  const week = deck?.game.weeks.find((w) => w.start === start) ?? null;

  if (!deck || !week) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, backgroundColor: base.bg, padding: space.xl }}>
        <Display size={26} style={{ textAlign: 'center' }}>
          That week has no Showdown.
        </Display>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }
  return <Table key={week.start} week={week} game={deck.game} />;
}

function Table({ week, game }: { week: Week; game: Game }) {
  const base = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const deck = useDeck();
  const { state, today, seed } = useData();
  const { demo } = useAuth();
  const { prefs, setPrefs, seeShowdown } = usePrefs();
  const { back } = useLook();
  const askReview = useReviewAsk();
  const reduced = useReducedMotion();

  const review = state.status === 'ready' ? weekReview(week, gameInput(state, today, seed)) : null;
  const felt = feltFor(base, review?.lead ?? null);
  // The face-down week sits a little above the middle of the felt below the heading, wherever there's room.
  const room = height - insets.top - insets.bottom - 170;
  const geo = stageGeometry(width, Math.round(Math.min(110, Math.max(0, (room - stageGeometry(width).revealHeight) * 0.4))), week.hand?.cards.length ?? 5);
  const { items, empty } = stageItems(week, geo);
  const riverIndex = items.findIndex((i) => i.river);
  const playable = !!week.hand && !week.warmup;
  const latest = lastShowdown(game)?.start === week.start;
  const firstShowdown = game.weeks.find((w) => !w.warmup && w.hand) === week;
  const total = weekTotal(week);

  // Reduce Motion starts at the result, with every card already turned.
  const startAtResult = reduced || !playable;
  const [phase, setPhase] = useState<Phase>(startAtResult ? 'result' : 'turn');
  const [turned, setTurned] = useState<boolean[]>(() => items.map(() => startAtResult));
  const [instant, setInstant] = useState(startAtResult);
  const [step, setStep] = useState(startAtResult ? 3 : 0);
  const [footerH, setFooterH] = useState(160);
  const gather = useSharedValue(startAtResult ? 1 : 0);
  const quiet = useRef(startAtResult);
  const primary = useRef<ViewType>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The stage is fixed while cards are being turned, unless large text pushes it past the screen.
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const overflows = viewH > 0 && contentH > viewH + 1;

  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  const daysTurned = items.every((item, i) => item.river || turned[i]);
  const riverReady = phase === 'turn' && daysTurned && riverIndex >= 0 && !turned[riverIndex];

  const turn = (i: number) => setTurned((was) => (was[i] ? was : was.map((on, j) => on || j === i)));

  const startGather = () => {
    setPhase('gather');
    gather.set(
      withTiming(1, { duration: GATHER_MS, easing: Easing.inOut(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(setPhase, 'result');
      }),
    );
  };

  // The table turns the next card itself when nobody taps for a moment, and gathers the hand once all are up.
  useEffect(() => {
    if (phase !== 'turn') return;
    const next = items.findIndex((item, i) => !item.river && !turned[i]);
    let timer: ReturnType<typeof setTimeout>;
    if (next >= 0) timer = setTimeout(() => turn(next), turned.some(Boolean) ? IDLE_MS : IDLE_MS + 500);
    else if (riverIndex >= 0 && !turned[riverIndex]) timer = setTimeout(() => turn(riverIndex), RIVER_WAIT_MS);
    else timer = setTimeout(startGather, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs again on every turn, which is the point
  }, [phase, turned]);

  // The result lands in beats: the hand stamps down, the chips count up, then the call and the rest.
  useEffect(() => {
    if (phase !== 'result' || instant) return;
    playSound('ceiling');
    feel.ceiling();
    const timers = [
      setTimeout(() => {
        setStep(1);
        playSound('chips');
        feel.chips();
      }, 520),
      setTimeout(() => {
        setStep(2);
        if (week.bonus > 0) playSound('call');
      }, 1550),
      setTimeout(() => setStep(3), 2050),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, instant, week.bonus]);

  // Straight to the result: Skip, or a screen reader, which hears it said instead.
  const jump = (announce: boolean) => {
    quiet.current = true;
    setInstant(true);
    setTurned(items.map(() => true));
    gather.set(withTiming(1, { duration: announce ? 0 : 260 }));
    setPhase('result');
    setStep(3);
    if (!announce) {
      playSound('chips');
      return;
    }
    const call = callLine(week);
    const said = [week.hand ? `${week.hand.title}. Pays ${formatChips(week.chips)} chips.` : '', call?.title ?? '', latest ? `Your stack: ${formatChips(game.stack)} chips.` : ''];
    AccessibilityInfo.announceForAccessibility(said.filter(Boolean).join(' '));
    focusTimer.current = setTimeout(() => {
      if (primary.current && typeof AccessibilityInfo.sendAccessibilityEvent === 'function') AccessibilityInfo.sendAccessibilityEvent(primary.current, 'focus');
    }, 600);
  };

  useEffect(() => {
    // The web always says a screen reader is on, so it can't tell; there the Skip button is the way through.
    if (startAtResult || Platform.OS === 'web') return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (on && live) jump(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the Showdown opens
  }, []);

  const onHalf = (i: number) => {
    if (quiet.current) return;
    if (items[i]?.river) {
      playSound('cardUp');
      feel.joker();
    } else {
      playSound('flip');
      feel.flip();
    }
  };

  const close = () => {
    if (latest && !demo) seeShowdown(seed, week.start);
    askReview('showdown');
    router.back();
  };

  const callNext = () => {
    if (!demo) seeShowdown(seed, week.start);
    router.replace('/call');
  };

  const offerCall = latest && game.callOpen && !game.current.call;
  // Showdowns played while you were away, older than this one and newer than the last you saw.
  const seen = prefs.showdownSeen[seed];
  const away = latest && seen ? game.weeks.filter((w) => w.hand && !w.warmup && w.start > seen && w.start < week.start).reverse() : [];
  const stageHeight = phase === 'result' ? geo.fanHeight + space.sm : geo.revealHeight;
  const hint = !playable ? null : riverReady ? 'Hold the river card to turn it.' : daysTurned ? null : 'Tap a card to turn it over.';

  return (
    <ThemeScope theme={felt.theme}>
      <View style={{ flex: 1, backgroundColor: felt.bg }}>
        <FeltBackground felt={felt} />
        <ScrollView
          scrollEnabled={phase === 'result' || overflows}
          onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_w, h) => setContentH(h)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: (phase === 'result' ? footerH : insets.bottom) + space.lg, paddingHorizontal: space.xl }}
        >
          <TopBar
            range={weekRange(week.start)}
            right={
              phase !== 'result' ? (
                <Pressable
                  onPress={() => jump(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Skip to the result"
                  hitSlop={8}
                  style={({ pressed }) => ({ minHeight: TAP, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: felt.theme.border, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Body weight="heavy" size={14} maxFontSizeMultiplier={fontScale.chrome}>
                    Skip
                  </Body>
                </Pressable>
              ) : latest && playable ? (
                <StackPill stack={game.stack} from={game.stack - total} run={step >= 1} instant={instant} />
              ) : null
            }
          />
          <View style={{ gap: space.xs, marginTop: space.sm, marginBottom: space.lg, minHeight: 74 }}>
            <Display size={30} header>
              {weekOf(week.start)}
            </Display>
            {phase === 'result' ? (
              review && playable ? (
                <Body size={15} weight="bold" color={felt.theme.textSecondary} numberOfLines={2}>
                  {weekLine(review)}
                </Body>
              ) : null
            ) : (
              <Body size={15} weight="bold" color={felt.theme.textSecondary}>
                {firstShowdown ? `Your week’s cards turn over. The best five make your hand, and it pays chips into your stack. ${hint ?? ''}` : (hint ?? ' ')}
              </Body>
            )}
          </View>

          {playable ? (
            <View style={{ height: stageHeight, marginHorizontal: -space.xl, zIndex: 2 }}>
              {phase !== 'result'
                ? empty.map((e) => <EmptySpot key={e.key} spot={e} geo={geo} gather={gather} color={felt.theme.dashed} />)
                : null}
              {items.map((item, i) =>
                phase === 'result' && !item.fan ? null : (
                  <StageCard
                    key={item.key}
                    item={item}
                    geo={geo}
                    back={back}
                    felt={felt}
                    turned={phase !== 'turn' || !!turned[i]}
                    instant={instant}
                    gather={gather}
                    ready={item.river ? riverReady : phase === 'turn'}
                    showDay={phase === 'turn'}
                    gathered={phase !== 'turn'}
                    onTurn={() => turn(i)}
                    onHalf={onHalf}
                  />
                ),
              )}
            </View>
          ) : (
            <StaticWeek week={week} back={back} />
          )}

          {phase === 'result' && playable && week.hand ? (
            <Result
              week={week}
              hand={week.hand}
              game={game}
              review={review}
              habits={state.status === 'ready' ? state.habits : []}
              timezone={state.status === 'ready' ? state.profile.timezone : 'UTC'}
              checkIns={state.status === 'ready' ? state.days : []}
              today={today}
              latest={latest}
              step={step}
              instant={instant}
              felt={felt}
              mastered={deck?.cards.find((c) => c.mastered)?.habit ?? null}
              tune={latest && !prefs.music ? () => setPrefs({ music: true }) : null}
              away={away}
              onReplay={(w) => router.push({ pathname: '/showdown', params: { week: w.start } })}
              onEdit={(id, focus) => router.push({ pathname: '/habit/edit', params: { id, focus } })}
            />
          ) : null}
        </ScrollView>

        {phase === 'result' ? (
          <Footer felt={felt} visible={step >= 2 || instant} onHeight={setFooterH} bottom={insets.bottom}>
            {playable && offerCall ? (
              <>
                <View ref={primary} collapsable={false}>
                  <Button label="Call this week’s hand" onPress={callNext} hint="Opens this week’s call" />
                </View>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <ShareButton target={{ kind: 'hand', week }} label="Share" variant="quiet" style={{ flex: 1, paddingHorizontal: space.sm }} />
                  <Button label="Add to my stack" variant="quiet" onPress={close} style={{ flex: 1.4, paddingHorizontal: space.sm }} />
                </View>
              </>
            ) : (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {playable ? <ShareButton target={{ kind: 'hand', week }} label="Share" /> : null}
                <View ref={primary} collapsable={false} style={{ flex: 1 }}>
                  <Button label={latest && playable ? 'Add to my stack' : 'Close'} onPress={close} />
                </View>
              </View>
            )}
          </Footer>
        ) : null}
      </View>
    </ThemeScope>
  );
}

/** The felt: lit from the middle in the colour of the suit that led the week, with a fine grain and darker edges. */
function FeltBackground({ felt }: { felt: Felt }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`glow${id}`} cx="50%" cy="30%" rx="75%" ry="55%" fx="50%" fy="30%">
            <Stop offset="0" stopColor={felt.glow} stopOpacity={1} />
            <Stop offset="0.55" stopColor={mix(felt.glow, felt.bg, 0.6)} stopOpacity={1} />
            <Stop offset="1" stopColor={felt.bg} stopOpacity={1} />
          </RadialGradient>
          <RadialGradient id={`edge${id}`} cx="50%" cy="40%" rx="85%" ry="70%">
            <Stop offset="0.6" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={felt.theme.vignette} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#glow${id})`} />
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#edge${id})`} />
      </Svg>
      <Image source={FELT_GRAIN} resizeMode="repeat" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: felt.theme.felt }]} />
    </View>
  );
}

function TopBar({ range, right }: { range: string; right: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: TAP }}>
      <Label>{`Showdown · ${range}`}</Label>
      {right}
    </View>
  );
}

/** A dashed place in the arc for a day with no card. */
function EmptySpot({ spot, geo, gather, color }: { spot: Empty; geo: Geometry; gather: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: 1 - gather.get() }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: spot.arc.x - geo.aw / 2, top: spot.arc.y - geo.ah / 2, alignItems: 'center', gap: 6 }, style]}>
      <CardSlot size="md" color={color} style={{ width: geo.aw, height: geo.ah, transform: [{ rotate: `${spot.arc.r}deg` }] }} />
      <Label>{spot.day}</Label>
    </Animated.View>
  );
}

/**
 * One card on the stage. It is dealt in face down, turns when tapped (or when the table moves on), and
 * flies to its place in the fan when it makes the hand, or drops away when it doesn't. The river card
 * turns only while it is held: let go early and it settles back.
 */
function StageCard({
  item,
  geo,
  back,
  felt,
  turned,
  instant,
  gather,
  ready,
  showDay,
  gathered,
  onTurn,
  onHalf,
}: {
  item: StageItem;
  geo: Geometry;
  back: BackKey;
  felt: Felt;
  turned: boolean;
  instant: boolean;
  gather: SharedValue<number>;
  ready: boolean;
  showDay: boolean;
  gathered: boolean;
  onTurn: () => void;
  onHalf: (index: number) => void;
}) {
  const w = geo.fanW;
  const h = geo.fanH;
  const flip = useSharedValue(turned ? 1 : 0);
  const enter = useSharedValue(instant ? 1 : 0);
  const peel = useSharedValue(0);
  const pulse = useSharedValue(0);
  const { arc, fan, river, index } = item;
  const deck = geo.deck;

  useEffect(() => {
    if (instant) enter.set(1);
    else enter.set(withDelay(index * 70, withTiming(1, { duration: 440, easing: Easing.out(Easing.cubic) })));
  }, [enter, index, instant]);

  useEffect(() => {
    if (!turned) return;
    flip.set(instant ? 1 : withTiming(1, { duration: river ? 560 : FLIP_MS, easing: Easing.inOut(Easing.quad) }));
  }, [flip, turned, instant, river]);

  // The river breathes while it waits to be held.
  useEffect(() => {
    if (river && ready && !instant) pulse.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1));
    else pulse.set(withTiming(0, { duration: 200 }));
  }, [pulse, river, ready, instant]);

  // Sound and touch land as the card crosses its edge, in step with what you see.
  useAnimatedReaction(
    () => flip.get() >= 0.5,
    (half, was) => {
      if (half && was === false) scheduleOnRN(onHalf, index);
    },
  );

  const place = useAnimatedStyle(() => {
    const e = enter.get();
    const g = gather.get();
    const p = peel.get();
    const fromX = deck.x + (arc.x - deck.x) * e;
    const fromY = deck.y + (arc.y - deck.y) * e;
    const fromR = -12 + (arc.r + 12) * e;
    const fromS = arc.s * (0.5 + 0.5 * e);
    const to = fan ?? { x: arc.x, y: arc.y + 28, r: arc.r, s: arc.s };
    const x = fromX + (to.x - fromX) * g;
    const y = fromY + (to.y - fromY) * g;
    const r = fromR + (to.r - fromR) * g;
    const s = fromS + (to.s - fromS) * g;
    const lift = river ? Math.max(p, pulse.get() * 0.25) : 0;
    return {
      opacity: Math.min(1, e * 2) * (fan ? 1 : 1 - g),
      transform: [{ translateX: x - w / 2 }, { translateY: y - h / 2 - lift * 14 }, { rotate: `${r - lift * 3}deg` }, { scale: s * (1 + lift * 0.07) }],
    };
  });
  const backFace = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${-flip.get() * 180}deg` }] }));
  const frontFace = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${180 - flip.get() * 180}deg` }] }));
  const glow = useAnimatedStyle(() => ({ opacity: river ? Math.max(peel.get(), pulse.get() * 0.5) * (1 - flip.get()) : 0 }));
  const label = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.get() * 2) * (1 - gather.get() * 3) }));

  const holdStart = () => {
    if (!ready || turned) return;
    peel.set(
      withTiming(1, { duration: 850, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) scheduleOnRN(onTurn);
      }),
    );
  };
  const holdEnd = () => {
    if (!turned) peel.set(withSpring(0, { damping: 14 }));
  };

  const tappable = ready && !turned;
  const name = river ? 'The river card, face down' : `${item.day}’s card, face down`;
  return (
    <Animated.View
      pointerEvents={tappable ? 'auto' : 'none'}
      style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, zIndex: gathered ? (item.at === null ? 1 : 20 + item.at) : index }, place]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={turned ? item.label : name}
        accessibilityHint={turned ? undefined : river ? 'Hold to turn it over' : 'Turns it over'}
        accessibilityState={{ disabled: !tappable }}
        // Holding is the gesture; a screen reader, Switch Control or a keyboard turns the river with one action.
        accessibilityActions={river && tappable ? [{ name: 'activate', label: 'Turn it over' }] : undefined}
        onAccessibilityAction={(e) => {
          if (river && tappable && e.nativeEvent.actionName === 'activate') onTurn();
        }}
        onPress={river ? undefined : onTurn}
        onPressIn={river ? holdStart : undefined}
        onPressOut={river ? holdEnd : undefined}
        onLongPress={river ? () => {} : undefined}
        delayLongPress={2000}
        style={{ flex: 1 }}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.md, boxShadow: `0px 0px 36px 10px ${withAlpha(felt.theme.text, 0.55)}` }, glow]} />
        <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: 'hidden' }, backFace]}>
          <CardBack back={back} size="lg" width={w} />
          {river ? <RiverMark w={w} h={h} /> : null}
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: 'hidden' }, frontFace]}>
          <PlayingCard face={item.face} size="lg" width={w} />
        </Animated.View>
      </Pressable>
      {showDay ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: h + 8 / arc.s, alignItems: 'center', transform: [{ scale: 1 / arc.s }] }, label]}>
          <Label>{river ? (turned ? 'River' : ready ? 'Hold to turn' : 'Turns last') : item.day}</Label>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** The river's back wears a ring, so it reads as the card still to come. */
function RiverMark({ w, h }: { w: number; h: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: radius.md, borderWidth: 3, borderColor: 'rgba(255, 253, 248, 0.85)' }} />
    </View>
  );
}

/** A finished week with nothing to turn: the warm-up week. Its cards face up, in a row. */
function StaticWeek({ week, back }: { week: Week; back: BackKey }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.lg, alignItems: 'center', paddingVertical: space.xl }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
        {week.slots.map((slot) => (slot.card ? <PlayingCard key={slot.day} face={faceOfDay(slot.card)} size="sm" /> : <CardSlot key={slot.day} size="sm" color={t.dashed} />))}
      </View>
      <Body weight="bold" style={{ textAlign: 'center' }}>
        {week.warmup
          ? 'Your warm-up week. Its cards count in your Court and your kept days. Your first full hand was dealt the Monday after.'
          : 'No cards this week. A new hand starts every Monday.'}
      </Body>
      {!week.slots.some((s) => s.card) ? <CardBack back={back} size="md" /> : null}
    </View>
  );
}

/** Your stack, top right, counting up as the week's chips land. */
function StackPill({ stack, from, run, instant }: { stack: number; from: number; run: boolean; instant: boolean }) {
  const value = useCountUp(stack - from, run, instant, 1100);
  return (
    <View accessible accessibilityLabel={`Your stack: ${formatChips(stack)} chips`}>
      <Chips value={from + value} size={16} pill />
    </View>
  );
}

/**
 * A number that runs up to `to` once `run` turns on, a frame at a time, with a tick you can feel every
 * tenth of the way. Only the small piece of screen showing it redraws.
 */
function useCountUp(to: number, run: boolean, instant: boolean, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run || instant || to <= 0) return;
    let frame = 0;
    let decile = 0;
    let began: number | null = null;
    // Timed by the frames themselves, not the wall clock, so a clock change mid-count can't stall or skip it.
    const tick = (now: number) => {
      began ??= now;
      const p = Math.min(1, (now - began) / duration);
      setValue(Math.round(to * (1 - (1 - p) ** 3)));
      const d = Math.floor(p * 10);
      if (d > decile) {
        decile = d;
        feel.tick();
      }
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, run, instant, duration]);
  return instant ? to : run ? value : 0;
}

function CountUp({ to, run, instant, size, sign }: { to: number; run: boolean; instant: boolean; size: number; sign?: boolean }) {
  const value = useCountUp(to, run, instant);
  return (
    <View accessible accessibilityLabel={`${sign ? '+' : ''}${formatChips(to)} chips`}>
      <Chips value={value} size={size} sign={sign} />
    </View>
  );
}

function Result({
  week,
  hand,
  game,
  review,
  habits,
  timezone,
  checkIns,
  today,
  latest,
  step,
  instant,
  felt,
  mastered,
  tune,
  away,
  onReplay,
  onEdit,
}: {
  week: Week;
  hand: Hand;
  game: Game;
  review: WeekReview | null;
  habits: readonly Habit[];
  timezone: string;
  checkIns: readonly { habitId: string; day: Day; level: 'floor' | 'ceiling' }[];
  today: Day;
  latest: boolean;
  step: number;
  instant: boolean;
  felt: Felt;
  mastered: Habit | null;
  tune: (() => void) | null;
  away: readonly Week[];
  onReplay: (week: Week) => void;
  onEdit: (id: string, focus: 'floor' | 'ceiling') => void;
}) {
  const t = useTheme();
  const stamp = useSharedValue(instant ? 1 : 0);
  const rest = useSharedValue(instant ? 1 : 0);
  const call = callLine(week);
  const lines = handLines(hand);
  const suited = suitedLine(hand);

  useEffect(() => {
    stamp.set(instant ? 1 : withSpring(1, { damping: 11, stiffness: 190, mass: 0.8 }));
  }, [stamp, instant]);
  useEffect(() => {
    if (step >= 3) rest.set(instant ? 1 : withTiming(1, { duration: 380 }));
  }, [rest, step, instant]);

  const stampStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, stamp.get() * 1.5), transform: [{ scale: 1.35 - 0.35 * stamp.get() }] }));
  const restStyle = useAnimatedStyle(() => ({ opacity: rest.get(), transform: [{ translateY: (1 - rest.get()) * 16 }] }));

  return (
    <View style={{ gap: space.xl, marginTop: space.md }}>
      <Animated.View style={[{ alignItems: 'center', gap: 2 }, stampStyle]} accessible accessibilityRole="header" accessibilityLabel={hand.title}>
        <Display size={44} style={{ textAlign: 'center' }}>
          {lines.name}
        </Display>
        {lines.detail ? (
          <Display size={20} color={t.textSecondary} style={{ textAlign: 'center' }}>
            {lines.detail}
          </Display>
        ) : null}
        {suited ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm }}>
            <SuitGlyph suit={hand.suited!.suit} size={14} color={t.text} />
            <Body size={14} weight="bold">
              {suited}
            </Body>
          </View>
        ) : null}
      </Animated.View>

      <Payout week={week} call={call} step={step} instant={instant} />

      <Animated.View style={[{ gap: space.xl }, restStyle]} pointerEvents={step >= 3 ? 'auto' : 'none'}>
        <Unlocks game={game} week={week} />
        {review ? (
          <BehindTheHand
            week={week}
            review={review}
            habits={habits}
            timezone={timezone}
            checkIns={checkIns}
            today={today}
            game={game}
            mastered={latest ? mastered : null}
            onEdit={latest ? onEdit : null}
          />
        ) : null}
        <Chapter game={game} week={week} />
        {away.length ? <Away weeks={away} onReplay={onReplay} /> : null}
        {tune ? <TuneRow onPress={tune} /> : null}
        {latest ? <SaveDeckCard moment="showdown" /> : null}
      </Animated.View>
    </View>
  );
}

/** What the week pays: the hand, then the call, then the week's total, each counted in as it lands. */
function Payout({ week, call, step, instant }: { week: Week; call: ReturnType<typeof callLine>; step: number; instant: boolean }) {
  const t = useTheme();
  const total = weekTotal(week);
  const bonus = week.bonus > 0;
  const name = week.hand ? HANDS[week.hand.kind].name : '';
  return (
    <View style={{ gap: space.md, alignItems: 'center' }}>
      <CountUp to={total} run={step >= 1} instant={instant} size={40} sign />
      {bonus ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' }} accessible accessibilityLabel={`${name} pays ${week.chips}, the call pays ${week.bonus}`}>
          <Piece label={name} chips={week.chips} />
          <Body weight="heavy" color={t.textSecondary}>
            +
          </Body>
          <Piece label={week.callMultiplier > 1 ? `Call ×${week.callMultiplier}` : 'Call'} chips={week.bonus} />
        </View>
      ) : null}
      {call && (step >= 2 || instant) ? <CallPanel call={call} week={week} /> : <View style={{ height: 1 }} />}
    </View>
  );
}

function Piece({ label, chips }: { label: string; chips: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1.5, borderColor: t.border, paddingVertical: 4, paddingLeft: space.md, paddingRight: space.sm }}>
      <Body size={13} weight="heavy">
        {label}
      </Body>
      <ChipIcon size={14} />
      <Body size={13} weight="heavy">
        {formatChips(chips)}
      </Body>
    </View>
  );
}

function CallPanel({ call, week }: { call: NonNullable<ReturnType<typeof callLine>>; week: Week }) {
  const t = useTheme();
  const made = call.kind === 'made';
  return (
    <View style={[{ alignSelf: 'stretch', borderRadius: radius.lg, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md }, raisedStyle(t)]}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: made ? t.onRaised : 'transparent',
          borderWidth: made ? 0 : 1.5,
          borderColor: t.onRaisedSecondary,
        }}
      >
        <Display size={20} color={made ? t.raised : t.onRaisedSecondary}>
          {made ? '✓' : call.kind === 'missed' ? '·' : '?'}
        </Display>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="heavy" color={t.onRaised}>
          {call.title}
        </Body>
        {call.detail ? (
          <Body size={14} color={t.onRaisedSecondary}>
            {call.detail}
          </Body>
        ) : null}
      </View>
      {made && week.bonus > 0 ? <Chips value={week.bonus} size={15} sign color={t.onRaised} /> : null}
    </View>
  );
}

type UnlockItem = { key: string; art?: ReactNode; title: string; body?: string; action?: { label: string; onPress: () => void } };

/** What the week opened. One row, and the rest a tap away, so five at once still feel like news. */
function Unlocks({ game, week }: { game: Game; week: Week }) {
  const look = useLook();
  const [all, setAll] = useState(false);
  const unlocks = unlocksFor(game, week);
  const played = game.weeks.filter((w) => !w.warmup && w.hand);
  const bestEver = game.bestEver?.week === week.start && played[0] !== week && !unlocks.firstOfKind;
  const list: UnlockItem[] = [];
  if (unlocks.firstOfKind && week.hand) list.push({ key: 'first', title: `Your first ${HANDS[week.hand.kind].name}`, body: 'It’s in your Hall of Hands now.' });
  if (bestEver) list.push({ key: 'best', title: 'Best hand ever', body: 'It’s at the top of your Hall of Hands.' });
  for (const key of unlocks.backs) {
    const info = BACKS.find((b) => b.key === key);
    list.push({ key, art: <CardBack back={key} size="xs" />, title: `New card back: ${info?.name}`, body: info?.how, action: look.back === key ? undefined : { label: 'Use it', onPress: () => look.setLook({ back: key }) } });
  }
  for (const key of unlocks.tables) {
    const info = TABLES.find((x) => x.key === key);
    list.push({ key, art: <TableSwatch table={key} />, title: `${info?.name} is open`, body: info?.about, action: look.table === key ? undefined : { label: 'Sit down', onPress: () => look.setLook({ table: key }) } });
  }
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 1);
  return (
    <View style={{ gap: space.sm }}>
      {shown.map(({ key, ...u }) => (
        <Unlock key={key} {...u} />
      ))}
      {list.length > shown.length ? <Button label={`+${list.length - shown.length} more`} variant="quiet" onPress={() => setAll(true)} /> : null}
    </View>
  );
}

function TableSwatch({ table }: { table: TableKey }) {
  const theme = table === 'kitchen' ? null : tables[table];
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme?.bg ?? '#ECE8F4', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme?.accent ?? '#17121F' }} />
    </View>
  );
}

function Unlock({ art, title, body, action }: Omit<UnlockItem, 'key'>) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.md }, raisedStyle(t)]}>
      {art ?? (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.onRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Display size={20} color={t.raised}>
            ★
          </Display>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Body weight="heavy" color={t.onRaised}>
          {title}
        </Body>
        {body ? (
          <Body size={13} color={t.onRaisedSecondary}>
            {body}
          </Body>
        ) : null}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({ backgroundColor: t.onRaised, borderRadius: radius.pill, minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, opacity: pressed ? 0.7 : 1 })}
        >
          <Body weight="heavy" size={13} color={t.raised}>
            {action.label}
          </Body>
        </Pressable>
      ) : null}
    </View>
  );
}

type Cell = 'ceiling' | 'floor' | 'none' | 'off';

/**
 * Behind the hand: how the week went, habit by habit. A row of seven for each card, its kept days, a
 * check on the one kept most, one small fix for the one that struggled, and how far the week moved the
 * Court.
 */
function BehindTheHand({
  week,
  review,
  habits,
  timezone,
  checkIns,
  today,
  game,
  mastered,
  onEdit,
}: {
  week: Week;
  review: WeekReview;
  habits: readonly Habit[];
  timezone: string;
  checkIns: readonly { habitId: string; day: Day; level: 'floor' | 'ceiling' }[];
  today: Day;
  game: Game;
  mastered: Habit | null;
  onEdit: ((id: string, focus: 'floor' | 'ceiling') => void) | null;
}) {
  const t = useTheme();
  const byId = new Map(habits.map((h) => [h.id, h]));
  const deal = new Map(dealHabits(habits, timezone).map((h) => [h.id, h]));
  const index = indexCheckIns(checkIns);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
  const cells = (id: string): Cell[] =>
    days.map((d) => {
      const level = index.get(id)?.get(d);
      if (level) return level;
      const h = deal.get(id);
      return h && inDeck(h, d) && d <= today ? 'none' : 'off';
    });
  const weakest = review.habits.find((h) => h.id === review.weakest);
  // An archived card can't be edited, so it never gets the nudge.
  const weakHabit = weakest ? byId.get(weakest.id) : null;
  const fixable = !!weakHabit && !weakHabit.archivedAt;
  const fix = weakest && fixable && weakest.days >= 3 && weakest.kept / weakest.days <= 0.5 ? weakest : null;
  const court = courtLine(week, review, habits, checkIns, game);

  return (
    <View style={[{ borderRadius: radius.lg, padding: space.lg, gap: space.lg }, raisedStyle(t)]}>
      <Display size={24} color={t.onRaised} header>
        Behind the hand
      </Display>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Stat value={review.dealt} label={review.dealt === 1 ? 'day dealt' : 'days dealt'} />
        <Stat value={review.keptDays} label="kept days" />
        <Stat value={review.ceilings} label={review.ceilings === 1 ? 'Ceiling' : 'Ceilings'} />
      </View>
      <View style={{ gap: space.md }}>
        <View aria-hidden style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: -space.xs }}>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Body key={i} size={10} weight="heavy" color={t.onRaisedSecondary} maxFontSizeMultiplier={fontScale.graphic} style={{ width: 11, textAlign: 'center' }}>
                {d}
              </Body>
            ))}
          </View>
          <View style={{ width: 32 + 22 + space.sm }} />
        </View>
        {review.habits.map((hw) => {
          const habit = byId.get(hw.id);
          if (!habit) return null;
          const color = cardColors[habit.color];
          const best = hw.id === review.best;
          return (
            <View
              key={hw.id}
              accessible
              accessibilityLabel={`${habit.name}: kept ${hw.kept} of ${hw.days} days, ${hw.ceilings} at the Ceiling${best ? '. Kept most this week' : ''}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
            >
              <SuitGlyph suit={habit.suit} size={13} color={color.onDark} />
              <Body weight="heavy" color={t.onRaised} numberOfLines={1} style={{ flex: 1 }}>
                {habit.name}
              </Body>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {cells(hw.id).map((c, i) => (
                  <View
                    key={i}
                    style={{
                      width: 11,
                      height: 18,
                      borderRadius: 3,
                      backgroundColor: c === 'ceiling' ? color.onDark : c === 'floor' ? withAlpha(color.onDark, 0.45) : 'transparent',
                      borderWidth: c === 'none' ? 1.5 : 0,
                      borderColor: t.onRaisedSecondary,
                      opacity: c === 'off' ? 0.25 : 1,
                    }}
                  >
                    {c === 'off' ? <View style={{ position: 'absolute', left: 4, top: 8, width: 3, height: 3, borderRadius: 2, backgroundColor: t.onRaised }} /> : null}
                  </View>
                ))}
              </View>
              <Body size={14} weight="heavy" color={t.onRaised} style={{ width: 32, textAlign: 'right' }} maxFontSizeMultiplier={fontScale.chrome}>
                {`${hw.kept}/${hw.days}`}
              </Body>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: best ? t.onRaised : 'transparent' }}>
                {best ? (
                  <Body size={12} weight="heavy" color={t.raised} maxFontSizeMultiplier={fontScale.graphic}>
                    ✓
                  </Body>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <View aria-hidden style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs }}>
        <Key label="Ceiling" fill={t.onRaised} />
        <Key label="Floor" fill={withAlpha(t.onRaised, 0.45)} />
        <Key label="Not kept" outline={t.onRaisedSecondary} />
      </View>
      {fix && weakHabit && onEdit ? (
        <Nudge text={`${weakHabit.name} was kept ${fix.kept} of ${fix.days} days. Make its Floor smaller?`} onPress={() => onEdit(weakHabit.id, 'floor')} />
      ) : null}
      {mastered && onEdit ? <Nudge text={`${mastered.name} is part of you now. Raise its Ceiling?`} onPress={() => onEdit(mastered.id, 'ceiling')} /> : null}
      {court ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }}>
          <SuitGlyph suit={court.suit} size={16} color={t.onRaised} />
          <Body size={14} weight="bold" color={t.onRaised} style={{ flex: 1 }}>
            {court.text}
          </Body>
        </View>
      ) : null}
    </View>
  );
}

function Key({ label, fill, outline }: { label: string; fill?: string; outline?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 9, height: 14, borderRadius: 2, backgroundColor: fill ?? 'transparent', borderWidth: outline ? 1.5 : 0, borderColor: outline }} />
      <Body size={12} weight="bold" color={t.onRaisedSecondary}>
        {label}
      </Body>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${value} ${label}`}>
      <Display size={30} color={t.onRaised}>
        {String(value)}
      </Display>
      <Body size={12} weight="bold" color={t.onRaisedSecondary}>
        {label}
      </Body>
    </View>
  );
}

function Nudge({ text, onPress }: { text: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: t.border, opacity: pressed ? 0.7 : 1 })}
    >
      <Body size={14} weight="bold" color={t.onRaised} style={{ flex: 1 }}>
        {text}
      </Body>
      <Display size={20} color={t.onRaised}>
        →
      </Display>
    </Pressable>
  );
}

/** How far the week moved the suit that led it: "♣ +6 Mind days · 12 to the Queen", or the face card it earned. */
function courtLine(week: Week, review: WeekReview, habits: readonly Habit[], checkIns: readonly { habitId: string; day: Day; level: 'floor' | 'ceiling' }[], game: Game): { suit: Suit; text: string } | null {
  const suit = review.lead;
  if (!suit) return null;
  const end = addDays(week.start, 6);
  const all = suitDays(courtHabits(habits), indexCheckIns(checkIns), suit, end);
  const gained = all.filter((d) => d >= week.start).length;
  const { name, part } = SUIT_INFO[suit];
  const earned = game.faces.find((f) => f.suit === suit && f.day >= week.start && f.day <= end);
  if (earned) return { suit, text: `+${gained} ${part} days · the ${earned.face.name} of ${name}, earned this week` };
  const next = nextFace(all.length);
  return { suit, text: next ? `+${gained} ${part} days · ${next.needed} to the ${next.face.name}` : `+${gained} ${part} days · ${all.length} in all` };
}

/** Every thirteenth week looks back on the chapter it closes. */
function Chapter({ game, week }: { game: Game; week: Week }) {
  const t = useTheme();
  const recap = chapterRecap(game, week);
  if (!recap) return null;
  return (
    <View style={[{ borderRadius: radius.lg, padding: space.lg, gap: space.md }, raisedStyle(t)]}>
      <Label color={t.onRaisedSecondary}>{`Chapter ${recap.chapter} · ${weekRange(recap.start).split(' – ')[0]} to ${weekRange(addDays(recap.end, -6)).split(' – ')[1]}`}</Label>
      <Display size={24} color={t.onRaised}>
        Thirteen weeks, played.
      </Display>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Stat value={recap.keptDays} label="kept days" />
        <Stat value={recap.dealtDays} label="days dealt" />
        <Stat value={recap.faces.length} label={recap.faces.length === 1 ? 'face card' : 'face cards'} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body weight="bold" color={t.onRaised}>
          Chips this chapter
        </Body>
        <Chips value={recap.chips} size={16} color={t.onRaised} />
      </View>
      {recap.best ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <HandRow faces={playedFaces(recap.best.hand.cards)} size="xs" overlap={0.4} accessibilityLabel={`Best hand: ${recap.best.hand.title}`} />
          <Body size={14} weight="bold" color={t.onRaised} style={{ flex: 1 }}>
            {`Best hand: ${recap.best.hand.title}`}
          </Body>
        </View>
      ) : null}
    </View>
  );
}

/** Showdowns that played while you were away: their chips are already in the stack, and each can be replayed. */
function Away({ weeks, onReplay }: { weeks: readonly Week[]; onReplay: (week: Week) => void }) {
  const t = useTheme();
  return (
    <View style={[{ borderRadius: radius.lg, padding: space.lg, gap: space.md }, raisedStyle(t)]}>
      <Display size={22} color={t.onRaised} header>
        While you were away
      </Display>
      <Body size={14} color={t.onRaisedSecondary}>
        {weeks.length === 1 ? 'One more Showdown played without you. Its chips are in your stack.' : `${weeks.length} more Showdowns played without you. Their chips are in your stack.`}
      </Body>
      {weeks.map((w) => (
        <Pressable
          key={w.start}
          onPress={() => onReplay(w)}
          accessibilityRole="button"
          accessibilityLabel={`${weekRange(w.start)}: ${w.hand?.title}. ${weekTotal(w)} chips.`}
          accessibilityHint="Replays this week’s Showdown"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border, opacity: pressed ? 0.7 : 1 })}
        >
          {w.hand ? <HandRow faces={playedFaces(w.hand.cards)} size="xs" overlap={0.4} /> : null}
          <View style={{ flex: 1, gap: 2, alignItems: 'flex-start' }}>
            <Label color={t.onRaisedSecondary}>{weekRange(w.start)}</Label>
            <Body size={14} weight="heavy" color={t.onRaised} numberOfLines={2}>
              {w.hand?.title}
            </Body>
            <Chips value={weekTotal(w)} size={13} sign color={t.onRaised} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function TuneRow({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: t.border, opacity: pressed ? 0.7 : 1 })}
    >
      <Display size={22}>♫</Display>
      <Body weight="heavy" style={{ flex: 1 }}>
        Play the card-room tune
      </Body>
      <Body size={13} weight="bold" color={t.textSecondary}>
        Off
      </Body>
    </Pressable>
  );
}

/** The buttons, pinned above the home indicator on a solid strip of felt, so they never cover the list. */
function Footer({ felt, visible, onHeight, bottom, children }: { felt: Felt; visible: boolean; onHeight: (h: number) => void; bottom: number; children: ReactNode }) {
  const show = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    show.set(withTiming(visible ? 1 : 0, { duration: 260 }));
  }, [show, visible]);
  const style = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ translateY: (1 - show.get()) * 24 }] }));
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: space.lg, paddingBottom: bottom + space.md, paddingHorizontal: space.xl, gap: space.xs, backgroundColor: felt.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: felt.theme.border }, style]}
    >
      {children}
    </Animated.View>
  );
}

