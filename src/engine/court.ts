/**
 * The Court: who you are becoming, one suit at a time. Every habit-day you keep is a vote for the part
 * of you its suit stands for. Enough votes and the suit earns a face card: a Jack for showing up, a
 * Queen for becoming, a King when it's who you are, and an Ace when it's second nature. Votes only add
 * up, so a face card, once earned, is never lost.
 */

import { SUITS, type Suit } from './cards';
import { addDays, daysBetween, type Day } from './day';
import type { CheckIns } from './kept';

export type Face = 'jack' | 'queen' | 'king' | 'ace';

export type FaceInfo = { face: Face; letter: 'J' | 'Q' | 'K' | 'A'; name: string; title: string; votes: number };

/** Lowest first. `votes` is the total a suit needs to earn the card. */
export const FACES: readonly FaceInfo[] = [
  { face: 'jack', letter: 'J', name: 'Jack', title: 'Showing up', votes: 10 },
  { face: 'queen', letter: 'Q', name: 'Queen', title: 'Becoming', votes: 30 },
  { face: 'king', letter: 'K', name: 'King', title: 'This is who I am', votes: 100 },
  { face: 'ace', letter: 'A', name: 'Ace', title: 'Second nature', votes: 365 },
];

/** The highest face card earned with this many votes, or null before the Jack. */
export function faceFor(votes: number): FaceInfo | null {
  let earned: FaceInfo | null = null;
  for (const f of FACES) if (votes >= f.votes) earned = f;
  return earned;
}

export function nextFace(votes: number): { face: FaceInfo; needed: number } | null {
  const face = FACES.find((f) => f.votes > votes);
  return face ? { face, needed: face.votes - votes } : null;
}

export type CourtHabit = { id: string; suit: Suit; identity: string | null };

export type CourtSuit = {
  suit: Suit;
  votes: number;
  ceilings: number;
  /** Votes in the last seven days, today included. */
  lastWeek: number;
  face: FaceInfo | null;
  next: { face: FaceInfo; needed: number } | null;
  /** Who the habits in this suit say you are becoming ("a reader", "calm"), most voted first. */
  identities: string[];
  habitIds: string[];
};

/** "I am a reader " and "a reader" are the same identity. Returns the cleaned label, or null when empty. */
export function cleanIdentity(identity: string | null): string | null {
  const label = identity?.trim().replace(/^(i am|i'm)\s+/i, '').replace(/\s+/g, ' ');
  return label ? label : null;
}

/** Every suit, in deck order, with its votes and face card. Pass archived habits too: their votes still count. */
export function summarizeCourt(habits: readonly CourtHabit[], checkIns: ReadonlyMap<string, CheckIns>, today: Day): CourtSuit[] {
  const since = addDays(today, -6);
  return SUITS.map((suit) => {
    let votes = 0;
    let ceilings = 0;
    let lastWeek = 0;
    const byIdentity = new Map<string, { label: string; votes: number }>();
    const habitIds: string[] = [];
    for (const h of habits) {
      if (h.suit !== suit) continue;
      habitIds.push(h.id);
      let mine = 0;
      for (const [day, level] of checkIns.get(h.id) ?? []) {
        if (day > today) continue;
        mine++;
        if (level === 'ceiling') ceilings++;
        if (daysBetween(since, day) >= 0) lastWeek++;
      }
      votes += mine;
      const label = cleanIdentity(h.identity);
      if (label) {
        const key = label.toLowerCase();
        const entry = byIdentity.get(key) ?? { label, votes: 0 };
        entry.votes += mine;
        byIdentity.set(key, entry);
      }
    }
    const identities = [...byIdentity.values()].sort((a, b) => b.votes - a.votes || a.label.localeCompare(b.label)).map((e) => e.label);
    return { suit, votes, ceilings, lastWeek, face: faceFor(votes), next: nextFace(votes), identities, habitIds };
  });
}

/**
 * When each face card was earned: the day its last needed vote came in. That day's card is dealt as a
 * Joker. Several habits in one suit can vote on the same day, and the card belongs to that day.
 */
export function faceDays(habits: readonly Pick<CourtHabit, 'id' | 'suit'>[], checkIns: ReadonlyMap<string, CheckIns>, upTo: Day): { day: Day; suit: Suit; face: FaceInfo }[] {
  const out: { day: Day; suit: Suit; face: FaceInfo }[] = [];
  for (const suit of SUITS) {
    const days: Day[] = [];
    for (const h of habits) {
      if (h.suit !== suit) continue;
      for (const day of (checkIns.get(h.id) ?? new Map()).keys()) if (day <= upTo) days.push(day);
    }
    days.sort();
    for (const face of FACES) if (days.length >= face.votes) out.push({ day: days[face.votes - 1], suit, face });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
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
