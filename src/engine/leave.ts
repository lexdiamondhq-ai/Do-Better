/**
 * Leave it where it plays: one card taken off the phone, as a print to cut out and fold or as a lock
 * screen, so its cue sits where its moment happens. It carries what helps you start (the card's name and
 * suit, when it plays, its Floor, its First move and who it says you are) and nothing you've won: no
 * chips, no hands, no kept days. It is a cue, not a trophy.
 */

import { cleanIdentity } from './court';
import { playsLine } from './playbook';

/**
 * The picture sizes, in pixels. A print is two playing-card faces side by side (each 750 × 1050, about
 * 63 × 88 mm at 300 dpi) with the fold between them; a lock screen fills a modern iPhone (1170 × 2532).
 */
export const LEAVE_FORMATS = { print: { w: 1500, h: 1050 }, lock: { w: 1170, h: 2532 } } as const;

export type LeaveFormat = keyof typeof LEAVE_FORMATS;

/** A playing card's height for each unit of width: 88 ÷ 63. */
export const CARD_ASPECT_H = 88 / 63;

/** On a lock screen, the top of the picture stays clear for the clock, and the card sits in the lower part. */
export const LOCK_CLEAR = 0.38;
/** How much of a lock screen the card's area takes, from the bottom. */
export const LOCK_CARD_AREA = 0.6;

/** The most of each line a printed card has room for, in characters. Longer words are cut with an ellipsis. */
export const LEAVE_CAPS = { name: 28, plays: 56, floor: 44, firstMove: 44, identity: 40 } as const;

/** What the card is made from: only the habit's own words. */
export type LeaveHabit = {
  name: string;
  anchor: string | null;
  whenWhere: string | null;
  floorLabel: string;
  twoMinuteLabel: string | null;
  identity: string | null;
};

export type LeaveLines = {
  name: string;
  /** "Plays after getting into bed", or null for a card with no When it plays yet. */
  plays: string | null;
  /** "↓ Floor · Read one page" */
  floor: string;
  /** "First move · Open the book", or null when the card has none. */
  firstMove: string | null;
  /** "I’m a reader", or null. */
  identity: string | null;
  /** No When it plays yet: the card asks for one before it leaves the phone. */
  needsMoment: boolean;
};

/** Spaces tidied and the text cut at a word, with an ellipsis, when it runs past `max` characters. */
export function capLine(text: string, max: number): string {
  const tidy = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(tidy);
  if (chars.length <= max) return tidy;
  const cut = chars.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  // Cut at the last space unless that would throw away most of the line.
  const head = space >= max * 0.6 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s,;:·.-]+$/, '')}…`;
}

const clean = (v: string | null | undefined) => {
  const s = v?.replace(/\s+/g, ' ').trim();
  return s ? s : null;
};

/** The words a card carries off the phone. */
export function leaveLines(habit: LeaveHabit): LeaveLines {
  const anchor = clean(habit.anchor);
  const where = clean(habit.whenWhere);
  const when = [anchor, where].filter(Boolean).join(' · ');
  const first = clean(habit.twoMinuteLabel);
  const who = cleanIdentity(habit.identity)?.replace(/^(i[’']m|im)\s+/i, '').replace(/[.!\s]+$/, '');
  return {
    name: capLine(habit.name, LEAVE_CAPS.name),
    plays: when ? capLine(playsLine(when), LEAVE_CAPS.plays) : null,
    floor: `↓ Floor · ${capLine(habit.floorLabel, LEAVE_CAPS.floor)}`,
    firstMove: first ? `First move · ${capLine(first, LEAVE_CAPS.firstMove)}` : null,
    identity: who ? `I’m ${capLine(who, LEAVE_CAPS.identity)}` : null,
    needsMoment: !when,
  };
}

/**
 * Where the card sits on a lock screen `w` × `h` points: centred across, in the lower part, clear of the
 * clock above and of the torch and camera buttons at the foot. Cards keep a playing card's shape.
 */
export function lockCardBox(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const top = h * (1 - LOCK_CARD_AREA);
  const bottom = h * 0.88;
  const cardW = Math.min(w * 0.66, ((bottom - top) * 0.94) / CARD_ASPECT_H);
  const cardH = cardW * CARD_ASPECT_H;
  return { x: (w - cardW) / 2, y: top + (bottom - top - cardH) / 2, w: cardW, h: cardH };
}
