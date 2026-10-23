import { describe, expect, it } from 'vitest';

import { atLocal, clockMinutes, cuesFor, DAILY_CAP, isQuiet, lastCallAt, MAX_CUES, MORNING_COPY, previewLastCall, type Cue, type CueHabit, type CueSettings, type CueSnapshot } from './cues';
import { addDays, daysBetween, weekday } from './day';

// 2026-10-12 is a Monday.
const MON = '2026-10-12';
const WED = '2026-10-14';
const SUN = '2026-10-18';
const NEXT_MON = '2026-10-19';

const walk: CueHabit = { id: 'walk', name: 'Walk', floor: 'Walk to the corner', firstMove: 'Put on my shoes', startedOn: '2026-09-01', part: 'evening', keptToday: false, remindAt: null };
const read: CueHabit = { id: 'read', name: 'Read', floor: 'Read one page', firstMove: null, startedOn: '2026-09-01', part: 'any', keptToday: false, remindAt: null };

const snap = (over: Partial<CueSnapshot> = {}): CueSnapshot => ({
  today: WED,
  habits: [walk, read],
  rescue: false,
  callWaiting: false,
  warmup: false,
  handThisWeek: true,
  showdownWaiting: null,
  faceSoon: null,
  ...over,
});
const settings: CueSettings = { lastCall: '20:30', morning: true };
const at = (day: string, clock: string) => new Date(`${day}T${clock}:00Z`);
const plan = (s: Partial<CueSnapshot> = {}, now = at(s.today ?? WED, '07:00'), set: Partial<CueSettings> = {}) => cuesFor(snap(s), { ...settings, ...set }, now, 'UTC');
const appChosen = (cues: Cue[]) => cues.filter((c) => c.kind !== 'plays');
const onDay = (cues: Cue[], day: string) => cues.filter((c) => c.day === day);
const utcClock = (c: Cue) => new Date(c.fireAt).toISOString().slice(11, 16);

describe('cuesFor', () => {
  it('plans nothing for an empty deck', () => {
    expect(plan({ habits: [] })).toEqual([]);
  });

  it('never sends more than two of its own cues in a day, whatever the day holds', () => {
    // A Monday with a Showdown waiting, calls open, yesterday unsaved and cards open.
    const cues = plan({ today: MON, showdownWaiting: '2026-10-05', callWaiting: true, rescue: true }, at(MON, '06:00'));
    for (let i = 0; i < 40; i++) expect(appChosen(onDay(cues, addDays(MON, i))).length).toBeLessThanOrEqual(DAILY_CAP);
    expect(appChosen(onDay(cues, MON)).map((c) => c.kind)).toEqual(['showdown', 'last-call']);
  });

  it('keeps quiet between 21:30 and 07:30, pulling a late last call back to 21:30', () => {
    const cues = plan({}, at(WED, '07:00'), { lastCall: '23:15' });
    for (const c of appChosen(cues)) expect(isQuiet(utcClock(c)), `${c.kind} ${utcClock(c)}`).toBe(false);
    expect(cues.find((c) => c.kind === 'last-call')?.at).toBe('21:30');
    expect(lastCallAt('05:00')).toBe('21:30');
    expect(lastCallAt('19:45')).toBe('19:45');
  });

  it('sends the player’s own times exactly, quiet hours and the daily cap aside', () => {
    const early = { ...walk, remindAt: '06:30' };
    const late = { ...read, remindAt: '22:15' };
    const cues = plan({ habits: [early, late], rescue: true }, at(WED, '05:00'));
    const own = cues.filter((c) => c.kind === 'plays');
    expect(own.filter((c) => c.habitId === 'walk').map(utcClock)).toEqual(Array(7).fill('06:30'));
    expect(own.filter((c) => c.habitId === 'read').map(utcClock)).toEqual(Array(7).fill('22:15'));
    expect(onDay(cues, WED).length).toBeGreaterThan(DAILY_CAP);
    expect(own.find((c) => c.habitId === 'walk')).toMatchObject({ title: 'Walk', body: 'First move: put on my shoes.' });
    expect(own.find((c) => c.habitId === 'read')?.body).toBe('Floor: read one page.');
  });

  it('drops a card’s own reminder for today once it is kept', () => {
    const cues = plan({ habits: [{ ...walk, remindAt: '18:00', keptToday: true }, read] });
    expect(cues.filter((c) => c.kind === 'plays').map((c) => c.day)[0]).toBe(addDays(WED, 1));
  });

  it('drops the evening cue once every card is kept, and keeps tomorrow’s', () => {
    const cues = plan({ habits: [{ ...walk, keptToday: true }, { ...read, keptToday: true }] });
    expect(onDay(cues, WED).filter((c) => c.kind === 'last-call')).toEqual([]);
    expect(onDay(cues, addDays(WED, 1)).some((c) => c.kind === 'last-call')).toBe(true);
  });

  it('names the open card when something was already kept today', () => {
    const cues = plan({ habits: [{ ...walk, keptToday: true }, read] });
    expect(onDay(cues, WED).find((c) => c.kind === 'last-call')).toMatchObject({ title: 'Last call for Read', body: 'Read one page still counts tonight.' });
  });

  it('leads with the Floor when nothing is kept yet', () => {
    expect(onDay(plan(), WED).find((c) => c.kind === 'last-call')).toMatchObject({ title: 'Last call for today’s card', body: 'Walk: Walk to the corner still counts.', at: '20:30' });
  });

  it('says the card’s own plan in the last call when it has one, and its Floor when it has none', () => {
    const planned = { ...walk, plan: 'Late night? Open your last chat.' };
    expect(onDay(plan({ habits: [planned, read] }), WED).find((c) => c.kind === 'last-call')).toMatchObject({ title: 'Last call for today’s card', body: 'Late night? Open your last chat. It keeps today.' });
    expect(onDay(plan({ habits: [{ ...walk, plan: null }, read] }), WED).find((c) => c.kind === 'last-call')?.body).toBe('Walk: Walk to the corner still counts.');
    // Something already kept today: the plan still leads.
    const kept = plan({ habits: [{ ...read, keptToday: true }, { ...planned, part: 'evening' }] });
    expect(onDay(kept, WED).find((c) => c.kind === 'last-call')).toMatchObject({ title: 'Last call for Walk', body: 'Late night? Open your last chat. It keeps today.' });
    // Yesterday still to save: the plan follows the two cards line.
    expect(onDay(plan({ habits: [planned, read], rescue: true }), WED).find((c) => c.kind === 'last-call')?.body).toBe('Keep anything tonight and yesterday gets its card too. Late night? Open your last chat. It keeps today.');
    // A plan in the player's own words without a full stop still reads as a sentence.
    expect(previewLastCall([{ ...walk, plan: 'Kids up early? Put on your shoes' }]).body).toBe('Kids up early? Put on your shoes. It keeps today.');
  });

  it('says two cards are at stake when yesterday can still be saved', () => {
    expect(onDay(plan({ rescue: true }), WED).find((c) => c.kind === 'last-call')?.title).toBe('Last call for two cards');
  });

  it('says when a face card is one day away', () => {
    const cues = plan({ faceSoon: { name: 'The Queen of Clubs', habitIds: ['read'] } });
    expect(onDay(cues, WED).find((c) => c.kind === 'last-call')).toMatchObject({ title: 'The Queen of Clubs is one day away', body: 'Read: Read one page still counts.' });
  });

  it('offers the morning after with back-fill first, while yesterday can still get its card', () => {
    const cues = plan({ rescue: true }, at(WED, '06:00'));
    expect(onDay(cues, WED).find((c) => c.kind === 'morning-after')).toMatchObject({ at: '09:00', title: MORNING_COPY.title, body: MORNING_COPY.body });
    expect(MORNING_COPY.title + ' ' + MORNING_COPY.body).toBe('Did it yesterday? Log it. If not, keep anything today and yesterday still gets its card.');
    // Tomorrow morning too, as today is still blank.
    expect(onDay(cues, addDays(WED, 1)).some((c) => c.kind === 'morning-after')).toBe(true);
    // Not once something was kept today, and never when switched off.
    expect(onDay(plan({ habits: [{ ...walk, keptToday: true }, read] }), addDays(WED, 1)).some((c) => c.kind === 'morning-after')).toBe(false);
    expect(plan({ rescue: true }, at(WED, '06:00'), { morning: false }).some((c) => c.kind === 'morning-after')).toBe(false);
  });

  it('never promises on a Monday morning to save Sunday', () => {
    for (const today of [WED, '2026-10-16', '2026-10-17', SUN]) {
      const cues = plan({ today, rescue: true }, at(today, '06:00'));
      for (const c of cues.filter((c) => weekday(c.day) === 0)) {
        expect(c.kind).not.toBe('morning-after');
        expect(`${c.title} ${c.body}`).not.toMatch(/yesterday/i);
      }
    }
  });

  it('sends Sunday’s cue at 19:00 only while Sunday is open, in place of the last call', () => {
    const open = onDay(plan({ today: SUN }, at(SUN, '10:00')), SUN);
    expect(open.find((c) => c.kind === 'sunday')).toMatchObject({ at: '19:00', title: 'Last card of the week' });
    expect(open.find((c) => c.kind === 'sunday')?.body).toMatch(/^Showdown at midnight\./);
    expect(open.some((c) => c.kind === 'last-call')).toBe(false);

    const kept = onDay(plan({ today: SUN, habits: [{ ...walk, keptToday: true }, read] }, at(SUN, '10:00')), SUN);
    expect(kept.some((c) => c.kind === 'sunday')).toBe(false);
    expect(kept.some((c) => c.kind === 'last-call')).toBe(true);

    expect(plan({ today: SUN, warmup: true }, at(SUN, '10:00')).some((c) => c.kind === 'sunday' && c.day === SUN)).toBe(false);
    // Planned ahead from Wednesday too.
    expect(onDay(plan(), SUN).map((c) => c.kind)).toContain('sunday');
  });

  it('opens next Monday with the Showdown when this week has a hand, otherwise a new week', () => {
    expect(onDay(plan(), NEXT_MON)[0]).toMatchObject({ kind: 'showdown', at: '08:00', title: 'Your Showdown is ready', url: `/showdown?week=${MON}` });
    expect(onDay(plan({ warmup: true }), NEXT_MON)[0]).toMatchObject({ kind: 'new-week', title: 'A new week. One card starts it.', url: '/' });
    expect(onDay(plan({ handThisWeek: false }), NEXT_MON)[0].kind).toBe('new-week');
  });

  it('reminds about a Showdown still waiting on a Monday morning', () => {
    const cues = plan({ today: MON, showdownWaiting: '2026-10-05' }, at(MON, '06:30'));
    expect(onDay(cues, MON)[0]).toMatchObject({ kind: 'showdown', url: '/showdown?week=2026-10-05' });
    expect(plan({ today: MON, showdownWaiting: '2026-10-05' }, at(MON, '09:00')).some((c) => c.kind === 'showdown' && c.day === MON)).toBe(false);
  });

  it('after a week without the app, only Monday mornings, four of them', () => {
    const cues = plan();
    const later = cues.filter((c) => daysBetween(WED, c.day) >= 7);
    expect(later.length).toBeGreaterThan(0);
    for (const c of later) {
      expect(weekday(c.day)).toBe(0);
      expect(['new-week', 'showdown']).toContain(c.kind);
    }
    const mondays = cues.filter((c) => c.kind === 'new-week' || c.kind === 'showdown');
    expect(mondays.map((c) => c.day)).toEqual([NEXT_MON, '2026-10-26', '2026-11-02', '2026-11-09']);
    expect(mondays[1].body).toBe('Read: read one page.');
    expect(mondays[2].body).toBe('Walk: put on my shoes.');
  });

  it('asks less the longer the app stays closed', () => {
    const cues = plan({ rescue: true }, at(WED, '06:00'));
    for (let i = 3; i < 7; i++) {
      const day = appChosen(onDay(cues, addDays(WED, i)));
      expect(day.length).toBeLessThanOrEqual(1);
      expect(day.some((c) => c.kind === 'morning-after')).toBe(false);
    }
  });

  it('never counts missed days, or anything else', () => {
    const snapshots: Partial<CueSnapshot>[] = [{}, { rescue: true }, { today: SUN }, { today: MON, showdownWaiting: '2026-10-05', callWaiting: true }, { faceSoon: { name: 'The Jack of Spades', habitIds: ['walk'] } }];
    for (const s of snapshots) {
      for (const c of plan(s, at(s.today ?? WED, '05:00'))) {
        expect(`${c.title} ${c.body}`, c.id).not.toMatch(/\d|missed|streak|in a row/i);
      }
    }
  });

  it('nudges a call only on Monday or once calls close tonight', () => {
    expect(onDay(plan({ today: MON, callWaiting: true }, at(MON, '07:00')), MON).find((c) => c.kind === 'call')).toMatchObject({ at: '12:00', title: 'Calls are open', url: '/call' });
    expect(plan({ callWaiting: true }).some((c) => c.kind === 'call')).toBe(false);
    expect(plan({ callWaiting: true, habits: [{ ...walk, keptToday: true }, read] }).find((c) => c.kind === 'call')?.title).toBe('Calls close at midnight');
  });

  it('only plans what is still ahead', () => {
    const cues = plan({}, at(WED, '21:00'));
    expect(onDay(cues, WED)).toEqual([]);
    for (const c of cues) expect(c.fireAt).toBeGreaterThan(at(WED, '21:00').getTime());
  });

  it('gives every cue a stable, unique id, in firing order, and stays under the phone’s limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...read, id: `h${i}`, name: `Card ${'abcdefghij'[i]}`, remindAt: '10:00' }));
    const cues = plan({ habits: many });
    expect(cues.length).toBe(MAX_CUES);
    expect(new Set(cues.map((c) => c.id)).size).toBe(cues.length);
    expect([...cues].sort((a, b) => a.fireAt - b.fireAt)).toEqual(cues);
    expect(plan().map((c) => c.id)).toEqual(plan().map((c) => c.id));
  });

  it('keeps all four Mondays ahead even when the player’s own times fill the phone’s limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...read, id: `h${i}`, name: `Card ${'abcdefghij'[i]}`, remindAt: '10:00' }));
    const cues = plan({ habits: many });
    expect(cues.length).toBe(MAX_CUES);
    const mondays = cues.filter((c) => c.kind === 'new-week' || c.kind === 'showdown').map((c) => c.day);
    expect(mondays).toEqual([NEXT_MON, '2026-10-26', '2026-11-02', '2026-11-09']);
  });
});

describe('atLocal', () => {
  it('turns a local time into the right instant, across the clock changes', () => {
    expect(atLocal('2026-10-14', '20:30', 'America/New_York')).toBe(Date.UTC(2026, 9, 15, 0, 30));
    expect(atLocal('2026-11-01', '09:00', 'America/New_York')).toBe(Date.UTC(2026, 10, 1, 14, 0));
    expect(atLocal('2026-03-08', '02:30', 'America/New_York')).toBe(Date.UTC(2026, 2, 8, 7, 30));
    expect(atLocal('2026-10-25', '08:00', 'Europe/London')).toBe(Date.UTC(2026, 9, 25, 8, 0));
    expect(atLocal('2026-10-14', '07:45', 'Asia/Kolkata')).toBe(Date.UTC(2026, 9, 14, 2, 15));
  });

  it('plans a week that crosses a clock change at the same wall time every day', () => {
    const cues = cuesFor(snap({ today: '2026-10-29' }), settings, new Date(Date.UTC(2026, 9, 29, 11)), 'America/New_York');
    const evenings = cues.filter((c) => c.kind === 'last-call');
    const local = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }).format(t);
    expect(evenings.length).toBeGreaterThan(3);
    for (const c of evenings) expect(local(c.fireAt)).toBe('20:30');
  });
});

describe('clock helpers', () => {
  it('read and check times', () => {
    expect(clockMinutes('07:30')).toBe(450);
    expect(clockMinutes('24:00')).toBeNull();
    expect(isQuiet('21:30')).toBe(false);
    expect(isQuiet('21:31')).toBe(true);
    expect(isQuiet('07:29')).toBe(true);
    expect(isQuiet('07:30')).toBe(false);
  });
});

describe('previewLastCall', () => {
  it('matches what the evening cue says with nothing kept', () => {
    const real = onDay(plan(), WED).find((c) => c.kind === 'last-call')!;
    expect(previewLastCall([walk, read])).toEqual({ title: real.title, body: real.body });
    expect(previewLastCall([]).body).toBe('Your Floor still counts.');
  });
});
