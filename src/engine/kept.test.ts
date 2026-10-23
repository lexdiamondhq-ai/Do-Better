import { describe, expect, it } from 'vitest';

import { best30, bounceBacks, calendarWeeks, ceilingDayCount, comebackAnswer, comebacksWithin, daysAway, dayStatus, indexCheckIns, keptBetween, keptDayCount, masteryOf, neverTwiceDay, recentDays, summarizeWindow, totals, type Level } from './kept';
import { addDays, weekday, weekStart } from './day';
import { dealWeek } from './deal';

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

  it('treats an unkept first day as before the habit, like the deal does', () => {
    expect(dayStatus('2026-10-12', '2026-10-12', '2026-10-13', new Map())).toBe('before');
    expect(dayStatus('2026-10-12', '2026-10-12', '2026-10-12', new Map())).toBe('open');
    expect(dayStatus('2026-10-12', '2026-10-12', '2026-10-13', days({ '2026-10-12': 'floor' }))).toBe('floor');
    expect(dayStatus('2026-10-13', '2026-10-12', '2026-10-14', new Map())).toBe('missed');
  });

  it('agrees with the deal about the day a card was made', () => {
    // Made on Monday the 12th, nothing kept: Monday is outside the game in both, Tuesday is open today.
    const habit = { id: 'a', suit: 'clubs' as const, startedOn: '2026-10-12', archivedOn: null };
    const slots = dealWeek(weekStart('2026-10-13'), '2026-10-13', [habit], new Map(), 'seed');
    expect(slots[0].state).toBe('before');
    expect(dayStatus('2026-10-12', habit.startedOn, '2026-10-13', new Map())).toBe('before');
    const summary = summarizeWindow('2026-10-13', 30, habit.startedOn, new Map());
    expect(summary).toEqual({ daysInWindow: 1, keptDays: 0, ceilingDays: 0, missedDays: 0 });
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
    // Started the 6th and not kept that day, so the window runs from the 7th.
    expect(summarizeWindow('2026-10-10', 30, '2026-10-06', checkIns)).toEqual({ daysInWindow: 4, keptDays: 2, ceilingDays: 1, missedDays: 2 });
    expect(summarizeWindow('2026-10-10', 30, '2026-10-06', days({ '2026-10-06': 'floor' }))).toEqual({ daysInWindow: 5, keptDays: 1, ceilingDays: 0, missedDays: 3 });
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

describe('keptDayCount', () => {
  it('counts calendar days with any habit kept, once each, up to the given day', () => {
    const a = days({ '2026-10-08': 'floor', '2026-10-09': 'ceiling', '2026-10-11': 'floor' });
    const b = days({ '2026-10-09': 'floor', '2026-10-10': 'ceiling' });
    expect(keptDayCount([a, b], '2026-10-10')).toBe(3);
    expect(keptDayCount([], '2026-10-10')).toBe(0);
  });
});

describe('ceilingDayCount', () => {
  it('counts calendar days with any Ceiling, once each, up to the given day', () => {
    const a = days({ '2026-10-08': 'ceiling', '2026-10-09': 'ceiling', '2026-10-11': 'ceiling' });
    const b = days({ '2026-10-09': 'ceiling', '2026-10-10': 'floor' });
    // Two habits' Ceilings on the 9th make one Ceiling day; the 11th is after the day asked about.
    expect(ceilingDayCount([a, b], '2026-10-10')).toBe(2);
    expect(ceilingDayCount([a, b], '2026-10-11')).toBe(3);
    expect(ceilingDayCount([], '2026-10-10')).toBe(0);
  });

  it('is never more than the kept days, whatever the deck', () => {
    const levels: Level[] = ['floor', 'ceiling'];
    for (let seed = 1; seed <= 40; seed++) {
      const deck = Array.from({ length: 1 + (seed % 4) }, (_, h) => {
        const m = new Map<string, Level>();
        for (let i = 0; i < 60; i++) if ((seed * 7 + h * 13 + i * 5) % 3 !== 0) m.set(addDays('2026-08-01', i), levels[(seed + h + i) % 2]);
        return m;
      });
      const upTo = addDays('2026-08-01', 20 + seed);
      expect(ceilingDayCount(deck, upTo)).toBeLessThanOrEqual(keptDayCount(deck, upTo));
    }
  });
});

describe('comebacksWithin', () => {
  it('counts kept days straight after a miss, inside the window', () => {
    // Started the 1st. Missed the 2nd (back the 3rd), missed the 4th and 5th (back the 6th), missed the 20th (back today, the 21st).
    const checkIns = days({ '2026-10-01': 'floor', '2026-10-03': 'floor', '2026-10-06': 'ceiling', ...Object.fromEntries(Array.from({ length: 13 }, (_, i) => [addDays('2026-10-07', i), 'floor' as Level])), '2026-10-21': 'floor' });
    expect(comebacksWithin('2026-10-01', '2026-10-21', checkIns)).toBe(3);
    expect(comebacksWithin('2026-10-01', '2026-10-21', checkIns, 30)).toBe(bounceBacks('2026-10-01', '2026-10-21', checkIns));
    // A 10-day window reaches back to the 12th: only today's comeback is in it.
    expect(comebacksWithin('2026-10-01', '2026-10-21', checkIns, 10)).toBe(1);
  });

  it('never counts a first day that wasn’t kept, or today before it is kept', () => {
    expect(comebacksWithin('2026-10-12', '2026-10-13', days({ '2026-10-13': 'floor' }))).toBe(0);
    expect(comebacksWithin('2026-10-01', '2026-10-05', days({ '2026-10-01': 'floor', '2026-10-02': 'floor', '2026-10-03': 'floor' }))).toBe(0);
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

  it('never greets a new card with a Comeback on day 2', () => {
    expect(neverTwiceDay('2026-10-12', '2026-10-13', new Map())).toBeNull();
  });
});

describe('bounceBacks', () => {
  it('counts each miss that was followed by a kept day', () => {
    // started 1st: kept 1, miss 2, kept 3, miss 4, miss 5, kept 6
    const checkIns = days({ '2026-10-01': 'floor', '2026-10-03': 'floor', '2026-10-06': 'ceiling' });
    expect(bounceBacks('2026-10-01', '2026-10-06', checkIns)).toBe(2);
  });

  it('skips an unkept first day: it was never a miss', () => {
    expect(bounceBacks('2026-10-12', '2026-10-13', days({ '2026-10-13': 'floor' }))).toBe(0);
    expect(bounceBacks('2026-10-12', '2026-10-15', days({ '2026-10-13': 'floor', '2026-10-15': 'floor' }))).toBe(1);
  });
});

describe('daysAway', () => {
  const deck = (...habits: Record<string, Level>[]) => habits.map(days);

  it('is zero once anything is kept today, or when yesterday was kept', () => {
    expect(daysAway(deck({ '2026-10-16': 'floor' }, { '2026-10-01': 'floor' }), '2026-10-16', '2026-09-01')).toBe(0);
    expect(daysAway(deck({ '2026-10-15': 'floor' }), '2026-10-16', '2026-09-01')).toBe(0);
  });

  it('counts the whole days since the last day anything was kept, on any card', () => {
    expect(daysAway(deck({ '2026-10-10': 'floor' }, { '2026-10-12': 'ceiling' }), '2026-10-16', '2026-09-01')).toBe(3);
    expect(daysAway(deck({ '2026-10-02': 'floor' }), '2026-10-16', '2026-09-01')).toBe(13);
  });

  it('counts from the day after the first card started when nothing was ever kept', () => {
    expect(daysAway(deck({}), '2026-10-16', '2026-10-12')).toBe(3);
    expect(daysAway(deck({}), '2026-10-13', '2026-10-12')).toBe(0);
    expect(daysAway([], '2026-10-16', null)).toBe(0);
  });

  it('ignores days after today, such as rows from a phone in another time zone', () => {
    expect(daysAway(deck({ '2026-10-10': 'floor', '2026-10-17': 'floor' }), '2026-10-16', '2026-09-01')).toBe(5);
  });
});

describe('masteryOf', () => {
  const run = (end: string, n: number, level: (i: number) => Level | null) => {
    const m = new Map<string, Level>();
    for (let i = 0; i < n; i++) {
      const l = level(i);
      if (l) m.set(addDays(end, -i), l);
    }
    return m;
  };

  it('needs 27 of the last 30 days kept and 15 of them at the Ceiling', () => {
    const today = '2026-10-16';
    // Yesterday back 30 days: 3 missed, 15 Ceilings.
    const yes = run(addDays(today, -1), 30, (i) => (i % 10 === 9 ? null : i < 16 ? 'ceiling' : 'floor'));
    expect(masteryOf(yes, today)).toEqual({ mastered: true, kept: 27, ceilings: 15 });
    const fewCeilings = run(addDays(today, -1), 30, (i) => (i % 10 === 9 ? null : i < 15 ? 'ceiling' : 'floor'));
    expect(masteryOf(fewCeilings, today).mastered).toBe(false);
    const fourMissed = run(addDays(today, -1), 30, (i) => (i % 7 === 6 ? null : 'ceiling'));
    expect(masteryOf(fourMissed, today).mastered).toBe(false);
  });

  it('keeps a card mastered in the morning, before today is kept', () => {
    const today = '2026-10-16';
    // Kept the last 27 days up to yesterday; the window ending today would drop the oldest kept day.
    const m = run(addDays(today, -1), 27, () => 'ceiling');
    expect(masteryOf(m, today).mastered).toBe(true);
  });

  it('counts today once it is kept', () => {
    const today = '2026-10-16';
    const m = run(addDays(today, -1), 26, () => 'ceiling');
    expect(masteryOf(m, today).mastered).toBe(false);
    m.set(today, 'floor');
    expect(masteryOf(m, today)).toEqual({ mastered: true, kept: 27, ceilings: 26 });
  });

  it('a brand-new card is never mastered', () => {
    expect(masteryOf(days({ '2026-10-16': 'ceiling' }), '2026-10-16').mastered).toBe(false);
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

describe('keptBetween', () => {
  it('counts kept days inside the range, both ends included', () => {
    const m = days({ '2026-10-11': 'floor', '2026-10-12': 'ceiling', '2026-10-14': 'floor', '2026-10-16': 'floor', '2026-10-17': 'floor' });
    expect(keptBetween(m, '2026-10-12', '2026-10-16')).toBe(3);
    expect(keptBetween(m, '2026-10-13', '2026-10-13')).toBe(0);
  });
});

describe('calendarWeeks', () => {
  const today = '2026-10-16'; // a Friday
  const started = '2026-09-01';
  const kept = days({ '2026-10-15': 'ceiling', '2026-10-14': 'floor', '2026-09-17': 'floor', '2026-09-16': 'floor' });

  it('lays the last 30 days out in whole Monday-to-Sunday weeks, ending with this one', () => {
    const weeks = calendarWeeks(today, { days: 30 }, started, kept);
    for (const w of weeks) {
      expect(w).toHaveLength(7);
      expect(weekday(w[0].day)).toBe(0);
    }
    const flat = weeks.flat();
    expect(weeks.at(-1)!.some((c) => c.day === today)).toBe(true);
    expect(flat.filter((c) => c.status !== 'outside' && c.status !== 'later')).toHaveLength(30);
    expect(flat.filter((c) => c.status === 'later').map((c) => c.day)).toEqual(['2026-10-17', '2026-10-18']);
    expect(flat.find((c) => c.day === addDays(today, -29))!.status).not.toBe('outside');
    expect(flat.find((c) => c.day === addDays(today, -30))?.status ?? 'outside').toBe('outside');
    expect(flat.find((c) => c.day === '2026-10-15')!.status).toBe('ceiling');
    expect(flat.find((c) => c.day === today)!.status).toBe('open');
  });

  it('gives twelve full weeks with the newest last, and leaves days before the habit blank', () => {
    const weeks = calendarWeeks(today, { weeks: 12 }, '2026-09-16', kept);
    expect(weeks).toHaveLength(12);
    expect(weeks[0][0].day).toBe(addDays(weekStart(today), -77));
    expect(weeks.flat().some((c) => c.status === 'outside')).toBe(false);
    expect(weeks.flat().find((c) => c.day === '2026-09-15')!.status).toBe('before');
    expect(weeks.flat().find((c) => c.day === '2026-09-16')!.status).toBe('floor');
  });

  it('starts a 30-day view on a Monday when the window does', () => {
    const monday = '2026-10-12';
    const weeks = calendarWeeks(addDays(monday, 29), { days: 30 }, started, kept);
    expect(weeks[0][0]).toEqual({ day: monday, status: dayStatus(monday, started, addDays(monday, 29), kept) });
  });
});

describe('comebackAnswer', () => {
  const today = '2026-10-14';
  const yesterday = '2026-10-13';
  it('answers a waiting Comeback with the Floor for any keep today, wherever it happens', () => {
    expect(comebackAnswer(yesterday, today, today)).toEqual({ missedDay: yesterday, response: 'floor_only' });
  });

  it('answers with the first move only when that was all that was done', () => {
    expect(comebackAnswer(yesterday, today, today, true)).toEqual({ missedDay: yesterday, response: 'two_minute' });
  });

  it('says nothing when no Comeback is waiting or the keep is a late log for yesterday', () => {
    expect(comebackAnswer(null, today, today)).toBeNull();
    expect(comebackAnswer(yesterday, yesterday, today)).toBeNull();
  });
});
