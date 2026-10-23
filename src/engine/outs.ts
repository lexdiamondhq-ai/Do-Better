/**
 * Outs: the ranks that would lift the week's hand. Only ranks a fully kept day can deal (5 and up) are
 * named, never which day deals them, never a percentage, and the live river is never worked out early.
 *
 * An out is tested the honest way: the week's cards plus one card of that rank with no suit, through the
 * same `bestHand` the Showdown uses. A suitless card never completes a straight flush, so an out never
 * promises a suit a day might not bring. The river's outs come from the band the river deals from
 * (`riverBand`), never from the river card itself, which stays unknown until midnight on Sunday.
 *
 * A warm-up week has no call and no Showdown, so it has nothing to say here.
 */

import { RANKS, rankName, type Rank } from './cards';
import { weekday, type Day } from './day';
import { KEPT_LO, riverBand, TOP_LO, type DayCard, type Slot } from './deal';
import type { Week } from './game';
import { atLeast, bestHand, handIndex, HANDS, makesCall, type HandKind } from './poker';

/** Ranks that would make a hand of `makes`, best kind first. */
export type OutGroup = { makes: HandKind; ranks: Rank[] };

/** A day in no week at all, so a test card never matches one of the week's own days. */
const NO_DAY: Day = '9999-12-31';

/** A card of `rank` with no suit: what any kept day of that rank adds to the hand, whatever its suits. */
function probe(rank: Rank): DayCard {
  return { kind: 'card', day: NO_DAY, rank, suits: [], ceilingSuits: [], tier: 'kept-all', lo: KEPT_LO, rescued: false };
}

/** Every rank from `min` (never below 5) to the Ace, highest first. */
function ranksFrom(min: Rank): Rank[] {
  const lo = Math.max(KEPT_LO, min);
  return RANKS.filter((r) => r >= lo).reverse();
}

/** The cards the week holds so far. */
function dealtOf(week: Pick<Week, 'slots'>): DayCard[] {
  return week.slots.flatMap((s) => (s.card ? [s.card] : []));
}

/** Today's slot in a week being played, or null for a finished week. */
function todayOf(week: Pick<Week, 'slots' | 'live'>): Slot | null {
  return week.live ? (week.slots.find((s) => s.isToday) ?? null) : null;
}

/** Every rank from `minRank` (default 5) up that would lift the hand these cards make, grouped by the hand it makes. */
export function outs(cards: readonly DayCard[], opts?: { minRank?: Rank }): OutGroup[] {
  const now = bestHand(cards);
  if (!now) return [];
  const by = new Map<HandKind, Rank[]>();
  for (const rank of ranksFrom(opts?.minRank ?? KEPT_LO)) {
    const kind = bestHand([...cards, probe(rank)])?.kind;
    if (!kind || handIndex(kind) <= handIndex(now.kind)) continue;
    by.set(kind, [...(by.get(kind) ?? []), rank]);
  }
  return [...by.entries()].sort(([a], [b]) => handIndex(b) - handIndex(a)).map(([makes, ranks]) => ({ makes, ranks }));
}

/** Draws still to come this week: days left (today counts while it has no card) and whether the river is still to come. */
export function drawsLeft(week: Week, today: Day): { days: number; river: boolean } {
  if (!week.live) return { days: 0, river: false };
  const days = week.slots.filter((s) => s.day > today || (s.day === today && !s.card && s.state === 'open')).length;
  const river = !week.warmup && (week.river.earned || week.river.need <= days);
  return { days, river };
}

/**
 * The lowest card the river can be whatever the rest of the week brings: its band with every day still to
 * play, today's included, at its very best. The band can only sit at or under this, so every rank from
 * here to the Ace is one the river can really deal.
 */
function riverFloor(week: Week, today: Day): Rank {
  const best = week.slots.map<Slot>((s) => {
    const open = s.day > today || (s.day === today && (!!s.card || s.state === 'open'));
    if (!open) return s;
    return { ...s, state: 'dealt', card: { kind: 'card', day: s.day, rank: 14, suits: [], ceilingSuits: [], tier: 'perfect', lo: TOP_LO, rescued: false } };
  });
  return riverBand(best) ?? KEPT_LO;
}

/**
 * The lowest band the river could still end in: every day still to play kept at the very least (a band of
 * 2), which can only pull the middle kept day down. The river can deal any rank from here to the Ace.
 */
function riverLowest(week: Week, today: Day): Rank {
  const worst = week.slots.map<Slot>((s) => {
    const open = s.day > today || (s.day === today && !s.card && s.state === 'open');
    if (!open) return s;
    return { ...s, state: 'dealt', card: { kind: 'card', day: s.day, rank: 2, suits: [], ceilingSuits: [], tier: 'showed-up', lo: 2, rescued: false } };
  });
  return riverBand(worst) ?? 2;
}

/** How far the week is from its call: 0 cards when made, 1 or 2 when that many outs would make it, else null. */
export type CallGap = { made: boolean; cards: 0 | 1 | 2 | null; ranks: Rank[]; days: number };

/**
 * How far the week is from its call. `ranks` lists the single ranks that make it, when one card is enough.
 * Only the draws still to come count: the days left, and the river, whose outs start at its band.
 */
export function callGap(week: Week, call: HandKind, today: Day): CallGap {
  const left = drawsLeft(week, today);
  const made = makesCall(week.hand, call);
  if (made) return { made, cards: 0, ranks: [], days: left.days };
  const none: CallGap = { made: false, cards: null, ranks: [], days: left.days };
  // A Flush call, from before Flush left the ladder, is made by Ceilings in one suit, never by a rank.
  if (week.warmup || !week.live || call === 'flush') return none;
  const cards = dealtOf(week);
  const makes = (extra: readonly Rank[]) => makesCall(bestHand([...cards, ...extra.map(probe)]), call);
  const dayRanks = ranksFrom(KEPT_LO);
  const riverRanks = left.river ? ranksFrom(riverFloor(week, today)) : [];
  // The one draw left may be a day or the river; with a day left, the river can't reach lower than a day can.
  const one = left.days > 0 ? dayRanks : riverRanks;
  const ranks = one.filter((r) => makes([r]));
  if (ranks.length) return { made: false, cards: 1, ranks, days: left.days };
  const pairs: [Rank[], Rank[]] | null = left.days >= 2 ? [dayRanks, dayRanks] : left.days === 1 && left.river ? [dayRanks, riverRanks] : null;
  if (pairs && pairs[0].some((a) => pairs[1].some((b) => makes([a, b])))) return { made: false, cards: 2, ranks: [], days: left.days };
  return none;
}

/**
 * The river's outs, once the river is earned or one kept day away (`ifToday`: keeping something today earns
 * it). Ranks run from the river's band to the Ace, never below 5. Never reads the live river's card.
 */
export function riverOuts(week: Week): { band: Rank; groups: OutGroup[]; stands: boolean; ifToday: boolean } | null {
  if (week.warmup) return null;
  const slot = todayOf(week);
  if (!slot) return null;
  const ifToday = !week.river.earned && week.river.need === 1 && !slot.card && slot.state === 'open';
  if (!week.river.earned && !ifToday) return null;
  const band = riverFloor(week, slot.day);
  const cards = dealtOf(week);
  const groups = outs(cards, { minRank: band });
  // "The hand stands" is a promise: no card the river could still deal lifts it, from the lowest band the
  // rest of the week could leave it in, ranks under 5 included. Outs that sit only under the named band
  // are never named and never promised away.
  const now = bestHand(cards);
  const low = riverLowest(week, slot.day);
  const stands = !!now && !RANKS.some((r) => r >= low && handIndex(bestHand([...cards, probe(r)])!.kind) > handIndex(now.kind));
  return { band, groups, stands, ifToday };
}

/** Whether the week has enough cards for its outs to be worth saying: three or more, a day still to play, and not a warm-up. */
export function outsWorthSaying(week: Week): boolean {
  const slot = todayOf(week);
  if (!slot || week.warmup) return false;
  return dealtOf(week).length >= 3 && drawsLeft(week, slot.day).days > 0;
}

// ---------------------------------------------------------------------------------------------------------
// Words. Never a weekday, never a percentage, never more than two kinds or three ranks in one line.

/** A kind as a name: "Full house". The secret hand keeps its secret until it has been made once. */
export function outName(kind: HandKind, o?: { secretKnown?: boolean }): string {
  return kind === 'five-of-a-kind' && !o?.secretKnown ? 'Secret hand' : HANDS[kind].name;
}

/** A kind as it reads in a sentence: "a Straight", "Two pair", "the secret hand". */
export function phrase(kind: HandKind, o?: { secretKnown?: boolean }): string {
  if (kind === 'five-of-a-kind' && !o?.secretKnown) return 'the secret hand';
  const name = HANDS[kind].name;
  return kind === 'pair' || kind === 'straight' || kind === 'full-house' || kind === 'straight-flush' || kind === 'royal-flush' ? `a ${name}` : name;
}

/** "your Full house", or "the secret hand", which no one can own before they make it. */
export function yours(kind: HandKind, o?: { secretKnown?: boolean }): string {
  return kind === 'five-of-a-kind' && !o?.secretKnown ? 'the secret hand' : `your ${HANDS[kind].name}`;
}

/** "a Seven", "an Eight", "an Ace". */
function aRank(rank: Rank): string {
  const name = rankName(rank);
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

/** "Nine", "Jack or Eight", "Nine, Six or Five". */
function either(words: readonly string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

/** Ranks named in a line: at most three, or a count. */
const MAX_NAMED = 3;
/** Kinds named in a line. */
const MAX_KINDS = 2;

type LineOpts = { call?: HandKind | null; secretKnown?: boolean };

/** One group as a sentence. `lead` uses "Any …", the second sentence "A … or a …" so two in a row don't echo. */
function sentence(g: OutGroup, o: LineOpts, lead: boolean): string {
  const target = o.call === g.makes ? yours(g.makes, o) : phrase(g.makes, o);
  if (g.ranks.length > MAX_NAMED) return `${g.ranks.length} ranks make ${yours(g.makes, o)}.`;
  const who = lead ? `Any ${either(g.ranks.map(rankName))}` : either(g.ranks.map(aRank)).replace(/^a/, 'A');
  return `${who} makes ${target}.`;
}

/**
 * The outs in words: "Drawing to a Straight: any Nine makes it." With two kinds, "Any Seven makes Four of a
 * kind. A Jack or a Six makes a Full house." With `call`, the called hand is "your" hand. Null when there
 * is nothing worth saying.
 */
export function outsLine(groups: readonly OutGroup[], o?: LineOpts): string | null {
  const opts = o ?? {};
  const named = groups.slice(0, MAX_KINDS);
  if (!named.length) return null;
  if (named.length === 1) {
    const [g] = named;
    if (g.ranks.length > MAX_NAMED || opts.call === g.makes) return sentence(g, opts, true);
    return `Drawing to ${phrase(g.makes, opts)}: any ${either(g.ranks.map(rankName))} makes it.`;
  }
  return `${sentence(named[0], opts, true)} ${sentence(named[1], opts, false)}`;
}

/** The ranks of the groups worth showing as cards, best kind first, at most `max` in all. */
export function outCards(groups: readonly OutGroup[], max = 6): OutGroup[] {
  const out: OutGroup[] = [];
  let room = max;
  for (const g of groups.slice(0, MAX_KINDS)) {
    if (room <= 0) break;
    const ranks = g.ranks.slice(0, room);
    out.push({ makes: g.makes, ranks });
    room -= ranks.length;
  }
  return out;
}

/** The outs toward a call that one card would make, grouped by what each makes: the called kind first, then the best other. */
export function callGroups(week: Week, call: HandKind, gap: CallGap): OutGroup[] {
  if (gap.cards !== 1) return [];
  const cards = dealtOf(week);
  const by = new Map<HandKind, Rank[]>();
  for (const rank of gap.ranks) {
    const kind = bestHand([...cards, probe(rank)])?.kind;
    if (kind && atLeast(kind, call)) by.set(kind, [...(by.get(kind) ?? []), rank]);
  }
  const all = [...by.entries()].sort(([a], [b]) => handIndex(b) - handIndex(a)).map(([makes, ranks]) => ({ makes, ranks }));
  const mine = all.find((g) => g.makes === call);
  const other = all.find((g) => g.makes !== call);
  return [mine, other].filter((g): g is OutGroup => !!g).sort((a, b) => handIndex(b.makes) - handIndex(a.makes));
}

/** What's left to draw, in words: "3 days left.", "Today’s card and the river are your last two draws." */
export function drawsLine(week: Week, today: Day): string | null {
  const { days, river } = drawsLeft(week, today);
  const lastIsToday = days === 1 && weekday(today) === 6;
  if (days >= 2) return `${days} days left.`;
  if (lastIsToday) return river ? 'Today’s card and the river are your last two draws.' : 'Today’s card is your last draw.';
  if (days === 1) return river ? 'One day left, then the river.' : 'One day left.';
  return river ? 'The river is your last draw.' : null;
}

/**
 * The call panel's line while the call isn't made yet: "Not made yet. Any Jack or Eight makes your Full
 * house. 3 days left." Falls back to how the hand is made when no card is one or two away. Null once made.
 */
export function callLine(week: Week, call: HandKind, today: Day, o?: { secretKnown?: boolean }): string | null {
  const gap = callGap(week, call, today);
  if (gap.made) return null;
  const tail = drawsLine(week, today);
  const end = tail ? ` ${tail}` : '';
  if (gap.cards === 1) return `Not made yet. ${outsLine(callGroups(week, call, gap), { call, ...o })}${end}`;
  if (gap.cards === 2) return `Not made yet. Two more cards could make ${yours(call, o)}.${end}`;
  return `Not made yet. ${HANDS[call].how}`;
}

/** The river's outs in words, or null when the river is out of reach: "On the river: any Seven makes Four of a kind." */
export function riverOutsLine(week: Week, o?: { secretKnown?: boolean }): string | null {
  const r = riverOuts(week);
  if (!r) return null;
  const suffix = r.ifToday ? ' If you keep something today.' : '';
  // A river not earned yet that couldn't lift the hand anyway isn't worth a line.
  if (r.stands) return r.ifToday ? null : 'Nothing on the river can lift it. The hand stands.';
  // Its only outs sit under the band it can be named from: nothing true to name, and nothing to promise away.
  if (!r.groups.length) return null;
  // The river is one card, so the line names what it makes: "On the river: any Nine makes a Straight."
  const [g, h] = r.groups;
  const first = g.ranks.length > MAX_NAMED ? `${g.ranks.length} ranks make ${phrase(g.makes, o)}` : `any ${either(g.ranks.map(rankName))} makes ${phrase(g.makes, o)}`;
  const second = h ? ` ${sentence(h, o ?? {}, false)}` : '';
  return `On the river: ${first}.${second}${suffix}`;
}
