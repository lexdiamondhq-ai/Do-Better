/**
 * Calendar-day helpers. A Do Better "day" is the user's local date as YYYY-MM-DD, matching the
 * `date` columns in Postgres, so a check-in at 11:30 pm counts for that evening, not tomorrow.
 */

export type Day = string;

// Building a formatter is slow and the clock asks often, so keep one per time zone.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The local calendar date of `at` in `timeZone` (an IANA name such as "America/New_York"). */
export function localDay(at: Date, timeZone: string): Day {
  const parts = formatterFor(timeZone).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const HOUR = 3_600_000;

/**
 * Milliseconds from `at` until the next local day starts in `timeZone`. Days can be 23 or 25 hours long
 * when the clocks change, and in a few places the clocks jump at midnight itself, so the next day can start
 * at 01:00. This finds the first moment whose local date differs, to the millisecond.
 */
export function msUntilNextDay(at: Date, timeZone: string): number {
  const start = at.getTime();
  const day = localDay(at, timeZone);
  const changed = (t: number) => localDay(new Date(t), timeZone) !== day;
  // No local day is longer than 25 hours, so the change is always inside this window.
  let lo = start;
  let hi = start + 27 * HOUR;
  if (!changed(hi)) return 24 * HOUR;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (changed(mid)) hi = mid;
    else lo = mid;
  }
  return hi - start;
}

/** `day` shifted by `delta` days. Works on the date alone, so daylight saving never skips or repeats a day. */
export function addDays(day: Day, delta: number): Day {
  const [y, m, d] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + delta));
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  const toUtc = (day: Day) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** 0 for Monday through 6 for Sunday. */
export function weekday(day: Day): number {
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday that starts the week `day` falls in. Weeks run Monday to Sunday, so Sunday night is the showdown. */
export function weekStart(day: Day): Day {
  return addDays(day, -weekday(day));
}

/** The seven days of the week starting on `start`. */
export function weekDays(start: Day): Day[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** `a` is on or before `b`. Days compare as strings because they are zero-padded ISO dates. */
export function onOrBefore(a: Day, b: Day): boolean {
  return a <= b;
}

/** The later of two days. A missing day counts as earlier than any day. */
export function laterDay(a: Day | null | undefined, b: Day): Day {
  return a && a > b ? a : b;
}

/**
 * Whether `day` can still be logged after the fact ("Did it, forgot to log"). Only yesterday, and only
 * while yesterday is in the week being played: on Monday, Sunday's hand is already settled. The habit
 * must have been running yesterday and still be in the deck. A back-fill only adds a missing day, so
 * pass the habit's check-ins to rule out a day that is already kept.
 */
export function canBackfill(day: Day, today: Day, habit?: { startedOn: Day; archivedAt?: string | null } | null, checkIns?: ReadonlyMap<Day, unknown>): boolean {
  if (day !== addDays(today, -1)) return false;
  if (weekStart(day) !== weekStart(today)) return false;
  if (habit && (habit.archivedAt || habit.startedOn > day)) return false;
  return !checkIns?.has(day);
}

/**
 * The value written to `habits.archived_at` when a card is archived on the local day `day`. The column is
 * a timestamp, but the app stores the local day as midnight UTC so the day it left the deck never moves
 * when the phone changes time zone. Read it back with `archivedDay`, never by slicing it anywhere else.
 */
export function archivedAtFor(day: Day): string {
  return `${day}T00:00:00.000Z`;
}

/** Midnight UTC exactly, as written by `archivedAtFor` and as Postgres sends it back. */
const ENCODED_DAY = /^(\d{4}-\d{2}-\d{2})[T ]00:00:00(?:\.0+)?(?:Z|\+00(?::?00)?)$/;

/**
 * The local day a card left the deck. New rows encode the local day itself (see `archivedAtFor`). Rows
 * archived before that hold the real moment, which is converted with `timeZone` as before.
 */
export function archivedDay(archivedAt: string, timeZone: string): Day {
  const encoded = ENCODED_DAY.exec(archivedAt);
  return encoded ? encoded[1] : localDay(new Date(archivedAt), timeZone);
}

/**
 * The value written to `habit_days.logged_at`. A check-in made on its own day stores the real moment. One
 * logged after its day ("Did it, forgot to log") stores the local day it was logged on, as midnight UTC
 * like `archivedAtFor`, so it can be told apart from a day kept on the day whatever time zone the phone
 * is in later. Read it back with `loggedLateOn`.
 */
export function loggedAtFor(day: Day, loggedOn: Day, now: Date): string {
  return loggedOn > day ? archivedAtFor(loggedOn) : now.toISOString();
}

/**
 * The day a check-in was logged on when that was after its own day, or null for one made on the day.
 * Only a stored day (see `loggedAtFor`) later than the check-in's day counts, so a real moment read in
 * another time zone can never turn an evening check-in into a late one.
 */
export function loggedLateOn(day: Day, loggedAt: string | null | undefined): Day | null {
  const encoded = loggedAt ? ENCODED_DAY.exec(loggedAt) : null;
  return encoded && encoded[1] > day ? encoded[1] : null;
}
