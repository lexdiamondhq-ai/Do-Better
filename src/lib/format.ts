import { addDays, type Day } from '@/engine/day';

const LONG = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' });

/** A local calendar day as a Date at local midnight, for formatting only. */
function asDate(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Sunday 11 October". */
export const longDate = (day: Day) => LONG.format(asDate(day));

/** "11 Oct". */
export const shortDate = (day: Day) => SHORT.format(asDate(day));

/** "Week of 5 October". */
export const weekOf = (start: Day) => `Week of ${MONTH_DAY.format(asDate(start))}`;

/** "5 Oct – 11 Oct", in the phone's own date order. */
export function weekRange(start: Day): string {
  return `${shortDate(start)} – ${shortDate(addDays(start, 6))}`;
}
