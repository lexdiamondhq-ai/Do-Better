/**
 * The rules of the Today screen, kept apart from the screen so they can be tested: which card is in
 * front, which ways it can go, how much room the card has, what the Comeback card says, what colour the
 * table takes, and which single moment gets the screen when a check-in causes several.
 *
 * Nothing here is stored. Deferring a card, focusing one or skipping a Ceiling lasts for the session.
 */

import { contrast, mix } from '@/theme/color';

import { addDays, type Day } from './day';
import type { Tip, TipTone } from './game';
import { dayStatus, type CheckIns, type Level } from './kept';
import { handPhrase, type Hand } from './poker';

// Time of day -------------------------------------------------------------------------------------------

/** When in the day a card plays. `any` cards are always in play. */
export type PartOfDay = 'morning' | 'midday' | 'evening' | 'any';
export type DayPart = Exclude<PartOfDay, 'any'>;

const PARTS: readonly DayPart[] = ['morning', 'midday', 'evening'];

/** The part of the day an hour (0 to 23) falls in: morning 4:00 to 10:59, midday 11:00 to 16:59, then evening until 4:00. */
export function partOfDayAt(hour: number): DayPart {
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  return 'evening';
}

/** Where a card's moment sits from now: in play now, still to come today, or already past. */
export function timing(part: PartOfDay, now: DayPart): 'now' | 'upcoming' | 'earlier' {
  if (part === 'any' || part === now) return 'now';
  return PARTS.indexOf(part) > PARTS.indexOf(now) ? 'upcoming' : 'earlier';
}

/** A tag for a card whose moment is still to come today ("Plays tonight"), or null. */
export function laterTag(part: PartOfDay, now: DayPart): string | null {
  if (timing(part, now) !== 'upcoming') return null;
  return part === 'evening' ? 'Plays tonight' : 'Plays later today';
}

// The queue ---------------------------------------------------------------------------------------------

/** One card in the deck as the queue sees it. */
export type TodayCard = {
  id: string;
  /** Today's check-in, if any. */
  level: Level | null;
  /** The day after a miss: the card shows its Comeback side. */
  comeback: boolean;
  part: PartOfDay;
};

/**
 * What a place in the queue shows. `welcome` is the Welcome back header, which checks nothing in.
 * `reach` is a Floor-kept card offered again in the "Any Ceiling still in reach?" pass.
 */
export type QueueKind = 'welcome' | 'comeback' | 'card' | 'reach';

export type QueueItem = { id: string; kind: QueueKind };

export const WELCOME_ID = 'welcome';

export type QueueInput = {
  /** Every card in the deck, in deck order. */
  cards: readonly TodayCard[];
  /** Cards sent to the back with a sideways swipe, in the order they were sent. */
  deferred: readonly string[];
  /** A card brought to the front from its pill. */
  focused?: string | null;
  now: DayPart;
  /** Show the Welcome back header in front of the deck. */
  welcome?: boolean;
  /** The Ceiling pass after everything is kept, with the cards already passed over today. */
  reach?: { skipped: readonly string[] } | null;
};

const GROUP = { now: 0, upcoming: 1, earlier: 2 } as const;

/**
 * The cards still to play today, front first.
 *
 * A focused card comes first. Then cards nobody pushed back: Comeback cards, then the cards whose moment
 * is now, then those still to come today, then those whose moment has passed, each in deck order. Cards
 * pushed back come last in the order they were pushed, and a Comeback card keeps its Comeback side.
 * The Welcome back header, when asked for, goes in front of everything.
 */
export function buildQueue({ cards, deferred, focused = null, now, welcome = false, reach = null }: QueueInput): QueueItem[] {
  const order = new Map(cards.map((c, i) => [c.id, i]));
  const pushed = (id: string) => deferred.indexOf(id);
  if (reach) {
    const items = cards.filter((c) => c.level === 'floor' && !reach.skipped.includes(c.id)).map<QueueItem>((c) => ({ id: c.id, kind: 'reach' }));
    return focusFirst(items, focused);
  }
  const pending = cards.filter((c) => c.level === null);
  const rank = (c: TodayCard): number[] => {
    const back = pushed(c.id);
    if (back >= 0) return [1, back, 0, 0];
    return [0, c.comeback ? 0 : 1, GROUP[timing(c.part, now)], order.get(c.id) ?? 0];
  };
  const sorted = [...pending].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
  const items = focusFirst(
    sorted.map<QueueItem>((c) => ({ id: c.id, kind: c.comeback ? 'comeback' : 'card' })),
    focused,
  );
  return welcome && items.length ? [{ id: WELCOME_ID, kind: 'welcome' }, ...items] : items;
}

function focusFirst(items: QueueItem[], focused: string | null): QueueItem[] {
  const i = focused ? items.findIndex((x) => x.id === focused) : -1;
  return i <= 0 ? items : [items[i], ...items.slice(0, i), ...items.slice(i + 1)];
}

export type Allow = { up: boolean; down: boolean; left: boolean; right: boolean };

/**
 * The ways the front card can go. Up keeps the Ceiling and down the Floor, on a Comeback card too. Sideways
 * sends it to the back, so it is only offered when another card waits behind it: deferring the only card
 * would leave it exactly where it is. In the Ceiling pass, sideways means "not today" and down is gone,
 * because the Floor is already kept. Any swipe on the Welcome back header just opens the deck.
 */
export function allowFor(queue: readonly QueueItem[]): Allow {
  const front = queue[0];
  if (!front) return { up: false, down: false, left: false, right: false };
  if (front.kind === 'welcome') return { up: true, down: true, left: true, right: true };
  if (front.kind === 'reach') return { up: true, down: false, left: true, right: true };
  const others = queue.length > 1;
  return { up: true, down: true, left: others, right: others };
}

/**
 * The front card's key. It changes with every deal, so a card that comes back to the front (or stays
 * there) is always a fresh card at rest, never one left where its last swipe threw it.
 */
export function cardKey(item: QueueItem, deals: number): string {
  return `${item.kind}:${item.id}:${deals}`;
}

// Room on screen ----------------------------------------------------------------------------------------

/** How Today lays out: the full card, a folded compact card, or a scrolling list with buttons. */
export type Density = 'regular' | 'compact' | 'list';

/** A card body shorter than this folds its Floor and Ceiling into one row of buttons. */
export const COMPACT_BELOW = 360;
/** The Comeback card says more, so it folds sooner: to its first move, Done it and the Floor. */
export const COMEBACK_BELOW = 470;
/** Below this the folded Comeback drops its evidence line too, keeping only who you are and the way in. */
export const COMEBACK_TIGHT_BELOW = 340;
/** At this text size or larger, cards become a list with buttons. */
export const LIST_FONT_SCALE = 1.35;
/** Only screens at least this tall give the tip its own band; on the rest it joins the hand line, leaving the room to the card. */
export const TALL_SCREEN = 900;

export function densityFor({ cardHeight, windowHeight, fontScale, screenReader }: { cardHeight: number; windowHeight: number; fontScale: number; screenReader: boolean }): {
  mode: Density;
  mergeTip: boolean;
  /** Show the Comeback card folded. */
  foldComeback: boolean;
  /** Fold it further, to who you are and the way in. */
  tightComeback: boolean;
} {
  const mergeTip = windowHeight < TALL_SCREEN;
  const foldComeback = cardHeight < COMEBACK_BELOW;
  const tightComeback = cardHeight < COMEBACK_TIGHT_BELOW;
  if (screenReader || fontScale >= LIST_FONT_SCALE) return { mode: 'list', mergeTip, foldComeback, tightComeback };
  return { mode: cardHeight < COMPACT_BELOW ? 'compact' : 'regular', mergeTip, foldComeback, tightComeback };
}

// The Comeback card's words -----------------------------------------------------------------------------

/**
 * "You're a reader." from the identity a player wrote, turned to speak to them: "in charge of my
 * attention" becomes "You're in charge of your attention." Null when there is none.
 */
export function identityLine(identity: string | null | undefined): string | null {
  let text = (identity ?? '').trim().replace(/[.!\s]+$/, '');
  text = text.replace(/^(i am|i'm|i’m|im)\s+/i, '');
  if (!text) return null;
  text = text
    .replace(/\bmyself\b/gi, 'yourself')
    .replace(/\bmine\b/gi, 'yours')
    .replace(/\bmy\b/gi, 'your')
    .replace(/\bme\b/gi, 'you')
    .replace(/\bI\b/g, 'you');
  return `You’re ${text}.`;
}

/** One missed day, or more than one. Never a number. */
export type ComebackGap = 'yesterday' | 'few';

/** 'few' when the day before yesterday was missed too (and the card was already running then). */
export function comebackGap(startedOn: Day, today: Day, checkIns: CheckIns): ComebackGap {
  return dayStatus(addDays(today, -2), startedOn, today, checkIns) === 'missed' ? 'few' : 'yesterday';
}

/** "1,860". The same on every phone. */
export function grouped(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * What the Comeback card says. It leads with who the player is becoming and the kept days that prove
 * it, never with the miss: no count of days missed, ever.
 */
export function comebackCopy({ name, identity, kept, gap }: { name: string; identity: string | null; kept: number; gap: ComebackGap }): {
  eyebrow: string;
  headline: string;
  evidence: string;
} {
  const who = identityLine(identity);
  const off = gap === 'few' ? 'A few days off don’t' : 'One day off doesn’t';
  let evidence: string;
  if (kept >= 3) evidence = `${grouped(kept)} kept days ${who ? 'say so' : 'so far'}. ${off} undo them.`;
  else if (kept >= 1) evidence = `You’ve started. ${off} undo that.`;
  else evidence = 'Start small today. Small still counts.';
  return { eyebrow: gap === 'few' ? 'A few days got away' : 'Yesterday got away', headline: who ?? `${name.trim()}.`, evidence };
}

// The chrome's words -------------------------------------------------------------------------------------

/** The header's count: "186 kept days". Before the first one, "Day one". */
export function keptLine(kept: number): string {
  if (kept <= 0) return 'Day one';
  return kept === 1 ? '1 kept day' : `${grouped(kept)} kept days`;
}

/**
 * The tips worth a place on Today: a Joker, a face card within reach, yesterday's card still to save,
 * and the call. The rest (the next band, a draw, the Showdown) live on the hand and in the rules,
 * so the screen above the card stays quiet.
 */
const TODAY_TONES: ReadonlySet<TipTone> = new Set(['joker', 'face', 'rescue', 'call']);

export function todayTips(tips: readonly Tip[]): Tip[] {
  return tips.filter((tip) => TODAY_TONES.has(tip.tone));
}

/** What the screen says once every card is kept: a title and a line about the week's hand. */
export function allKeptCopy({ count, hand, warmup, chips }: { count: number; hand: Pick<Hand, 'kind' | 'title'> | null; warmup: boolean; chips: number }): {
  title: string;
  hand: string;
} {
  const title = count === 1 ? 'Kept.' : `All ${count} kept.`;
  if (!hand) return { title, hand: 'Today’s card is in your hand.' };
  if (warmup) return { title, hand: `Your hand: ${handPhrase(hand)}. A warm-up week, so it plays for fun.` };
  return { title, hand: `Your hand: ${handPhrase(hand)}, worth ${grouped(chips)} chips if the week ended now.` };
}

// The table's colour ------------------------------------------------------------------------------------

/**
 * The table under the front card takes that card's colour: its soft tint on a light table, and on a dark
 * table the card's colour sunk into the table. Within one table every felt calls for the same text colour,
 * so the chrome stays readable while the table crossfades from one card's colour to the next.
 */
export function feltFor(card: { bg: string; soft: string }, table: { scheme: 'light' | 'dark'; bg: string }): string {
  return table.scheme === 'light' ? card.soft : mix(table.bg, card.bg, 0.32);
}

/** How clearly a card stands out on the felt its colour made. */
export function cardOnFelt(card: { bg: string; soft: string }, table: { scheme: 'light' | 'dark'; bg: string }): number {
  return contrast(card.bg, feltFor(card, table));
}

// Moments -----------------------------------------------------------------------------------------------

/** Anything with an id and a kind, such as a game event waiting to be shown. */
export type EventLike = { id: number; kind: string };

/**
 * What gets the screen for the events waiting: one moment, never a stack. A face card beats the first card,
 * which beats a milestone; anything else is a receipt for the latest of them. Everything waiting is folded
 * into the moment (`ids`), so dismissing it clears the queue. `also` lists what was folded in.
 */
export type Moment<E extends EventLike> = { kind: 'face' | 'first' | 'milestone' | 'receipt'; main: E; also: E[]; ids: number[] };

const RECEIPTS = new Set(['deal', 'backfill', 'rung']);

export function momentOf<E extends EventLike>(events: readonly E[]): Moment<E> | null {
  if (!events.length) return null;
  const ids = events.map((e) => e.id);
  for (const kind of ['face', 'first', 'milestone'] as const) {
    const main = events.find((e) => e.kind === kind);
    if (main) return { kind, main, also: events.filter((e) => e !== main), ids };
  }
  const receipts = events.filter((e) => RECEIPTS.has(e.kind));
  const main = receipts.at(-1) ?? events.at(-1)!;
  return { kind: 'receipt', main, also: events.filter((e) => e !== main), ids };
}

type HandLike = Pick<Hand, 'kind' | 'title' | 'score'>;

/** What a receipt is about: today's card after a check-in, yesterday logged late, or a rung in the Court. */
export type Receipt =
  | { kind: 'deal'; level: Level; joker: boolean; wentUp: boolean; first: boolean; dropped: boolean; hand: HandLike | null; handWas: HandLike | null; saved: boolean }
  | { kind: 'backfill'; level: Level; hand: HandLike | null }
  | { kind: 'rung'; suit: string; part: string; days: number };

/**
 * The words on the receipt that drops in after a check-in. When a higher card breaks a pair, it says so
 * plainly instead of cheering: the card went up but the hand went down.
 */
export function receiptCopy(r: Receipt): { eyebrow: string; title: string; line: string } {
  if (r.kind === 'rung') return { eyebrow: `The Court · ${r.suit}`, title: `${grouped(r.days)} days of ${r.part}`, line: 'Still climbing toward the Ace.' };
  const level = r.level === 'ceiling' ? 'Ceiling reached' : 'Floor kept';
  if (r.kind === 'backfill') return { eyebrow: `Logged late · ${level}`, title: 'Yesterday saved', line: r.hand ? `Your hand: ${handPhrase(r.hand)}.` : 'Yesterday has its card.' };
  const title = r.joker ? 'A Joker!' : r.dropped ? 'Today’s card changed' : r.wentUp && !r.first ? 'Today’s card went up' : 'Today’s card';
  let line = '';
  if (r.dropped && r.hand && r.handWas) line = `A higher card broke your ${r.handWas.title}. Your hand is now ${handPhrase(r.hand)}.`;
  else if (r.hand && r.handWas && r.hand.score > r.handWas.score) line = r.hand.title === r.handWas.title ? `Your ${r.hand.title} just got stronger.` : `Your hand is now ${handPhrase(r.hand)}.`;
  else if (r.hand) line = `Your hand: ${handPhrase(r.hand)}.`;
  if (r.joker) line = `It plays as any card. ${line}`.trim();
  if (r.saved) line = `${line} Yesterday’s card was saved too.`.trim();
  return { eyebrow: level, title, line };
}

/** Something that interrupts Today: a moment from a check-in, the first-swipe coach mark or the reminder question. */
export type Interruption = 'moment' | 'coach' | 'reminder' | null;

/**
 * The one interruption allowed now. A moment from a check-in always wins. The coach mark only shows to a
 * player with nothing kept yet. The reminder question waits for a later visit to Today than the one with
 * the first kept day, and never comes on a day with a face card or a Comeback card.
 */
export function interruptionFor(s: {
  moment: boolean;
  coachDue: boolean;
  reminderDue: boolean;
  /** This visit to Today began with at least one day already kept. */
  visitAfterKeeping: boolean;
  faceToday: boolean;
  comebackToday: boolean;
}): Interruption {
  if (s.moment) return 'moment';
  if (s.coachDue) return 'coach';
  if (s.reminderDue && s.visitAfterKeeping && !s.faceToday && !s.comebackToday) return 'reminder';
  return null;
}
