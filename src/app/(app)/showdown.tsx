import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type View as ViewType } from 'react-native';
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { CardBack } from '@/components/CardBack';
import { Chips, formatChips } from '@/components/Chips';
import { fanCardWidth, fanLayout, HandFan, HandRow, HOLD_HINT, HOLD_HINT_H, playedFaces } from '@/components/HandFan';
import { CARD_SIZES, CardSlot, faceLabel, faceOfDay, PlayingCard, StampSeal, type CardFace } from '@/components/PlayingCard';
import { SaveDeckCard } from '@/components/SaveDeckCard';
import { ShareButton } from '@/components/ShareButton';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Display, Label, raisedStyle } from '@/components/ui';
import { WeekStrip } from '@/components/WeekStrip';
import { SUIT_INFO, type Suit } from '@/engine/cards';
import { handChord } from '@/engine/chord';
import { nextFace, suitDays } from '@/engine/court';
import { addDays, weekday, type Day } from '@/engine/day';
import { inDeck, type DayCard } from '@/engine/deal';
import { BACKS, chapterRecap, lastShowdown, TABLES, unlocksFor, weekReview, weekTotal, type BackKey, type Game, type TableKey, type Week, type WeekReview } from '@/engine/game';
import { indexCheckIns } from '@/engine/kept';
import { HANDS, type Hand, type PlayedCard } from '@/engine/poker';
import { chipsAfter, handRhythm } from '@/engine/rhythm';
import { captionsFor, fanOrder, handSoFar, madeThisLine, payoutLine, payoutPieces, stampsFor } from '@/engine/showdown';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { useDeck, useLook } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { weekOf, weekRange } from '@/lib/format';
import { courtHabits, dealHabits, gameInput } from '@/lib/play';
import { hasSeen, usePrefs } from '@/lib/prefs';
import { useReviewAsk } from '@/lib/review';
import { callLine, callPanelLines, captionFacts, feltFor, handLines, payoutSize, stampSize, suitedLine, weekLine, weekSuit, type Felt } from '@/lib/share';
import { playSound, playTones } from '@/lib/sound';
import type { Habit } from '@/lib/types';
import { mix, withAlpha } from '@/theme/color';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { cardColors, fontScale, fonts, radius, space, tables, TAP } from '@/theme/tokens';

/** How long the table waits for a tap before it turns the next card itself. */
const IDLE_MS = 1500;
/** How long the river waits to be held before it turns on its own, so nobody is left stuck. */
const RIVER_WAIT_MS = 4500;
const FLIP_MS = 420;
/** The river turns bigger and slower than the days: it is the card that decides. */
const RIVER_FLIP_MS = 760;
/** The table holds still on "The river decides" this long before the river can be turned. */
const DECIDE_MS = 600;
const GATHER_MS = 820;
/** How far apart the stamps press into the fan, and when the first one lands after the result. */
const STAMPS_AT_MS = 300;
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
  /** The day's card itself, for naming the hand as the cards turn. */
  card: DayCard;
  /** Its place in the fan, for the five cards that make the hand. */
  fan: Spot | null;
  /** Which of the five it is in the hand (`hand.cards`). */
  at: number | null;
  /** Where it sits in the fan, left to right (a straight climbs low to high), so the fan overlaps in order. */
  pos: number | null;
  river: boolean;
};

type Empty = { key: string; day: string; arc: Spot };

/**
 * Where everything sits: the week face down in a 4 + 3 arc with the river below it, and the fan the best
 * five fly into. Cards are drawn at fan size and scaled down in the arc, so they stay sharp as they grow.
 */
function stageGeometry(width: number, lift = 0, count = 5, fanMax = 150, line = 0) {
  const gutter = space.xl;
  const fanW = fanCardWidth(width - gutter * 2, fanMax);
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
  // The line naming the hand so far sits over the arc, in `line` points of its own.
  const lineTop = 6 + lift;
  const top = lineTop + line;
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
    lineTop,
    line,
    deck: { x: width / 2, y: -40 },
  };
}

type Geometry = ReturnType<typeof stageGeometry>;

/** The cards on the stage: every dealt day, then the river, with the five that make the hand marked for the fan. */
function stageItems(week: Week, geo: Geometry): { items: StageItem[]; empty: Empty[] } {
  const hand = week.hand;
  const playedBy = new Map<string, { card: PlayedCard; at: number; pos: number }>();
  // The same order HandFan fans the hand in, so the cards fly to the very spots the fan then holds.
  const order = fanOrder(hand?.cards.map((c) => c.rank) ?? []);
  hand?.cards.forEach((card, at) => playedBy.set(card.river ? 'river' : card.day, { card, at, pos: order.indexOf(at) }));
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
    items.push({ key: slot.day, index: items.length, face, label: `${day}: ${faceLabel(face)}`, day, arc: geo.days[i], card: slot.card, fan: played ? geo.fanSpots[played.pos] : null, at: played?.at ?? null, pos: played?.pos ?? null, river: false });
  });
  const river = week.river.card;
  if (river) {
    const played = playedBy.get('river');
    const face = faceFor(river, played?.card);
    items.push({ key: 'river', index: items.length, face, label: `The river: ${faceLabel(face)}`, day: 'River', arc: geo.river, card: river, fan: played ? geo.fanSpots[played.pos] : null, at: played?.at ?? null, pos: played?.pos ?? null, river: true });
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
  // `sample` marks the demo deck's week, opened by the tabs layout, so the Showdown can say it is made up.
  const { week: start, replay, sample } = useLocalSearchParams<{ week?: string; replay?: string; sample?: string }>();
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
  return <Table key={week.start} week={week} game={deck.game} replay={replay === '1'} sample={sample === '1'} />;
}

/** A phone this short gets a smaller fan and stamp, so the hand, its total and what it's made of all show above the buttons. */
const SHORT_SCREEN = 700;
/** The week's heading and two lines under it: room for the turning hints and the result's week line alike. */
const HEAD_MIN = Math.round(30 * 1.08) + space.xs + 2 * Math.round(15 * 1.4);

function Table({ week, game, replay, sample }: { week: Week; game: Game; replay: boolean; sample: boolean }) {
  const base = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const deck = useDeck();
  const { state, today, seed } = useData();
  const { demo } = useAuth();
  const { prefs, ready: prefsReady, setPrefs, seeShowdown } = usePrefs();
  const { back } = useLook();
  const askReview = useReviewAsk();
  const reduced = useReducedMotion();

  const review = state.status === 'ready' ? weekReview(week, gameInput(state, today, seed)) : null;
  // The felt takes the colour of the suit the week's words name: Suited, or else the one that led.
  const felt = feltFor(base, weekSuit(review, week.hand));
  const short = height < SHORT_SCREEN;
  const fanMax = short ? 86 : 150;
  const lineH = short ? 42 : 54;
  // The face-down week sits in the lower part of the felt, with the river card in easy reach of a thumb,
  // but takes only a third of the spare room above it, so no tall bare band opens under the header.
  const room = height - insets.top - insets.bottom - 170;
  const lift = Math.round(Math.min(100, Math.max(0, (room - stageGeometry(width, 0, 5, fanMax, lineH).revealHeight) * 0.3)));
  const geo = stageGeometry(width, lift, week.hand?.cards.length ?? 5, fanMax, lineH);
  const { items, empty } = stageItems(week, geo);
  const riverIndex = items.findIndex((i) => i.river);
  const playable = !!week.hand && !week.warmup;
  const latest = lastShowdown(game)?.start === week.start;
  const firstShowdown = game.weeks.find((w) => !w.warmup && w.hand) === week;
  const total = weekTotal(week);
  // Played again: from the Hands tab, or a week whose Showdown was already watched. Its chips went into
  // the stack the night it played, so the stack doesn't count up again and nothing offers to add them.
  const [replayed] = useState(() => {
    const watched = prefs.showdownSeen[seed];
    // The demo's sample week is marked seen as it opens, so its first run is still a first run, not a replay.
    return replay || (!sample && !!watched && watched >= week.start);
  });

  // Reduce Motion starts at the result, with every card already turned.
  const startAtResult = reduced || !playable;
  const [phase, setPhase] = useState<Phase>(startAtResult ? 'result' : 'turn');
  const [turned, setTurned] = useState<boolean[]>(() => items.map(() => startAtResult));
  // Which cards show their face yet: a card counts from the moment it crosses its edge, so the hand is
  // named as you see each card, never before.
  const [faceUp, setFaceUp] = useState<boolean[]>(() => items.map(() => startAtResult));
  // "The river decides": once the days are up, the table holds still a moment before the river can turn.
  const [decided, setDecided] = useState(false);
  // The one-time "Hold a card to read it." goes under the fan on a screen with room for it. Decided once, as
  // the Showdown opens, so the hand's name knows where it will land.
  const [holdHint] = useState(() => !short && prefsReady && !hasSeen(prefs, seed, HOLD_HINT));
  const [instant, setInstant] = useState(startAtResult);
  const [step, setStep] = useState(startAtResult ? 3 : 0);
  const [footerH, setFooterH] = useState(160);
  const [headH, setHeadH] = useState(0);
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
  const daysUp = items.every((item, i) => item.river || faceUp[i]);
  const allUp = items.length > 0 && items.every((_, i) => faceUp[i]);
  const riverPending = phase === 'turn' && riverIndex >= 0 && !turned[riverIndex];
  const riverReady = riverPending && daysTurned && decided;
  // The line over the arc: the hand so far as each card shows, then "The river decides" while the river waits.
  const soFar = phase === 'turn' ? handSoFar(items.filter((_, i) => faceUp[i]).map((item) => item.card)) : null;
  // Said from the moment the days are up until the river's face shows, its turn included.
  const deciding = phase === 'turn' && riverIndex >= 0 && daysUp && !faceUp[riverIndex];
  const soFarText = deciding ? 'The river decides' : soFar ? `${soFar.title}…` : null;
  const soFarSub = deciding && soFar ? `${soFar.title}…` : null;
  // Once every card shows, the hand's name goes up big, and in the gather it drops to where the stamp lands.
  const lines = week.hand ? handLines(week.hand) : null;
  const nameSize = lines ? stampSize(lines.name, width - space.xl * 2, short ? 38 : 44) : 0;
  const finalName = playable && lines && ((phase === 'turn' && allUp) || phase === 'gather') ? lines.name : null;
  const stampTop = geo.fanHeight + (holdHint ? HOLD_HINT_H : 0) + space.sm + (short ? space.xs : space.md);

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
    else if (riverIndex >= 0 && !turned[riverIndex]) {
      // The river only waits to be held once the table has said "The river decides".
      if (!decided) return;
      timer = setTimeout(() => turn(riverIndex), RIVER_WAIT_MS);
    }
    // The last card gets a moment on the table, with the hand's name up big, before the hand gathers.
    else timer = setTimeout(startGather, riverIndex >= 0 ? RIVER_FLIP_MS + 700 : FLIP_MS + 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs again on every turn, which is the point
  }, [phase, turned, decided]);

  // The hold before the river: the last day finishes turning, then the table waits DECIDE_MS.
  useEffect(() => {
    if (!riverPending || !daysUp || decided) return;
    const timer = setTimeout(() => setDecided(true), FLIP_MS / 2 + DECIDE_MS);
    return () => clearTimeout(timer);
  }, [riverPending, daysUp, decided]);

  // A screen reader hears the hand form, card by card (iOS; Android reads the line's live region).
  useEffect(() => {
    if (Platform.OS !== 'ios' || quiet.current || !soFarText) return;
    AccessibilityInfo.announceForAccessibility(soFarSub ? `${soFarText}. ${soFarSub}` : soFarText);
  }, [soFarText, soFarSub]);

  // The hand the result plays, held for this Showdown, so a refresh that re-deals the week never plays it twice.
  const [resultHand] = useState(() => week.hand);

  // Reduce Motion cuts the turning and the gather, not the result's sound and feel: a week with a hand still
  // rings its chord, taps its rhythm and lands its chips once, over a result that is already in place.
  const [calmStart] = useState(() => reduced && playable);

  // The result lands in beats: the hand stamps down, the chips count up, then the call and the rest.
  useEffect(() => {
    if (phase !== 'result' || (instant && !calmStart)) return;
    // The hand taps out its own shape and rings as its chord; with no hand, the plain success. The Ceiling
    // flourish never sounds under the chord.
    const beats = resultHand ? handRhythm(resultHand.kind) : [];
    if (resultHand) {
      feel.rhythm(beats);
      playTones(handChord(resultHand));
    } else {
      playSound('ceiling');
      feel.ceiling();
    }
    // The chips wait for the hand's last beat, so its shape ends before they land; the call and the rest follow.
    const chipsAt = chipsAfter(beats);
    const show = (n: number) => {
      if (!calmStart) setStep(n);
    };
    const timers = [
      setTimeout(() => {
        show(1);
        playSound('chips');
        feel.chips();
      }, chipsAt),
      setTimeout(() => {
        show(2);
        if (week.bonus > 0) playSound('call');
      }, chipsAt + 1030),
      setTimeout(() => show(3), chipsAt + 1530),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, instant, calmStart, week.bonus, resultHand]);

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
    const said = [week.hand ? `${week.hand.title}.` : '', madeThisLine(week) ?? '', payoutLine(week) ? `${payoutLine(week)} chips.` : '', call?.title ?? '', latest ? `Your stack: ${formatChips(game.stack)} chips.` : ''];
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
    setFaceUp((was) => (was[i] ? was : was.map((on, j) => on || j === i)));
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
    // Only the newest Showdown, the first time it plays, is ever a moment to ask for a review.
    if (latest && !replayed) askReview('showdown');
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
  // The fan, in hand order, with each card as the table showed it, so the swap from stage to fan is seamless.
  const hand = week.hand;
  const fanFaces = hand ? hand.cards.map((c, at) => items.find((item) => item.at === at)?.face ?? playedFaces([c])[0]) : [];
  const facts = state.status === 'ready' ? captionFacts(state.habits, state.days) : null;
  // The chips are in the stack the moment the week ends, so the first time through this says where you go
  // next rather than asking you to put them there. A replay just closes.
  const doneLabel = latest && playable && !replayed ? 'On to this week' : 'Close';
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
            eyebrow={sample ? 'Sample week' : week.warmup ? 'Warm-up week' : 'Showdown'}
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
                <StackPill stack={game.stack} from={replayed ? game.stack : game.stack - total} run={step >= 1} instant={instant} />
              ) : null
            }
          />
          <View
            // Never shorter than it has been, so the stage under it stays put as the words change from turning to the result.
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              setHeadH((was) => Math.max(was, h));
            }}
            style={{ gap: space.xs, marginTop: space.sm, marginBottom: short ? space.sm : space.lg, minHeight: Math.max(HEAD_MIN, headH) }}
          >
            <Display size={30} header>
              {weekOf(week.start)}
            </Display>
            {phase === 'result' ? (
              review && playable ? (
                <Body size={15} weight="bold" color={felt.theme.textSecondary} numberOfLines={2}>
                  {weekLine(review, week.hand)}
                </Body>
              ) : null
            ) : (
              <Body size={15} weight="bold" color={felt.theme.textSecondary}>
                {sample
                  ? `This is a sample week from the demo deck. ${hint ?? ''}`
                  : firstShowdown && !replayed
                    ? `Your week’s cards turn over. The best five make your hand, and it pays chips into your stack. ${hint ?? ''}`
                    : (hint ?? ' ')}
              </Body>
            )}
          </View>

          {playable && phase === 'result' && hand ? (
            // The settled fan: the same spots the cards flew to, now stamped, lifting on the hand's rhythm, and
            // each card held to read the day it came from.
            <View style={{ marginHorizontal: -space.xl, paddingBottom: space.sm, zIndex: 2 }}>
              <HandFan
                faces={fanFaces}
                days={hand.cards.map((c) => c.day)}
                stamps={stampsFor(week)}
                captions={facts ? captionsFor(week, facts) : undefined}
                rhythm={instant ? undefined : handRhythm(hand.kind)}
                stampsAt={instant ? undefined : STAMPS_AT_MS}
                hint={holdHint}
                size="lg"
                width={geo.fanW}
                spread={0.55}
                tilt={9}
              />
            </View>
          ) : playable ? (
            <View style={{ height: geo.revealHeight, marginHorizontal: -space.xl, zIndex: 2 }}>
              {empty.map((e) => (
                <EmptySpot key={e.key} spot={e} geo={geo} gather={gather} color={felt.theme.dashed} />
              ))}
              {finalName ? null : <SoFarLine top={geo.lineTop} height={geo.line} text={soFarText} sub={soFarSub} gather={gather} short={short} />}
              {items.map((item, i) => (
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
                  peek={phase !== 'turn' && item.pos !== null && item.pos < (hand?.cards.length ?? 0) - 1 ? 0.55 : undefined}
                  onTurn={() => turn(i)}
                  onHalf={onHalf}
                />
              ))}
              {finalName ? <FinalName name={finalName} size={nameSize} top={geo.lineTop + (geo.line - Math.round(nameSize * 1.08)) / 2} to={stampTop} gather={gather} /> : null}
            </View>
          ) : (
            <StaticWeek week={week} back={back} />
          )}

          {phase === 'result' && playable && week.hand ? (
            <Result
              week={week}
              hand={week.hand}
              handed={!instant}
              game={game}
              review={review}
              habits={state.status === 'ready' ? state.habits : []}
              timezone={state.status === 'ready' ? state.profile.timezone : 'UTC'}
              checkIns={state.status === 'ready' ? state.days : []}
              today={today}
              latest={latest}
              short={short}
              step={step}
              instant={instant}
              felt={felt}
              mastered={deck?.cards.find((c) => c.mastered)?.habit ?? null}
              tune={latest && !prefs.music ? () => setPrefs({ music: true }) : null}
              away={away}
              onReplay={(w) => router.push({ pathname: '/showdown', params: { week: w.start, replay: '1' } })}
              onEdit={(id, focus) => router.push({ pathname: '/habit/edit', params: { id, focus } })}
            />
          ) : null}
        </ScrollView>

        {phase === 'result' ? (
          <Footer felt={felt} visible={step >= 2 || instant} onHeight={setFooterH} bottom={insets.bottom} fade={phase === 'result'}>
            {playable && offerCall ? (
              <>
                <View ref={primary} collapsable={false}>
                  <Button label="Call this week’s hand" onPress={callNext} hint="Opens this week’s call" />
                </View>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <ShareButton target={{ kind: 'hand', week }} label="Share" variant="quiet" style={{ flex: 1, paddingHorizontal: space.sm }} />
                  <Button label={doneLabel} variant="quiet" onPress={close} style={{ flex: 1.4, paddingHorizontal: space.sm }} />
                </View>
              </>
            ) : (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {playable ? <ShareButton target={{ kind: 'hand', week }} label="Share" /> : null}
                <View ref={primary} collapsable={false} style={{ flex: 1 }}>
                  <Button label={doneLabel} onPress={close} />
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

function TopBar({ eyebrow, range, right }: { eyebrow: string; range: string; right: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: TAP }}>
      <Label>{`${eyebrow} · ${range}`}</Label>
      {right}
    </View>
  );
}

/**
 * The line over the arc: the hand so far, renamed as each card shows ("Two pair, Nines and Fours…"), and
 * "The river decides" while the river waits, with the hand so far under it. Each new line rises into place.
 */
function SoFarLine({ top, height, text, sub, gather, short }: { top: number; height: number; text: string | null; sub: string | null; gather: SharedValue<number>; short: boolean }) {
  const style = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, gather.get() * 3) }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[{ position: 'absolute', left: space.xl, right: space.xl, top, height, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {text ? <LineText key={`${text}|${sub ?? ''}`} text={text} sub={sub} size={short ? 20 : 24} /> : null}
    </Animated.View>
  );
}

function LineText({ text, sub, size }: { text: string; sub: string | null; size: number }) {
  const t = useTheme();
  const show = useSharedValue(0);
  useEffect(() => {
    show.set(withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));
  }, [show]);
  const style = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ translateY: (1 - show.get()) * 10 }] }));
  return (
    <Animated.View accessible accessibilityLabel={sub ? `${text}. ${sub}` : text} style={[{ alignItems: 'center' }, style]}>
      <Display size={size} numberOfLines={1} style={{ textAlign: 'center' }}>
        {text}
      </Display>
      {sub ? (
        <Body size={13} weight="heavy" color={t.textSecondary} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome}>
          {sub}
        </Body>
      ) : null}
    </Animated.View>
  );
}

/**
 * The hand's name, up big the moment its last card shows. As the cards gather into the fan it steps aside
 * (fading out while they fly, so the white name never crosses the cream cards) and comes back at the very
 * spot where the result's stamp sits, at the stamp's size, once they have settled, so the stamp simply takes over.
 */
function FinalName({ name, size, top, to, gather }: { name: string; size: number; top: number; to: number; gather: SharedValue<number> }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.set(withSpring(1, { damping: 13, stiffness: 240, mass: 0.7 }));
  }, [pop]);
  const style = useAnimatedStyle(() => {
    const g = gather.get();
    // Out over the gather's first quarter, moved while unseen, back as the cards seat themselves.
    const seen = g < 0.25 ? 1 - g / 0.25 : g > 0.88 ? (g - 0.88) / 0.12 : 0;
    return {
      opacity: Math.min(1, pop.get() * 1.8) * seen,
      transform: [{ translateY: (to - top) * (g < 0.25 ? 0 : 1) }, { scale: 0.55 + 0.45 * pop.get() }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: space.xl, right: space.xl, top, alignItems: 'center', zIndex: 40 }, style]}>
      <Display size={size} numberOfLines={1} style={{ textAlign: 'center' }}>
        {name}
      </Display>
    </Animated.View>
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
  peek,
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
  /** In the fan, how much of the card shows past the next one, so a card with no suit keeps its mark in view. */
  peek?: number;
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
    flip.set(instant ? 1 : withTiming(1, { duration: river ? RIVER_FLIP_MS : FLIP_MS, easing: Easing.inOut(Easing.cubic) }));
  }, [flip, turned, instant, river]);

  // Once the river has turned it settles back into its place, so it never sits lifted over the cards beside it.
  useEffect(() => {
    if (river && turned) peel.set(instant ? 0 : withDelay(240, withSpring(0, { damping: 16, stiffness: 220 })));
  }, [peel, river, turned, instant]);

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
    // The river grows as it turns, biggest edge-on, and settles back as its face lands.
    const pop = river ? Math.sin(Math.PI * Math.min(1, Math.max(0, flip.get()))) * 0.24 : 0;
    return {
      opacity: Math.min(1, e * 2) * (fan ? 1 : 1 - g),
      transform: [{ translateX: x - w / 2 }, { translateY: y - h / 2 - lift * 14 - pop * h * 0.3 }, { rotate: `${r - lift * 3}deg` }, { scale: s * (1 + lift * 0.07 + pop) }],
    };
  });
  const backFace = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${-flip.get() * 180}deg` }] }));
  const frontFace = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${180 - flip.get() * 180}deg` }] }));
  // The glow is gone before the card turns edge-on, so its hollow middle never shows behind the turning card.
  const glow = useAnimatedStyle(() => ({ opacity: river ? Math.max(peel.get(), pulse.get() * 0.5) * Math.max(0, 1 - flip.get() * 5) : 0 }));
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
      // Gathered, each card lies over the one to its left, the way HandFan stacks the fan it lands in. By
      // fan position, not hand order: a straight fans low to high, the reverse of its hand order.
      style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, zIndex: gathered ? (item.pos === null ? 1 : 20 + item.pos) : index }, place]}
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
          <PlayingCard face={item.face} size="lg" width={w} peek={peek} />
        </Animated.View>
      </Pressable>
      {showDay ? (
        // Twice the card's width and centred on it, so "Hold to turn" stays on one line under a small card.
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -w / 2, right: -w / 2, top: h + 8 / arc.s, alignItems: 'center', transform: [{ scale: 1 / arc.s }] }, label]}>
          <Label style={{ textAlign: 'center' }}>{river ? (turned ? 'River' : ready ? 'Hold to turn' : 'Turns last') : item.day}</Label>
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
  return (
    <View style={{ gap: space.lg, alignItems: 'center', paddingVertical: space.xl }}>
      {/* The same seven-day strip as Today: one row with day letters, days before the deck began solid, missed days dashed. */}
      <View style={{ alignSelf: 'stretch' }}>
        <WeekStrip week={week} back={back} rescue={null} />
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

function Result({
  week,
  hand,
  handed,
  game,
  review,
  habits,
  timezone,
  checkIns,
  today,
  latest,
  short,
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
  /** The hand's name dropped into place in the gather, so the stamp takes over from it instead of landing from nowhere. */
  handed: boolean;
  game: Game;
  review: WeekReview | null;
  habits: readonly Habit[];
  timezone: string;
  checkIns: readonly { habitId: string; day: Day; level: 'floor' | 'ceiling' }[];
  today: Day;
  latest: boolean;
  short: boolean;
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
  const { width } = useWindowDimensions();
  const stamp = useSharedValue(instant ? 1 : 0);
  const credit = useSharedValue(instant ? 1 : 0);
  const rest = useSharedValue(instant ? 1 : 0);
  const call = callLine(week);
  const lines = handLines(hand);
  const suited = suitedLine(hand);
  const made = madeThisLine(week);

  useEffect(() => {
    stamp.set(instant ? 1 : withSpring(1, { damping: 11, stiffness: 190, mass: 0.8 }));
  }, [stamp, instant]);
  useEffect(() => {
    if (step >= 1) credit.set(instant ? 1 : withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [credit, step, instant]);
  useEffect(() => {
    if (step >= 3) rest.set(instant ? 1 : withTiming(1, { duration: 380 }));
  }, [rest, step, instant]);

  // Handed over, the name is already in place and lands with a short thump; otherwise it stamps down from above.
  const nameStyle = useAnimatedStyle(() =>
    handed ? { transform: [{ scale: 1.07 - 0.07 * stamp.get() }] } : { opacity: Math.min(1, stamp.get() * 1.5), transform: [{ scale: 1.35 - 0.35 * stamp.get() }] },
  );
  const detailStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, stamp.get() * 1.2) }));
  const creditStyle = useAnimatedStyle(() => ({ opacity: credit.get(), transform: [{ translateY: (1 - credit.get()) * 8 }] }));
  const restStyle = useAnimatedStyle(() => ({ opacity: rest.get(), transform: [{ translateY: (1 - rest.get()) * 16 }] }));

  return (
    <View style={{ gap: short ? space.md : space.lg, marginTop: short ? space.xs : space.md }}>
      <View style={{ alignItems: 'center', gap: short ? space.xs : space.sm }}>
        <View accessible accessibilityRole="header" accessibilityLabel={hand.title} style={{ alignItems: 'center', gap: 2, alignSelf: 'stretch' }}>
          <Animated.View style={nameStyle}>
            <Display size={stampSize(lines.name, width - space.xl * 2, short ? 38 : 44)} numberOfLines={1} style={{ textAlign: 'center' }}>
              {lines.name}
            </Display>
          </Animated.View>
          {lines.detail ? (
            <Animated.View style={detailStyle}>
              <Display size={short ? 18 : 20} color={t.textSecondary} style={{ textAlign: 'center' }}>
                {lines.detail}
              </Display>
            </Animated.View>
          ) : null}
        </View>
        {made ? (
          <Animated.View style={creditStyle}>
            <Credit text={made} short={short} />
          </Animated.View>
        ) : null}
        {/* Below 700 pt the Suited line goes to Behind the hand, so the payout stays above the buttons. */}
        {suited && !short ? (
          <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, detailStyle]}>
            <SuitGlyph suit={hand.suited!.suit} size={14} color={t.text} />
            <Body size={14} weight="bold">
              {suited}
            </Body>
          </Animated.View>
        ) : null}
      </View>

      <Payout week={week} call={call} step={step} instant={instant} short={short} />

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
            suited={suited && short ? { suit: hand.suited!.suit, text: suited } : null}
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

/**
 * The one credit line under the hand. A line about Floor days wears the same ↓ seal as the cards it
 * counts, so the words point at the stamps; a comeback line leads with its own ↺.
 */
function Credit({ text, short }: { text: string; short: boolean }) {
  const floorish = /Floor day/.test(text);
  // The seal stays beside its own sentence: in one wrapped block it would sit out at the left edge, far from
  // the centred words. "Without them: …" goes on the line below.
  const cut = floorish ? text.indexOf('. ') : -1;
  const lead = cut > 0 ? text.slice(0, cut + 1) : text;
  const after = cut > 0 ? text.slice(cut + 2) : '';
  const size = short ? 14 : 15;
  return (
    <View accessible accessibilityLabel={text} style={{ alignItems: 'center', paddingHorizontal: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        {floorish ? <StampSeal stamp="floor" r={short ? 8 : 9} /> : null}
        <Body size={size} weight="heavy" style={{ textAlign: 'center', flexShrink: 1 }}>
          {lead}
        </Body>
      </View>
      {after ? (
        <Body size={size} weight="heavy" style={{ textAlign: 'center' }}>
          {after}
        </Body>
      ) : null}
    </View>
  );
}

/**
 * What the week pays, as one sum that counts: "Straight 100 + Call 100 = 200". The total runs up to the
 * hand's chips, then, as the call lands, its piece shows and the same total runs on to the whole week.
 * Its place is kept from the start, so nothing moves when it shows. With nothing to add: "Straight 100".
 */
function Payout({ week, call, step, instant, short }: { week: Week; call: ReturnType<typeof callLine>; step: number; instant: boolean; short: boolean }) {
  const t = useTheme();
  const pieces = payoutPieces(week);
  const total = weekTotal(week);
  const hasCall = pieces.some((p) => p.label === 'Call');
  const callShown = !hasCall || step >= 2 || instant;
  const first = pieces.filter((p) => p.label !== 'Call').reduce((sum, p) => sum + p.chips, 0);
  const value = useTally(callShown ? total : first, step >= 1, instant);
  const { width } = useWindowDimensions();
  const hidden = (p: { label: string }) => p.label === 'Call' && !callShown;
  // The call piece before it lands: there, but faint.
  const waiting = withAlpha(t.textSecondary, 0.3);
  // One piece is said by its label and the counting total alone ("Straight ●100"), never its number twice.
  const sum = pieces.length > 1;
  const chipsSize = short ? 30 : 36;
  // Sized to stay on one line beside the total, so a long hand never breaks the sum ("… + Call / 140 =").
  const said = sum ? `${pieces.map((p) => `${p.label} ${formatChips(p.chips)}`).join(' + ')} =` : (pieces[0]?.label ?? '');
  const size = payoutSize(said, total, width - space.xl * 2 - space.sm, { max: short ? 17 : 19, chips: chipsSize });
  return (
    <View style={{ gap: short ? space.sm : space.md, alignItems: 'center' }}>
      <View accessible accessibilityLabel={`${payoutLine(week) ?? ''} chips`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, alignSelf: 'stretch' }}>
        {pieces.length ? (
          <Text
            maxFontSizeMultiplier={fontScale.chrome}
            style={{ flexShrink: 1, textAlign: 'right', fontFamily: fonts.displaySemi, fontSize: size, lineHeight: Math.round(size * 1.25), color: t.textSecondary }}
          >
            {pieces.map((p, i) => (
              <Text key={p.label} style={hidden(p) ? { color: waiting } : null}>
                {i ? ' + ' : ''}
                {sum ? `${p.label} ` : p.label}
                {sum ? <Text style={{ color: hidden(p) ? waiting : t.text }}>{formatChips(p.chips)}</Text> : null}
              </Text>
            ))}
            {/* The call and its sign wait faintly in place, so the row reads as a sum from the start and lights up as the call lands. */}
            {sum ? <Text style={callShown ? null : { color: waiting }}> =</Text> : null}
          </Text>
        ) : null}
        <Chips value={value} size={chipsSize} />
      </View>
      {call && (step >= 2 || instant) ? <CallPanel call={call} instant={instant} /> : null}
    </View>
  );
}

/** Like useCountUp, but runs on from wherever it stands when `to` moves, so a sum can grow as its pieces land. */
function useTally(to: number, run: boolean, instant: boolean, duration = 800): number {
  const [value, setValue] = useState(0);
  const at = useRef(0);
  useEffect(() => {
    if (!run || instant) return;
    const from = at.current;
    if (from === to) return;
    let frame = 0;
    let decile = 0;
    let began: number | null = null;
    const tick = (now: number) => {
      began ??= now;
      const p = Math.min(1, (now - began) / duration);
      const v = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
      at.current = v;
      setValue(v);
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

/** The call, said in one line under the sum: made, missed, or none made. */
function CallPanel({ call, instant }: { call: NonNullable<ReturnType<typeof callLine>>; instant: boolean }) {
  const t = useTheme();
  const made = call.kind === 'made';
  const show = useSharedValue(instant ? 1 : 0);
  useEffect(() => {
    show.set(instant ? 1 : withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
  }, [show, instant]);
  const style = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ translateY: (1 - show.get()) * 8 }] }));
  const text = call.detail ? `${call.title} ${call.detail}` : call.title;
  // One line where it fits, sized down a little if it must; a longer sentence breaks at its comma, never
  // leaving a word on its own in the panel. Measured once laid out; until then, from the screen's width.
  const { width } = useWindowDimensions();
  const [room, setRoom] = useState<number | null>(null);
  const set = callPanelLines(text, room ?? width - space.xl * 2 - space.md * 2 - 26 - (space.sm + 2));
  return (
    <Animated.View
      accessible
      accessibilityLabel={text}
      style={[{ alignSelf: 'stretch', borderRadius: radius.md, paddingVertical: space.sm + 2, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 }, raisedStyle(t), style]}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: made ? t.onRaised : 'transparent',
          borderWidth: made ? 0 : 1.5,
          borderColor: t.onRaisedSecondary,
        }}
      >
        <Display size={14} color={made ? t.raised : t.onRaisedSecondary} maxFontSizeMultiplier={fontScale.graphic}>
          {made ? '✓' : call.kind === 'missed' ? '·' : '?'}
        </Display>
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setRoom((r) => (r !== null && Math.abs(r - e.nativeEvent.layout.width) < 0.5 ? r : e.nativeEvent.layout.width))}>
        <Body size={set.size} weight="heavy" color={t.onRaised}>
          {set.lines.join('\n')}
        </Body>
      </View>
    </Animated.View>
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
  suited,
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
  /** The Suited line, here instead of under the hand on a short screen. */
  suited: { suit: Suit; text: string } | null;
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
        <Stat value={review.keptDays} label={review.keptDays === 1 ? 'time kept' : 'times kept'} />
        <Stat value={review.ceilings} label={review.ceilings === 1 ? 'Ceiling' : 'Ceilings'} />
      </View>
      {suited ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <SuitGlyph suit={suited.suit} size={14} color={t.onRaised} />
          <Body size={14} weight="heavy" color={t.onRaised} style={{ flex: 1 }}>
            {suited.text}
          </Body>
        </View>
      ) : null}
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
                  <DayCell key={i} cell={c} color={color.onDark} />
                ))}
              </View>
              <Body size={14} weight="heavy" color={t.onRaised} style={{ width: 32, textAlign: 'right' }} maxFontSizeMultiplier={fontScale.chrome}>
                {`${hw.kept}/${hw.days}`}
              </Body>
              <View
                accessibilityRole={best ? 'image' : undefined}
                accessibilityLabel={best ? 'Kept most this week' : undefined}
                style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: best ? t.onRaised : 'transparent' }}
              >
                {best ? <BestMark /> : null}
              </View>
            </View>
          );
        })}
      </View>
      <View aria-hidden style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs }}>
        <Key label="Ceiling" cell="ceiling" />
        <Key label="Floor" cell="floor" />
        <Key label="Not kept" cell="none" />
        {review.best ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: t.onRaised }}>
              <BestMark size={10} />
            </View>
            <Body size={12} weight="bold" color={t.onRaisedSecondary}>
              Kept most this week
            </Body>
          </View>
        ) : null}
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

/**
 * One day in Behind the hand, told apart by shape as well as colour: a Ceiling fills the cell, a Floor
 * fills its lower half under an outline (the floor of the cell), a day not kept is an empty outline, and a
 * day the card wasn't in the deck is a faint dot.
 */
function DayCell({ cell, color, w = 11, h = 18 }: { cell: Cell; color: string; w?: number; h?: number }) {
  const t = useTheme();
  if (cell === 'off') {
    return (
      <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: t.onRaisedSecondary }} />
      </View>
    );
  }
  const filled = cell === 'ceiling';
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: 3,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        backgroundColor: filled ? color : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: cell === 'floor' ? color : t.onRaisedSecondary,
      }}
    >
      {cell === 'floor' ? <View style={{ height: '50%', backgroundColor: color }} /> : null}
    </View>
  );
}

/** The ✓ on the habit kept most this week, in the row and in the key under it. */
function BestMark({ size = 12 }: { size?: number }) {
  const t = useTheme();
  return (
    <Body size={size} weight="heavy" color={t.raised} maxFontSizeMultiplier={fontScale.graphic} aria-hidden>
      ✓
    </Body>
  );
}

/** The key under Behind the hand, drawn with the same cells as the rows, in the panel's own ink. */
function Key({ label, cell }: { label: string; cell: Cell }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <DayCell cell={cell} color={t.onRaised} w={10} h={16} />
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
        <Stat value={recap.keptDays} label={recap.keptDays === 1 ? 'time kept' : 'times kept'} />
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

const FADE_H = 28;

/** The buttons, pinned above the home indicator on a solid strip of felt, so they never cover the list. */
function Footer({ felt, visible, onHeight, bottom, fade, children }: { felt: Felt; visible: boolean; onHeight: (h: number) => void; bottom: number; fade: boolean; children: ReactNode }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
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
      {/* The felt fades into the strip above it, so whatever runs on below reads as more to scroll to. */}
      {fade ? (
        <View pointerEvents="none" aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: -FADE_H - StyleSheet.hairlineWidth, height: FADE_H }}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`fade${id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={felt.bg} stopOpacity={0} />
                <Stop offset="1" stopColor={felt.bg} stopOpacity={0.92} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" fill={`url(#fade${id})`} />
          </Svg>
        </View>
      ) : null}
      {children}
    </Animated.View>
  );
}

