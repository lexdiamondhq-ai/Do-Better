import { describe, expect, it } from 'vitest';

import { addDays, daysBetween, localDay } from './day';

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
