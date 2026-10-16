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
import { playsLine } from './playbook';
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

/**
 * The card's When it plays line. Beside a "Plays tonight" tag it carries on from the tag ("after getting
 * into bed") instead of saying "Plays" twice. Null when the card has no anchor.
 */
export function whenLine(anchor: string | null | undefined, whenWhere: string | null | undefined, tag: string | null): string | null {
  const text = anchor?.trim();
  if (!text) return null;
  const plays = playsLine(text);
  const line = tag ? plays.replace(/^Plays\s+/, '') : plays;
  const where = whenWhere?.trim();
  return where ? `${line} · ${where}` : line;
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
 * is now, then those still to come today (the soonest first, so midday comes before tonight), then those
 * whose moment has passed, each in deck order. Cards pushed back come last in the order they were pushed,
 * and a Comeback card keeps its Comeback side. The Welcome back header, when asked for, goes in front.
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
    if (back >= 0) return [1, back, 0, 0, 0];
    const when = timing(c.part, now);
    const soon = when === 'upcoming' && c.part !== 'any' ? PARTS.indexOf(c.part) : 0;
    return [0, c.comeback ? 0 : 1, GROUP[when], soon, order.get(c.id) ?? 0];
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
/** From this height the folded Comeback still has room for "Did it, forgot to log" under its buttons. */
export const COMEBACK_LOG_FROM = 400;
/** Below this the folded Comeback drops its why (or the line about saving yesterday) and keeps its evidence line. */
export const COMEBACK_LEAN_BELOW = 340;
/** Below this the folded Comeback drops its evidence line too, keeping only who you are and the way in. */
export const COMEBACK_TIGHT_BELOW = 305;
/** Below this the folded Comeback's first move gives up its label line, so who you are still fits whole above it. */
export const COMEBACK_TINY_BELOW = 250;
/** From this height the folded Comeback has spare room, and gives it to its words: "Yesterday got away", a bigger headline, more of the why. */
export const COMEBACK_ROOMY_FROM = 430;
/** At this text size or larger, cards become a list with buttons. */
export const LIST_FONT_SCALE = 1.35;
/** Only screens at least this tall give the tip its own band; on the rest it joins the hand line, leaving the room to the card. */
export const TALL_SCREEN = 900;

export function densityFor({ cardHeight, windowHeight, fontScale, screenReader }: { cardHeight: number; windowHeight: number; fontScale: number; screenReader: boolean }): {
  mode: Density;
  mergeTip: boolean;
  /** Show the Comeback card folded. */
  foldComeback: boolean;
  /** The Comeback card, folded or not, has room for "Did it, forgot to log". Otherwise yesterday is logged from the week strip. */
  logOnComeback: boolean;
  /** Folded, without the why: the evidence line still fits. */
  leanComeback: boolean;
  /** Fold it further, to who you are and the way in. */
  tightComeback: boolean;
  /** Shorter still: the first move loses its label line. */
  tinyComeback: boolean;
  /** Folded, but with room to spare for the words. */
  roomyComeback: boolean;
} {
  const mergeTip = windowHeight < TALL_SCREEN;
  const foldComeback = cardHeight < COMEBACK_BELOW;
  const logOnComeback = cardHeight >= COMEBACK_LOG_FROM;
  const leanComeback = cardHeight < COMEBACK_LEAN_BELOW;
  const tightComeback = cardHeight < COMEBACK_TIGHT_BELOW;
  const tinyComeback = cardHeight < COMEBACK_TINY_BELOW;
  const roomyComeback = cardHeight >= COMEBACK_ROOMY_FROM;
  const room = { mergeTip, foldComeback, logOnComeback, leanComeback, tightComeback, tinyComeback, roomyComeback };
  if (screenReader || fontScale >= LIST_FONT_SCALE) return { mode: 'list', ...room };
  return { mode: cardHeight < COMPACT_BELOW ? 'compact' : 'regular', ...room };
}

// The keyboard ---------------------------------------------------------------------------------------------

/** What a key does to the front card in a browser, or null. `first` is Done it on a Comeback card's first move. */
export type KeyMove = { dir: 'up' | 'down' | 'left' | 'right'; first: boolean } | null;

/**
 * Arrows swipe the front card the ways it allows. Enter or Space opens the Welcome back card and presses
 * Done it on a Comeback card, but only when no control has the focus, so they never steal a button's press.
 * A key held down repeats, and a repeat never plays a card: each card takes its own press.
 */
export function keyMove(
  key: { key: string; repeat: boolean; onPage: boolean },
  front: { kind: QueueKind; allow: Allow; firstMove: boolean },
): KeyMove {
  if (key.repeat) return null;
  const { allow } = front;
  if (key.key === 'ArrowDown') return allow.down ? { dir: 'down', first: false } : null;
  if (key.key === 'ArrowUp') return allow.up ? { dir: 'up', first: false } : null;
  if (key.key === 'ArrowLeft') return allow.left ? { dir: 'left', first: false } : null;
  if (key.key === 'ArrowRight') return allow.right ? { dir: 'right', first: false } : null;
  if ((key.key === 'Enter' || key.key === ' ') && key.onPage) {
    if (front.kind === 'welcome') return { dir: 'up', first: false };
    if (front.kind === 'comeback' && front.firstMove) return { dir: 'down', first: true };
  }
  return null;
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
 * The tips worth a place on Today: a Joker, a face card within reach, yesterday's card still to save, the
 * call, and what the week is playing for (the warm-up, a river card a day or two away, Sunday's Showdown).
 * The rest (the next band, a draw) live on the hand and in the rules, so the screen above the card stays quiet.
 *
 * In the warm-up week the line that explains it leads. On a player's very first look, while the swipe hint
 * is showing, only one line may join it, and only the warm-up explanation: the call waits for the next look
 * (its chip is still there), so the first screen asks one thing at a time.
 */
const TODAY_TONES: ReadonlySet<TipTone> = new Set(['joker', 'face', 'rescue', 'call', 'showdown']);

export function todayTips(tips: readonly Tip[], { warmup = false, firstLook = false }: { warmup?: boolean; firstLook?: boolean } = {}): Tip[] {
  const shown = tips.filter((tip) => TODAY_TONES.has(tip.tone));
  const week = shown.filter((tip) => tip.tone === 'showdown');
  const ordered = warmup ? [...week, ...shown.filter((tip) => tip.tone !== 'showdown')] : shown;
  if (firstLook) return warmup ? week.slice(0, 1) : [];
  return ordered;
}

/**
 * The hand line over the deck: what to call the hand, its name, and what it pays. On Sunday it names the
 * stake ("Showdown tonight"); in the warm-up week the hand plays for fun and pays nothing.
 */
export function handLineCopy({ warmup, hand, chips, sunday }: { warmup: boolean; hand: Pick<Hand, 'title'> | null; chips: number; sunday: boolean }): {
  label: string;
  title: string;
  pays: number | null;
  spoken: string;
} {
  const label = warmup ? 'Warm-up hand' : sunday && hand ? 'Showdown tonight' : 'Your hand';
  const title = hand?.title ?? 'No cards yet';
  const pays = !warmup && hand ? chips : null;
  const worth = pays === null ? '' : `. Pays ${grouped(pays)} chips ${sunday ? 'at midnight' : 'if the week ended now'}`;
  return { label, title, pays, spoken: `${label}: ${title}${worth}` };
}

/** The eyebrow on today's idea: "Today's idea", with the reason it was picked when there is one. */
export function ideaLabel(reason: string): string {
  const why = reason.trim().replace(/\.$/, '');
  const base = 'Today’s idea';
  return !why || why.replace(/'/g, '’').toLowerCase() === base.toLowerCase() ? base : `${base} · ${why}`;
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
 * which beats a milestone; anything else is a receipt for the latest check-in, with a Court rung riding
 * along on it. Everything waiting is folded into the moment (`ids`), so dismissing it clears the queue.
 * `also` lists what was folded in.
 */
export type Moment<E extends EventLike> = { kind: 'face' | 'first' | 'milestone' | 'receipt'; main: E; also: E[]; ids: number[] };

/** Receipts about a card come before a rung's own receipt: the rung then shows as a line on the card's. */
const CARD_RECEIPTS = new Set(['deal', 'backfill']);

export function momentOf<E extends EventLike>(events: readonly E[]): Moment<E> | null {
  if (!events.length) return null;
  const ids = events.map((e) => e.id);
  for (const kind of ['face', 'first', 'milestone'] as const) {
    const main = events.find((e) => e.kind === kind);
    if (main) return { kind, main, also: events.filter((e) => e !== main), ids };
  }
  const main = events.filter((e) => CARD_RECEIPTS.has(e.kind)).at(-1) ?? events.filter((e) => e.kind === 'rung').at(-1) ?? events.at(-1)!;
  return { kind: 'receipt', main, also: events.filter((e) => e !== main), ids };
}

/** A waiting event as far as staleness goes: the check-in it came from, or the rung it reached. */
export type EventFacts = { kind: string; habitId?: string; level?: Level; day?: Day; suit?: string; days?: number };

/**
 * Whether a waiting event no longer matches the deck, so it must not be shown (or must stop showing): its
 * check-in was undone or changed level since (from the Undo chip, a pill or the habit page), or the suit
 * dropped back below the rung it reached.
 */
export function eventStale(e: EventFacts, today: Day, live: { level: (habitId: string, day: Day) => Level | null; suitDays: (suit: string) => number }): boolean {
  if ((e.kind === 'deal' || e.kind === 'backfill') && e.habitId) return live.level(e.habitId, e.kind === 'deal' ? today : (e.day ?? today)) !== e.level;
  if (e.kind === 'rung' && e.suit) return live.suitDays(e.suit) < (e.days ?? 0);
  return false;
}

/** How a Joker is described everywhere a player reads about one. */
export const JOKER_LINE = 'It has no suit and plays as any rank.';

type HandLike = Pick<Hand, 'kind' | 'title' | 'score'>;

/** A Court rung reached by the same check-in, told on the card's receipt. */
export type RungNote = { part: string; days: number };

/**
 * A late log that moved the week's Joker onto yesterday. `face` names the face card whose day it was, when
 * that face card now falls on yesterday; `today` names today's card now, when today has one.
 */
export type JokerMove = { day: string; face: string | null; today: string | null };

/** What a receipt is about: today's card after a check-in, yesterday logged late, or a rung in the Court. */
export type Receipt =
  | {
      kind: 'deal';
      level: Level;
      /** Today's card by name, such as "Ten of Diamonds". */
      card: string;
      joker: boolean;
      wentUp: boolean;
      first: boolean;
      dropped: boolean;
      hand: HandLike | null;
      handWas: HandLike | null;
      saved: boolean;
      rung?: RungNote | null;
    }
  | {
      kind: 'backfill';
      level: Level;
      /** Yesterday's card by name, after the late log. */
      card: string;
      joker: boolean;
      /** Yesterday had no card before the late log. */
      blank: boolean;
      hand: HandLike | null;
      handWas: HandLike | null;
      moved?: JokerMove | null;
      rung?: RungNote | null;
    }
  | { kind: 'rung'; suit: string; part: string; days: number };

/**
 * The receipt's words. `lead` is the news that must never be cut (yesterday saved too, a Joker that moved),
 * shown first; `line` is the card and the hand; `notes` follow (the Joker's rule, a rung reached).
 */
export type ReceiptCopy = { eyebrow: string; title: string; lead: string | null; line: string; notes: string[] };

/** The hand, in words, after a change: a broken match said plainly, a better kicker named as just that. */
function handLine(hand: HandLike | null, handWas: HandLike | null, dropped: boolean): string {
  if (!hand) return '';
  if (dropped && handWas) return `A higher card broke your ${handWas.title}. Your hand is now ${handPhrase(hand)}.`;
  if (handWas && hand.score > handWas.score) return hand.title === handWas.title ? `Still ${handPhrase(hand)}, now with a higher side card.` : `Your hand is now ${handPhrase(hand)}.`;
  return `Your hand: ${handPhrase(hand)}.`;
}

/** "a Ten of Hearts", "an Eight of Clubs", "a Joker". */
export function aCard(name: string): string {
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

const rungNote = (r: RungNote | null | undefined) => (r ? [`And ${grouped(r.days)} days of ${r.part} in the Court.`] : []);

/**
 * The words on the receipt that drops in after a check-in. When a higher card breaks a pair, it says so
 * plainly instead of cheering: the card went up but the hand went down. A late log says "Yesterday counts"
 * when yesterday had no card, and "Yesterday logged" when it already had one: "saved" is kept for the
 * saved day of the rules, which a late log never makes.
 */
export function receiptCopy(r: Receipt): ReceiptCopy {
  if (r.kind === 'rung') return { eyebrow: `The Court · ${r.suit}`, title: `${grouped(r.days)} days of ${r.part}`, lead: null, line: 'Still climbing toward the Ace.', notes: [] };
  const eyebrow = r.level === 'ceiling' ? 'Ceiling reached' : 'Floor kept';
  const hand = handLine(r.hand, r.handWas, r.kind === 'deal' && r.dropped);
  const line = (r.joker ? hand : `${r.card}. ${hand}`).trim();
  const notes = [...(r.joker ? [JOKER_LINE] : []), ...rungNote(r.rung)];
  if (r.kind === 'backfill') {
    let lead: string | null = null;
    if (r.moved) {
      const today = r.moved.today ? ` Today is ${aCard(r.moved.today)}.` : '';
      lead = r.moved.face
        ? `The ${r.moved.face} now lands on ${r.moved.day}, so its Joker moved there.${today}`
        : r.moved.today
          ? `The week’s Joker moved to ${r.moved.day}, your first kept day.${today}`
          : `Your waiting Joker landed on ${r.moved.day}.`;
    }
    return { eyebrow, title: r.blank ? 'Yesterday counts' : 'Yesterday logged', lead, line, notes };
  }
  const title = r.joker ? 'A Joker!' : r.dropped ? 'Today’s card changed' : r.wentUp && !r.first ? 'Today’s card went up' : 'Today’s card';
  return { eyebrow, title, lead: r.saved ? 'Yesterday’s card was saved too.' : null, line, notes };
}

/** Something that interrupts Today: a moment from a check-in, the first-swipe coach mark or the reminder question. */
export type Interruption = 'moment' | 'coach' | 'reminder' | null;

/**
 * The one interruption allowed now. A moment from a check-in always wins. The coach mark only shows to a
 * player with nothing kept yet. The reminder question waits for a later visit to Today than the one with
 * the first kept day, and never comes on a day with a face card or a Comeback card. It also waits while
 * Today is out of sight or a finished week's Showdown is still to be shown, so it never opens over it.
 */
export function interruptionFor(s: {
  moment: boolean;
  coachDue: boolean;
  reminderDue: boolean;
  /** This visit to Today began with at least one day already kept. */
  visitAfterKeeping: boolean;
  faceToday: boolean;
  comebackToday: boolean;
  /** Today is the screen in front (no Showdown or other screen pushed over it). */
  inFront?: boolean;
  /** A finished week's Showdown is waiting to open. */
  showdownPending?: boolean;
}): Interruption {
  if (s.moment) return 'moment';
  if (s.coachDue) return 'coach';
  if (s.inFront === false || s.showdownPending) return null;
  if (s.reminderDue && s.visitAfterKeeping && !s.faceToday && !s.comebackToday) return 'reminder';
  return null;
}
