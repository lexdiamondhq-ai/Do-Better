/**
 * Identity votes. Every kept day is a vote for the person the habit says you are becoming
 * ("a reader", "someone who moves every day"). A Floor counts as a full vote: showing up is the point.
 * Habits without an identity still count toward kept days, just not here.
 */

import { addDays, daysBetween, type Day } from './day';
import type { CheckIns } from './kept';

export type IdentityHabit = { id: string; identity: string | null; startedOn: Day };

export type IdentityLevel = { key: 'trying' | 'showing' | 'becoming' | 'am'; label: string; from: number };

/** Ordered from the start. Thresholds are total votes. */
export const IDENTITY_LEVELS: readonly IdentityLevel[] = [
  { key: 'trying', label: 'Trying it on', from: 0 },
  { key: 'showing', label: 'Showing up', from: 10 },
  { key: 'becoming', label: 'Becoming', from: 30 },
  { key: 'am', label: 'This is who I am', from: 100 },
];

export function identityLevel(votes: number): IdentityLevel {
  let level = IDENTITY_LEVELS[0];
  for (const l of IDENTITY_LEVELS) if (votes >= l.from) level = l;
  return level;
}

/** Votes needed to reach the next level, or null at the top. */
export function votesToNextLevel(votes: number): { next: IdentityLevel; needed: number } | null {
  const next = IDENTITY_LEVELS.find((l) => l.from > votes);
  return next ? { next, needed: next.from - votes } : null;
}

/** How far `votes` has come from the current level toward the next, from 0 to 1. Stays at 1 on the top level. */
export function levelProgress(votes: number): number {
  const next = votesToNextLevel(votes);
  if (!next) return 1;
  const from = identityLevel(votes).from;
  return (votes - from) / (next.next.from - from);
}

export type IdentitySummary = {
  identity: string;
  habitIds: string[];
  votes: number;
  ceilingVotes: number;
  last30: number;
  level: IdentityLevel;
};

/** Trims, drops a leading "I am"/"I'm", and lowercases for grouping, so "A reader" and "a reader " are one identity. */
export function identityKey(identity: string): string {
  return identity.trim().replace(/^(i am|i'm)\s+/i, '').replace(/\s+/g, ' ').toLowerCase();
}

export function summarizeIdentities(
  habits: readonly IdentityHabit[],
  checkInsByHabit: ReadonlyMap<string, CheckIns>,
  today: Day,
): IdentitySummary[] {
  const groups = new Map<string, IdentitySummary>();
  const since = addDays(today, -29);
  for (const habit of habits) {
    if (!habit.identity?.trim()) continue;
    const key = identityKey(habit.identity);
    let group = groups.get(key);
    if (!group) {
      group = { identity: habit.identity.trim().replace(/^(i am|i'm)\s+/i, ''), habitIds: [], votes: 0, ceilingVotes: 0, last30: 0, level: IDENTITY_LEVELS[0] };
      groups.set(key, group);
    }
    group.habitIds.push(habit.id);
    for (const [day, level] of checkInsByHabit.get(habit.id) ?? []) {
      if (daysBetween(day, today) < 0) continue;
      group.votes++;
      if (level === 'ceiling') group.ceilingVotes++;
      if (daysBetween(since, day) >= 0) group.last30++;
    }
  }
  const out = [...groups.values()];
  for (const g of out) g.level = identityLevel(g.votes);
  return out.sort((a, b) => b.votes - a.votes || a.identity.localeCompare(b.identity));
}
