import { addDays, type Day } from '@/engine/day';

const LONG = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const SHORT_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** A local calendar day as a Date at local midnight, for formatting only. */
function asDate(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Sunday 11 October". */
export const longDate = (day: Day) => LONG.format(asDate(day));

/** "11 Oct". */
export const shortDate = (day: Day) => SHORT.format(asDate(day));

/** "Tue 13 Oct": a date with its weekday that still fits where `longDate` would be cut off, as with larger text. */
export const shortDay = (day: Day) => SHORT_DAY.format(asDate(day));

/**
 * "3 August", with the year when it isn't this year: "3 August 2025". `today` is the user's local day;
 * without it, this year is the phone's.
 */
export function monthDay(day: Day, today?: Day): string {
  const year = today ? today.slice(0, 4) : String(new Date().getFullYear());
  return (day.slice(0, 4) === year ? MONTH_DAY : MONTH_DAY_YEAR).format(asDate(day));
}

/** "Week of 5 October". */
export const weekOf = (start: Day) => `Week of ${MONTH_DAY.format(asDate(start))}`;

/** "5 Oct – 11 Oct", in the phone's own date order. */
export function weekRange(start: Day): string {
  return `${shortDate(start)} – ${shortDate(addDays(start, 6))}`;
}
