import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUIT_INFO, SUITS, type Suit } from '@/engine/cards';
import { SUIT_NOTE, strum, suitTone, type Tone } from '@/engine/chord';
import { FACES, RUNGS } from '@/engine/court';
import { weekday, type Day } from '@/engine/day';
import { KEPT_LO, RIVER_DAYS, TOP_LO, type DayCard } from '@/engine/deal';
import { CALL_HISTORY, type Game, type Multiplier, type Week } from '@/engine/game';
import { HAND_LADDER, HANDS, JOKER_LINE, type HandKind } from '@/engine/poker';
import { stampsFor, type Stamp } from '@/engine/showdown';
import { WEAR_AT } from '@/engine/wear';
import { useDeck, useLook } from '@/lib/deck';
import { tick } from '@/lib/feel';
import { playSound, playTones } from '@/lib/sound';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';
import { chip, edgeBorder, fontScale, fonts, radius, space, suitColors, TAP, typeScale } from '@/theme/tokens';

import { CardBack } from './CardBack';
import { ChipIcon, formatChips } from './Chips';
import { EXAMPLES, HandRow } from './HandFan';
import { CARD_SIZES, faceLabel, faceOfDay, faceOfPlayed, PlayingCard, type CardFace } from './PlayingCard';
import { SuitGlyph } from './Suit';
import { Body, Display, Label } from './ui';

/**
 * The rules, one tap away: every term in a line, in the app's own words. `<RulesButton topic="call"/>`
 * opens the sheet at that section. The words come from the engine's own numbers, so a retuned rule
 * can't leave the sheet behind (RulesSheet.test.ts checks the lines against the engine).
 *
 * The sheet reads your own game back to you: the ladder marks the hand you hold with a gold bar and
 * outlines your call, a secret hand stays face down until one of your weeks has held it, and each
 * section that touches your week shows a row of this week's cards with the part that section is about
 * picked out.
 */
export type RulesTopic = 'deal' | 'week' | 'river' | 'showdown' | 'call' | 'comeback' | 'court' | 'suits' | 'leave' | 'fair';

export type Rule = { term: string; line: string };
export type RulesSection = { key: RulesTopic; title: string; chip: string; rules: Rule[] };

const faceDays = FACES.map((f) => `${f.name} at ${f.votes}`);
const notes = SUITS.map((s) => `${SUIT_INFO[s].part} ${SUIT_NOTE[s]}`).join(', ');

export const RULES: readonly RulesSection[] = [
  {
    key: 'deal',
    title: 'Every kept day deals a card',
    chip: 'The deal',
    rules: [
      { term: 'Floor', line: 'The least that still counts. Swipe the card down and the day is kept.' },
      { term: 'Ceiling', line: 'What a great day looks like. Swipe the card up.' },
      { term: 'Later', line: 'Swipe sideways and the card goes to the back of today’s deck.' },
      { term: 'Kept day', line: 'Keep at least one habit and the day deals one playing card.' },
      { term: 'Some kept', line: 'The card can be as low as 2, 3 or 4: each habit kept and each Ceiling lifts the lowest it can be.' },
      { term: 'Everything kept', line: `Keep every habit, even at the Floor, and the card is ${KEPT_LO} or better.` },
      { term: 'Everything at its Ceiling', line: `Every habit at its Ceiling deals ${TOP_LO} or better. A few Ceilings don’t lift a fully kept day past ${KEPT_LO}.` },
      { term: 'Up to the Ace', line: 'Every day can deal an Ace. Where the card lands is the luck of the deal, the same on every phone.' },
      { term: 'Suits', line: 'A card carries the suit of every habit you kept that day.' },
      { term: 'Only up', line: 'Keeping more later in the day can raise its card, never lower it.' },
      { term: 'Into your week', line: 'Keep a card and today’s playing card is dealt into its place in your week.' },
      { term: 'Days to come', line: 'Days still to come sit face down in your card back. On Monday they’re dealt in once, and the hand line says New week.' },
    ],
  },
  {
    key: 'week',
    title: 'Every week plays as a poker hand',
    chip: 'The week',
    rules: [
      { term: 'The hand', line: 'Monday to Sunday, your best five cards make the hand.' },
      { term: 'Showdown', line: 'At Sunday midnight the hand pays chips into your stack. Chips never leave the stack.' },
      { term: 'Outs', line: `Your hand names the ranks that would lift it: only ranks a fully kept day can deal (${KEPT_LO} and up), and never which day deals them.` },
      { term: 'No Flush', line: 'A day counts in the suit of every habit you kept, so five in one suit come too easily. It isn’t a hand here.' },
      { term: 'Suited', line: 'Five Ceiling days in one suit in a week. It pays nothing: it names the part of you that was at its best.' },
      { term: 'Led the week', line: 'The suit on the most days you kept something.' },
      { term: 'Warm-up week', line: 'Start on a Thursday to a Sunday and that first week is a warm-up: its cards deal and count in the Court, with no Showdown and no call.' },
      { term: 'Fresh deck', line: 'Every day deals from a fresh deck, so the same card can turn up twice in a week.' },
    ],
  },
  {
    key: 'river',
    title: 'The river card',
    chip: 'River',
    rules: [
      { term: 'River card', line: `Keep something on ${RIVER_DAYS} days of the week (saved days don’t count) and you earn one more card.` },
      { term: 'Face down', line: 'It has no suit, stays face down all week and turns at the Showdown.' },
      { term: 'River outs', line: 'From Saturday, or once the river is earned, your hand names the river’s outs too. The river itself stays face down until midnight on Sunday.' },
    ],
  },
  {
    key: 'showdown',
    title: 'Sunday: what made this hand',
    chip: 'Showdown',
    rules: [
      { term: 'The river decides', line: 'The hand names itself as each card turns, and the table pauses before the river turns.' },
      { term: '↓ and ↑', line: 'Under each played card, ↓ marks a Floor day and ↑ a Ceiling day.' },
      {
        term: 'What made this hand',
        line: 'When Floor days, a comeback’s saved card or the river changed the kind of hand, the Showdown says so: “Without them: Queen high.” Otherwise it counts how many of the cards were Floor days.',
      },
      { term: 'One total', line: 'The hand and the call pay as one total: Straight 100 + Call 100 = 200.' },
      { term: 'Hand names', line: 'A run is named by its ends: Straight, Six to Ten.' },
      { term: 'The hand’s chord', line: 'The five cards ring as the hand’s chord, and the result taps out its shape: a pair twice, a full house three then two.' },
    ],
  },
  {
    key: 'call',
    title: 'Call your hand',
    chip: 'Calls',
    rules: [
      { term: 'Call', line: 'Pick the hand you think this week will make. Make it or better and it pays again on top.' },
      { term: 'Safe ×1, Stretch ×2, Long shot ×3', line: `Safe pays the called hand’s chips again, Stretch twice, Long shot three times, each priced from your last ${CALL_HISTORY} weeks.` },
      { term: 'Sure things', line: 'A hand you make most weeks pays nothing extra, so it isn’t offered.' },
      { term: 'When', line: 'A call stays open until the end of the first day this week you keep something.' },
      { term: 'No risk', line: 'Missing a call costs nothing. Your hand still pays.' },
    ],
  },
  {
    key: 'comeback',
    title: 'A missed day is only a day',
    chip: 'Comeback',
    rules: [
      { term: 'Comeback', line: 'After a missed day the card offers its First move, the smallest way back in.' },
      { term: 'Turn it back over', line: 'Keep anything from the Comeback side and the card turns back over to its bright side.' },
      { term: 'Saved day', line: 'Kept nothing yesterday? Keep anything today and yesterday gets a card too. It has no suit and counts for pairs and straights.' },
      { term: 'Yesterday’s card', line: 'If the whole of yesterday got away, yesterday’s card shows face up. Keep anything today and it’s yours.' },
      { term: 'Floor held', line: 'Keep the Floor on a Comeback card, or press Done it, and its receipt says Floor held.' },
      {
        term: 'Your plan',
        line: 'After a Comeback you can make one plan for next time: what got in the way, then your First move or your Floor. It shows on that card’s next Comeback and in its Last call reminder, and it’s saved on this phone.',
      },
      { term: 'Two in a row', line: 'Miss two days running and the first of them stays empty.' },
      { term: 'Sunday', line: 'Sunday can’t be saved: the hand pays out at midnight.' },
      { term: 'Did it, forgot to log', line: 'Add yesterday the next day, while it’s still the same week. You can add it, not change it.' },
      { term: 'Never lost', line: 'Once the day ends, face cards are never lost.' },
      { term: 'No streaks', line: 'Nothing here resets to zero. Kept days only add up.' },
    ],
  },
  {
    key: 'court',
    title: 'The Court',
    chip: 'Court',
    rules: [
      { term: 'Four suits', line: `Each habit builds one part of you: ${SUITS.map((s) => `${SUIT_INFO[s].glyph} ${SUIT_INFO[s].part}`).join(', ')}.` },
      { term: 'Days', line: 'The Court counts days per suit. A day counts once for a suit, however many of its habits you kept.' },
      { term: 'Face cards', line: `${faceDays.join(', ')} days.` },
      { term: 'Rungs', line: `Between the King and the Ace, rungs at ${RUNGS.slice(0, -1).join(', ')} and ${RUNGS[RUNGS.length - 1]} days mark the climb. They bring no Joker.` },
      { term: 'Kept for good', line: 'Days only add up. A face card, once earned, is never lost.' },
      { term: 'Joker', line: `Each new face card deals a Joker on your next kept day. ${JOKER_LINE} A day logged late never takes one.` },
      { term: 'One a week', line: 'At most one Joker lands in a week. Any others wait for the weeks after, so none is ever lost.' },
    ],
  },
  {
    key: 'suits',
    title: 'Suits are who you are',
    chip: 'Suits',
    rules: [
      {
        term: 'Worn in',
        line: `Cards wear in with their own kept days: Worn in at ${WEAR_AT.worn}, Well played at ${WEAR_AT.played} (a crease and your thumb mark), a gilt edge at ${WEAR_AT.gilt}, an Heirloom at a year. Nothing can buy wear.`,
      },
      { term: 'Its own note', line: `Each part of you plays its own note: ${notes}. A Floor sounds it softly and a Ceiling rings it an octave up.` },
      { term: 'The day’s chord', line: 'Keep every card and the day plays as a chord.' },
    ],
  },
  {
    key: 'leave',
    title: 'Leave it where it plays',
    chip: 'Leave it',
    rules: [
      { term: 'Print', line: 'A card about the size of a playing card, with your card back on the reverse. Cut it out, fold it and leave it where its habit plays.' },
      { term: 'Lock screen', line: 'The same card, made to sit under your phone’s clock.' },
      { term: 'When it plays first', line: 'A card needs a When it plays before it can leave the phone. No chips or hands go on it: it’s a cue, not a trophy.' },
    ],
  },
  {
    key: 'fair',
    title: 'Rules that keep it fair',
    chip: 'Fair play',
    rules: [
      { term: 'Outs stay fair', line: `Outs never name a day, and never count ranks below ${KEPT_LO}.` },
      { term: 'The river waits', line: 'The live river is never worked out early.' },
      { term: 'Credit only', line: 'Floor credit is credit only. It never takes anything away.' },
      { term: 'On this phone', line: 'Wear, plans and seen moments live only on this phone, and Delete my deck clears them.' },
      { term: 'Chips stay', line: 'Still no streaks, and chips never leave the stack.' },
    ],
  },
];

/** The hands, weakest first, with what each pays. There is no Flush. */
export const HAND_PRICES = HAND_LADDER.map((kind) => ({ kind, name: HANDS[kind].name, chips: HANDS[kind].chips }));

/**
 * The price list as the player may see it: a secret hand keeps its secret, as it does in the Hands
 * tab, until it has been spotted in one of their weeks. What it pays still shows.
 */
export function handPrices(spotted: ReadonlySet<HandKind>): { kind: HandKind; name: string; chips: number; hidden: boolean }[] {
  return HAND_PRICES.map((h) => ({ ...h, hidden: HANDS[h.kind].secret && !spotted.has(h.kind) }));
}

/** One rung of the ladder, with what it means to you: the hand you hold now, or the hand you called. */
export type LadderRow = { kind: HandKind; name: string; chips: number; hidden: boolean; mine: boolean; called: boolean; multiplier: Multiplier; made: boolean };

/**
 * The ladder, strongest first, marked for this week: `mine` on the hand you hold, `called` on the hand
 * you called (with its multiplier, and `made` once the hand reaches it). A secret hand shows once a
 * finished week has held it, or once it's the hand you hold.
 */
export function ladder(game: Pick<Game, 'hall' | 'current'> | null): LadderRow[] {
  const spotted = new Set((game?.hall ?? []).filter((e) => e.count > 0).map((e) => e.kind));
  const week = game?.current;
  const holding = week?.hand?.kind ?? null;
  if (holding) spotted.add(holding);
  return handPrices(spotted)
    .map((h) => ({
      ...h,
      mine: h.kind === holding,
      called: !!week && week.call === h.kind,
      multiplier: week && week.call === h.kind ? week.callMultiplier : 0,
      made: !!week && week.call === h.kind && week.madeCall,
    }))
    .reverse();
}

/**
 * The section the reader is in: the last one whose top has scrolled up to `y`, or the last section
 * once the page is scrolled to its end (a short last section never reaches the top).
 */
export function sectionAt(tops: readonly { key: RulesTopic; y: number }[], y: number, atEnd: boolean): RulesTopic | undefined {
  if (!tops.length) return undefined;
  const sorted = [...tops].sort((a, b) => a.y - b.y);
  if (atEnd) return sorted[sorted.length - 1].key;
  let here = sorted[0].key;
  for (const s of sorted) if (s.y <= y) here = s.key;
  return here;
}

/** Where the page scrolls to open at `topic`: its top, with a little room above. Null until it has a place. */
export function openingScroll(topic: RulesTopic | undefined, tops: Partial<Record<RulesTopic, number>>): number | null {
  const y = topic ? tops[topic] : undefined;
  return y === undefined ? null : Math.max(0, y - space.md);
}

/** What a section's row of your week's cards picks out. */
export type MiniMode = 'deal' | 'hand' | 'river' | 'stamps' | 'call' | 'saved' | 'court' | 'notes';

const MINI: Partial<Record<RulesTopic, MiniMode>> = { deal: 'deal', week: 'hand', river: 'river', showdown: 'stamps', call: 'call', comeback: 'saved', court: 'court', suits: 'notes' };

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** The day names VoiceOver says: a lone "T" could be Tuesday or Thursday. */
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Clubs and Spades". */
const suitList = (suits: readonly Suit[]) => {
  const names = suits.map((s) => SUIT_INFO[s].name);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/**
 * One place in a mini row: a card face up, a back (a day to come, or the river while face down), today's
 * open place, or an empty day. `focus` is what the section is about; the rest dims. `under` is the small
 * mark below the card, `tone` the note it rings when tapped. `day` and `said` are what VoiceOver says for
 * the letter and the mark, since it would read ↓ or ↺ as the arrow's name.
 */
export type MiniSlot = {
  key: string;
  letter: string;
  day: string;
  face: CardFace | null;
  back: boolean;
  open: boolean;
  dashed: boolean;
  focus: boolean;
  held: boolean;
  under: string | null;
  said: string | null;
  /** The suits drawn under the card in Court, in their own colours. `said` names them for VoiceOver. */
  underSuits?: readonly Suit[];
  tone: Tone | null;
  center: string | null;
};

/** The note a day's card rings: its leading suit (an octave up if that suit reached its Ceiling), or the low F with no suit. */
export function cardTone(card: DayCard): Tone {
  const suit = card.kind === 'card' ? card.suits[0] : undefined;
  if (!suit) return 'ring-low';
  return suitTone(suit, card.ceilingSuits.includes(suit));
}

const STAMP_MARK: Record<Stamp, string> = { floor: '↓', ceiling: '↑' };
const STAMP_SAID: Record<Stamp, string> = { floor: 'Floor day', ceiling: 'Ceiling day' };

/**
 * The row of this week's cards a section shows, with what that section is about picked out:
 * - `deal`: every card, with the lowest its day could deal under it.
 * - `hand`: the cards in your hand lifted, the rest dimmed.
 * - `river`: the week, then the river: face down once earned, or how many kept days it still needs. A
 *   warm-up week has no Showdown, so it has no river either.
 * - `stamps`: the hand's cards with ↓ or ↑ under each.
 * - `call`: the hand's cards; the caption says whether they make the call.
 * - `saved`: saved days marked ↺, and yesterday's card, dashed, while it can still be saved.
 * - `court`: every card with the suits it counts in.
 * - `notes`: every card with the note it rings.
 */
export function miniSlots(week: Week, mode: MiniMode, rescue: { day: Day; card: DayCard } | null = null): MiniSlot[] {
  const played = new Map(week.hand?.cards.map((c) => [c.day, c]) ?? []);
  // Saved days stand out only when there is one to show; with none, the row stays bright.
  const anySaved = !!rescue || week.slots.some((s) => s.card?.kind === 'card' && s.card.rescued);
  if ((mode === 'stamps' || mode === 'call') && week.hand) {
    const stamps = stampsFor(week);
    return week.hand.cards.map((c, i) => {
      const stamp = mode === 'stamps' ? stamps[c.day] : undefined;
      return {
        key: `${c.day}-${i}`,
        letter: c.river ? 'River' : LETTERS[weekday(c.day)],
        day: c.river ? 'River' : DAY_NAMES[weekday(c.day)],
        face: faceOfPlayed(c),
        back: false,
        open: false,
        dashed: false,
        focus: true,
        held: false,
        under: stamp ? STAMP_MARK[stamp] : null,
        said: stamp ? STAMP_SAID[stamp] : null,
        tone: null,
        center: null,
      };
    });
  }
  const slots: MiniSlot[] = week.slots.map((slot) => {
    const base: MiniSlot = {
      key: slot.day,
      letter: LETTERS[weekday(slot.day)],
      day: DAY_NAMES[weekday(slot.day)],
      face: null,
      back: false,
      open: false,
      dashed: false,
      focus: true,
      held: false,
      under: null,
      said: null,
      tone: null,
      center: null,
    };
    const card = slot.card;
    if (!card) {
      if (mode === 'saved' && rescue && rescue.day === slot.day) return { ...base, face: faceOfDay(rescue.card), dashed: true, under: '↺', said: 'yours if you keep anything today' };
      if (slot.state === 'future') return { ...base, back: true, focus: false };
      if (slot.state === 'open') return { ...base, open: true };
      return { ...base, focus: false, center: slot.state === 'blank' ? '·' : null };
    }
    const p = played.get(slot.day);
    const face = faceOfDay(card, card.kind === 'joker' ? undefined : p?.suit);
    const saved = card.kind === 'card' && card.rescued;
    switch (mode) {
      case 'deal':
        // The card's own label already says "saved" or "Joker".
        return { ...base, face, under: saved ? '↺' : card.kind === 'joker' ? '★' : `${card.lo}+`, said: saved || card.kind === 'joker' ? null : `${card.lo} or better` };
      case 'hand':
      case 'stamps':
      case 'call':
        return { ...base, face: p && card.kind === 'joker' ? faceOfPlayed(p) : face, focus: !!p, held: !!p };
      case 'saved':
        return { ...base, face, focus: saved || !anySaved, under: saved ? '↺' : null };
      case 'court':
        return {
          ...base,
          face,
          focus: card.suits.length > 0,
          under: card.suits.map((s) => SUIT_INFO[s].glyph).join('') || null,
          said: card.suits.length ? `counts for ${suitList(card.suits)}` : null,
          underSuits: card.suits,
        };
      case 'notes': {
        const tone = card.kind === 'joker' ? 'ring-low' : cardTone(card);
        const suit = card.kind === 'card' ? card.suits[0] : undefined;
        const note = suit ? SUIT_NOTE[suit] : 'low F';
        return { ...base, face, tone, under: note, said: `its note ${note}` };
      }
      default:
        return { ...base, face };
    }
  });
  if (mode === 'river' && !week.warmup) {
    const { earned, need } = week.river;
    slots.push({
      key: 'river',
      letter: 'River',
      day: 'River',
      face: null,
      back: earned,
      open: false,
      dashed: !earned,
      focus: earned,
      held: false,
      under: null,
      said: null,
      tone: null,
      center: earned ? null : `+${need}`,
    });
  }
  return slots;
}

/** Whether any day of the week has dealt a card yet. */
const anyCards = (week: Week) => week.slots.some((s) => s.card);

/** The line beside "Your week": what the row shows, in a few words. */
export function miniCaption(week: Week, mode: MiniMode, o: { rescue?: boolean; callOpen?: boolean } = {}): string | null {
  switch (mode) {
    case 'deal':
      return anyCards(week) ? 'Under each card, the lowest its day could deal.' : 'No cards yet this week.';
    case 'hand':
      return week.hand ? week.hand.title : 'No cards yet this week.';
    case 'river': {
      if (week.warmup) return 'A warm-up week has no river.';
      const { earned, need } = week.river;
      if (earned) return 'Earned. It turns at the Showdown.';
      return need === 1 ? '1 more kept day earns it.' : `${need} more kept days earn it.`;
    }
    case 'stamps':
      if (week.warmup) return 'A warm-up week has no Showdown.';
      if (!week.hand) return 'No cards yet this week.';
      // The legend only once a card wears a mark; until then the row is the hand itself.
      return Object.keys(stampsFor(week)).length ? '↓ Floor day  ·  ↑ Ceiling day' : week.hand.title;
    case 'call':
      if (week.warmup) return 'A warm-up week has no call.';
      if (!week.call) return o.callOpen ? 'No call yet this week.' : 'No call this week.';
      return `Your call: ${HANDS[week.call].name} ×${week.callMultiplier}${week.madeCall ? ', made' : ''}`;
    case 'saved':
      return o.rescue ? 'Yesterday’s card can still be saved.' : 'A saved day shows ↺.';
    case 'court': {
      if (!anyCards(week)) return 'No cards yet this week.';
      const counts = SUITS.map((s) => `${SUIT_INFO[s].glyph} ${week.slots.filter((slot) => slot.card?.suits.includes(s)).length}`);
      return `${counts.join('  ')} days this week`;
    }
    case 'notes':
      return anyCards(week) ? 'Tap a card to hear its note.' : 'No cards yet this week.';
    default:
      return null;
  }
}

/**
 * The caption as VoiceOver says it: the same words, except where the screen uses a mark. Each card says
 * its own ↓, ↑ or ↺, so the legend isn't read out, and the Court's suit glyphs become their names.
 */
export function miniCaptionSaid(week: Week, mode: MiniMode, o: { rescue?: boolean; callOpen?: boolean } = {}): string | null {
  const caption = miniCaption(week, mode, o);
  if (mode === 'stamps' && caption?.startsWith('↓')) return week.hand?.title ?? null;
  if (mode === 'saved' && !o.rescue) return null;
  if (mode === 'court' && anyCards(week)) return `Days this week: ${SUITS.map((s) => `${SUIT_INFO[s].name} ${week.slots.filter((slot) => slot.card?.suits.includes(s)).length}`).join(', ')}`;
  return caption;
}

/** A small "Rules" pill that opens the rules sheet, at `topic` when given. */
export function RulesButton({ topic, label = 'Rules', style }: { topic?: RulesTopic; label?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label === 'Rules' ? 'Rules' : `${label}, rules`}
        accessibilityHint="Opens how the game plays."
        hitSlop={6}
        onPress={() => {
          tick();
          setOpen(true);
        }}
        style={({ pressed }) => [
          { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1.5, borderColor: t.border, paddingLeft: 5, paddingRight: space.md, opacity: pressed ? 0.6 : 1 },
          style,
        ]}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.text, alignItems: 'center', justifyContent: 'center' }}>
          <Display size={14} color={t.bg} maxFontSizeMultiplier={fontScale.graphic}>
            ?
          </Display>
        </View>
        <Body size={typeScale.text.sm} weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
          {label}
        </Body>
      </Pressable>
      <RulesSheet visible={open} topic={topic} onClose={() => setOpen(false)} />
    </>
  );
}

/** The sheet itself, for screens that open it from their own control. */
export function RulesSheet({ visible, topic, onClose }: { visible: boolean; topic?: RulesTopic; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={onClose}>
      {visible ? <RulesBody topic={topic} onClose={onClose} /> : null}
    </Modal>
  );
}

const SECTION_SUIT: Record<RulesTopic, Suit> = {
  deal: 'spades',
  week: 'hearts',
  river: 'diamonds',
  showdown: 'clubs',
  call: 'clubs',
  comeback: 'hearts',
  court: 'spades',
  suits: 'diamonds',
  leave: 'hearts',
  fair: 'spades',
};

function RulesBody({ topic, onClose }: { topic?: RulesTopic; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const chips = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<RulesTopic, number>>>({});
  const chipX = useRef<Partial<Record<RulesTopic, number>>>({});
  // Until the reader scrolls or picks a chip, the page keeps itself on the topic it opened at, even as
  // the sections above it finish laying out and push it down.
  const settled = useRef(false);
  // Where the page is scrolling to after a chip (or the opening topic) asked for a section. Until it
  // gets there, that section keeps the highlight; after it, the highlight follows the page.
  const heading = useRef<number | null>(null);
  // Where the page last arrived after a jump. Moving off it by any means (a drag, a wheel, the keyboard
  // or VoiceOver, which never start a drag) hands the page to the reader.
  const landed = useRef<number | null>(null);
  // Where the page is now, from the last scroll event.
  const at = useRef(0);
  const [active, setActive] = useState<RulesTopic>(topic ?? RULES[0].key);
  // A page sheet starts below the status bar; anywhere else the sheet covers the whole screen.
  const top = Platform.OS === 'ios' ? space.lg : insets.top + space.md;

  const jump = (key: RulesTopic, animated: boolean) => {
    const y = openingScroll(key, offsets.current);
    if (y === null) return;
    // Already there: no scroll event will come to say so.
    if (Math.abs(at.current - y) <= 2) {
      heading.current = null;
      landed.current = at.current;
      return;
    }
    heading.current = y;
    scroll.current?.scrollTo({ y, animated });
  };

  // The highlighted chip stays in view in the chip row as the reader moves down the page.
  useEffect(() => {
    const x = chipX.current[active];
    if (x !== undefined) chips.current?.scrollTo({ x: Math.max(0, x - space.xl), animated: true });
  }, [active]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - 4;
    at.current = contentOffset.y;
    if (heading.current !== null) {
      // Still on the way to the section asked for. A section near the end can't reach the top, so the end counts as there.
      if (Math.abs(contentOffset.y - heading.current) > 2 && !atEnd) return;
      heading.current = null;
      landed.current = contentOffset.y;
      return;
    }
    if (!settled.current && landed.current !== null && Math.abs(contentOffset.y - landed.current) > 2) settled.current = true;
    const tops = RULES.flatMap((s) => {
      const y = offsets.current[s.key];
      return y === undefined ? [] : [{ key: s.key, y }];
    });
    const here = sectionAt(tops, contentOffset.y + space.md + 1, atEnd);
    if (here && here !== active) setActive(here);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: top, paddingHorizontal: space.xl, paddingBottom: space.xs, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Display size={typeScale.display.lg} header>
            How it plays
          </Display>
          <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={onClose} hitSlop={8} style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.6 : 1 })}>
            <Body weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
              Done
            </Body>
          </Pressable>
        </View>
        <ScrollView ref={chips} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 4 }} style={{ marginHorizontal: -space.xl, flexGrow: 0 }}>
          <View style={{ width: space.xl - space.sm }} />
          {RULES.map((s) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${s.chip}`}
              accessibilityState={{ selected: s.key === active }}
              // 36 points tall, so the reach above and below makes it a full 44.
              hitSlop={{ top: 4, bottom: 4 }}
              onLayout={(e) => {
                chipX.current[s.key] = e.nativeEvent.layout.x;
              }}
              onPress={() => {
                tick();
                settled.current = true;
                setActive(s.key);
                jump(s.key, true);
              }}
              // The section you're reading is the solid chip.
              style={({ pressed }) => ({ minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: s.key === active ? t.text : t.border, backgroundColor: s.key === active ? t.text : 'transparent', opacity: pressed ? 0.6 : 1 })}
            >
              <Body size={typeScale.text.sm} weight="heavy" color={s.key === active ? t.bg : t.text} maxFontSizeMultiplier={fontScale.chrome}>
                {s.chip}
              </Body>
            </Pressable>
          ))}
          <View style={{ width: space.xl - space.sm }} />
        </ScrollView>
      </View>
      <ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => {
          settled.current = true;
          heading.current = null;
        }}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.xxxl, gap: space.xxl }}>
        {RULES.map((section) => (
          <View
            key={section.key}
            onLayout={(e) => {
              offsets.current[section.key] = e.nativeEvent.layout.y;
              // Open at the section asked for once it has a place on the page, and stay on it while the
              // sections above settle, until the reader takes over.
              if (topic && !settled.current && offsets.current[topic] !== undefined) jump(topic, false);
            }}
            style={{ gap: space.lg }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ width: 36, height: 48, borderRadius: 8, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: 'rgba(23, 18, 31, 0.14)', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
                <SuitGlyph suit={SECTION_SUIT[section.key]} size={20} color={suitColors[SECTION_SUIT[section.key]].glyph} />
              </View>
              <Display size={typeScale.display.md} header style={{ flex: 1 }}>
                {section.title}
              </Display>
            </View>
            {MINI[section.key] ? <YourWeek mode={MINI[section.key]!} /> : null}
            {section.key === 'week' ? <Prices /> : null}
            <View style={{ gap: space.md }}>
              {section.rules.map((r) => (
                <View key={r.term} accessible accessibilityLabel={`${r.term}. ${r.line}`} style={{ gap: 2 }}>
                  <Body weight="heavy" size={typeScale.text.lg}>
                    {r.term}
                  </Body>
                  <Body size={typeScale.text.md} color={t.textSecondary}>
                    {r.line}
                  </Body>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Gap between the cards of a mini row, and the most points a mini card may take across. */
const MINI_GAP = 5;
const MINI_MAX_W = 40;
/** A ringing card rises over 90 ms and settles over 320 ms. */
const RING_RISE_MS = 90;
const RING_FALL_MS = 320;
/** The strum clock while nothing rings: far past every card's note, so nothing is lifted. */
const RING_IDLE = 1e9;

/** When each card of a played week rings: its note's place in the strum, low to high. Cards with no note never ring. */
export function ringTimes(slots: readonly MiniSlot[]): Readonly<Record<string, number>> {
  const steps = strum(slots.flatMap((s) => (s.tone ? [s.tone] : [])));
  const at: Record<string, number> = {};
  for (const s of slots) {
    const step = steps.find((x) => x.tone === s.tone);
    if (step) at[s.key] = step.delayMs;
  }
  return at;
}

/** How far a card is lifted, 0 to 1, `ms` after its note rang: a quick rise, then an easy settle. */
export function ringLift(ms: number): number {
  'worklet';
  if (ms < 0) return 0;
  if (ms < RING_RISE_MS) return ms / RING_RISE_MS;
  const left = 1 - (ms - RING_RISE_MS) / RING_FALL_MS;
  return left > 0 ? left * left : 0;
}

/**
 * This week's cards, small, in a panel on the felt, with the part the section is about picked out. In
 * Suits, each card rings its note when tapped, and Play your week strums the lot, each card lifting
 * on its note.
 */
function YourWeek({ mode }: { mode: MiniMode }) {
  const t = useTheme();
  const deck = useDeck();
  const { back } = useLook();
  const { width } = useWindowDimensions();
  // Milliseconds since Play your week was pressed. Each card lifts as the clock passes its note; Reduce
  // Motion finishes the clock at once, so nothing lifts.
  const clock = useSharedValue(RING_IDLE);
  if (!deck) return null;
  const { game } = deck;
  const week = game.current;
  const rescue = game.rescue && game.rescueCard ? { day: game.rescue, card: game.rescueCard } : null;
  const slots = miniSlots(week, mode, rescue);
  const caption = miniCaption(week, mode, { rescue: !!rescue, callOpen: game.callOpen });
  const said = miniCaptionSaid(week, mode, { rescue: !!rescue, callOpen: game.callOpen });
  const pad = space.md;
  const inner = Math.min(width, 520) - space.xl * 2 - pad * 2;
  const cardW = Math.floor(Math.min(MINI_MAX_W, (inner - MINI_GAP * (Math.max(slots.length, 5) - 1)) / Math.max(slots.length, 5)));
  const cardH = Math.round((cardW * CARD_SIZES.xs.h) / CARD_SIZES.xs.w);
  const playable = mode === 'notes' && slots.some((s) => s.tone);
  const rings = playable ? ringTimes(slots) : {};

  const playWeek = () => {
    tick();
    const steps = strum(slots.flatMap((s) => (s.tone ? [s.tone] : [])));
    playTones(steps);
    const end = (steps.at(-1)?.delayMs ?? 0) + RING_RISE_MS + RING_FALL_MS;
    clock.set(withSequence(withTiming(0, { duration: 0 }), withTiming(end, { duration: end, easing: Easing.linear, reduceMotion: ReduceMotion.System })));
  };

  return (
    <View style={{ borderRadius: radius.lg, backgroundColor: t.surface, padding: pad, gap: space.md, ...edgeBorder(t) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', minHeight: playable ? 32 : undefined }}>
        <Label color={t.text}>Your week</Label>
        {caption && !playable ? (
          <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary} style={{ flexShrink: 1 }}>
            {caption}
          </Body>
        ) : null}
        {playable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play your week"
            accessibilityHint="Rings each card’s note, low to high."
            onPress={playWeek}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => ({ marginLeft: 'auto', minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: t.text, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}
          >
            <Text allowFontScaling={false} style={{ color: t.bg, fontFamily: fonts.bodyHeavy, fontSize: 11 }}>
              ▶
            </Text>
            <Body size={typeScale.text.sm} weight="heavy" color={t.bg} maxFontSizeMultiplier={fontScale.chrome}>
              Play your week
            </Body>
          </Pressable>
        ) : null}
      </View>
      <View
        accessible={mode !== 'notes'}
        accessibilityRole={mode !== 'notes' ? 'image' : undefined}
        accessibilityLabel={mode !== 'notes' ? miniLabel(slots, said) : undefined}
        style={{ flexDirection: 'row', gap: MINI_GAP, justifyContent: slots.length < 7 ? 'flex-start' : 'space-between' }}
      >
        {slots.map((slot) => (
          <MiniCard key={slot.key} slot={slot} w={cardW} h={cardH} back={back} clock={clock} ring={rings[slot.key]} alone={mode === 'notes'} />
        ))}
      </View>
      {/* With a button in the header, the hint sits under the cards it's about. */}
      {caption && playable ? (
        <Body size={typeScale.text.sm} weight="bold" color={t.textSecondary}>
          {caption}
        </Body>
      ) : null}
    </View>
  );
}

/** What one place in a mini row holds, for VoiceOver: "Seven of Clubs", "face down", "no card". */
export function slotWhat(s: MiniSlot): string {
  if (s.face) return faceLabel(s.face);
  if (s.back) return 'face down';
  if (s.open) return 'not dealt yet';
  if (!s.center?.startsWith('+')) return 'no card';
  const need = s.center.slice(1);
  return need === '1' ? '1 more kept day to go' : `${need} more kept days to go`;
}

/** One place read out: "Monday, King of Hearts, in your hand, Ceiling day". */
export function slotSaid(s: MiniSlot): string {
  return `${s.day}, ${slotWhat(s)}${s.held ? ', in your hand' : ''}${s.said ? `, ${s.said}` : ''}`;
}

/** The row read as one sentence: "Your week. Pair of Kings. Monday, King of Hearts, in your hand. …". */
export function miniLabel(slots: readonly MiniSlot[], caption: string | null): string {
  return `Your week${caption ? `. ${caption}` : ''}. ${slots.map(slotSaid).join('. ')}.`;
}

/**
 * One small card of a mini row. A card that rings lifts on its note when the week is played (as `clock`
 * passes `ring`) or when it's tapped. `alone` gives a card that can't be tapped its own label, for rows
 * VoiceOver reads card by card.
 */
function MiniCard({
  slot,
  w,
  h,
  back,
  clock,
  ring,
  alone,
}: {
  slot: MiniSlot;
  w: number;
  h: number;
  back: Parameters<typeof CardBack>[0]['back'];
  clock: SharedValue<number>;
  ring: number | undefined;
  alone: boolean;
}) {
  const t = useTheme();
  const tapped = useSharedValue(0);
  // A small rise and a bigger swell, so a ringing card stays clear of its day letter.
  const lifted = useAnimatedStyle(() => {
    const v = Math.max(tapped.get(), ring === undefined ? 0 : ringLift(clock.get() - ring));
    return { transform: [{ translateY: -4 * v }, { scale: 1 + 0.07 * v }] };
  });

  const r = Math.round((w * CARD_SIZES.xs.radius) / CARD_SIZES.xs.w);
  let card;
  if (slot.face) card = <PlayingCard face={slot.face} size="xs" width={w} highlight={slot.held ? 'held' : undefined} dim={!slot.focus} dashed={slot.dashed} style={slot.dashed ? { opacity: 0.7 } : undefined} />;
  else if (slot.back) card = <CardBack back={back} size="xs" width={w} style={{ opacity: slot.focus ? 1 : 0.45 }} />;
  else
    card = (
      <View
        style={{
          width: w,
          height: h,
          borderRadius: r,
          borderWidth: slot.open ? 2 : 1.5,
          borderStyle: slot.open ? 'solid' : 'dashed',
          borderColor: slot.open ? t.text : t.dashed,
          backgroundColor: slot.open ? withAlpha(t.text, 0.06) : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {slot.open || slot.center ? (
          <Text allowFontScaling={false} style={{ fontFamily: fonts.display, fontSize: slot.open ? Math.round(w * 0.5) : Math.round(w * 0.32), color: slot.open ? t.text : t.textSecondary }}>
            {slot.open ? '?' : slot.center}
          </Text>
        ) : null}
      </View>
    );

  const body = (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.5, color: t.textSecondary }}>
        {slot.letter}
      </Text>
      <Animated.View style={lifted}>{card}</Animated.View>
      {slot.underSuits?.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 1, minWidth: w, height: 14, alignItems: 'center' }}>
          {slot.underSuits.map((s) => (
            <SuitGlyph key={s} suit={s} size={slot.underSuits!.length > 2 ? 10 : 12} color={t.scheme === 'dark' ? suitColors[s].bright : suitColors[s].glyph} />
          ))}
        </View>
      ) : slot.under ? (
        <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bodyHeavy, fontSize: slot.under.length > 2 ? 10 : 12, color: slot.focus ? t.text : t.textSecondary, minWidth: w, textAlign: 'center' }}>
          {slot.under}
        </Text>
      ) : null}
    </View>
  );
  if (!slot.tone) {
    return alone ? (
      <View accessible accessibilityLabel={slotSaid(slot)}>
        {body}
      </View>
    ) : (
      body
    );
  }
  const tone = slot.tone;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${slot.day}, ${slotWhat(slot)}. Its note: ${slot.under ?? ''}.`}
      accessibilityHint="Plays its note."
      onPress={() => {
        tick();
        playSound(tone);
        tapped.set(withSequence(withTiming(1, { duration: RING_RISE_MS, reduceMotion: ReduceMotion.System }), withSpring(0, { damping: 9, stiffness: 180, reduceMotion: ReduceMotion.System })));
      }}
    >
      {body}
    </Pressable>
  );
}

/**
 * What each hand pays, strongest at the top, with a made-up example of each. The hand you hold wears a
 * gold bar, the hand you called an outline (checked once made), and a secret hand stays face down, as
 * on the Hands tab, until one of your weeks has held it.
 */
function Prices() {
  const t = useTheme();
  const deck = useDeck();
  const { back } = useLook();
  const rows = ladder(deck?.game ?? null);
  const warmup = !!deck?.game.current.warmup;
  return (
    <View style={{ backgroundColor: t.bgRaised, borderRadius: radius.lg, paddingVertical: space.sm, paddingHorizontal: space.md, ...edgeBorder(t) }}>
      <Label style={{ paddingVertical: space.sm, paddingHorizontal: ROW_IN }}>What each hand pays</Label>
      {rows.map((h, i) => {
        const marked = h.mine || h.called;
        const prevMarked = i > 0 && (rows[i - 1].mine || rows[i - 1].called);
        const label = [h.hidden ? `A secret hand, ${h.chips} chips. A Joker helps.` : `${h.name}, ${h.chips} chips`, h.mine ? (warmup ? 'your hand so far' : 'your hand this week') : null, h.called ? `your call, times ${h.multiplier}${h.made ? ', made' : ''}` : null]
          .filter(Boolean)
          .join('. ');
        return (
          <View
            key={h.kind}
            accessible
            accessibilityLabel={label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              paddingVertical: space.sm,
              // Every row takes the same border and inset, so the cards line up down the ladder.
              paddingLeft: ROW_IN - 2,
              paddingRight: space.xs,
              marginVertical: marked ? 3 : 0,
              borderRadius: marked ? radius.md : 0,
              borderWidth: 2,
              borderColor: h.called ? t.text : 'transparent',
              // The gold bar runs to the row's edge: its first 2 points are the border.
              borderLeftColor: h.called ? t.text : h.mine ? chip.bg : 'transparent',
              backgroundColor: h.mine ? withAlpha(chip.bg, t.scheme === 'dark' ? 0.16 : 0.22) : 'transparent',
              overflow: h.mine ? 'hidden' : 'visible',
            }}
          >
            {i && !marked && !prevMarked ? <View aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: -2, height: 1, backgroundColor: t.border }} /> : null}
            {h.mine ? <View aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: h.called ? 6 : 4, backgroundColor: chip.bg }} /> : null}
            <View aria-hidden>
              {h.hidden ? (
                <View style={{ flexDirection: 'row' }}>
                  {[0, 1, 2, 3, 4].map((k) => (
                    <CardBack key={k} back={back} size="xs" style={{ marginLeft: k ? -12 : 0, transform: [{ rotate: `${(k - 2) * 3}deg` }] }} />
                  ))}
                </View>
              ) : (
                <HandRow faces={EXAMPLES[h.kind]} size="xs" overlap={0.3} />
              )}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Body weight="heavy">{h.hidden ? 'Secret hand' : h.name}</Body>
              {h.hidden ? (
                <Body size={typeScale.text.sm} color={t.textSecondary}>
                  A Joker helps.
                </Body>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <ChipIcon size={15} />
                <Display size={typeScale.display.sm} maxFontSizeMultiplier={fontScale.chrome}>
                  {formatChips(h.chips)}
                </Display>
              </View>
              {marked ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {h.mine ? <Tag text={warmup ? 'Your hand so far' : 'Your hand'} solid /> : null}
                  {h.called ? <Tag text={`Your call ×${h.multiplier}${h.made ? ' ✓' : ''}`} /> : null}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** How far in from a ladder row's edge its cards start: room for the gold bar of the hand you hold. */
const ROW_IN = space.md + 2;

/** A small tag on a ladder row: gold for the hand you hold, an outline for your call. */
function Tag({ text, solid = false }: { text: string; solid?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: solid ? chip.bg : 'transparent', borderWidth: solid ? 0 : 1.5, borderColor: t.text }}>
      <Text allowFontScaling={false} style={{ fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: solid ? chip.ink : t.text }}>
        {text}
      </Text>
    </View>
  );
}
