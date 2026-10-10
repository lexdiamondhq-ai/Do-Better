/**
 * Calendar-day helpers. A Do Better "day" is the user's local date as YYYY-MM-DD, matching the
 * `date` columns in Postgres, so a check-in at 11:30 pm counts for that evening, not tomorrow.
 */

export type Day = string;

/** The local calendar date of `at` in `timeZone` (an IANA name such as "America/New_York"). */
export function localDay(at: Date, timeZone: string): Day {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
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
