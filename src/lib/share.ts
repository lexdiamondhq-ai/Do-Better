import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { PixelRatio, Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { rankName, rankPlural, SUIT_INFO, type Rank, type Suit } from '@/engine/cards';
import type { FaceInfo } from '@/engine/court';
import { addDays, weekday, type Day } from '@/engine/day';
import { CALL_HISTORY, type HallEntry, type Week, type WeekReview } from '@/engine/game';
import type { Level } from '@/engine/kept';
import { atLeast, HANDS, type Hand, type HandKind } from '@/engine/poker';
import { madeThisLine, type CaptionFacts } from '@/engine/showdown';
import { faintestAlpha, mix, withAlpha } from '@/theme/color';
import { suitColors, type Theme } from '@/theme/tokens';

import { longDate, weekOf } from './format';

/**
 * Sunday's words and sharing. The lines the Showdown, the Hands tab and the share card say about a week
 * (the hand, the call, the Suited line, how the week went), the felt they sit on, and sharing a hand or a
 * face card: as a picture on a phone, as a line of text in a browser.
 *
 * Habit names never leave the phone unless the player asks: a shared hand says what the week made, not
 * what you were working on.
 */

export type ShareTarget =
  | { kind: 'hand'; week: Week; names?: boolean }
  | { kind: 'face'; suit: Suit; face: FaceInfo; identities: string[]; days: number }
  /** One card, to print or to set as a lock screen. Its name leaves the phone only from an explicit Save. */
  | { kind: 'card'; habitId: string; name: string; format: 'print' | 'lock' };

/** One habit's week, for a shared hand that shows habit names: "Read 6/7". */
export type HabitLine = { name: string; kept: number; days: number };

/** The size of a shared picture: a phone story, 9:16. */
export const SHARE_SIZE = { w: 1080, h: 1920 } as const;
/** The size the share card is laid out at, in points. It is captured at SHARE_SIZE pixels. */
export const SHARE_LAYOUT = { w: 360, h: 640 } as const;
/** The card's coloured frame, the felt's border inside it, and the felt's padding, in points. */
export const SHARE_INSET = { frame: 14, border: 2, pad: 22 } as const;
/** How wide a line of words can be on the share card. */
export const SHARE_TEXT_WIDTH = SHARE_LAYOUT.w - 2 * (SHARE_INSET.frame + SHARE_INSET.border + SHARE_INSET.pad);

export const FOOTER = 'Do Better · Habits, dealt as cards. No streaks.';

// The words ------------------------------------------------------------------------------------------

/**
 * A hand as a stamp and a line under it: "Two pair" / "Aces and Eights", "Straight" / "Six to Ten",
 * "Royal flush" / "Ten to Ace in Diamonds". The stamp is the kind of hand; the line names its cards.
 */
export function handLines(hand: Pick<Hand, 'kind' | 'ranks' | 'suit'>): { name: string; detail: string | null } {
  const [a, b] = hand.ranks;
  const name = HANDS[hand.kind].name;
  const run = () => (a === 5 ? 'Ace to Five' : `${rankName((a - 4) as Rank)} to ${rankName(a)}`);
  const inSuit = hand.suit ? ` in ${SUIT_INFO[hand.suit].name}` : '';
  switch (hand.kind) {
    case 'high-card':
      return { name, detail: `${rankName(a)} high` };
    case 'pair':
    case 'three-of-a-kind':
    case 'four-of-a-kind':
    case 'five-of-a-kind':
      return { name, detail: rankPlural(a) };
    case 'two-pair':
      return { name, detail: `${rankPlural(a)} and ${rankPlural(b)}` };
    case 'full-house':
      return { name, detail: `${rankPlural(a)} over ${rankPlural(b)}` };
    case 'straight':
      return { name, detail: run() };
    case 'straight-flush':
    case 'royal-flush':
      return { name, detail: `${run()}${inSuit}` };
    default:
      return { name, detail: null };
  }
}

/** Suited pays nothing; it is a line about who showed up: "Suited in Clubs: 5 Mind Ceiling days". */
export function suitedLine(hand: Pick<Hand, 'suited'> | null): string | null {
  if (!hand?.suited) return null;
  const { name, part } = SUIT_INFO[hand.suited.suit];
  return `Suited in ${name}: ${hand.suited.days} ${part} Ceiling days`;
}

/**
 * How the week went, in one line: "6 days dealt · 8 Ceilings · Craft led the week". A Suited week leaves
 * out who led: its Suited line already names the part of you that showed up, so one week never names two.
 */
export function weekLine(review: Pick<WeekReview, 'dealt' | 'ceilings' | 'lead'>, hand: Pick<Hand, 'suited'> | null = null): string {
  const parts = [`${review.dealt} ${review.dealt === 1 ? 'day' : 'days'} dealt`];
  if (review.ceilings > 0) parts.push(`${review.ceilings} ${review.ceilings === 1 ? 'Ceiling' : 'Ceilings'}`);
  if (review.lead && !hand?.suited) parts.push(`${SUIT_INFO[review.lead].part} led the week`);
  return parts.join(' · ');
}

/** The suit a finished week is coloured by: its Suited suit when it has one, otherwise the suit that led. */
export function weekSuit(review: Pick<WeekReview, 'lead'> | null, hand: Pick<Hand, 'suited'> | null): Suit | null {
  return hand?.suited?.suit ?? review?.lead ?? null;
}

export type CallLine = { kind: 'made' | 'missed' | 'none'; title: string; detail: string | null; chips: number };

/**
 * The call, said honestly. A made call pays its multiplier; a missed one costs nothing; no call says how
 * to get one next week. Null for a week with no hand or the warm-up week, which have no call.
 */
export function callLine(week: Pick<Week, 'hand' | 'call' | 'madeCall' | 'bonus' | 'callMultiplier' | 'warmup'>): CallLine | null {
  if (!week.hand || week.warmup) return null;
  if (!week.call) return { kind: 'none', title: 'No call this week.', detail: 'Call next week’s hand and it can pay again.', chips: 0 };
  const called = `You called ${HANDS[week.call].name}.`;
  if (!week.madeCall) return { kind: 'missed', title: 'Not this time.', detail: `${called} A missed call costs nothing.`, chips: 0 };
  // A made call is one sentence: what was called, and what it paid on top of the hand.
  const name = HANDS[week.call].name;
  if (week.callMultiplier === 0) return { kind: 'made', title: `Called it: the ${name} call was a sure thing, so nothing extra.`, detail: null, chips: 0 };
  const paid = `the ${name} call paid ${chipText(week.bonus)} more`;
  const title = ['', `Called it: ${paid}.`, `Called a Stretch: ${paid}, twice its chips.`, `Called a Long shot: ${paid}, three times its chips.`][week.callMultiplier];
  return { kind: 'made', title, detail: null, chips: week.bonus };
}

/**
 * The live week's river card, said on the Hands tab: earned, how many more days you keep something would
 * earn it, or, once too few days are left, that it waits for next week. Never a count the week can't reach.
 */
export function riverLine(week: Pick<Week, 'river' | 'slots'>, today: Day): { title: string; detail: string } {
  if (week.river.earned) return { title: 'River card earned', detail: 'It stays face down until the Showdown, then joins your seven days.' };
  const { need } = week.river;
  // Today still counts while nothing has been kept today.
  const keptToday = week.slots.some((s) => s.day === today && s.card);
  const left = 6 - weekday(today) + (keptToday ? 0 : 1);
  if (need > left) return { title: 'The river card', detail: 'Five days you keep something earn an eighth card. Too few days are left this week, so it’s back in play on Monday.' };
  return { title: 'The river card', detail: `${need} more ${need === 1 ? 'day' : 'days'} you keep something ${need === 1 ? 'earns' : 'earn'} an eighth card, turned ${showdownWhen(today)}.` };
}

/** When this week's Showdown plays, from today: "tonight" on Sunday, "on Sunday" any other day. */
export function showdownWhen(today: Day): string {
  return weekday(today) === 6 ? 'tonight' : 'on Sunday';
}

/** The Sunday of the first Showdown, for a deck in its warm-up week: the end of the first full week, which starts the Monday after. */
export function firstShowdownDay(warmupStart: Day): Day {
  return addDays(warmupStart, 13);
}

/** That Sunday as the phone writes it: "Sunday, October 25". */
export function firstShowdownDate(warmupStart: Day): string {
  return longDate(firstShowdownDay(warmupStart));
}

/**
 * When an open call closes, said the same way on every screen. A call stays open until the end of the
 * first day this week you keep something: once this week has a card (today's) that is midnight, and
 * before that, the end of whichever day you first keep something.
 */
export function callWindow(week: Pick<Week, 'slots'>): { until: string; line: string } {
  return week.slots.some((s) => s.card)
    ? { until: 'midnight', line: 'Calls close at midnight.' }
    : { until: 'your first kept day ends', line: 'Open until your first kept day ends.' };
}

/**
 * How often your last weeks made a hand, for the call card: "Made in 3 of your last 8 weeks". A call is
 * made by that hand or better, so when only a higher hand came up the line says so, and agrees with the
 * Hall of Hands, which shows the hand itself as not spotted.
 */
export function callHistoryLine(kind: HandKind, weeks: readonly Pick<Week, 'hand' | 'live' | 'warmup' | 'contains'>[]): string {
  const recent = weeks.filter((w) => !w.live && !w.warmup).slice(-CALL_HISTORY);
  const of = recent.length;
  if (of === 0) return 'No finished weeks yet, so it’s priced for a deck your size.';
  const made = recent.filter((w) => w.hand && atLeast(w.hand.kind, kind)).length;
  const spotted = recent.filter((w) => w.contains.has(kind)).length;
  if (made === 0) return of === 1 ? 'Not made last week.' : `Not made in your last ${of} weeks.`;
  // Only a higher hand made it: it counts, and the line says how, so it still agrees with the Hall.
  if (spotted === 0) return of === 1 ? 'Made it last week, with a higher hand.' : `Made it in ${made} of your last ${of} weeks, with a higher hand.`;
  if (spotted >= made) return of === 1 ? 'Made last week.' : `Made in ${made} of your last ${of} weeks.`;
  return `Made this or better in ${made} of your last ${of} weeks.`;
}

/**
 * A Hall of Hands row in words: how many weeks the hand turned up in, and in how many it was the hand
 * that paid. "Spotted in 3 weeks · paid as your hand in 1".
 */
export function hallLine(entry: Pick<HallEntry, 'count' | 'ended'>): string {
  const { count, ended } = entry;
  if (count === 0) return 'Not spotted yet';
  const spotted = `Spotted in ${count} ${count === 1 ? 'week' : 'weeks'}`;
  if (!ended) return spotted;
  if (ended >= count) return count === 1 ? `${spotted} · it paid as your hand` : `${spotted} · paid as your hand each time`;
  return `${spotted} · paid as your hand in ${ended}`;
}

/** Chips the way every screen writes them: "1,080". */
export function chipText(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Who the days were for, from the "I’m …" answers, in a voice: "I’m strong", "You’re a reader and
 * someone who shows up". Reads the same whether or not the answer was typed with its "I’m". Null with
 * no answers.
 */
export function identityPhrase(identities: readonly string[], voice: 'me' | 'you' = 'me', max = 2): string | null {
  const clean = identities
    .map((s) => s.trim().replace(/^(i\s*[’']\s*m|im|i am)\s+/i, '').replace(/[\s.!,;]+$/, ''))
    .filter(Boolean)
    .slice(0, max);
  if (!clean.length) return null;
  const list = clean.length === 1 ? clean[0] : `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
  return `${voice === 'me' ? 'I’m' : 'You’re'} ${list}`;
}

// The stamp ------------------------------------------------------------------------------------------

/**
 * Fredoka Bold's advance widths, in thousandths of the font size, measured from the font itself: enough
 * to size a stamp so it never runs past the edge of a picture that can't scroll or wrap.
 */
const STAMP_WIDTHS: Record<string, number> = {
  a: 557, b: 554, c: 503, d: 554, e: 535, f: 419, g: 546, h: 563, i: 251, j: 234, k: 512, l: 311, m: 791,
  n: 566, o: 558, p: 541, q: 543, r: 432, s: 457, t: 429, u: 568, v: 577, w: 737, x: 538, y: 576, z: 545,
  A: 711, B: 609, C: 631, D: 655, E: 603, F: 613, G: 719, H: 650, I: 239, J: 531, K: 597, L: 569, M: 809,
  N: 670, O: 721, P: 595, Q: 782, R: 604, S: 542, T: 640, U: 675, V: 728, W: 947, X: 689, Y: 638, Z: 598,
  ' ': 235, '’': 220, "'": 193, '-': 403, '.': 220, ':': 221, '!': 248, '?': 476, '(': 357, ')': 357, '·': 220, '…': 803,
  // Figures and the signs of a sum, so a chip count is measured as itself and not as a row of Ws.
  '0': 565, '1': 379, '2': 566, '3': 565, '4': 551, '5': 493, '6': 521, '7': 522, '8': 541, '9': 521, '+': 490, '=': 445, ',': 223,
};
/** Display type is set 1% tight: a hundredth of the size taken off after every letter. */
const TRACKING = 0.01;

/** How wide `text` sets in display type at `size` points. A character not in the table counts as wide as a W. */
export function stampWidth(text: string, size: number): number {
  let em = 0;
  let n = 0;
  for (const ch of text) {
    em += (STAMP_WIDTHS[ch] ?? 950) / 1000;
    n++;
  }
  return size * (em - TRACKING * n);
}

/** The biggest display size, up to `max`, at which `text` fits on one line `width` points wide, with a little room to spare. */
export function stampSize(text: string, width: number, max: number, min = Math.round(max * 0.55)): number {
  const per = stampWidth(text, 1);
  if (per <= 0) return max;
  return Math.max(min, Math.min(max, Math.floor((width * 0.96) / per)));
}

/**
 * Body type (Nunito ExtraBold) sets a touch wider than the display type the widths above were measured
 * from: never more than this much, measured from both fonts.
 */
const BODY_WIDE = 1.09;

/**
 * How the Showdown's call panel sets its line in `room` points: one line, at the biggest size from `max`
 * down to `min` that fits. A sentence too long for one line even at `min` breaks in two where it reads
 * naturally (at its comma, or else before "paid"), never leaving a word on its own, and both lines share
 * the biggest size that fits them.
 */
export function callPanelLines(text: string, room: number, o: { max: number; min: number } = { max: 14, min: 12 }): { lines: string[]; size: number } {
  const per = (line: string) => stampWidth(line, 1) * BODY_WIDE;
  const fit = (lines: string[]) => Math.min(o.max, Math.floor((room * 0.98) / Math.max(...lines.map(per))));
  const one = fit([text]);
  if (one >= o.min) return { lines: [text], size: one };
  const comma = text.lastIndexOf(', ');
  const paid = text.indexOf(' paid ');
  const at = comma > 0 ? comma + 1 : paid > 0 ? paid : -1;
  if (at < 0) return { lines: [text], size: o.min };
  const lines = [text.slice(0, at).trim(), text.slice(at).trim()];
  return { lines, size: Math.max(o.min, fit(lines)) };
}

/**
 * The size the Showdown's payout is set at so the sum stays on one line beside its counting total:
 * "Five of a kind 800 + Call 140 =" then the chip and "940", in a row `room` points wide. Up to `max`,
 * down to 13. The total takes its room first (a chip 1.25 times its size, a gap, its digits), and the sum
 * is set in a semi-bold a little wider than the bold the widths were measured from.
 */
export function payoutSize(said: string, total: number, room: number, o: { max: number; chips: number }): number {
  const totalW = o.chips * 1.6 + stampWidth(chipText(total), o.chips) * 1.03;
  return stampSize(said, Math.max(0, room - totalW) / 1.02, o.max, 13);
}

/** A habit's week: "Read 6/7". */
export function habitLine(h: HabitLine): string {
  return `${h.name} ${h.kept}/${h.days}`;
}

/**
 * What a held card's caption knows about each day: whose habits were kept (archived ones too, so old
 * weeks name every card), whether one reached its Ceiling, and whether one was logged late. Names come in
 * the order the habits are given.
 */
export function captionFacts(
  habits: readonly { id: string; name: string }[],
  days: readonly { habitId: string; day: Day; level: Level; loggedOn?: Day }[],
): CaptionFacts {
  const order = new Map(habits.map((h, i) => [h.id, i]));
  const byDay = new Map<Day, { ids: string[]; ceiling: boolean; late: boolean }>();
  for (const row of days) {
    if (!order.has(row.habitId)) continue;
    let entry = byDay.get(row.day);
    if (!entry) byDay.set(row.day, (entry = { ids: [], ceiling: false, late: false }));
    if (!entry.ids.includes(row.habitId)) entry.ids.push(row.habitId);
    entry.ceiling ||= row.level === 'ceiling';
    entry.late ||= !!row.loggedOn && row.loggedOn > row.day;
  }
  const names = new Map(habits.map((h) => [h.id, h.name]));
  return {
    names: (day) => [...(byDay.get(day)?.ids ?? [])].sort((a, b) => order.get(a)! - order.get(b)!).map((id) => names.get(id)!),
    ceiling: (day) => byDay.get(day)?.ceiling ?? false,
    late: (day) => byDay.get(day)?.late ?? false,
  };
}

/**
 * The words that go with a shared hand, face card or card, and all that is shared from a browser. Habit
 * names appear only when the player asked for them and `habits` is given (a card is its name, shared only
 * from an explicit Save); the call line only for a made call; the Suited line only for a Suited week.
 */
export function shareCaption(target: ShareTarget, habits?: readonly HabitLine[]): string {
  const lines: string[] = [];
  if (target.kind === 'card') {
    lines.push(target.name);
  } else if (target.kind === 'face') {
    const { name, part } = SUIT_INFO[target.suit];
    lines.push(`${target.face.name} of ${name}: ${target.face.title}.`);
    const who = identityPhrase(target.identities, 'me', 1);
    lines.push(who ? `${chipText(target.days)} ${part} days. ${who}.` : `${chipText(target.days)} ${part} days.`);
  } else {
    const { week } = target;
    const total = week.chips + week.suitedBonus + week.bonus;
    lines.push(week.hand ? `${weekOf(week.start)}: ${week.hand.title}. +${chipText(total)} chips.` : `${weekOf(week.start)}: no cards this week.`);
    const made = madeThisLine(week);
    if (made) lines.push(made);
    if (week.call && week.madeCall) lines.push(`Called ${HANDS[week.call].name} and made it.`);
    const suited = suitedLine(week.hand);
    if (suited) lines.push(`${suited}.`);
    if (target.names && habits?.length) lines.push(habits.map(habitLine).join(' · '));
  }
  lines.push(FOOTER);
  return lines.join('\n');
}

// The felt -------------------------------------------------------------------------------------------

/** The Showdown's stage and the share card: the table's felt, lit from the middle in the colour of the suit that led. */
export type Felt = { bg: string; glow: string; theme: Theme };

/**
 * The felt under the Showdown for a table. On the kitchen table it is the ink of a card back; on every
 * other table it is the table itself. Text on it reaches 4.5:1 on both the felt and its glow.
 */
export function feltFor(base: Theme, lead: Suit | null = null): Felt {
  const light = base.scheme === 'light' && base.bg !== base.raised;
  const bg = light ? base.raised : base.bg;
  const text = light ? base.onRaised : base.text;
  const glow = mix(bg, lead ? suitColors[lead].glyph : text, lead ? 0.34 : 0.1);
  // Quieter text is measured on the brighter of the two, so it reads anywhere on the felt.
  const brightest = mix(glow, text, 0.08);
  const raised = mix(bg, text, 0.1);
  return {
    bg,
    glow,
    theme: {
      ...base,
      scheme: 'dark',
      bg,
      bgRaised: mix(bg, text, 0.07),
      surface: mix(bg, text, 0.13),
      text,
      textSecondary: withAlpha(text, faintestAlpha(text, brightest, 4.5, 0.7)),
      textFaint: withAlpha(text, faintestAlpha(text, brightest, 3, 0.5)),
      border: withAlpha(text, 0.16),
      dashed: withAlpha(text, faintestAlpha(text, brightest, 3, 0.42)),
      accent: light ? text : base.accent,
      onAccent: bg,
      raised,
      onRaised: text,
      onRaisedSecondary: withAlpha(text, faintestAlpha(text, raised, 4.5, 0.6)),
      edge: withAlpha(text, 0.14),
      highlight: withAlpha(text, 0.12),
      cardBack: raised,
      onCardBack: text,
      felt: Math.max(base.felt, 0.06),
      vignette: Math.max(base.vignette, 0.35),
    },
  };
}

// Sharing --------------------------------------------------------------------------------------------

export type ShareOutcome = 'image' | 'text' | 'copied' | 'cancelled' | 'failed';

/**
 * Shares a hand, a face card or one card of the deck. On a phone, with the share card's `view` on screen,
 * it shares the card as a picture (1080 × 1920 unless `size` says otherwise); anywhere else (a browser, or a phone that can't make the picture) it shares
 * the caption as text, and copies it when the browser can't share.
 */
export async function share(target: ShareTarget, opts: { view?: RefObject<View | null>; habits?: readonly HabitLine[]; size?: { w: number; h: number } } = {}): Promise<ShareOutcome> {
  const message = shareCaption(target, opts.habits);
  const view = opts.view;
  // The picture's size in pixels: a phone story unless the target asks for its own (a printed card, a lock screen).
  const size = opts.size ?? SHARE_SIZE;
  if (Platform.OS !== 'web' && view?.current) {
    try {
      if (await Sharing.isAvailableAsync()) {
        // iOS sizes the picture in points and draws it at the screen's scale; Android sizes it in pixels.
        const scale = Platform.OS === 'ios' ? PixelRatio.get() : 1;
        const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', width: size.w / scale, height: size.h / scale });
        await Sharing.shareAsync(uri.startsWith('file://') ? uri : `file://${uri}`, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: target.kind === 'hand' ? 'Share this hand' : 'Share this card' });
        return 'image';
      }
    } catch {
      // No picture this time: the words still go.
    }
  }
  try {
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'cancelled' : 'text';
  } catch {
    return (await copy(message)) ? 'copied' : 'failed';
  }
}

async function copy(text: string): Promise<boolean> {
  try {
    const clipboard = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator?.clipboard;
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Shares a week's hand. */
export function shareHand(week: Week, opts?: { names?: boolean; view?: RefObject<View | null>; habits?: readonly HabitLine[] }): Promise<ShareOutcome> {
  return share({ kind: 'hand', week, names: opts?.names }, opts);
}

/** Shares a face card earned in the Court. */
export function shareFace(info: { suit: Suit; face: FaceInfo; identities: string[]; days: number }, opts?: { view?: RefObject<View | null> }): Promise<ShareOutcome> {
  return share({ kind: 'face', ...info }, opts);
}
