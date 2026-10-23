/**
 * Kept days. A day is kept when it has a Floor or Ceiling check-in. A day with neither is a miss,
 * but only once it has ended: today is "open" until midnight, and days before a habit started
 * don't count at all. The day a habit was made only counts once it is kept, the same as in the deal,
 * so a card made in the evening never greets you with a Comeback the next morning. Nothing here ever
 * looks at runs of days; the app counts kept days, not runs.
 */

import { addDays, daysBetween, weekStart, type Day } from './day';

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
  if (day === today) return 'open';
  // The day a card was made counts only if it was kept, as in the deal: no card is missed on day one.
  return day === startedOn ? 'before' : 'missed';
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

/** Kept days from `from` to `upTo`, both included, such as "kept this week". */
export function keptBetween(checkIns: CheckIns, from: Day, upTo: Day): number {
  let kept = 0;
  for (const day of checkIns.keys()) if (daysBetween(from, day) >= 0 && daysBetween(day, upTo) >= 0) kept++;
  return kept;
}

/** A day in a calendar: its status, or `later` after today, or `outside` before the stretch being shown. */
export type CalendarDay = { day: Day; status: DayStatus | 'later' | 'outside' };

/**
 * Whole Monday-to-Sunday weeks, oldest first, the last one holding today, so a habit's history lines up
 * with the weekly hands. With `days`, it covers the last `days` days and marks the days before them in
 * the first week `outside`; otherwise it is `weeks` full weeks. The rest of this week is `later`.
 */
export function calendarWeeks(today: Day, span: { days: number } | { weeks: number }, startedOn: Day, checkIns: CheckIns): CalendarDay[][] {
  const first = 'days' in span ? addDays(today, -(span.days - 1)) : addDays(weekStart(today), -7 * (span.weeks - 1));
  const out: CalendarDay[][] = [];
  for (let monday = weekStart(first); daysBetween(monday, today) >= 0; monday = addDays(monday, 7)) {
    out.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(monday, i);
        if (daysBetween(day, today) < 0) return { day, status: 'later' as const };
        if (daysBetween(first, day) < 0) return { day, status: 'outside' as const };
        return { day, status: dayStatus(day, startedOn, today, checkIns) };
      }),
    );
  }
  return out;
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
 * Kept days across the whole deck up to and including `upTo`: calendar days with at least one habit kept.
 * Two habits kept on the same day make one kept day, not two.
 */
export function keptDayCount(checkIns: Iterable<CheckIns>, upTo: Day): number {
  const kept = new Set<Day>();
  for (const days of checkIns) {
    for (const day of days.keys()) if (day <= upTo) kept.add(day);
  }
  return kept.size;
}

/**
 * Ceiling days across the whole deck up to and including `upTo`: calendar days with at least one Ceiling.
 * Two Ceilings on the same day make one Ceiling day, so it is never more than `keptDayCount`.
 */
export function ceilingDayCount(checkIns: Iterable<CheckIns>, upTo: Day): number {
  const days = new Set<Day>();
  for (const habit of checkIns) {
    for (const [day, level] of habit) if (level === 'ceiling' && day <= upTo) days.add(day);
  }
  return days.size;
}

/**
 * The missed day the Comeback card should be shown for, or null.
 * That is yesterday, when yesterday counted, had no check-in, and today isn't kept yet.
 */
export function neverTwiceDay(startedOn: Day, today: Day, checkIns: CheckIns): Day | null {
  const yesterday = addDays(today, -1);
  if (dayStatus(yesterday, startedOn, today, checkIns) !== 'missed') return null;
  if (checkIns.has(today)) return null;
  return yesterday;
}

/**
 * What keeping a card says to its Comeback, wherever the card is kept: Today, the list, a pill or the
 * card's own page. Null when there is nothing to answer: no Comeback waiting (`missed` is null) or a
 * late log for an earlier day rather than a keep today. Doing just the first move answers it with the
 * first move; a Floor or a Ceiling answers it with the Floor.
 */
export function comebackAnswer(missed: Day | null, keptOn: Day, today: Day, firstMove = false): { missedDay: Day; response: 'floor_only' | 'two_minute' } | null {
  if (!missed || keptOn !== today) return null;
  return { missedDay: missed, response: firstMove ? 'two_minute' : 'floor_only' };
}

/** Misses that were followed by a kept day: the comebacks. An unkept first day was never a miss, so it isn't one. */
export function bounceBacks(startedOn: Day, upTo: Day, checkIns: CheckIns): number {
  let count = 0;
  for (let day = startedOn; daysBetween(day, upTo) > 0; day = addDays(day, 1)) {
    const next = addDays(day, 1);
    if (dayStatus(day, startedOn, upTo, checkIns) === 'missed' && checkIns.has(next)) count++;
  }
  return count;
}

/**
 * Comebacks made on a card in the last `days` days, today included: kept days that came straight after a
 * day it missed. The same count as `bounceBacks`, over a window, for the coach's "came back twice this month".
 */
export function comebacksWithin(startedOn: Day, today: Day, checkIns: CheckIns, days = 30): number {
  let count = 0;
  for (let i = 0; i < days; i++) {
    const kept = addDays(today, -i);
    if (checkIns.has(kept) && dayStatus(addDays(kept, -1), startedOn, today, checkIns) === 'missed') count++;
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

/**
 * Whole days that ended with nothing kept on any card, counted back from yesterday to the last day
 * something was kept. With nothing kept ever, they count from the day after the first card started (a
 * card's first day only counts once kept). Zero once anything is kept today: you're back. Only ever a
 * trigger for a kinder way back in, never a number shown to anyone.
 */
export function daysAway(checkIns: Iterable<CheckIns>, today: Day, firstStart: Day | null): number {
  let last: Day | null = null;
  for (const days of checkIns) {
    for (const day of days.keys()) {
      if (day > today) continue;
      if (day === today) return 0;
      if (last === null || day > last) last = day;
    }
  }
  const from = last ?? firstStart;
  if (from === null) return 0;
  return Math.max(0, daysBetween(from, today) - 1);
}

/** A card that has become part of you: kept on 27 of the last 30 days, with 15 or more of them at the Ceiling. */
export const MASTERY = { days: 30, kept: 27, ceilings: 15 } as const;

export type Mastery = { mastered: boolean; kept: number; ceilings: number };

/**
 * How close a card is to being part of you, over the last 30 days. The 30 days ending yesterday count, or
 * the 30 ending today once today is kept, whichever is better, so a card mastered last night doesn't
 * lose it in the morning before you've had the chance to keep it. It never raises the Floor: the next
 * step is a higher Ceiling, and that is the player's choice.
 */
export function masteryOf(checkIns: CheckIns, today: Day): Mastery {
  const count = (end: Day) => {
    let kept = 0;
    let ceilings = 0;
    for (let i = 0; i < MASTERY.days; i++) {
      const level = checkIns.get(addDays(end, -i));
      if (level) kept++;
      if (level === 'ceiling') ceilings++;
    }
    return { kept, ceilings };
  };
  const judge = (w: { kept: number; ceilings: number }): Mastery => ({ ...w, mastered: w.kept >= MASTERY.kept && w.ceilings >= MASTERY.ceilings });
  const a = judge(count(addDays(today, -1)));
  if (!checkIns.has(today)) return a;
  const b = judge(count(today));
  if (a.mastered !== b.mastered) return a.mastered ? a : b;
  return b.kept > a.kept || (b.kept === a.kept && b.ceilings >= a.ceilings) ? b : a;
}
