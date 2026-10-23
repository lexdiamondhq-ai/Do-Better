import { describe, expect, it } from 'vitest';

import { CARD_ASPECT_H, capLine, LEAVE_CAPS, LEAVE_FORMATS, leaveLines, LOCK_CLEAR, lockCardBox, type LeaveHabit } from './leave';

const read: LeaveHabit = { name: 'Read', anchor: 'After getting into bed', whenWhere: null, floorLabel: 'Read one page', twoMinuteLabel: 'Open the book', identity: 'a reader' };

describe('the words a card carries off the phone', () => {
  it('says what to do and when, in the card’s own words', () => {
    expect(leaveLines(read)).toEqual({
      name: 'Read',
      plays: 'Plays after getting into bed',
      floor: '↓ Floor · Read one page',
      firstMove: 'First move · Open the book',
      identity: 'I’m a reader',
      needsMoment: false,
    });
  });

  it('asks for a moment when the card has no When it plays', () => {
    for (const blank of [null, '', '   ']) {
      const lines = leaveLines({ ...read, anchor: blank, whenWhere: blank });
      expect(lines.needsMoment).toBe(true);
      expect(lines.plays).toBeNull();
    }
  });

  it('takes the where on its own, or after the when', () => {
    expect(leaveLines({ ...read, anchor: null, whenWhere: 'On the train' })).toMatchObject({ plays: 'Plays on the train', needsMoment: false });
    expect(leaveLines({ ...read, whenWhere: 'in the big chair' }).plays).toBe('Plays after getting into bed · in the big chair');
    expect(leaveLines({ ...read, anchor: '7 am' }).plays).toBe('Plays at 7 am');
  });

  it('leaves out a First move or an I’m line the card doesn’t have, and never says I’m twice', () => {
    const bare = leaveLines({ ...read, twoMinuteLabel: '  ', identity: null });
    expect(bare.firstMove).toBeNull();
    expect(bare.identity).toBeNull();
    expect(leaveLines({ ...read, identity: 'I’m a reader.' }).identity).toBe('I’m a reader');
    expect(leaveLines({ ...read, identity: "I'm someone who reads" }).identity).toBe('I’m someone who reads');
    expect(leaveLines({ ...read, identity: 'I am calm' }).identity).toBe('I’m calm');
  });

  it('carries nothing won: no chips, no hands, no kept days', () => {
    const lines = leaveLines(read);
    expect(Object.keys(lines).sort()).toEqual(['firstMove', 'floor', 'identity', 'name', 'needsMoment', 'plays']);
    const words = Object.values(lines).filter((v): v is string => typeof v === 'string');
    for (const w of words) expect(w).not.toMatch(/\bchips?\b|\bhands?\b|kept|\d+\s*days?\b|Showdown|Joker/i);
  });

  it('cuts long lines at a word, with an ellipsis, so a printed card never runs off its edge', () => {
    const long: LeaveHabit = {
      name: 'An extraordinarily long habit name that goes on',
      anchor: 'after I have finished putting the children to bed and tidied the kitchen properly',
      whenWhere: null,
      floorLabel: 'Put on my running shoes and step outside the front door for a moment',
      twoMinuteLabel: 'Lay out the shoes by the door the night before so they are waiting',
      identity: 'someone who looks after their body and their mind every single day',
    };
    const lines = leaveLines(long);
    expect(Array.from(lines.name).length).toBeLessThanOrEqual(LEAVE_CAPS.name);
    expect(Array.from(lines.plays!).length).toBeLessThanOrEqual(LEAVE_CAPS.plays);
    expect(Array.from(lines.floor).length).toBeLessThanOrEqual(LEAVE_CAPS.floor + '↓ Floor · '.length);
    expect(Array.from(lines.firstMove!).length).toBeLessThanOrEqual(LEAVE_CAPS.firstMove + 'First move · '.length);
    expect(Array.from(lines.identity!).length).toBeLessThanOrEqual(LEAVE_CAPS.identity + 'I’m '.length);
    for (const v of [lines.name, lines.plays!, lines.floor]) expect(v.endsWith('…')).toBe(true);
    expect(lines.name).toBe('An extraordinarily long…');
  });

  it('tidies spaces and leaves short lines alone', () => {
    expect(capLine('  Read   one page ', 20)).toBe('Read one page');
    expect(capLine('Supercalifragilisticexpialidocious', 10)).toBe('Supercali…');
  });
});

describe('the picture sizes', () => {
  it('prints two playing-card faces side by side, about 63 × 88 mm at 300 dpi', () => {
    expect(LEAVE_FORMATS.print).toEqual({ w: 1500, h: 1050 });
    const face = { w: LEAVE_FORMATS.print.w / 2, h: LEAVE_FORMATS.print.h };
    expect((face.w / 300) * 25.4).toBeCloseTo(63.5, 0);
    expect((face.h / 300) * 25.4).toBeCloseTo(88.9, 0);
  });

  it('fills a modern iPhone lock screen', () => {
    expect(LEAVE_FORMATS.lock).toEqual({ w: 1170, h: 2532 });
  });

  it('keeps the clock’s part of the lock screen clear and the card clear of the buttons at its foot', () => {
    for (const [w, h] of [[360, 779], [1170, 2532], [300, 649]] as const) {
      const box = lockCardBox(w, h);
      expect(box.y).toBeGreaterThanOrEqual(h * LOCK_CLEAR);
      expect(box.y + box.h).toBeLessThanOrEqual(h * 0.88 + 0.01);
      expect(box.x).toBeGreaterThan(0);
      expect(box.h / box.w).toBeCloseTo(CARD_ASPECT_H);
    }
  });
});
