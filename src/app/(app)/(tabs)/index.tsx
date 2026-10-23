import { useIsFocused, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, interpolateColor, LinearTransition, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnUI } from 'react-native-worklets';

import { ask, type AskButton } from '@/components/Ask';
import { Burst, type BurstKind } from '@/components/Burst';
import { Chips } from '@/components/Chips';
import { DealArc, type Flight } from '@/components/DealArc';
import { anchorReceipts, noteKeep } from '@/components/Events';
import { ComebackCard, HabitCard, WelcomeCard } from '@/components/HabitCard';
import { faceLabel, faceOfDay, PlayingCard } from '@/components/PlayingCard';
import { ReminderPrompt, useReminderPromptDue } from '@/components/ReminderPrompt';
import { RulesSheet } from '@/components/RulesSheet';
import { SuitGlyph } from '@/components/Suit';
import { DeckCard, LIFT, SwipeCard, type CommitInfo, type SwipeDirection, type SwipeHandle } from '@/components/SwipeCard';
import { Body, Button, Display, Label, raisedStyle, TableSurface } from '@/components/ui';
import { WeekStrip, type Rect as SlotRect, type StripArc } from '@/components/WeekStrip';
import type { Suit } from '@/engine/cards';
import { dayChord, keepSound, strum, type ToneStep } from '@/engine/chord';
import { comebackExit, planLine, type Point } from '@/engine/comeback';
import { addDays, canBackfill, weekday } from '@/engine/day';
import { lastShowdown, type Game, type TipTone } from '@/engine/game';
import type { Level } from '@/engine/kept';
import type { Recommendation } from '@/engine/playbook';
import { HANDS, makesCall } from '@/engine/poker';
import {
  allKeptCopy,
  allowFor,
  buildQueue,
  cardKey,
  comebackGap,
  densityFor,
  feltFor,
  grouped,
  HAND_ROLL_COUNT_MS,
  handLineCopy,
  ideaLabel,
  identityLine,
  interruptionFor,
  keptLine,
  keyMove,
  laterTag,
  momentOf,
  partOfDayAt,
  pillMenu,
  todayTips,
  weekDealDue,
  weekDealSlot,
  weekDealtKey,
  type Allow,
  type DayPart,
  type QueueItem,
} from '@/engine/today';
import { useAuth } from '@/lib/auth';
import { useData, useEvents } from '@/lib/data';
import { useDeck, useKeep, useLook, type Deck, type HabitView } from '@/lib/deck';
import * as feel from '@/lib/feel';
import { shortDay } from '@/lib/format';
import { usePlans } from '@/lib/plans';
import { hasSeen, usePrefs } from '@/lib/prefs';
import { playSound, playTones, warmDeckSounds } from '@/lib/sound';
import { withAlpha } from '@/theme/color';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { cardColors, fontScale, radius, space, suitColors, TAP, themeOn, type Theme } from '@/theme/tokens';

/** The first-swipe coach mark, shown once per player until the first kept day. */
const COACH = 'coach:first-swipe';
/** The floating tab bar's pill, above its bottom padding. */
const TAB_BAR = 56;
const FIRST_MOVE_NOTE = 'First move done. Today is kept.';
/** Done it on a Comeback card whose plan for next time is its Floor: it keeps the Floor. */
const FLOOR_PLAN_NOTE = 'Floor kept. Today is kept.';
const TIP_MARK: Record<TipTone, string> = { joker: '★', face: '♛', rescue: '↺', deal: '✦', climb: '↑', draw: '◆', call: '◎', showdown: '☾', done: '✓' };
/** How long the Undo chip stays, counted only while no big moment covers the screen. */
const UNDO_MS = 6000;

/** One card on the table as it was dealt: what it is, and how it was allowed to go when it was in front. */
type Play = { key: string; item: QueueItem; view: HabitView | null; allow: Allow; from: number; appear: 'deal' | 'flip' };
/** The latest check-in made here, for the Undo chip. `was` is the level it replaced: undo goes back to it. */
type Move = { habitId: string; name: string; level: Level; was: Level | null; n: number };

export default function Today() {
  const deck = useDeck();
  if (!deck) return null;
  // A new day is a fresh table: nothing deferred, focused or skipped carries over.
  return <Table key={deck.today} deck={deck} />;
}

function Table({ deck }: { deck: Deck }) {
  const base = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { height: windowHeight, fontScale: textScale } = useWindowDimensions();
  const { demo, startOwnDeck } = useAuth();
  const inFront = useIsFocused();
  const { back } = useLook();
  const { checkIn, undoCheckIn, recordPrompt, seed } = useData();
  const keepCard = useKeep();
  const { events } = useEvents();
  const { prefs, ready, markSeen, noteGrip } = usePrefs();
  const plans = usePlans();
  const { game } = deck;

  // Session state only: none of it is stored.
  const [deferred, setDeferred] = useState<string[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [deals, setDeals] = useState(0);
  const [promoted, setPromoted] = useState(0);
  const [flipIn, setFlipIn] = useState<string | null>(null);
  const [reach, setReach] = useState<{ skipped: string[] } | null>(null);
  const [welcome, setWelcome] = useState(() => deck.away && !!deck.welcome);
  const [leaving, setLeaving] = useState<Play[]>([]);
  const [burst, setBurst] = useState<{ n: number; kind: BurstKind; color: string } | null>(null);
  const [move, setMove] = useState<Move | null>(null);
  const [tipTurn, setTipTurn] = useState(0);
  const [deckHeight, setDeckHeight] = useState<number | null>(null);
  const [now, setNow] = useState<DayPart>(() => partOfDayAt(new Date().getHours()));
  const [screenReader, setScreenReader] = useState(false);
  const [visitKept, setVisitKept] = useState(() => deck.totals.kept > 0);
  const [coachClosed, setCoachClosed] = useState(false);
  // The day's chord as it strums, for the pills to ring in time. Set from the keep that finishes the day.
  const [ringing, setRinging] = useState<Ring | null>(null);
  // Today's card on its way into the week, and what the strip shows meanwhile.
  const [flight, setFlight] = useState<Flight | null>(null);
  const [stripArc, setStripArc] = useState<StripArc | null>(null);
  // Turns today's card over in the strip once each time it changes: after a face card's night, for its Joker.
  const [turnToday, setTurnToday] = useState(0);
  const [faceUp, setFaceUp] = useState<'joker' | 'plain' | null>(null);
  const swipe = useRef<SwipeHandle>(null);
  const prompted = useRef(new Set<string>());
  const keptSoFar = useRef(deck.totals.kept);
  const deckBox = useRef<View>(null);
  const dealing = useRef(false);
  // Where the deck's middle and today's place in the strip are on screen, for the deal arc.
  const [deckMiddle, setDeckMiddle] = useState<Point | null>(null);
  const [todaySlot, setTodaySlot] = useState<SlotRect | null>(null);
  const pull = useSharedValue(0);
  const reduced = useReducedMotion();

  // The queue ------------------------------------------------------------------------------------------
  const views = new Map(deck.cards.map((c) => [c.habit.id, c]));
  const pending = deck.cards.filter((c) => !c.today);
  const keptCount = deck.cards.length - pending.length;
  const floorKept = deck.cards.filter((c) => c.today === 'floor');
  const reaching = reach && !pending.length ? reach : null;
  const queue = buildQueue({
    cards: deck.cards.map((c) => ({ id: c.habit.id, level: c.today, comeback: !!c.neverTwice, part: c.partOfDay })),
    deferred,
    focused,
    now,
    welcome: welcome && !!deck.welcome,
    reach: reaching,
  });
  const allow = allowFor(queue);
  const front: Play | null = queue[0]
    ? { key: cardKey(queue[0], deals), item: queue[0], view: views.get(queue[0].id) ?? null, allow, from: 1 - LIFT * promoted, appear: flipIn === queue[0].id ? 'flip' : 'deal' }
    : null;
  const behind = queue.slice(1, 3);
  const yesterday = addDays(deck.today, -1);
  const lateCards = deck.cards.filter((c) => canBackfill(yesterday, deck.today, c.habit, c.checkIns));

  // The table's colour follows the front card -----------------------------------------------------------
  const keptFelt = (() => {
    const card = deck.todayCard;
    if (!card) return base.bg;
    if (card.kind === 'joker') return feltFor(cardColors.lilac, base);
    const suit = card.suits[0];
    return suit ? feltFor(cardColors[suitColors[suit].habit], base) : base.bg;
  })();
  const feltOf = (item: QueueItem | undefined): string => {
    if (!item) return deck.cards.length ? keptFelt : base.bg;
    const view = views.get(item.id);
    return item.kind === 'welcome' || !view ? base.bg : feltFor(cardColors[view.habit.color], base);
  };
  const frontFelt = feltOf(queue[0]);
  const nextFelt = feltOf(queue[1]);
  const chrome = themeOn(frontFelt, base);
  const feltNow = useSharedValue(frontFelt);
  const feltNext = useSharedValue(nextFelt);
  const frontKey = front?.key ?? 'none';

  // Room on screen --------------------------------------------------------------------------------------
  const density = densityFor({ cardHeight: deckHeight ?? windowHeight - 400, windowHeight, fontScale: textScale, screenReader });
  const compact = density.mode === 'compact';
  const bottomPad = Math.max(insets.bottom, space.md) + TAB_BAR + space.sm;

  // One interruption at a time --------------------------------------------------------------------------
  const moment = momentOf(events);
  // A face card, the first card or a milestone covers the screen; a receipt only drops in at the top.
  const bigMoment = !!moment && moment.kind !== 'receipt';
  const reminderDue = useReminderPromptDue();
  const coachDue = ready && !coachClosed && deck.cards.length > 0 && deck.totals.kept === 0 && !hasSeen(prefs, seed, COACH);
  // The same test the tabs use to open a finished week's Showdown: the reminder question waits behind it.
  const showdown = lastShowdown(game);
  const seenShowdown = prefs.showdownSeen[seed];
  const showdownPending = !!showdown && (!!demo || !seenShowdown || showdown.start > seenShowdown);
  const interruption = interruptionFor({
    moment: !!moment,
    coachDue,
    reminderDue,
    visitAfterKeeping: visitKept,
    faceToday: game.faces.some((f) => f.day === deck.today),
    comebackToday: deck.cards.some((c) => !!c.neverTwice),
    inFront,
    showdownPending,
  });

  // While the swipe hint shows on a first look, the line above the deck stays quiet (bar the warm-up's own line).
  const tips = todayTips(game.tips, { warmup: game.current.warmup, firstLook: coachDue, sunday: weekday(deck.today) === 6 });
  const tip = tips.length ? tips[tipTurn % tips.length] : null;
  // A tip can name the card a face-card moment is about to show, so until it closes the tip keeps its place but shows nothing.
  const tipVeiled = bigMoment;

  // When a face card's night closes, the hand line rolls to the new hand and, when the night brought it, today's
  // Joker turns over in the strip.
  const faceNow = moment?.main.kind === 'face' ? (moment.main.joker ? 'joker' : 'plain') : null;
  // Until then, the Joker that night brought stays face down: the arc seats it on its back and the strip keeps it there.
  const jokerDown = faceNow === 'joker' && deck.todayCard?.kind === 'joker';
  if (faceNow !== faceUp) {
    setFaceUp(faceNow);
    if (!faceNow && faceUp === 'joker' && deck.todayCard?.kind === 'joker') setTurnToday((n) => n + 1);
  }

  // Monday's backs: the week's days to come deal into the strip face down, once a week (remembered on this phone).
  const week = game.current;
  const monday = week.start;
  const backsToDeal = week.slots.filter((x) => x.state === 'future').length;
  const dealPending = ready && hasCardsNow(deck) && weekDealDue({ seen: hasSeen(prefs, seed, weekDealtKey(monday)), reduced, inFront: true, list: density.mode === 'list', cards: backsToDeal });
  const dealt = useSharedValue(dealPending ? 0 : 1);

  // Effects ---------------------------------------------------------------------------------------------
  useEffect(() => {
    keptSoFar.current = deck.totals.kept;
  }, [deck.totals.kept]);

  // A visit to Today starts when the tab comes into view or the app comes back. The reminder question
  // waits for a visit that began with a day already kept.
  useEffect(() => {
    const begin = () => {
      setVisitKept(keptSoFar.current > 0);
      setNow(partOfDayAt(new Date().getHours()));
    };
    const unfocus = navigation.addListener('focus', begin);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') begin();
    });
    const clock = setInterval(() => setNow(partOfDayAt(new Date().getHours())), 5 * 60 * 1000);
    return () => {
      unfocus();
      app.remove();
      clearInterval(clock);
    };
  }, [navigation]);

  useEffect(() => {
    // A browser always claims a screen reader, so the web demo keeps the cards.
    if (Platform.OS === 'web') return;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (alive) setScreenReader(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // The Comeback card is recorded as shown the first time it reaches the front, once per missed day.
  const comebackShown = front?.item.kind === 'comeback' && front.view?.neverTwice ? { id: front.item.id, missed: front.view.neverTwice } : null;
  const comebackId = comebackShown?.id;
  const comebackMissed = comebackShown?.missed;
  useEffect(() => {
    if (!comebackId || !comebackMissed) return;
    const key = `${comebackId}:${comebackMissed}`;
    if (prompted.current.has(key)) return;
    prompted.current.add(key);
    recordPrompt(comebackId, comebackMissed, null).catch(() => prompted.current.delete(key));
  }, [comebackId, comebackMissed, recordPrompt]);

  // When the front card changes, the deck settles: the pull resets and the table eases to the new card's
  // colour from wherever the drag left it.
  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      const shown = interpolateColor(pull.get(), [0, 1], [feltNow.get(), feltNext.get()]);
      pull.set(0);
      feltNow.set(shown);
      feltNow.set(withTiming(frontFelt, { duration: 280 }));
      feltNext.set(nextFelt);
    });
  }, [frontKey, frontFelt, nextFelt, pull, feltNow, feltNext]);

  // The backs wait face down out of sight until Today is in front, then deal in: one deal sound, any touch finishes it.
  // A deal that can't happen any more (the list, Reduce Motion) leaves the backs in place, never hidden.
  useEffect(() => {
    if (!dealing.current) dealt.set(dealPending ? 0 : 1);
  }, [dealPending, dealt]);
  useEffect(() => {
    if (!dealPending || !inFront) return;
    // A beat after Today comes to the front, so a Showdown opening over it first is never dealt under.
    const id = setTimeout(() => {
      dealing.current = true;
      markSeen(seed, weekDealtKey(monday));
      playSound('deal');
      dealt.set(0);
      dealt.set(withTiming(1, { duration: weekDealSlot(backsToDeal - 1, backsToDeal).endMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    }, 320);
    return () => clearTimeout(id);
  }, [dealPending, inFront, markSeen, seed, monday, backsToDeal, dealt]);

  // The receipt drops in under the strip, so it is told where the strip ends; when Today goes, or turns into the
  // list (which has no fixed strip), receipts go back to the top.
  useEffect(() => () => anchorReceipts(null), []);

  // Once the strum has rung out the pills are let go, so a pill drawn again later (the list, a new habit,
  // coming back to the tab) never rings without a keep.
  useEffect(() => {
    if (!ringing) return;
    const last = ringing.steps.reduce((ms, s) => Math.max(ms, s.delayMs), 0);
    const id = setTimeout(() => setRinging((r) => (r === ringing ? null : r)), Math.max(0, ringing.at + STRUM_AT_MS + last + RING_MS - Date.now()));
    return () => clearTimeout(id);
  }, [ringing]);

  // A moment after Today shows, the keep sounds and ring notes for the deck's own suits are made ready, so the
  // first keep of each suit and the first strum play on time.
  const deckSuits = [...new Set(deck.cards.map((c) => c.habit.suit))].sort().join(' ');
  useEffect(() => {
    if (!deckSuits) return;
    const id = setTimeout(() => warmDeckSounds(deckSuits.split(' ') as Suit[]), 1500);
    return () => clearTimeout(id);
  }, [deckSuits]);
  const listMode = density.mode === 'list';
  useEffect(() => {
    if (listMode) anchorReceipts(null);
  }, [listMode]);
  // The list has no deal arc: a card still in flight when the cards turn into rows is let go, so nothing waits on it.
  if (listMode && flight) {
    setFlight(null);
    setStripArc((a) => (a ? { ...a, phase: 'landed' } : a));
  }

  // The chip's few seconds don't run out behind a face card or a milestone: they start again when it closes.
  useEffect(() => {
    if (!move || bigMoment) return;
    const id = setTimeout(() => setMove(null), UNDO_MS);
    return () => clearTimeout(id);
  }, [move, bigMoment]);

  const table = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(pull.get(), [0, 1], [feltNow.get(), feltNext.get()]) }));

  // Actions ---------------------------------------------------------------------------------------------
  const fail = (e: unknown) => ask('That didn’t save', e instanceof Error ? e.message : 'Check your connection and try again.');
  const fling = (dir: SwipeDirection, opts: { note?: string; tag?: string; turnover?: Point } = { tag: 'button' }) => swipe.current?.fling(dir, opts);
  /**
   * Done it on a Comeback card: its First move, unless the card's plan for next time is its Floor, in which
   * case it keeps the Floor (recorded as the Floor, not the First move).
   */
  const doneIt = (habitId: string, at?: Point) => {
    if (plans[habitId]?.then === 'floor') fling('down', { note: FLOOR_PLAN_NOTE, tag: 'floor', turnover: at });
    else fling('down', { note: FIRST_MOVE_NOTE, tag: 'first', turnover: at });
  };
  /** The next card comes to the front fresh, turning over into place. */
  const bringForward = (id: string | null) => {
    setFocused(id);
    setFlipIn(id);
    setDeals((d) => d + 1);
    setPromoted(0);
  };

  // "See it" on a new card's receipt opens Today with `focus`: that card comes to the front, once. The
  // param is cleared again, so it can't bring the card back on another day.
  const { focus: focusParam } = useLocalSearchParams<{ focus?: string }>();
  const [focusSeen, setFocusSeen] = useState<string | undefined>(undefined);
  if (focusParam !== focusSeen) {
    setFocusSeen(focusParam);
    const view = focusParam ? views.get(focusParam) : undefined;
    if (view && !view.today) {
      setWelcome(false);
      bringForward(view.habit.id);
    }
  }
  useEffect(() => {
    if (focusParam) router.setParams({ focus: undefined });
  }, [focusParam, router]);

  /**
   * Keeps a card at a level: from a swipe, a button, the list or a pill. Every kept day comes from one of those.
   * `firstMove` is Done it on the Comeback card. `table` is a keep of the front card, which leaves the table
   * (turning over first when it is a Comeback) and deals today's card into the week on an arc.
   */
  function keep(view: HabitView, level: Level, firstMove = false, table = false): boolean {
    const id = view.habit.id;
    // The moments drawn over Today wait for a Comeback's turnover and the arc when they play, and only a keep
    // on the Comeback card offers a plan.
    noteKeep({ habitId: id, suit: view.habit.suit, level, was: view.today, comeback: !!view.neverTwice, handWas: game.current.hand, table });
    playSound(keepSound(view.habit.suit, level, { comeback: !!view.neverTwice }));
    // Only the front card turns over on the table; a Comeback kept from the list or a pill gets the plain keep's touch.
    if (view.neverTwice && table) feel.turnover();
    else if (level === 'ceiling') feel.ceiling();
    else feel.floor();
    // The keep that finishes the day strums today's notes as one chord, and the pills ring in time: both count
    // from this moment, so a pill lifts on its note however long the render after the keep takes.
    const strums = !view.today && pending.every((c) => c.habit.id === id);
    if (strums) {
      const cardsAfter = deck.cards.map((c) => ({ suit: c.habit.suit, level: c.habit.id === id ? level : c.today }));
      const steps = strum(dayChord(cardsAfter).notes);
      setRinging({ steps, at: playTones(steps, STRUM_AT_MS) });
    }
    // A Comeback card bursts once, as it turns back over (its own burst): never a second one here.
    if (!view.neverTwice) setBurst((b) => ({ n: (b?.n ?? 0) + 1, kind: level, color: cardColors[view.habit.color].bg }));
    setFocused(null);
    setMove((m) => ({ habitId: id, name: view.habit.name, level, was: view.today, n: (m?.n ?? 0) + 1 }));
    if (coachDue) markSeen(seed, COACH);
    // The shared keep also answers a waiting Comeback, the same way the card's own page does. A Ceiling
    // on the Comeback card still answers it as the Floor; only Done it is the first move.
    keepCard(view, level, { firstMove }).catch(fail);
    return strums;
  }

  /** The front card has gone one way: it plays out as a ghost while the deck moves on under it. */
  function commit(play: Play, dir: SwipeDirection, tag?: string, info?: CommitInfo) {
    setPromoted(pull.get());
    setDeals((d) => d + 1);
    setFlipIn(null);
    setLeaving((l) => [...l.slice(-2), play]);
    const { item, view } = play;
    // Where the thumb took the card on a real swipe: the card wears in there (saved on this phone).
    if (info?.grip && play.view) noteGrip(seed, play.view.habit.id, info.grip);
    if (item.kind === 'welcome') {
      setWelcome(false);
      playSound('flip');
      feel.flip();
      return;
    }
    if (!view) return;
    if (dir === 'left' || dir === 'right') {
      playSound('later');
      feel.tick();
      if (item.kind === 'reach') setReach((r) => ({ skipped: [...(r?.skipped ?? []), item.id] }));
      else setDeferred((d) => [...d.filter((x) => x !== item.id), item.id]);
      setFocused((f) => (f === item.id ? null : f));
      return;
    }
    const strummed = keep(view, dir === 'up' ? 'ceiling' : 'floor', item.kind === 'comeback' && tag === 'first', true);
    deal(item.kind === 'comeback', tag === 'first', info?.at, strummed);
  }

  /**
   * Today's card arcs from the kept card into its place in the week. It starts where the card went (or the
   * middle of the deck), after a Comeback card's turnover when it was one. Yesterday, when this keep saves it,
   * stays faint in the strip until the card lands.
   */
  const deal = (comeback: boolean, firstMove: boolean, at?: Point, quiet = false) => {
    const to = todaySlot;
    if (!to) return;
    // `deals` counts every card played here, so each flight has its own number.
    const n = deals + 1;
    const delayMs = comeback ? comebackExit({ firstMove, reduced }).totalMs : 0;
    const from = at ?? deckMiddle ?? { x: to.x + to.width / 2, y: to.y + 260 };
    // A keep that strums the day's chord lands its card with the tick alone, so the deal sound doesn't ring over the notes.
    setFlight({ id: n, from, to, delayMs, reduced, quiet });
    setStripArc({ phase: 'flying', savedDay: game.rescue, n });
    // The arc turns today's card over in its place, so the strip doesn't turn it again once it lands.
    setTurnToday(0);
  };

  function landed(id: number) {
    setFlight((f) => (f?.id === id ? null : f));
    setStripArc((a) => (a && a.n === id ? { ...a, phase: 'landed' } : a));
  }

  const gone = (key: string) => setLeaving((l) => l.filter((p) => p.key !== key));

  function undo(habitId: string) {
    setMove(null);
    setReach(null);
    setWelcome(false);
    bringForward(habitId);
    playSound('flip');
    feel.flip();
    undoCheckIn(habitId).catch(fail);
  }

  /**
   * The Undo chip takes back the latest check-in. A Ceiling reached over a kept Floor goes back to the Floor,
   * never to nothing; in the Ceiling pass that card comes back to the front.
   */
  function takeBack(m: Move) {
    if (!m.was) return undo(m.habitId);
    const level = m.was;
    setMove(null);
    playSound('flip');
    feel.flip();
    if (reach) {
      setReach((r) => (r ? { skipped: r.skipped.filter((x) => x !== m.habitId) } : r));
      bringForward(m.habitId);
    }
    checkIn(m.habitId, level).catch(fail);
  }

  /** A pill: a waiting card comes to the front; a kept one offers to change or take back today. */
  function onPill(view: HabitView) {
    const id = view.habit.id;
    if (!view.today) {
      if (queue[0]?.id === id && queue[0].kind !== 'welcome') {
        feel.tick();
        return;
      }
      setWelcome(false);
      bringForward(id);
      playSound('flip');
      feel.flip();
      return;
    }
    // A Floor-kept card leads with its Ceiling; Undo is there but quiet, and Cancel is last.
    const buttons = pillMenu(view.today).map((choice): AskButton => {
      if (choice === 'ceiling') return { text: `Reach the Ceiling: ${view.habit.ceilingLabel}`, onPress: () => keep(view, 'ceiling') };
      if (choice === 'open') return { text: 'Open card', onPress: () => router.push(`/habit/${id}`) };
      if (choice === 'undo') return { text: 'Undo today', style: 'destructive', quiet: true, onPress: () => undo(id) };
      return { text: 'Cancel', style: 'cancel' };
    });
    ask(view.habit.name, view.today === 'floor' ? `Floor kept today: ${view.habit.floorLabel}.` : `Ceiling reached today: ${view.habit.ceilingLabel}.`, buttons);
  }

  /** "Did it, forgot to log": yesterday gets its check-in now, at the level picked. */
  function logLate(view: HabitView, level: Level) {
    playSound('flip');
    feel.flip();
    // A late log is no keep on the table: its moment comes at once, and never borrows an earlier keep's note.
    noteKeep({ habitId: view.habit.id, suit: view.habit.suit, level, was: null, comeback: false, handWas: game.current.hand, table: false });
    // A Comeback card that was about yesterday turns over to today's face.
    if (queue[0]?.id === view.habit.id && queue[0].kind === 'comeback') bringForward(focused);
    // The receipt's own Undo takes back a late log; the chip for today's last check-in goes, so the two never sit side by side.
    setMove(null);
    checkIn(view.habit.id, level, yesterday).catch(fail);
  }

  function logYesterday(only?: HabitView) {
    const pick = (view: HabitView) =>
      ask(`Yesterday · ${view.habit.name}`, 'Which did you do?', [
        { text: `Floor: ${view.habit.floorLabel}`, onPress: () => logLate(view, 'floor') },
        { text: `Ceiling: ${view.habit.ceilingLabel}`, onPress: () => logLate(view, 'ceiling') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    if (only) return pick(only);
    if (lateCards.length === 1) return pick(lateCards[0]);
    // A second question waits for the first sheet to slide away.
    const then = (view: HabitView) => setTimeout(() => pick(view), Platform.OS === 'web' ? 0 : 350);
    ask('Log yesterday', 'Which card did you keep yesterday?', [...lateCards.slice(0, 6).map((v) => ({ text: v.habit.name, onPress: () => then(v) })), { text: 'Cancel', style: 'cancel' as const }]);
  }

  function startReach() {
    setReach((r) => ({ skipped: r?.skipped ?? [] }));
    bringForward(null);
    playSound('flip');
    feel.flip();
  }

  // The keyboard, in a browser: arrows swipe, Enter or Space presses Done it.
  const keys = front ? { kind: front.item.kind, allow: front.allow, firstMove: !!front.view?.habit.twoMinuteLabel?.trim() } : null;
  const keyKind = keys?.kind;
  const keyUp = keys?.allow.up;
  const keyDown = keys?.allow.down;
  const keySide = keys?.allow.left;
  const keyFirst = keys?.firstMove;
  // Enter on a Comeback card follows its plan, like Done it.
  const keyPlanFloor = !!front?.view && plans[front.view.habit.id]?.then === 'floor';
  useEffect(() => {
    const doc = (globalThis as { document?: { addEventListener: (t: string, f: (e: KeyEvent) => void) => void; removeEventListener: (t: string, f: (e: KeyEvent) => void) => void } }).document;
    if (Platform.OS !== 'web' || !doc || !keyKind) return;
    const onKey = (e: KeyEvent) => {
      const tag = e.target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      // A sheet or a big moment is open over the table: its keys are its own.
      if (e.target?.closest?.('[aria-modal="true"]')) return;
      const card = swipe.current;
      if (!card) return;
      // The front card itself is a focus stop: Enter there presses Done it, as it does with nothing focused.
      const onPage = !tag || tag === 'BODY' || tag === 'HTML' || e.target?.getAttribute?.('data-testid') === 'front-card';
      const move = keyMove({ key: e.key, repeat: !!e.repeat, onPage }, { kind: keyKind, allow: { up: !!keyUp, down: !!keyDown, left: !!keySide, right: !!keySide }, firstMove: !!keyFirst });
      if (!move) return;
      e.preventDefault();
      if (move.first) card.fling('down', keyPlanFloor ? { note: FLOOR_PLAN_NOTE, tag: 'floor' } : { note: FIRST_MOVE_NOTE, tag: 'first' });
      else card.fling(move.dir, { tag: 'key' });
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [keyKind, keyUp, keyDown, keySide, keyFirst, keyPlanFloor]);

  // Card faces ------------------------------------------------------------------------------------------
  function face(item: QueueItem, view: HabitView | null, live: boolean, depth = 0): ReactNode {
    if (item.kind === 'welcome') {
      const w = deck.welcome ?? { kept: deck.totals.kept, faces: game.faces.length, chips: game.stack };
      return <WelcomeCard kept={w.kept} faces={w.faces} chips={w.chips} compact={compact} onOpen={live ? () => fling('up') : undefined} />;
    }
    if (!view) return null;
    const habit = view.habit;
    // The front card's ⋯ opens its page (calendar, numbers, edit). Cards behind show it as a picture.
    const onOpen = live ? () => router.push(`/habit/${habit.id}`) : null;
    if (item.kind === 'comeback') {
      const folded = compact || density.foldComeback;
      return (
        <ComebackCard
          habit={habit}
          kept={view.allTime.kept}
          wearDepth={depth}
          plan={plans[habit.id] ? planLine(plans[habit.id], habit) : null}
          planFloor={plans[habit.id]?.then === 'floor'}
          gap={comebackGap(habit.startedOn, deck.today, view.checkIns)}
          saving={!!game.rescue}
          compact={folded}
          lean={density.leanComeback}
          tight={density.tightComeback}
          tiny={density.tinyComeback}
          roomy={density.roomyComeback}
          onOpen={onOpen}
          onFirstMove={live ? (at) => doneIt(habit.id, at) : undefined}
          onFloor={live ? () => fling('down') : undefined}
          onCeiling={live ? () => fling('up') : undefined}
          onLogYesterday={live && density.logOnComeback && lateCards.some((c) => c.habit.id === habit.id) ? () => logYesterday(view) : undefined}
        />
      );
    }
    return (
      <HabitCard
        habit={habit}
        level={view.today}
        kept={view.allTime.kept}
        wearDepth={depth}
        tag={laterTag(view.partOfDay, now)}
        compact={compact}
        onOpen={onOpen}
        onFloor={live && item.kind !== 'reach' ? () => fling('down') : undefined}
        onCeiling={live ? () => fling('up') : undefined}
      />
    );
  }

  function swipeProps(play: Play) {
    const { item, view } = play;
    if (item.kind === 'welcome' || !view) return { labels: {}, actions: { up: 'Show my cards' }, ink: base.onRaised, wash: withAlpha(base.raised, 0.94), label: 'Welcome back' };
    const h = view.habit;
    const c = cardColors[h.color];
    const dark = item.kind === 'comeback';
    // The Comeback's stamp is inked in its accent, like its headline, so it reads on the dark side.
    const ink = dark ? c.onDark : c.ink;
    const wash = withAlpha(dark ? base.raised : c.bg, 0.94);
    if (item.kind === 'reach')
      return { labels: { up: 'CEILING', left: 'NOT TODAY', right: 'NOT TODAY' }, actions: { up: `Reach the Ceiling: ${h.ceilingLabel}`, left: 'Not today', right: '' }, ink, wash, label: `${h.name}, Floor kept. Ceiling: ${h.ceilingLabel}` };
    return {
      labels: { up: 'CEILING', down: 'FLOOR', left: 'LATER', right: 'LATER' },
      actions: { up: `Reach the Ceiling: ${h.ceilingLabel}`, down: `Keep the Floor: ${h.floorLabel}`, left: 'Later', right: '' },
      ink,
      wash,
      label: `${dark ? 'Comeback: ' : ''}${h.name}. Floor: ${h.floorLabel}. Ceiling: ${h.ceilingLabel}.`,
    };
  }

  function card(play: Play, live: boolean) {
    const words = swipeProps(play);
    // The bright side a kept Comeback card turns to. It stays on the card once it is played (a ghost under
    // the same key), since the turn runs as it leaves.
    const turned = play.item.kind === 'comeback' ? play.view : null;
    return (
      <SwipeCard
        key={play.key}
        ref={live ? swipe : undefined}
        ghost={!live}
        testID={live ? 'front-card' : undefined}
        pull={pull}
        allow={play.allow}
        labels={words.labels}
        actions={words.actions}
        ink={words.ink}
        wash={words.wash}
        label={words.label}
        from={play.from}
        appear={play.appear}
        onCommit={(dir, tag, info) => commit(play, dir, tag, info)}
        onGone={() => gone(play.key)}
        backFace={turned ? (dir) => <HabitCard habit={turned.habit} level={dir === 'up' ? 'ceiling' : 'floor'} kept={turned.allTime.kept + 1} quietKept={dir === 'down'} /> : undefined}
      >
        {face(play.item, play.view, live)}
      </SwipeCard>
    );
  }

  // Layout ----------------------------------------------------------------------------------------------
  const hasCards = deck.cards.length > 0;
  const header = <Header deck={deck} demo={!!demo} onStartOwn={() => startOwnDeck().catch(() => {})} onStack={() => router.push('/you')} compact={compact} />;
  const stripBox = useRef<View>(null);
  const strip = (measure: boolean) =>
    hasCards ? (
      <View
        ref={measure ? stripBox : undefined}
        collapsable={false}
        style={{ paddingHorizontal: space.xl, marginTop: compact ? space.sm : space.md }}
        onLayout={
          measure
            ? () =>
                stripBox.current?.measureInWindow((_x, y, _w, height) => {
                  if (height > 0) anchorReceipts(y + height);
                })
            : undefined
        }
      >
        <WeekStrip
          week={game.current}
          back={back}
          rescue={game.rescue}
          saved={game.rescueCard}
          arc={measure ? stripArc : null}
          dealt={dealt}
          turnToday={turnToday}
          todayDown={jokerDown}
          onPress={() => router.push('/hands')}
          onYesterday={lateCards.length ? () => logYesterday() : undefined}
          onTodayLayout={measure ? (rect) => setTodaySlot((r) => (r && r.x === rect.x && r.y === rect.y && r.width === rect.width ? r : rect)) : undefined}
        />
      </View>
    ) : null;
  const handLine = hasCards ? (
    <HandLine
      game={game}
      base={base}
      sunday={weekday(deck.today) === 6}
      fresh={weekday(deck.today) === 0 && !game.current.slots.some((x) => !!x.card)}
      held={bigMoment || (!!flight && !listMode)}
      tip={density.mergeTip ? tip : null}
      tipVeiled={tipVeiled}
      tipCount={tips.length}
      tipTurn={tipTurn}
      onTip={() => setTipTurn((n) => n + 1)}
      onHands={() => router.push('/hands')}
      onCall={() => router.push(game.callOpen ? '/call' : '/hands')}
    />
  ) : null;
  const banner = hasCards && !density.mergeTip && tip ? <TipBanner tip={tip} veiled={tipVeiled} count={tips.length} turn={tipTurn} onNext={() => setTipTurn((n) => n + 1)} /> : null;
  const pills = hasCards ? (
    <Pills cards={deck.cards} frontId={front?.item.kind === 'welcome' ? null : (front?.item.id ?? null)} felt={table} ringing={ringing} onPill={onPill} onOpen={(id) => router.push(`/habit/${id}`)} onNew={() => router.push('/habit/edit')} />
  ) : null;

  if (density.mode === 'list') {
    // The same order as the cards: a Comeback first, then by time of day, then what's kept.
    const at = new Map(queue.map((q, i) => [q.id, i]));
    const place = (view: HabitView) => at.get(view.habit.id) ?? queue.length;
    const listRows = [...[...pending].sort((a, b) => place(a) - place(b)), ...deck.cards.filter((c) => c.today)];
    return (
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, table]} />
        <TableSurface />
        <ThemeScope theme={chrome}>
          <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: bottomPad + space.lg, gap: space.md }}>
            {header}
            {strip(false)}
            {handLine}
            {banner}
            <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
              {pending.length === 0 && hasCards ? <AllKept deck={deck} keptCount={keptCount} onReach={null} onIdea={() => followIdea(router, deck.idea)} /> : null}
              {!hasCards ? <EmptyDeck onCreate={() => router.push('/habit/edit')} /> : null}
              {listRows.map((view) => (
                <ListRow
                  key={view.habit.id}
                  view={view}
                  onFloor={() => keep(view, 'floor')}
                  onCeiling={() => keep(view, 'ceiling')}
                  onFirstMove={() => keep(view, 'floor', plans[view.habit.id]?.then !== 'floor')}
                  plan={plans[view.habit.id] ? planLine(plans[view.habit.id], view.habit) : null}
                  planFloor={plans[view.habit.id]?.then === 'floor'}
                  onUndo={() => undo(view.habit.id)}
                  onLogYesterday={view.neverTwice && lateCards.some((c) => c.habit.id === view.habit.id) ? () => logYesterday(view) : undefined}
                />
              ))}
            </View>
          </ScrollView>
        </ThemeScope>
        {interruption === 'reminder' ? <ReminderPrompt /> : null}
      </View>
    );
  }

  const coach = interruption === 'coach';
  return (
    <View
      style={{ flex: 1 }}
      // Any touch finishes the week's backs dealing in. It never takes the touch.
      onStartShouldSetResponderCapture={() => {
        if (dealing.current) {
          dealing.current = false;
          dealt.set(1);
        }
        return false;
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, table]} />
      <TableSurface />
      <ThemeScope theme={chrome}>
        <View style={{ flex: 1, paddingTop: insets.top + (compact ? space.xs : space.sm), paddingBottom: bottomPad }}>
          {header}
          {strip(true)}
          {handLine}
          {banner}
          {pills}
          {/* Raised over the row below it, so a card dragged down passes over "2 of 4 kept today" and Later, not under them. */}
          <View style={{ flex: 1, zIndex: front ? 1 : undefined, marginHorizontal: space.lg, marginTop: hasCards && front ? (compact ? space.lg : space.xl) : space.md }}>
            <View
              ref={deckBox}
              collapsable={false}
              style={{ flex: 1 }}
              onLayout={(e) => {
                setDeckHeight(Math.round(e.nativeEvent.layout.height));
                deckBox.current?.measureInWindow((x, y, width, height) => {
                  if (width > 0) setDeckMiddle({ x: x + width / 2, y: y + height / 2 });
                });
              }}
            >
              {front ? null : hasCards ? (
                <AllKept
                  deck={deck}
                  keptCount={keptCount}
                  compact={compact}
                  under={bottomPad}
                  undo={move ? <UndoChip move={move} onUndo={() => takeBack(move)} /> : null}
                  onReach={floorKept.some((c) => !reach?.skipped.includes(c.habit.id)) ? startReach : null}
                  onIdea={() => followIdea(router, deck.idea)}
                />
              ) : (
                <EmptyDeck onCreate={() => router.push('/habit/edit')} />
              )}
              {
                // One keyed list for the deck, the front card and the cards still leaving, so a played card keeps
                // its place (and its motion) as it turns from the front card into a ghost.
                [
                  ...(front
                    ? behind
                        .map((item, i) => ({ item, depth: i + 1 }))
                        .reverse()
                        .map(({ item, depth }) => (
                          <DeckCard key={`deck:${item.kind}:${item.id}`} depth={depth} pull={pull}>
                            {face(item, views.get(item.id) ?? null, false, depth)}
                          </DeckCard>
                        ))
                    : []),
                  ...(front ? [card(front, true)] : []),
                  ...leaving.map((play) => card(play, false)),
                ]
              }
              {burst ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Burst key={burst.n} kind={burst.kind} color={burst.color} onDone={() => setBurst(null)} />
                </View>
              ) : null}
            </View>
          </View>
          {front ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.lg, marginTop: space.sm, minHeight: TAP }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                {move ? (
                  <UndoChip move={move} onUndo={() => takeBack(move)} />
                ) : coach ? (
                  <Coach
                    onClose={() => {
                      setCoachClosed(true);
                      markSeen(seed, COACH);
                    }}
                  />
                ) : (
                  <Progress front={front} kept={keptCount} total={deck.cards.length} reaching={!!reaching} />
                )}
              </View>
              {reaching ? <QuietButton label="Done" onPress={() => setReach(null)} /> : null}
              {front.allow.left && front.item.kind !== 'welcome' ? <QuietButton label={reaching ? 'Not today →' : 'Later →'} hint={reaching ? 'Leaves this card at its Floor' : 'Sends this card to the back of the deck'} onPress={() => fling('left')} /> : null}
            </View>
          ) : null}
        </View>
        {!front && hasCards ? <BottomFade height={fadeHeight(bottomPad)} /> : null}
      </ThemeScope>
      <DealArc flight={flight} face={deck.todayCard ? faceOfDay(deck.todayCard, game.current.hand?.cards.find((c) => c.day === deck.today)?.suit) : null} down={jokerDown} back={back} onLanded={landed} />
      {interruption === 'reminder' ? <ReminderPrompt /> : null}
    </View>
  );
}

/** The deck has cards at all (the strip, the hand line and the pills only show then). */
const hasCardsNow = (deck: Deck) => deck.cards.length > 0;

type KeyEvent = {
  key: string;
  repeat?: boolean;
  target?: { tagName?: string; closest?: (selector: string) => unknown; getAttribute?: (name: string) => string | null } | null;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  preventDefault: () => void;
};

// Chrome ------------------------------------------------------------------------------------------------

/** How tall the fade over the page's foot is. The all-kept page leaves this much room under its last line, so it ends clear of it. */
const fadeHeight = (bottomPad: number) => bottomPad + TAP + space.xl;

/** The table's own colour rising over the page's foot, so what scrolls under the floating tab bar fades away instead of being cut. */
function BottomFade({ height }: { height: number }) {
  const t = useTheme();
  const id = `fade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.bg} stopOpacity={0} />
            <Stop offset="0.4" stopColor={t.bg} stopOpacity={0.85} />
            <Stop offset="0.6" stopColor={t.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The day, the kept days so far and the stack. In the demo, a way out to a deck of your own. */
function Header({ deck, demo, compact, onStartOwn, onStack }: { deck: Deck; demo: boolean; compact: boolean; onStartOwn: () => void; onStack: () => void }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        {demo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Demo deck"
            accessibilityHint="Leaves the demo and starts a deck of your own"
            onPress={onStartOwn}
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
            style={({ pressed }) => ({ alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: t.text, paddingHorizontal: 9, paddingVertical: 2, opacity: pressed ? 0.75 : 1 })}
          >
            <Body size={11} weight="heavy" color={t.bg} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} style={{ letterSpacing: 0.6 }}>
              DEMO DECK · START MY OWN →
            </Body>
          </Pressable>
        ) : (
          <Label numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome}>
            {shortDay(deck.today)}
          </Label>
        )}
        <Display size={compact ? 22 : 26} numberOfLines={1} header maxFontSizeMultiplier={fontScale.chrome}>
          {keptLine(deck.totals.kept)}
        </Display>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${grouped(deck.game.stack)} chips`}
        accessibilityHint="Opens your stack, tables and card backs"
        onPress={onStack}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <Chips value={deck.game.stack} size={16} pill />
      </Pressable>
    </View>
  );
}

/**
 * The week's hand so far and what it pays, a "?" for the rules, and the call. The hand's name may take two
 * lines and the payout sits on the label's line as a chip, so neither is ever cut beside the call.
 *
 * While a moment is up (`held`) the line keeps showing the hand as it was. When the moment closes it rolls
 * to the new hand: the name slides up into place with a spring and the chips count up, with one chip tick.
 * On a Monday before any card (`fresh`) it says "New week".
 */
function HandLine({
  game,
  base,
  sunday,
  fresh,
  held,
  tip,
  tipVeiled,
  tipCount,
  tipTurn,
  onTip,
  onHands,
  onCall,
}: {
  game: Game;
  /** The app's own theme, for the Rules sheet: a full-screen reference doesn't take the felt's colour. */
  base: Theme;
  sunday: boolean;
  fresh: boolean;
  held: boolean;
  tip: { tone: TipTone; text: string } | null;
  /** Holds the tip's place without showing it. */
  tipVeiled: boolean;
  tipCount: number;
  tipTurn: number;
  onTip: () => void;
  onHands: () => void;
  onCall: () => void;
}) {
  const t = useTheme();
  const [rules, setRules] = useState(false);
  const week = game.current;
  const live = handLineCopy({ warmup: week.warmup, hand: week.hand, chips: week.chips, sunday, fresh });
  // What the line shows: the live hand, except while a moment is up, when it holds the hand from before.
  const [copy, setCopy] = useState(live);
  const [roll, setRoll] = useState<{ n: number; from: number | null } | null>(null);
  if (!held && (copy.title !== live.title || copy.pays !== live.pays || copy.label !== live.label)) {
    setRoll({ n: (roll?.n ?? 0) + 1, from: copy.pays });
    setCopy(live);
  }
  const rollN = roll?.n ?? 0;
  const climbed = !!roll && roll.from !== null && copy.pays !== null && copy.pays > roll.from;
  // The chips tick is a sound: the haptic for this beat is the deal arc's tick as the card lands.
  useEffect(() => {
    if (!rollN || !climbed) return;
    playSound('chips', 120);
  }, [rollN, climbed]);
  return (
    <View style={{ marginHorizontal: space.xl, marginTop: space.sm, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.spoken}
          accessibilityHint="Opens your hands"
          onPress={onHands}
          style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.75 : 1 })}
        >
          {/* On a narrow screen "Showdown tonight" keeps its words and the payout drops under it. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2 }}>
            <Label numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} style={{ flexShrink: 1 }}>
              {copy.label}
            </Label>
            {copy.pays !== null ? <RollingChips key={`chips:${rollN}`} from={roll?.from ?? copy.pays} to={copy.pays} /> : null}
          </View>
          <View style={{ overflow: 'hidden' }}>
            <Animated.View key={`title:${rollN}`} entering={rollN ? FadeInDown.springify().mass(1).damping(14).stiffness(170) : undefined}>
              <Display size={22} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 25 }}>
                {copy.title}
              </Display>
            </Animated.View>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rules"
          accessibilityHint="Opens how the game plays."
          hitSlop={6}
          onPress={() => {
            feel.tick();
            setRules(true);
          }}
          style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: t.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Display size={17} maxFontSizeMultiplier={fontScale.graphic}>
            ?
          </Display>
        </Pressable>
        <CallChip game={game} onPress={onCall} />
      </View>
      <ThemeScope theme={base}>
        <RulesSheet visible={rules} topic="week" onClose={() => setRules(false)} />
      </ThemeScope>
      {tip ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tip.text}
          accessibilityHint={tipCount > 1 ? 'Shows the next tip' : undefined}
          onPress={onTip}
          disabled={tipVeiled}
          aria-hidden={tipVeiled}
          accessibilityElementsHidden={tipVeiled}
          importantForAccessibility={tipVeiled ? 'no-hide-descendants' : 'auto'}
          hitSlop={{ top: 4, bottom: 8 }}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, opacity: tipVeiled ? 0 : 1 }}
        >
          <Body size={12} weight="heavy" numberOfLines={2} color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome} style={{ flex: 1, lineHeight: 16 }}>
            {`${TIP_MARK[tip.tone]}  ${tip.text}`}
          </Body>
          {tipCount > 1 ? (
            <Body size={11} weight="heavy" color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 16 }}>
              {`${(tipTurn % tipCount) + 1}/${tipCount} ›`}
            </Body>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** The hand's chips counting up from what they were to what they are now, once, over half a second (at once with Reduce Motion). */
function RollingChips({ from, to }: { from: number; to: number }) {
  const [value, setValue] = useState(from);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (from === to || reduced) return;
    let frame = 0;
    const start = Date.now();
    const step = () => {
      const u = Math.min(1, (Date.now() - start) / HAND_ROLL_COUNT_MS);
      const eased = 1 - Math.pow(1 - u, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (u < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, reduced]);
  return <Chips value={from === to || reduced ? to : value} size={11} pill />;
}

/** This week's call: an outline until the hand makes it, then filled in with a tick. Calls are made on Monday. */
function CallChip({ game, onPress }: { game: Game; onPress: () => void }) {
  const t = useTheme();
  const { call, hand, warmup } = game.current;
  if (warmup || (!call && !game.callOpen)) return null;
  const made = !!call && makesCall(hand, call);
  // One pip for each card the hand still needs to make the call, up to two; none once it's made or further off.
  const gap = game.callGap?.cards;
  const away = !call || made ? 0 : gap === 1 || gap === 2 ? gap : 0;
  const status = made ? 'Made.' : away === 1 ? 'One card away.' : away === 2 ? 'Two cards away.' : 'Not made yet.';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={!call ? 'Call your hand' : `${HANDS[call].name} called. ${status}`}
      hitSlop={6}
      style={({ pressed }) => ({
        minHeight: TAP,
        justifyContent: 'center',
        alignItems: 'flex-end',
        borderRadius: radius.md,
        paddingVertical: 4,
        paddingHorizontal: 10,
        backgroundColor: made ? t.text : 'transparent',
        borderWidth: 2,
        borderColor: t.text,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {call ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Body size={10} weight="heavy" color={made ? t.bg : t.textSecondary} maxFontSizeMultiplier={fontScale.chrome} style={{ letterSpacing: 0.8 }}>
              {made ? 'CALL MADE ✓' : 'YOUR CALL'}
            </Body>
            {away ? (
              <Animated.View key={away} entering={FadeIn.duration(240)} aria-hidden style={{ flexDirection: 'row', gap: 3 }}>
                {Array.from({ length: away }, (_, i) => (
                  <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.text }} />
                ))}
              </Animated.View>
            ) : null}
          </View>
          <Body size={14} weight="heavy" color={made ? t.bg : t.text} numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome}>
            {HANDS[call].name}
          </Body>
        </>
      ) : (
        <Body size={14} weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
          Call your hand
        </Body>
      )}
    </Pressable>
  );
}

/** A tip that matters today, on tall screens, in its own raised band. Tap for the next one. */
function TipBanner({ tip, veiled, count, turn, onNext }: { tip: { tone: TipTone; text: string }; veiled: boolean; count: number; turn: number; onNext: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onNext}
      disabled={veiled}
      aria-hidden={veiled}
      accessibilityElementsHidden={veiled}
      importantForAccessibility={veiled ? 'no-hide-descendants' : 'auto'}
      accessibilityRole="button"
      accessibilityLabel={tip.text}
      accessibilityHint={count > 1 ? 'Shows the next tip' : undefined}
      style={({ pressed }) => [
        { marginHorizontal: space.lg, marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, paddingVertical: space.sm, paddingHorizontal: space.md, opacity: veiled ? 0 : pressed ? 0.85 : 1 },
        raisedStyle(t),
      ]}
    >
      <Display size={18} color={t.onRaised} aria-hidden>
        {TIP_MARK[tip.tone]}
      </Display>
      <Body size={13} weight="bold" color={t.onRaised} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ flex: 1, lineHeight: 18 }}>
        {tip.text}
      </Body>
      {count > 1 ? (
        <Body size={11} weight="heavy" color={t.onRaisedSecondary} maxFontSizeMultiplier={fontScale.chrome}>
          {`${(turn % count) + 1}/${count}`}
        </Body>
      ) : null}
    </Pressable>
  );
}

/** How wide the soft edge is where the pill row runs on past the screen. */
const PILL_FADE = 28;
/** The keep that finishes the day starts its strum this long after the keep. */
const STRUM_AT_MS = 380;
/** How long a ring note sounds, so the pills are let go once the strum has rung out. */
const RING_MS = 500;
/** A pill that comes to ring more than this long after its note (drawn again later) stays still instead. */
const RING_LATE_MS = 100;
/** The day's chord as it strums: its notes, and when the keep that started it happened (Date.now()). */
type Ring = { steps: readonly ToneStep[]; at: number };

/**
 * Every card in the deck as a pill: kept ones in their colour, waiting ones as outlines. The row scrolls
 * by itself, just enough to keep the front card's pill in view as the front card changes, and comes to
 * rest with a whole pill at its edge. Where it runs on past the screen, that edge fades softly into the
 * felt. "+ New" stays put beside it. When the day's chord strums, each pill's chip rings on its suit's note.
 */
function Pills({
  cards,
  frontId,
  felt,
  ringing = null,
  onPill,
  onOpen,
  onNew,
}: {
  cards: HabitView[];
  frontId: string | null;
  /** The table's colour as it is drawn right now, so the soft edges match it even mid-swipe. */
  felt: React.ComponentProps<typeof Animated.View>['style'];
  /** The day's chord as it strums: each pill rings on its suit's note (stream 1 draws it). */
  ringing?: Ring | null;
  onPill: (view: HabitView) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const t = useTheme();
  const scroll = useRef<ScrollView>(null);
  const room = useRef({ x: 0, width: 0, content: 0, spots: new Map<string, { x: number; w: number }>(), shown: undefined as string | null | undefined });
  const [edges, setEdges] = useState({ left: false, right: false });
  const [snaps, setSnaps] = useState<number[]>([]);

  /** Which ends have more to scroll to, and where a whole pill sits at the left edge. */
  const measure = () => {
    const r = room.current;
    if (!r.width) return;
    const max = Math.max(0, r.content - r.width);
    const left = r.x > 2;
    const right = r.x < max - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    const at = [...new Set([...r.spots.values()].map((spot) => Math.round(Math.min(max, Math.max(0, spot.x - space.lg)))).concat(Math.round(max)))].sort((a, b) => a - b);
    setSnaps((was) => (was.length === at.length && was.every((v, i) => v === at[i]) ? was : at));
  };

  /** Scrolls just enough to show a pill whole, clear of the soft edges. False while it can't be placed yet. */
  const reveal = (id: string | null): boolean => {
    const r = room.current;
    const spot = id ? r.spots.get(id) : undefined;
    if (!spot || !r.width) return false;
    const pad = PILL_FADE + 4;
    let x = r.x;
    if (spot.x - pad < r.x) x = Math.max(0, spot.x - space.lg);
    else if (spot.x + spot.w + pad > r.x + r.width) x = Math.min(Math.max(0, r.content - r.width), spot.x + spot.w + pad - r.width);
    if (x === r.x) return true;
    r.x = x;
    scroll.current?.scrollTo({ x, animated: true });
    return true;
  };

  // Once for each new front card: after that the row stays wherever the player scrolls it.
  useEffect(() => {
    if (room.current.shown === frontId) return;
    if (reveal(frontId) || frontId === null) room.current.shown = frontId;
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingLeft: space.lg, paddingRight: space.sm, gap: 6, alignItems: 'center' }}
          snapToOffsets={snaps.length > 1 ? snaps : undefined}
          snapToStart
          snapToEnd
          decelerationRate="fast"
          scrollEventThrottle={32}
          onScroll={(e) => {
            const n = e.nativeEvent;
            room.current.x = n.contentOffset.x;
            if (n.contentSize?.width) room.current.content = n.contentSize.width;
            if (n.layoutMeasurement?.width) room.current.width = n.layoutMeasurement.width;
            measure();
          }}
          onContentSizeChange={(w) => {
            room.current.content = w;
            measure();
          }}
          onLayout={(e) => {
            room.current.width = e.nativeEvent.layout.width;
            measure();
            reveal(frontId);
          }}
        >
          {cards.map((view) => {
            const c = cardColors[view.habit.color];
            const kept = view.today;
            const isFront = view.habit.id === frontId;
            const state = kept === 'ceiling' ? 'Ceiling reached' : kept === 'floor' ? 'Floor kept' : view.neverTwice ? 'Comeback waiting' : 'not kept yet';
            const step = ringing?.steps.find((s) => s.suit === view.habit.suit);
            return (
              <Pressable
                key={view.habit.id}
                accessibilityRole="button"
                accessibilityLabel={`${view.habit.name}, ${state}`}
                accessibilityHint={kept ? 'Change or undo today' : 'Brings this card to the front'}
                accessibilityActions={[{ name: 'open', label: 'Open card' }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === 'open') onOpen(view.habit.id);
                }}
                onPress={() => onPill(view)}
                onLongPress={() => onOpen(view.habit.id)}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  room.current.spots.set(view.habit.id, { x, w: width });
                  measure();
                  if (isFront) reveal(view.habit.id);
                }}
                hitSlop={{ top: 5, bottom: 5 }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  height: 36,
                  borderRadius: radius.pill,
                  paddingLeft: 8,
                  paddingRight: 12,
                  backgroundColor: kept ? c.bg : isFront ? withAlpha(t.text, 0.1) : 'transparent',
                  borderWidth: kept ? 1 : 1.5,
                  borderStyle: kept || isFront || view.neverTwice ? 'solid' : 'dashed',
                  borderColor: kept ? withAlpha('#000000', 0.12) : isFront ? t.text : t.dashed,
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}
              >
                <RingChip start={step && ringing ? ringing.at : null} at={step ? STRUM_AT_MS + step.delayMs : null} color={kept ? withAlpha(c.ink, 0.14) : c.bg} edge={kept ? withAlpha(c.ink, 0.22) : withAlpha('#000000', 0.14)}>
                  {kept ? (
                    <Body weight="heavy" size={12} color={c.ink} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 14 }}>
                      {kept === 'ceiling' ? '↑' : '✓'}
                    </Body>
                  ) : null}
                </RingChip>
                <Body weight="heavy" size={13} numberOfLines={1} color={kept ? c.ink : t.text} maxFontSizeMultiplier={fontScale.chrome}>
                  {view.habit.name}
                </Body>
              </Pressable>
            );
          })}
        </ScrollView>
        {edges.left ? <EdgeFade side="left" felt={felt} /> : null}
        {edges.right ? <EdgeFade side="right" felt={felt} /> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New card"
        onPress={onNew}
        hitSlop={{ top: 5, bottom: 5 }}
        style={({ pressed }) => ({
          height: 36,
          justifyContent: 'center',
          borderRadius: radius.pill,
          paddingHorizontal: 12,
          marginLeft: 2,
          marginRight: space.lg,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: t.dashed,
          opacity: pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <Body weight="heavy" size={13} color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
          + New
        </Body>
      </Pressable>
    </View>
  );
}

/**
 * How the soft edge builds up: 14 layers of the felt, each starting 2 px further out and running to the
 * edge, so together they deepen smoothly to solid with no seams between them.
 */
const FADE_BANDS = (() => {
  const n = PILL_FADE / 2;
  const reach = (k: number) => Math.pow((k + 1) / n, 1.6);
  return Array.from({ length: n }, (_, k) => ({ left: k * 2, opacity: k === 0 ? reach(0) : 1 - (1 - reach(k)) / (1 - reach(k - 1)) }));
})();

/** The pill row running on under the felt at one end: drawn in the table's own colour, taking no touches. */
function EdgeFade({ side, felt }: { side: 'left' | 'right'; felt: React.ComponentProps<typeof Animated.View>['style'] }) {
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(160)}
      pointerEvents="none"
      aria-hidden
      style={{ position: 'absolute', top: 0, bottom: 0, width: PILL_FADE, [side]: 0, transform: side === 'left' ? [{ scaleX: -1 }] : undefined }}
    >
      {FADE_BANDS.map((band) => (
        <Animated.View key={band.left} style={[{ position: 'absolute', top: 0, bottom: 0, left: band.left, right: 0, opacity: band.opacity }, felt]} />
      ))}
    </Animated.View>
  );
}

/**
 * A pill's little card of colour. When the day's chord strums it rings: up to 1.15 and back on its suit's
 * note, `at` ms after the keep at `start`. The time since the keep is taken off, so the lift meets its note
 * however late this renders, and a pill drawn again after its note has passed stays still. Reduce Motion
 * leaves it still.
 */
function RingChip({ start, at, color, edge, children }: { start: number | null; at: number | null; color: string; edge: string; children?: ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (start === null || at === null) return;
    const wait = start + at - Date.now();
    if (wait < -RING_LATE_MS) return;
    scale.set(withDelay(Math.max(0, wait), withSequence(withTiming(1.15, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }))));
  }, [start, at, scale]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={[{ width: 16, height: 22, borderRadius: 4, backgroundColor: color, borderWidth: 1, borderColor: edge, alignItems: 'center', justifyContent: 'center' }, ringStyle]}>{children}</Animated.View>
  );
}

/** A plain text button under the card, at least 44 points. */
function QuietButton({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label.replace(/\s*→$/, '')}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: t.border, opacity: pressed ? 0.7 : 1 })}
    >
      <Body weight="heavy" size={14} maxFontSizeMultiplier={fontScale.chrome}>
        {label}
      </Body>
    </Pressable>
  );
}

/** Take back the check-in just made. It stays a few seconds; a kept card's pill can always undo it too. */
function UndoChip({ move, onUndo }: { move: Move; onUndo: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Undo ${move.level === 'ceiling' ? 'Ceiling' : 'Floor'} on ${move.name}`}
      onPress={onUndo}
      style={({ pressed }) => ({ minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 6, paddingRight: space.md, borderRadius: radius.pill, backgroundColor: t.text, opacity: pressed ? 0.8 : 1, flexShrink: 1 })}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Body weight="heavy" size={16} color={t.text} maxFontSizeMultiplier={1}>
          ↺
        </Body>
      </View>
      <Body weight="heavy" size={14} color={t.bg} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ flexShrink: 1, lineHeight: 17 }}>
        {`Undo · ${move.name}`}
      </Body>
    </Pressable>
  );
}

/** The first-swipe hint, until the first kept day. */
function Coach({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  return (
    <View style={[{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.pill, paddingLeft: space.md, paddingRight: 4, minHeight: TAP }, raisedStyle(t)]}>
      <Body weight="heavy" size={13} color={t.onRaised} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ flexShrink: 1, lineHeight: 17 }}>
        ↓ Floor · ↑ Ceiling. Swipe or tap.
      </Body>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Got it"
        onPress={onClose}
        style={({ pressed }) => ({ minHeight: 36, minWidth: TAP, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill, backgroundColor: t.onRaised, paddingHorizontal: space.md, opacity: pressed ? 0.8 : 1 })}
      >
        <Body weight="heavy" size={13} color={t.raised} maxFontSizeMultiplier={fontScale.chrome}>
          Got it
        </Body>
      </Pressable>
    </View>
  );
}

function Progress({ front, kept, total, reaching }: { front: Play; kept: number; total: number; reaching: boolean }) {
  const t = useTheme();
  // Short enough to sit beside Done and "Not today" on the narrowest phone.
  const text = reaching ? 'Ceiling in reach?' : front.item.kind === 'welcome' ? 'Nothing was lost.' : total - kept === 1 ? 'Last card today' : `${kept} of ${total} kept today`;
  return (
    <Body weight="heavy" size={14} color={t.textSecondary} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ flexShrink: 1, lineHeight: 18 }}>
      {text}
    </Body>
  );
}

// When the deck is done --------------------------------------------------------------------------------

/**
 * Every card kept: today's card, the hand it makes, and something worth doing next. `undo` is the last
 * check-in's Undo chip, shown in the page's own flow so it never covers a line of it.
 */
function AllKept({
  deck,
  keptCount,
  compact = false,
  under = 0,
  undo = null,
  onReach,
  onIdea,
}: {
  deck: Deck;
  keptCount: number;
  compact?: boolean;
  under?: number;
  undo?: ReactNode;
  onReach: (() => void) | null;
  onIdea: () => void;
}) {
  const t = useTheme();
  const card = deck.todayCard;
  const week = deck.game.current;
  const copy = allKeptCopy({ count: keptCount, hand: week.hand, warmup: week.warmup, chips: week.chips });
  const climb = deck.game.tips.find((tip) => tip.tone === 'climb');
  const north = deck.profile.northStar?.trim();
  const joker = card?.kind === 'joker';
  // An idea about one card (a plan for it, its Floor) says so and goes straight there, as it does on the Playbook.
  const ideaActs = ideaGoes(deck.idea);
  return (
    // `under` lets the page run on under the floating tab bar, so nothing looks cut off where it stops; at
    // its end the last line sits above the fade over the tab bar, never inside it.
    <ScrollView
      style={{ marginHorizontal: -space.sm, marginBottom: -under }}
      contentContainerStyle={{ gap: space.lg, paddingBottom: under ? fadeHeight(under) + space.sm : space.lg, paddingTop: space.sm, paddingHorizontal: space.sm }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        {card ? (
          // A Joker sits smaller beside the words: the hand it plays into is the news, not the Joker itself.
          <View accessible accessibilityLabel={`Today’s card: ${faceLabel(faceOfDay(card))}`} style={{ transform: [{ rotate: joker ? '-9deg' : '-6deg' }], marginLeft: space.xs }}>
            <PlayingCard face={faceOfDay(card)} size={joker || compact ? 'md' : 'lg'} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: space.xs }}>
          <Label numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome}>
            {copy.eyebrow}
          </Label>
          <Display size={compact ? 32 : 40} header maxFontSizeMultiplier={fontScale.chrome}>
            {copy.title}
          </Display>
          {/* The week's hand and what it pays, always: "Pair of Queens · 30 chips". */}
          <Display size={compact ? 18 : 20} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: compact ? 22 : 25 }}>
            {copy.hand}
          </Display>
        </View>
      </View>

      {undo ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={{ flexDirection: 'row' }}>
          {undo}
        </Animated.View>
      ) : null}

      {climb ? (
        <Animated.View layout={LinearTransition.duration(220)} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <Display size={18} aria-hidden>
            ↑
          </Display>
          <Body size={14} weight="bold" color={t.textSecondary} style={{ flex: 1 }}>
            {climb.text}
          </Body>
        </Animated.View>
      ) : null}

      {onReach ? (
        <Animated.View layout={LinearTransition.duration(220)}>
          <Button label="Any Ceiling still in reach?" variant="ghost" onPress={onReach} hint="Shows your Floor-kept cards again, one at a time" />
        </Animated.View>
      ) : null}

      {north ? (
        <Animated.View layout={LinearTransition.duration(220)} style={{ borderLeftWidth: 3, borderLeftColor: t.text, paddingLeft: space.md, gap: 2 }}>
          <Label maxFontSizeMultiplier={fontScale.chrome}>Your North Star</Label>
          <Display size={20}>{`“${north}”`}</Display>
        </Animated.View>
      ) : null}

      <Animated.View layout={LinearTransition.duration(220)}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={ideaActs ? deck.idea.cta : 'Opens the Playbook'}
          onPress={onIdea}
          style={({ pressed }) => [{ borderRadius: radius.lg, padding: space.lg, paddingHorizontal: space.xl, gap: space.xs, opacity: pressed ? 0.9 : 1 }, raisedStyle(t)]}
        >
          <Label color={t.onRaisedSecondary} maxFontSizeMultiplier={fontScale.chrome}>
            {ideaLabel(deck.idea.reason)}
          </Label>
          <Display size={22} color={t.onRaised} maxFontSizeMultiplier={fontScale.chrome}>
            {deck.idea.principle.title}
          </Display>
          <Body size={15} color={t.onRaised} maxFontSizeMultiplier={fontScale.chrome}>
            {deck.idea.text ?? deck.idea.principle.tryThis}
          </Body>
          {ideaActs ? (
            <Body size={15} weight="heavy" color={t.onRaised} maxFontSizeMultiplier={fontScale.chrome} style={{ marginTop: space.xs }}>
              {`${deck.idea.cta}\u00A0→`}
            </Body>
          ) : null}
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

/** Whether today's idea is one to act on (it names where to go), not just one to read. */
function ideaGoes(rec: Recommendation): boolean {
  return !!rec.cta && (!!(rec.habitId && rec.field) || !!rec.href);
}

/** Goes where today's idea points, as the Playbook's advice card does; an idea with nowhere to go opens the Playbook. */
function followIdea(router: ReturnType<typeof useRouter>, rec: Recommendation) {
  if (rec.cta && rec.habitId && rec.field) router.push({ pathname: '/habit/edit', params: { id: rec.habitId, focus: rec.field } });
  else if (rec.cta && rec.href) router.push(rec.href);
  else router.push('/playbook');
}

function EmptyDeck({ onCreate }: { onCreate: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: radius.card, borderWidth: 2, borderStyle: 'dashed', borderColor: t.dashed, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>
      <Display size={36} style={{ textAlign: 'center' }}>
        Your deck is empty.
      </Display>
      <Body color={t.textSecondary} style={{ textAlign: 'center' }}>
        Make a card with a Floor you can do on your worst day and a Ceiling for your best. Every day you keep it deals you a playing card.
      </Body>
      <Button label="Make a card" onPress={onCreate} />
    </View>
  );
}

// Large text and screen readers -------------------------------------------------------------------------

/** One card as a row with buttons, for large text sizes and screen readers. */
function ListRow({
  view,
  plan = null,
  planFloor = false,
  onFloor,
  onCeiling,
  onFirstMove,
  onUndo,
  onLogYesterday,
}: {
  view: HabitView;
  /** Your plan for this card's Comeback, as one line. */
  plan?: string | null;
  /** The plan is to keep the Floor: the Floor button is the plan, so there is no separate Done it. */
  planFloor?: boolean;
  onFloor: () => void;
  onCeiling: () => void;
  onFirstMove: () => void;
  onUndo: () => void;
  onLogYesterday?: () => void;
}) {
  const h = view.habit;
  const c = cardColors[h.color];
  const buttonColors = { bg: c.ink, fg: c.bg };
  const who = identityLine(h.identity);
  const firstMove = view.neverTwice && !planFloor ? h.twoMinuteLabel?.trim() : null;
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: withAlpha('#000000', 0.12) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <SuitGlyph suit={h.suit} size={16} color={c.ink} />
        <Display size={26} color={c.ink} header style={{ flex: 1 }}>
          {h.name}
        </Display>
      </View>
      {view.neverTwice ? (
        <Body weight="bold" color={c.ink}>
          {`Comeback. ${who ?? 'Yesterday got away.'} ${plan ? `Your plan · ${plan}` : 'Keep anything today and it counts.'}`}
        </Body>
      ) : null}
      {view.today ? (
        <>
          <Body weight="heavy" color={c.ink}>
            {view.today === 'ceiling' ? `Ceiling reached: ${h.ceilingLabel}` : `Floor kept: ${h.floorLabel}`}
          </Body>
          {view.today === 'floor' ? <Button label={`Reach the Ceiling: ${h.ceilingLabel}`} colors={buttonColors} onPress={onCeiling} /> : null}
          <Button label="Undo today" variant="ghost" colors={{ bg: 'transparent', fg: c.ink }} onPress={onUndo} />
        </>
      ) : (
        <>
          {firstMove ? <Button label={`Done it: ${firstMove}`} colors={buttonColors} onPress={onFirstMove} hint="Keeps today" /> : null}
          <Button label={`Floor: ${h.floorLabel}`} colors={buttonColors} onPress={onFloor} />
          <Button label={`Ceiling: ${h.ceilingLabel}`} colors={buttonColors} onPress={onCeiling} />
          {onLogYesterday ? <Button label="Did it yesterday, forgot to log" variant="ghost" colors={{ bg: 'transparent', fg: c.ink }} onPress={onLogYesterday} /> : null}
        </>
      )}
    </View>
  );
}
