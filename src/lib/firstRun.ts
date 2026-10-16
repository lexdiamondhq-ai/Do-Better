import { SUIT_INFO, SUITS, type Suit } from '@/engine/cards';
import { RECIPES, type Recipe } from '@/engine/playbook';

/**
 * The rules behind the first run, kept apart from the screen so they can be tested: when the practice
 * swipe counts, which ready-made cards the deck step shows, and which of them stay picked when the
 * player goes back to change who they're becoming.
 */

/* ---------------------------------------------------------------- the practice swipe */

/**
 * How far, in stage points, the practice card has to travel up or down before letting go counts. About
 * a quarter of the card's height, the same share of the card as on Today.
 */
export const PRACTICE_DISTANCE = 44;
/** A flick this fast (points a second) counts from a shorter drag. */
export const PRACTICE_VELOCITY = 800;
/** A drag shorter than this was a touch, not an attempt. */
const TOUCH = 14;

export type PracticeWay = 'floor' | 'ceiling';

/**
 * The way the dragged card is armed, or null. Armed means letting go right now keeps the day, so this
 * is exactly when the FLOOR or CEILING stamp lands at full strength.
 */
export function armedWay(dx: number, dy: number): PracticeWay | null {
  'worklet';
  if (Math.abs(dy) <= Math.abs(dx) || Math.abs(dy) < PRACTICE_DISTANCE) return null;
  return dy > 0 ? 'floor' : 'ceiling';
}

/**
 * What letting go does. An armed card keeps the day; so does a quick flick the way it is going. A
 * sideways drag is the "later" swipe. A real attempt that fell short is `short`, so the screen can say
 * "a bit further" instead of springing back in silence.
 */
export function practiceRelease(dx: number, dy: number, vy: number): PracticeWay | 'sideways' | 'short' | 'none' {
  'worklet';
  const armed = armedWay(dx, dy);
  if (armed) return armed;
  const vertical = Math.abs(dy) > Math.abs(dx);
  if (vertical && Math.abs(dy) > 12 && Math.abs(vy) > PRACTICE_VELOCITY && Math.sign(vy) === Math.sign(dy)) return dy > 0 ? 'floor' : 'ceiling';
  if (!vertical && Math.abs(dx) > 36) return 'sideways';
  if (vertical && Math.abs(dy) > TOUCH) return 'short';
  return 'none';
}

/** How strongly a stamp shows while the card is dragged its way but not yet armed: a hint, never the real thing. */
export const STAMP_PREVIEW = 0.35;

/* ---------------------------------------------------------------- the deck step */

export type DeckGroup = { key: string; title: string | null; suit: Suit | null; recipes: Recipe[] };

const matchesOf = (identities: readonly string[]) => RECIPES.filter((r) => identities.includes(r.identity));

/** Every ready-made card not in `except`, a group to a suit, in suit order. */
function bySuit(except: ReadonlySet<string>): DeckGroup[] {
  return SUITS.map((suit) => ({ key: suit, title: SUIT_INFO[suit].part, suit, recipes: RECIPES.filter((r) => r.suit === suit && !except.has(r.key)) })).filter((g) => g.recipes.length > 0);
}

/**
 * The cards the deck step shows. With identities picked: the cards for them first, then (when asked
 * for, or when a card picked earlier lives there) every other card, by suit. With none picked: every
 * card, by suit, so "Show me every card" shows every card. `more` is how many cards the "Show every
 * card" button would add; 0 means they're all on screen.
 */
export function deckGroups(identities: readonly string[], picked: readonly string[], everything: boolean): { groups: DeckGroup[]; more: number } {
  const matches = matchesOf(identities);
  if (!matches.length) return { groups: bySuit(new Set()), more: 0 };
  const mine = new Set(matches.map((r) => r.key));
  const lead: DeckGroup = { key: 'yours', title: 'For who you’re becoming', suit: null, recipes: matches };
  const all = everything || picked.some((k) => !mine.has(k));
  if (!all) return { groups: [lead], more: RECIPES.length - matches.length };
  return { groups: [lead, ...bySuit(mine)], more: 0 };
}

/** The picked cards, in the order the deck shows them. Picks no longer on offer are left out. */
export function chosenRecipes(picked: readonly string[]): Recipe[] {
  return RECIPES.filter((r) => picked.includes(r.key));
}

/**
 * The deck step's picks. `auto` are the ones the app picked for the identities in `seededFor`; the rest
 * the player picked by hand.
 */
export type Picks = { picked: string[]; auto: string[]; seededFor: string | null };

export const NO_PICKS: Picks = { picked: [], auto: [], seededFor: null };

const identityKey = (identities: readonly string[]) => [...identities].sort().join('\n');

/**
 * Picks for the deck step, each time the player moves on from who they're becoming. The same identities
 * keep every pick exactly as it was. New identities replace the app's own picks with up to three cards
 * for them, and keep every card the player picked by hand.
 */
export function seedPicks(prev: Picks, identities: readonly string[]): Picks {
  const key = identityKey(identities);
  if (prev.seededFor === key) return prev;
  const seeds = matchesOf(identities)
    .slice(0, 3)
    .map((r) => r.key);
  const byHand = prev.picked.filter((k) => !prev.auto.includes(k));
  const auto = seeds.filter((k) => !byHand.includes(k));
  return { picked: [...byHand, ...auto], auto, seededFor: key };
}

/** A pick toggled by hand on the deck step. A card the app picked becomes the player's own choice either way. */
export function togglePick(prev: Picks, key: string): Picks {
  const picked = prev.picked.includes(key) ? prev.picked.filter((k) => k !== key) : [...prev.picked, key];
  return { ...prev, picked, auto: prev.auto.filter((k) => k !== key) };
}
