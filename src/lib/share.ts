import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { PixelRatio, Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { rankName, rankPlural, SUIT_INFO, type Rank, type Suit } from '@/engine/cards';
import type { FaceInfo } from '@/engine/court';
import type { Week, WeekReview } from '@/engine/game';
import { HANDS, type Hand } from '@/engine/poker';
import { faintestAlpha, mix, withAlpha } from '@/theme/color';
import { suitColors, type Theme } from '@/theme/tokens';

import { weekOf } from './format';

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
  | { kind: 'face'; suit: Suit; face: FaceInfo; identities: string[]; days: number };

/** One habit's week, for a shared hand that shows habit names: "Read 6/7". */
export type HabitLine = { name: string; kept: number; days: number };

/** The size of a shared picture: a phone story, 9:16. */
export const SHARE_SIZE = { w: 1080, h: 1920 } as const;
/** The size the share card is laid out at, in points. It is captured at SHARE_SIZE pixels. */
export const SHARE_LAYOUT = { w: 360, h: 640 } as const;

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

/** How the week went, in one line: "6 days dealt · 8 Ceilings · Craft led the week". */
export function weekLine(review: Pick<WeekReview, 'dealt' | 'ceilings' | 'lead'>): string {
  const parts = [`${review.dealt} ${review.dealt === 1 ? 'day' : 'days'} dealt`];
  if (review.ceilings > 0) parts.push(`${review.ceilings} ${review.ceilings === 1 ? 'Ceiling' : 'Ceilings'}`);
  if (review.lead) parts.push(`${SUIT_INFO[review.lead].part} led the week`);
  return parts.join(' · ');
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
  if (week.callMultiplier === 0) return { kind: 'made', title: 'Called it.', detail: `${called} A sure thing, so nothing extra.`, chips: 0 };
  // A no-break space keeps "paid ×2" together when the line wraps.
  const title = ['', 'Called it. The safe call, paid\u00A0×1.', 'Called it. A stretch, paid\u00A0×2.', 'Called it. A long shot, paid\u00A0×3.'][week.callMultiplier];
  return { kind: 'made', title, detail: called, chips: week.bonus };
}

/** A habit's week: "Read 6/7". */
export function habitLine(h: HabitLine): string {
  return `${h.name} ${h.kept}/${h.days}`;
}

/**
 * The words that go with a shared hand or face card, and all that is shared from a browser. Habit names
 * appear only when the player asked for them and `habits` is given; the call line only for a made call;
 * the Suited line only for a Suited week.
 */
export function shareCaption(target: ShareTarget, habits?: readonly HabitLine[]): string {
  const lines: string[] = [];
  if (target.kind === 'face') {
    const { name, part } = SUIT_INFO[target.suit];
    lines.push(`${target.face.name} of ${name}: ${target.face.title}.`);
    const who = target.identities[0];
    lines.push(who ? `${target.days} ${part} days as ${who}.` : `${target.days} ${part} days.`);
  } else {
    const { week } = target;
    const total = week.chips + week.suitedBonus + week.bonus;
    lines.push(week.hand ? `${weekOf(week.start)}: ${week.hand.title}. +${total} chips.` : `${weekOf(week.start)}: no cards this week.`);
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
 * Shares a hand or a face card. On a phone, with the share card's `view` on screen, it shares the card
 * as a 1080 × 1920 picture; anywhere else (a browser, or a phone that can't make the picture) it shares
 * the caption as text, and copies it when the browser can't share.
 */
export async function share(target: ShareTarget, opts: { view?: RefObject<View | null>; habits?: readonly HabitLine[] } = {}): Promise<ShareOutcome> {
  const message = shareCaption(target, opts.habits);
  const view = opts.view;
  if (Platform.OS !== 'web' && view?.current) {
    try {
      if (await Sharing.isAvailableAsync()) {
        // iOS sizes the picture in points and draws it at the screen's scale; Android sizes it in pixels.
        const scale = Platform.OS === 'ios' ? PixelRatio.get() : 1;
        const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', width: SHARE_SIZE.w / scale, height: SHARE_SIZE.h / scale });
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
