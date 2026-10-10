import { describe, expect, it } from 'vitest';

import { best30, bounceBacks, dayStatus, indexCheckIns, neverTwiceDay, recentDays, summarizeWindow, totals, type Level } from './kept';
import { addDays } from './day';

const days = (entries: Record<string, Level>) => new Map(Object.entries(entries));

describe('dayStatus', () => {
  const checkIns = days({ '2026-10-08': 'floor', '2026-10-10': 'ceiling' });
  it('reads kept days, misses, today and days before the start', () => {
    expect(dayStatus('2026-10-08', '2026-10-05', '2026-10-10', checkIns)).toBe('floor');
    expect(dayStatus('2026-10-09', '2026-10-05', '2026-10-10', checkIns)).toBe('missed');
    expect(dayStatus('2026-10-10', '2026-10-05', '2026-10-10', checkIns)).toBe('ceiling');
    expect(dayStatus('2026-10-04', '2026-10-05', '2026-10-10', checkIns)).toBe('before');
  });

  it('never calls today a miss', () => {
    expect(dayStatus('2026-10-10', '2026-10-05', '2026-10-10', new Map())).toBe('open');
  });
});

describe('indexCheckIns', () => {
  it('keeps the last row for a habit and day, so an upgrade to Ceiling wins', () => {
    const index = indexCheckIns([
      { habitId: 'a', day: '2026-10-10', level: 'floor' },
      { habitId: 'a', day: '2026-10-10', level: 'ceiling' },
      { habitId: 'b', day: '2026-10-10', level: 'floor' },
    ]);
    expect(index.get('a')?.get('2026-10-10')).toBe('ceiling');
    expect(index.get('b')?.size).toBe(1);
  });
});

describe('summarizeWindow', () => {
  it('counts only days since the habit started, today included', () => {
    const checkIns = days({ '2026-10-08': 'floor', '2026-10-10': 'ceiling' });
    expect(summarizeWindow('2026-10-10', 30, '2026-10-06', checkIns)).toEqual({ daysInWindow: 5, keptDays: 2, ceilingDays: 1, missedDays: 3 });
  });

  it('returns days oldest first', () => {
    const list = recentDays('2026-10-10', 3, '2026-01-01', new Map());
    expect(list.map((d) => d.day)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10']);
  });
});

describe('totals', () => {
  it('ignores check-ins after the given day', () => {
    const checkIns = days({ '2026-10-08': 'floor', '2026-10-09': 'ceiling', '2026-10-11': 'ceiling' });
    expect(totals(checkIns, '2026-10-10')).toEqual({ kept: 2, ceiling: 1 });
  });
});

describe('neverTwiceDay', () => {
  it('returns yesterday when it was missed and today is not kept yet', () => {
    expect(neverTwiceDay('2026-10-01', '2026-10-10', days({ '2026-10-08': 'floor' }))).toBe('2026-10-09');
  });

  it('stays quiet once today is kept', () => {
    expect(neverTwiceDay('2026-10-01', '2026-10-10', days({ '2026-10-10': 'floor' }))).toBeNull();
  });

  it('stays quiet when yesterday was kept or the habit started today', () => {
    expect(neverTwiceDay('2026-10-01', '2026-10-10', days({ '2026-10-09': 'floor' }))).toBeNull();
    expect(neverTwiceDay('2026-10-10', '2026-10-10', new Map())).toBeNull();
  });
});

describe('bounceBacks', () => {
  it('counts each miss that was followed by a kept day', () => {
    // started 1st: kept 1, miss 2, kept 3, miss 4, miss 5, kept 6
    const checkIns = days({ '2026-10-01': 'floor', '2026-10-03': 'floor', '2026-10-06': 'ceiling' });
    expect(bounceBacks('2026-10-01', '2026-10-06', checkIns)).toBe(2);
  });
});

describe('best30', () => {
  it('needs 30 days of history', () => {
    expect(best30('2026-10-01', '2026-10-20', days({ '2026-10-01': 'floor' }))).toBe(0);
  });

  it('finds the best 30-day stretch', () => {
    const checkIns = new Map<string, Level>();
    for (let i = 0; i < 40; i++) if (i % 4 !== 0) checkIns.set(addDays('2026-09-01', i), 'floor');
    for (let i = 10; i < 40; i++) checkIns.set(addDays('2026-09-01', i), 'floor');
    expect(best30('2026-09-01', addDays('2026-09-01', 39), checkIns)).toBe(30);
  });
});
