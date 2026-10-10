/**
 * Kept days. A day is kept when it has a Floor or Ceiling check-in. A day with neither is a miss,
 * but only once it has ended: today is "open" until midnight, and days before a habit started
 * don't count at all. Nothing here ever looks at runs of days; the app counts kept days, not streaks.
 */

import { addDays, daysBetween, type Day } from './day';

export type Level = 'floor' | 'ceiling';
export type DayStatus = Level | 'missed' | 'open' | 'before';

/** One habit's check-ins, keyed by day. */
export type CheckIns = ReadonlyMap<Day, Level>;

export type CheckInRow = { habitId: string; day: Day; level: Level };

/** Groups check-in rows by habit. A later row for the same habit and day replaces an earlier one. */
export function indexCheckIns(rows: readonly CheckInRow[]): Map<string, Map<Day, Level>> {
  const byHabit = new Map<string, Map<Day, Level>>();
  for (const row of rows) {
    let days = byHabit.get(row.habitId);
    if (!days) byHabit.set(row.habitId, (days = new Map()));
    days.set(row.day, row.level);
  }
  return byHabit;
}

export function dayStatus(day: Day, startedOn: Day, today: Day, checkIns: CheckIns): DayStatus {
  if (daysBetween(startedOn, day) < 0 || daysBetween(day, today) < 0) return 'before';
  const level = checkIns.get(day);
  if (level) return level;
  return day === today ? 'open' : 'missed';
}

export function isKept(status: DayStatus): status is Level {
  return status === 'floor' || status === 'ceiling';
}

/** The last `length` days ending today, oldest first. */
export function recentDays(today: Day, length: number, startedOn: Day, checkIns: CheckIns): { day: Day; status: DayStatus }[] {
  const out: { day: Day; status: DayStatus }[] = [];
  for (let i = length - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({ day, status: dayStatus(day, startedOn, today, checkIns) });
  }
  return out;
}

export type WindowSummary = {
  /** Days in the window on or after the habit started, today included. */
  daysInWindow: number;
  keptDays: number;
  ceilingDays: number;
  missedDays: number;
};

/** Kept days over the last `length` days. Today counts toward the window, so the number only rises during the day. */
export function summarizeWindow(today: Day, length: number, startedOn: Day, checkIns: CheckIns): WindowSummary {
  const summary: WindowSummary = { daysInWindow: 0, keptDays: 0, ceilingDays: 0, missedDays: 0 };
  for (const { status } of recentDays(today, length, startedOn, checkIns)) {
    if (status === 'before') continue;
    summary.daysInWindow++;
    if (isKept(status)) summary.keptDays++;
    if (status === 'ceiling') summary.ceilingDays++;
    if (status === 'missed') summary.missedDays++;
  }
  return summary;
}

/** All-time kept and Ceiling days up to and including `upTo`. */
export function totals(checkIns: CheckIns, upTo: Day): { kept: number; ceiling: number } {
  let kept = 0;
  let ceiling = 0;
  for (const [day, level] of checkIns) {
    if (daysBetween(day, upTo) < 0) continue;
    kept++;
    if (level === 'ceiling') ceiling++;
  }
  return { kept, ceiling };
}

/**
 * The missed day the Never Twice card should be shown for, or null.
 * That is yesterday, when yesterday counted, had no check-in, and today isn't kept yet.
 */
export function neverTwiceDay(startedOn: Day, today: Day, checkIns: CheckIns): Day | null {
  const yesterday = addDays(today, -1);
  if (dayStatus(yesterday, startedOn, today, checkIns) !== 'missed') return null;
  if (checkIns.has(today)) return null;
  return yesterday;
}

/** Misses that were followed by a kept day: the moments Never Twice worked. */
export function bounceBacks(startedOn: Day, upTo: Day, checkIns: CheckIns): number {
  let count = 0;
  for (let day = startedOn; daysBetween(day, upTo) > 0; day = addDays(day, 1)) {
    const next = addDays(day, 1);
    if (!checkIns.has(day) && checkIns.has(next)) count++;
  }
  return count;
}

/** The most kept days in any 30-day stretch since the habit started, counting only stretches that have fully ended or end today. */
export function best30(startedOn: Day, upTo: Day, checkIns: CheckIns): number {
  const span = daysBetween(startedOn, upTo) + 1;
  if (span < 30) return 0;
  let inWindow = 0;
  let best = 0;
  for (let i = 0; i < span; i++) {
    if (checkIns.has(addDays(startedOn, i))) inWindow++;
    if (i >= 30 && checkIns.has(addDays(startedOn, i - 30))) inWindow--;
    if (i >= 29) best = Math.max(best, inWindow);
  }
  return best;
}
