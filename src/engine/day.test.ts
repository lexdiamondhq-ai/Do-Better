import { describe, expect, it } from 'vitest';

import { addDays, archivedAtFor, archivedDay, canBackfill, daysBetween, laterDay, localDay, msUntilNextDay, weekDays, weekStart, weekday } from './day';

describe('localDay', () => {
  it('uses the local date, not the UTC date', () => {
    const lateEvening = new Date('2026-10-11T03:30:00Z');
    expect(localDay(lateEvening, 'America/New_York')).toBe('2026-10-10');
    expect(localDay(lateEvening, 'UTC')).toBe('2026-10-11');
  });
});

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is unaffected by daylight saving changes', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days in either direction', () => {
    expect(daysBetween('2026-10-01', '2026-10-30')).toBe(29);
    expect(daysBetween('2026-10-30', '2026-10-01')).toBe(-29);
    expect(daysBetween('2026-10-10', '2026-10-10')).toBe(0);
  });
});

describe('weeks', () => {
  it('start on Monday and end on Sunday', () => {
    expect(weekday('2026-10-12')).toBe(0);
    expect(weekday('2026-10-18')).toBe(6);
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
  });

  it('list their seven days', () => {
    expect(weekDays('2026-12-28')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });
});

describe('laterDay', () => {
  it('keeps the later day, so a remembered week never moves back', () => {
    expect(laterDay('2026-10-12', '2026-10-05')).toBe('2026-10-12');
    expect(laterDay('2026-10-05', '2026-10-12')).toBe('2026-10-12');
    expect(laterDay(undefined, '2026-10-05')).toBe('2026-10-05');
    expect(laterDay(null, '2026-10-05')).toBe('2026-10-05');
  });
});

const HOUR = 3_600_000;

describe('msUntilNextDay', () => {
  it('counts to the next local midnight', () => {
    expect(msUntilNextDay(new Date('2026-10-16T22:00:00Z'), 'UTC')).toBe(2 * HOUR);
    expect(msUntilNextDay(new Date('2026-10-16T23:59:59.999Z'), 'UTC')).toBe(1);
    // 22:00 UTC is 18:00 in New York.
    expect(msUntilNextDay(new Date('2026-10-16T22:00:00Z'), 'America/New_York')).toBe(6 * HOUR);
  });

  it('knows a spring-forward day is 23 hours long', () => {
    // Midnight on 8 March 2026 in New York, the day the clocks go forward.
    expect(msUntilNextDay(new Date('2026-03-08T05:00:00Z'), 'America/New_York')).toBe(23 * HOUR);
  });

  it('knows a fall-back day is 25 hours long', () => {
    // Midnight on 1 November 2026 in New York, the day the clocks go back.
    expect(msUntilNextDay(new Date('2026-11-01T04:00:00Z'), 'America/New_York')).toBe(25 * HOUR);
  });

  it('finds the start of a day that has no midnight', () => {
    // Santiago skips from 23:59:59 on 5 September 2026 to 01:00 on the 6th. Noon on the 5th is 16:00 UTC.
    expect(msUntilNextDay(new Date('2026-09-05T16:00:00Z'), 'America/Santiago')).toBe(12 * HOUR);
    expect(localDay(new Date(Date.parse('2026-09-05T16:00:00Z') + 12 * HOUR), 'America/Santiago')).toBe('2026-09-06');
  });
});

describe('canBackfill', () => {
  // Wednesday 14 October 2026.
  const today = '2026-10-14';

  it('allows yesterday inside the week being played', () => {
    expect(canBackfill('2026-10-13', today)).toBe(true);
    expect(canBackfill('2026-10-13', today, { startedOn: '2026-10-01', archivedAt: null }, new Map())).toBe(true);
  });

  it('allows only yesterday', () => {
    expect(canBackfill(today, today)).toBe(false);
    expect(canBackfill('2026-10-12', today)).toBe(false);
    expect(canBackfill('2026-10-15', today)).toBe(false);
  });

  it('never reopens Sunday from Monday, because that hand is settled', () => {
    expect(canBackfill('2026-10-18', '2026-10-19')).toBe(false);
    // Monday from Tuesday is fine.
    expect(canBackfill('2026-10-19', '2026-10-20')).toBe(true);
  });

  it('needs the habit running yesterday and still in the deck', () => {
    expect(canBackfill('2026-10-13', today, { startedOn: today })).toBe(false);
    expect(canBackfill('2026-10-13', today, { startedOn: '2026-10-13' })).toBe(true);
    expect(canBackfill('2026-10-13', today, { startedOn: '2026-10-01', archivedAt: archivedAtFor(today) })).toBe(false);
  });

  it('only adds a missing day, never upgrades a kept one', () => {
    expect(canBackfill('2026-10-13', today, null, new Map([['2026-10-13', 'floor']]))).toBe(false);
    expect(canBackfill('2026-10-13', today, null, new Map([['2026-10-12', 'floor']]))).toBe(true);
  });
});

describe('archivedDay', () => {
  it('reads the local day written by archivedAtFor, in any time zone', () => {
    const stored = archivedAtFor('2026-10-12');
    expect(stored).toBe('2026-10-12T00:00:00.000Z');
    expect(archivedDay(stored, 'America/New_York')).toBe('2026-10-12');
    expect(archivedDay(stored, 'Asia/Tokyo')).toBe('2026-10-12');
  });

  it('reads the same day back the way Postgres writes it', () => {
    expect(archivedDay('2026-10-12T00:00:00+00:00', 'America/Los_Angeles')).toBe('2026-10-12');
    expect(archivedDay('2026-10-12T00:00:00Z', 'America/Los_Angeles')).toBe('2026-10-12');
    expect(archivedDay('2026-10-12 00:00:00+00', 'America/Los_Angeles')).toBe('2026-10-12');
  });

  it('converts older rows, which hold the real moment, with the time zone', () => {
    // 23:30 on Monday in New York is already Tuesday in London.
    expect(archivedDay('2026-10-13T03:30:00.000Z', 'America/New_York')).toBe('2026-10-12');
    expect(archivedDay('2026-10-13T03:30:00+00:00', 'Europe/London')).toBe('2026-10-13');
  });
});
