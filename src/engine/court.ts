/**
 * The Court: who you are becoming, one suit at a time. A suit counts days, not check-ins: a day counts
 * once for Body if you kept any Body habit that day, however many you kept. Enough of those days and the
 * suit earns a face card: a Jack for showing up, a Queen for becoming, a King when it's who you are, and
 * an Ace when it's second nature, a year of days. Between the King and the Ace, rungs at 150, 200, 250
 * and 300 days mark the climb. Days only add up, so a face card or a rung, once earned, is never lost.
 * The code calls the count `votes` for history; on screen it is always days.
 */

import { SUITS, type Suit } from './cards';
import { weekStart, type Day } from './day';
import type { CheckIns } from './kept';

export type Face = 'jack' | 'queen' | 'king' | 'ace';

export type FaceInfo = { face: Face; letter: 'J' | 'Q' | 'K' | 'A'; name: string; title: string; votes: number };

/** Lowest first. `votes` is the number of days a suit needs to earn the card. */
export const FACES: readonly FaceInfo[] = [
  { face: 'jack', letter: 'J', name: 'Jack', title: 'Showing up', votes: 10 },
  { face: 'queen', letter: 'Q', name: 'Queen', title: 'Becoming', votes: 30 },
  { face: 'king', letter: 'K', name: 'King', title: 'This is who I am', votes: 100 },
  { face: 'ace', letter: 'A', name: 'Ace', title: 'Second nature', votes: 365 },
];

/** The rungs between the King and the Ace, in days. Each one is celebrated; none deals a Joker. */
export const RUNGS: readonly number[] = [150, 200, 250, 300];

export type Rung = 0 | 1 | 2 | 3 | 4;

/** The highest face card earned with this many days, or null before the Jack. */
export function faceFor(votes: number): FaceInfo | null {
  let earned: FaceInfo | null = null;
  for (const f of FACES) if (votes >= f.votes) earned = f;
  return earned;
}

export function nextFace(votes: number): { face: FaceInfo; needed: number } | null {
  const face = FACES.find((f) => f.votes > votes);
  return face ? { face, needed: face.votes - votes } : null;
}

/** How many rungs this many days has climbed: 0 below 150, 4 from 300 on. */
export function rungFor(votes: number): Rung {
  return RUNGS.filter((r) => votes >= r).length as Rung;
}

/** The next rung to reach, numbered from 1, with the days it needs, or null past the last rung. */
export function nextRung(votes: number): { rung: Rung; votes: number; needed: number } | null {
  const i = RUNGS.findIndex((r) => r > votes);
  return i < 0 ? null : { rung: (i + 1) as Rung, votes: RUNGS[i], needed: RUNGS[i] - votes };
}

export type CourtHabit = { id: string; suit: Suit; identity: string | null };

export type CourtSuit = {
  suit: Suit;
  /** Days this suit was kept: a day counts once, however many of its habits were kept. */
  votes: number;
  /** Days with at least one Ceiling in this suit. */
  ceilings: number;
  /** Days this suit was kept this week, Monday to today. */
  lastWeek: number;
  face: FaceInfo | null;
  next: { face: FaceInfo; needed: number } | null;
  /** Rungs climbed between the King and the Ace. */
  rung: Rung;
  nextRung: { rung: Rung; votes: number; needed: number } | null;
  /** Who the habits in this suit say you are becoming ("a reader", "calm"), most kept first. */
  identities: string[];
  habitIds: string[];
};

/** "I am a reader " and "a reader" are the same identity. Returns the cleaned label, or null when empty. */
export function cleanIdentity(identity: string | null): string | null {
  const label = identity?.trim().replace(/^(i am|i'm)\s+/i, '').replace(/\s+/g, ' ');
  return label ? label : null;
}

/** The days, in order, on which any habit in `suit` was kept, up to and including `upTo`. */
export function suitDays(habits: readonly Pick<CourtHabit, 'id' | 'suit'>[], checkIns: ReadonlyMap<string, CheckIns>, suit: Suit, upTo: Day): Day[] {
  const days = new Set<Day>();
  for (const h of habits) {
    if (h.suit !== suit) continue;
    for (const day of (checkIns.get(h.id) ?? new Map<Day, never>()).keys()) if (day <= upTo) days.add(day);
  }
  return [...days].sort();
}

/** Every suit, in deck order, with its days and face card. Pass archived habits too: their days still count. */
export function summarizeCourt(habits: readonly CourtHabit[], checkIns: ReadonlyMap<string, CheckIns>, today: Day): CourtSuit[] {
  const monday = weekStart(today);
  return SUITS.map((suit) => {
    const kept = new Set<Day>();
    const ceilingDays = new Set<Day>();
    const byIdentity = new Map<string, { label: string; votes: number }>();
    const habitIds: string[] = [];
    for (const h of habits) {
      if (h.suit !== suit) continue;
      habitIds.push(h.id);
      let mine = 0;
      for (const [day, level] of checkIns.get(h.id) ?? []) {
        if (day > today) continue;
        mine++;
        kept.add(day);
        if (level === 'ceiling') ceilingDays.add(day);
      }
      const label = cleanIdentity(h.identity);
      if (label) {
        const key = label.toLowerCase();
        const entry = byIdentity.get(key) ?? { label, votes: 0 };
        entry.votes += mine;
        byIdentity.set(key, entry);
      }
    }
    const votes = kept.size;
    const lastWeek = [...kept].filter((day) => day >= monday).length;
    const identities = [...byIdentity.values()].sort((a, b) => b.votes - a.votes || a.label.localeCompare(b.label)).map((e) => e.label);
    return { suit, votes, ceilings: ceilingDays.size, lastWeek, face: faceFor(votes), next: nextFace(votes), rung: rungFor(votes), nextRung: nextRung(votes), identities, habitIds };
  });
}

/**
 * Check-ins logged after their own day ("Did it, forgot to log"): habit id, then the day kept, then the
 * later day it was logged on. A check-in made on its own day isn't listed.
 */
export type LoggedLate = ReadonlyMap<string, ReadonlyMap<Day, Day>>;

/** The day a check-in became known: its own day, or the later day it was logged on. */
export function knownOn(late: LoggedLate | undefined, habitId: string, day: Day): Day {
  const on = late?.get(habitId)?.get(day);
  return on && on > day ? on : day;
}

/**
 * When each face card was earned, as it happened: the day the suit's count of kept days reached the
 * days the card needs, oldest first. A day logged late joins the count on the day it was logged, so
 * logging yesterday never moves a face card back to yesterday. Each one deals a Joker on the first day
 * from then on that was kept on the day and whose week doesn't have one yet (see game.ts).
 */
export function faceDays(habits: readonly Pick<CourtHabit, 'id' | 'suit'>[], checkIns: ReadonlyMap<string, CheckIns>, upTo: Day, late?: LoggedLate): { day: Day; suit: Suit; face: FaceInfo }[] {
  const out: { day: Day; suit: Suit; face: FaceInfo }[] = [];
  for (const suit of SUITS) {
    // Each kept day of the suit, by the day it was first known: a day kept by two habits counts once.
    const known = new Map<Day, Day>();
    for (const h of habits) {
      if (h.suit !== suit) continue;
      for (const day of (checkIns.get(h.id) ?? new Map<Day, never>()).keys()) {
        const on = knownOn(late, h.id, day);
        if (day > upTo || on > upTo) continue;
        const was = known.get(day);
        if (!was || on < was) known.set(day, on);
      }
    }
    const days = [...known.values()].sort();
    for (const face of FACES) if (days.length >= face.votes) out.push({ day: days[face.votes - 1], suit, face });
  }
  // Same day: deck order of the suits, then lower face first, so the order never depends on the habit list.
  return out.sort((a, b) => a.day.localeCompare(b.day) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.face.votes - b.face.votes);
}

/** Face cards earned between two summaries of the same Court, for celebrating. */
export function newFaces(before: readonly CourtSuit[], after: readonly CourtSuit[]): { suit: Suit; face: FaceInfo; identities: string[] }[] {
  const out: { suit: Suit; face: FaceInfo; identities: string[] }[] = [];
  for (const now of after) {
    const was = before.find((b) => b.suit === now.suit);
    for (const f of FACES) {
      if (now.votes >= f.votes && (was?.votes ?? 0) < f.votes) out.push({ suit: now.suit, face: f, identities: now.identities });
    }
  }
  return out;
}

/** Rungs climbed between two summaries of the same Court, for celebrating. `votes` is the rung's day count. */
export function newRungs(before: readonly CourtSuit[], after: readonly CourtSuit[]): { suit: Suit; rung: Rung; votes: number; identities: string[] }[] {
  const out: { suit: Suit; rung: Rung; votes: number; identities: string[] }[] = [];
  for (const now of after) {
    const was = before.find((b) => b.suit === now.suit)?.votes ?? 0;
    RUNGS.forEach((r, i) => {
      if (now.votes >= r && was < r) out.push({ suit: now.suit, rung: (i + 1) as Rung, votes: r, identities: now.identities });
    });
  }
  return out;
}
