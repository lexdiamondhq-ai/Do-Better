import { useIsFocused, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, interpolateColor, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnUI } from 'react-native-worklets';

import { ask, type AskButton } from '@/components/Ask';
import { Burst, type BurstKind } from '@/components/Burst';
import { Chips } from '@/components/Chips';
import { ComebackCard, HabitCard, WelcomeCard } from '@/components/HabitCard';
import { faceLabel, faceOfDay, PlayingCard } from '@/components/PlayingCard';
import { ReminderPrompt, useReminderPromptDue } from '@/components/ReminderPrompt';
import { RulesSheet } from '@/components/RulesSheet';
import { SuitGlyph } from '@/components/Suit';
import { DeckCard, LIFT, SwipeCard, type CommitInfo, type SwipeDirection, type SwipeHandle } from '@/components/SwipeCard';
import { Body, Button, Display, Label, raisedStyle, TableSurface } from '@/components/ui';
import { WeekStrip } from '@/components/WeekStrip';
import { dayChord, keepSound, strum, type ToneStep } from '@/engine/chord';
import { planLine, type Point } from '@/engine/comeback';
import { addDays, canBackfill, weekday } from '@/engine/day';
import { lastShowdown, type Game, type TipTone } from '@/engine/game';
import type { Level } from '@/engine/kept';
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
  handLineCopy,
  ideaLabel,
  identityLine,
  interruptionFor,
  JOKER_LINE,
  keptLine,
  keyMove,
  laterTag,
  momentOf,
  partOfDayAt,
  todayTips,
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
import { playSound, playTones } from '@/lib/sound';
import { withAlpha } from '@/theme/color';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';
import { cardColors, fontScale, radius, space, suitColors, TAP, themeOn, type Theme } from '@/theme/tokens';

/** The first-swipe coach mark, shown once per player until the first kept day. */
const COACH = 'coach:first-swipe';
/** The floating tab bar's pill, above its bottom padding. */
const TAB_BAR = 56;
const FIRST_MOVE_NOTE = 'First move done. Today is kept.';
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
  const [ringing, setRinging] = useState<readonly ToneStep[]>([]);
  const swipe = useRef<SwipeHandle>(null);
  const prompted = useRef(new Set<string>());
  const keptSoFar = useRef(deck.totals.kept);
  const pull = useSharedValue(0);

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
  const tips = todayTips(game.tips, { warmup: game.current.warmup, firstLook: coachDue });
  const tip = tips.length ? tips[tipTurn % tips.length] : null;
  // A tip can name the card a face-card moment is about to show, so until it closes the tip keeps its place but shows nothing.
  const tipVeiled = bigMoment;

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
   * `firstMove` is Done it on the Comeback card.
   */
  function keep(view: HabitView, level: Level, firstMove = false) {
    const id = view.habit.id;
    playSound(keepSound(view.habit.suit, level, { comeback: !!view.neverTwice }));
    if (view.neverTwice) feel.turnover();
    else if (level === 'ceiling') feel.ceiling();
    else feel.floor();
    // The keep that finishes the day strums today's notes as one chord, and the pills ring in time.
    if (!view.today && pending.every((c) => c.habit.id === id)) {
      const cardsAfter = deck.cards.map((c) => ({ suit: c.habit.suit, level: c.habit.id === id ? level : c.today }));
      const steps = strum(dayChord(cardsAfter).notes);
      playTones(steps, 380);
      setRinging(steps);
    }
    setBurst((b) => ({ n: (b?.n ?? 0) + 1, kind: level, color: cardColors[view.habit.color].bg }));
    setFocused(null);
    setMove((m) => ({ habitId: id, name: view.habit.name, level, was: view.today, n: (m?.n ?? 0) + 1 }));
    if (coachDue) markSeen(seed, COACH);
    // The shared keep also answers a waiting Comeback, the same way the card's own page does. A Ceiling
    // on the Comeback card still answers it as the Floor; only Done it is the first move.
    keepCard(view, level, { firstMove }).catch(fail);
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
    keep(view, dir === 'up' ? 'ceiling' : 'floor', item.kind === 'comeback' && tag === 'first');
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
    const buttons: AskButton[] = [{ text: 'Undo today', style: 'destructive', onPress: () => undo(id) }];
    if (view.today === 'floor') buttons.push({ text: `Reach the Ceiling: ${view.habit.ceilingLabel}`, onPress: () => keep(view, 'ceiling') });
    else
      buttons.push({
        text: `Make it a Floor day`,
        onPress: () => {
          feel.tick();
          // The Undo chip now offers to take back this change (back to the Ceiling), never to clear the day.
          setMove((m) => ({ habitId: id, name: view.habit.name, level: 'floor', was: 'ceiling', n: (m?.n ?? 0) + 1 }));
          checkIn(id, 'floor').catch(fail);
        },
      });
    buttons.push({ text: 'Open card', onPress: () => router.push(`/habit/${id}`) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    ask(view.habit.name, view.today === 'floor' ? `Floor kept today: ${view.habit.floorLabel}.` : `Ceiling reached today: ${view.habit.ceilingLabel}.`, buttons);
  }

  /** "Did it, forgot to log": yesterday gets its check-in now, at the level picked. */
  function logLate(view: HabitView, level: Level) {
    playSound('flip');
    feel.flip();
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
      const onPage = !tag || tag === 'BODY' || tag === 'HTML';
      const move = keyMove({ key: e.key, repeat: !!e.repeat, onPage }, { kind: keyKind, allow: { up: !!keyUp, down: !!keyDown, left: !!keySide, right: !!keySide }, firstMove: !!keyFirst });
      if (!move) return;
      e.preventDefault();
      if (move.first) card.fling('down', { note: FIRST_MOVE_NOTE, tag: 'first' });
      else card.fling(move.dir, { tag: 'key' });
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [keyKind, keyUp, keyDown, keySide, keyFirst]);

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
          gap={comebackGap(habit.startedOn, deck.today, view.checkIns)}
          saving={!!game.rescue}
          compact={folded}
          lean={density.leanComeback}
          tight={density.tightComeback}
          tiny={density.tinyComeback}
          roomy={density.roomyComeback}
          onOpen={onOpen}
          onFirstMove={live ? (at) => fling('down', { note: FIRST_MOVE_NOTE, tag: 'first', turnover: at }) : undefined}
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
        backFace={turned ? (dir) => <HabitCard habit={turned.habit} level={dir === 'up' ? 'ceiling' : 'floor'} kept={turned.allTime.kept + 1} /> : undefined}
      >
        {face(play.item, play.view, live)}
      </SwipeCard>
    );
  }

  // Layout ----------------------------------------------------------------------------------------------
  const hasCards = deck.cards.length > 0;
  const header = <Header deck={deck} demo={!!demo} onStartOwn={() => startOwnDeck().catch(() => {})} onStack={() => router.push('/you')} compact={compact} />;
  const strip = hasCards ? (
    <View style={{ paddingHorizontal: space.xl, marginTop: compact ? space.sm : space.md }}>
      <WeekStrip week={game.current} back={back} rescue={game.rescue} onPress={() => router.push('/hands')} onYesterday={lateCards.length ? () => logYesterday() : undefined} />
    </View>
  ) : null;
  const handLine = hasCards ? (
    <HandLine
      game={game}
      base={base}
      sunday={weekday(deck.today) === 6}
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
    <Pills cards={deck.cards} frontId={front?.item.kind === 'welcome' ? null : (front?.item.id ?? null)} ringing={ringing} onPill={onPill} onOpen={(id) => router.push(`/habit/${id}`)} onNew={() => router.push('/habit/edit')} />
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
            {strip}
            {handLine}
            {banner}
            <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
              {pending.length === 0 && hasCards ? <AllKept deck={deck} keptCount={keptCount} onReach={null} onIdea={() => router.push('/playbook')} /> : null}
              {!hasCards ? <EmptyDeck onCreate={() => router.push('/habit/edit')} /> : null}
              {listRows.map((view) => (
                <ListRow
                  key={view.habit.id}
                  view={view}
                  onFloor={() => keep(view, 'floor')}
                  onCeiling={() => keep(view, 'ceiling')}
                  onFirstMove={() => keep(view, 'floor', true)}
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
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, table]} />
      <TableSurface />
      <ThemeScope theme={chrome}>
        <View style={{ flex: 1, paddingTop: insets.top + (compact ? space.xs : space.sm), paddingBottom: bottomPad }}>
          {header}
          {strip}
          {handLine}
          {banner}
          {pills}
          {/* Raised over the row below it, so a card dragged down passes over "2 of 4 kept today" and Later, not under them. */}
          <View style={{ flex: 1, zIndex: front ? 1 : undefined, marginHorizontal: space.lg, marginTop: hasCards && front ? (compact ? space.lg : space.xl) : space.md }}>
            <View style={{ flex: 1 }} onLayout={(e) => setDeckHeight(Math.round(e.nativeEvent.layout.height))}>
              {front ? null : hasCards ? (
                <AllKept
                  deck={deck}
                  keptCount={keptCount}
                  compact={compact}
                  under={bottomPad}
                  undo={move ? <UndoChip move={move} onUndo={() => takeBack(move)} /> : null}
                  onReach={floorKept.some((c) => !reach?.skipped.includes(c.habit.id)) ? startReach : null}
                  onIdea={() => router.push('/playbook')}
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
      {interruption === 'reminder' ? <ReminderPrompt /> : null}
    </View>
  );
}

type KeyEvent = {
  key: string;
  repeat?: boolean;
  target?: { tagName?: string; closest?: (selector: string) => unknown } | null;
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
 */
function HandLine({
  game,
  base,
  sunday,
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
  const copy = handLineCopy({ warmup: week.warmup, hand: week.hand, chips: week.chips, sunday });
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
            {copy.pays !== null ? <Chips value={copy.pays} size={11} pill /> : null}
          </View>
          <Display size={22} numberOfLines={2} maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 25 }}>
            {copy.title}
          </Display>
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

/** This week's call: an outline until the hand makes it, then filled in with a tick. Calls are made on Monday. */
function CallChip({ game, onPress }: { game: Game; onPress: () => void }) {
  const t = useTheme();
  const { call, hand, warmup } = game.current;
  if (warmup || (!call && !game.callOpen)) return null;
  const made = !!call && makesCall(hand, call);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={!call ? 'Call your hand' : `You called ${HANDS[call].name}${made ? ', and your hand makes it' : ''}`}
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
          <Body size={10} weight="heavy" color={made ? t.bg : t.textSecondary} maxFontSizeMultiplier={fontScale.chrome} style={{ letterSpacing: 0.8 }}>
            {made ? 'CALL MADE ✓' : 'YOUR CALL'}
          </Body>
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

/**
 * Every card in the deck as a pill: kept ones in their colour, waiting ones as outlines. The row scrolls
 * by itself, just enough to keep the front card's pill in view as the front card changes.
 */
function Pills({
  cards,
  frontId,
  onPill,
  onOpen,
  onNew,
}: {
  cards: HabitView[];
  frontId: string | null;
  /** The day's chord as it strums: each pill rings on its suit's note (stream 1 draws it). */
  ringing?: readonly ToneStep[];
  onPill: (view: HabitView) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const t = useTheme();
  const scroll = useRef<ScrollView>(null);
  const room = useRef({ x: 0, width: 0, spots: new Map<string, { x: number; w: number }>() });

  /** Scrolls just enough to show a pill whole, with the row's padding around it. */
  const reveal = (id: string | null) => {
    const r = room.current;
    const spot = id ? r.spots.get(id) : undefined;
    if (!spot || !r.width) return;
    const pad = space.lg;
    let x = r.x;
    if (spot.x - pad < r.x) x = Math.max(0, spot.x - pad);
    else if (spot.x + spot.w + pad > r.x + r.width) x = spot.x + spot.w + pad - r.width;
    if (x === r.x) return;
    r.x = x;
    scroll.current?.scrollTo({ x, animated: true });
  };

  useEffect(() => {
    reveal(frontId);
  });

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, marginTop: space.md }}
      contentContainerStyle={{ paddingHorizontal: space.lg, gap: 6, alignItems: 'center' }}
      scrollEventThrottle={32}
      onScroll={(e) => {
        room.current.x = e.nativeEvent.contentOffset.x;
      }}
      onLayout={(e) => {
        room.current.width = e.nativeEvent.layout.width;
        reveal(frontId);
      }}
    >
      {cards.map((view) => {
        const c = cardColors[view.habit.color];
        const kept = view.today;
        const isFront = view.habit.id === frontId;
        const state = kept === 'ceiling' ? 'Ceiling reached' : kept === 'floor' ? 'Floor kept' : view.neverTwice ? 'Comeback waiting' : 'not kept yet';
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
              if (isFront) reveal(view.habit.id);
            }}
            hitSlop={{ top: 5, bottom: 5 }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 36,
              borderRadius: radius.pill,
              paddingLeft: kept ? 12 : 8,
              paddingRight: 12,
              backgroundColor: kept ? c.bg : isFront ? withAlpha(t.text, 0.1) : 'transparent',
              borderWidth: kept ? 1 : 1.5,
              borderStyle: kept || isFront || view.neverTwice ? 'solid' : 'dashed',
              borderColor: kept ? withAlpha('#000000', 0.12) : isFront ? t.text : t.dashed,
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            {kept ? null : <View style={{ width: 16, height: 22, borderRadius: 4, backgroundColor: c.bg, borderWidth: 1, borderColor: withAlpha('#000000', 0.14) }} />}
            <Body weight="heavy" size={13} numberOfLines={1} color={kept ? c.ink : t.text} maxFontSizeMultiplier={fontScale.chrome}>
              {kept ? `${kept === 'ceiling' ? '↑' : '✓'} ${view.habit.name}` : view.habit.name}
            </Body>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New card"
        onPress={onNew}
        hitSlop={{ top: 5, bottom: 5 }}
        style={({ pressed }) => ({ height: 36, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.dashed, opacity: pressed ? 0.7 : 1 })}
      >
        <Body weight="heavy" size={13} color={t.textSecondary} maxFontSizeMultiplier={fontScale.chrome}>
          + New
        </Body>
      </Pressable>
    </ScrollView>
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
          <View accessible accessibilityLabel={`Today’s card: ${faceLabel(faceOfDay(card))}`} style={{ transform: [{ rotate: '-6deg' }], marginLeft: space.xs }}>
            <PlayingCard face={faceOfDay(card)} size={compact ? 'md' : 'lg'} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: space.xs }}>
          {/* One short line: the card beside it shows which card it is, and VoiceOver reads its name from the card. */}
          <Label numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} aria-hidden={!!card}>
            {card ? 'Today’s card' : 'Today'}
          </Label>
          <Display size={compact ? 32 : 40} header maxFontSizeMultiplier={fontScale.chrome}>
            {copy.title}
          </Display>
          <Body size={15} weight="bold" maxFontSizeMultiplier={fontScale.chrome} style={{ lineHeight: 20 }}>
            {joker ? `Today’s card is a Joker. ${JOKER_LINE}` : copy.hand}
          </Body>
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
          accessibilityHint="Opens the Playbook"
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
            {deck.idea.principle.tryThis}
          </Body>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
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
  onFloor,
  onCeiling,
  onFirstMove,
  onUndo,
  onLogYesterday,
}: {
  view: HabitView;
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
  const firstMove = view.neverTwice ? h.twoMinuteLabel?.trim() : null;
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
          {`Comeback. ${who ?? 'Yesterday got away.'} Keep anything today and it counts.`}
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
