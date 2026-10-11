import { describe, expect, it } from 'vitest';

import { identityKey, identityLevel, levelProgress, summarizeIdentities, votesToNextLevel } from './identity';
import type { Level } from './kept';

describe('identityLevel', () => {
  it('moves through the levels by total votes', () => {
    expect(identityLevel(0).key).toBe('trying');
    expect(identityLevel(10).key).toBe('showing');
    expect(identityLevel(99).key).toBe('becoming');
    expect(identityLevel(100).key).toBe('am');
  });

  it('says how far the next level is', () => {
    expect(votesToNextLevel(4)).toEqual({ next: expect.objectContaining({ key: 'showing' }), needed: 6 });
    expect(votesToNextLevel(150)).toBeNull();
  });

  it('measures progress inside a level, starting again from empty at each new level', () => {
    expect(levelProgress(0)).toBe(0);
    expect(levelProgress(5)).toBe(0.5);
    expect(levelProgress(10)).toBe(0);
    expect(levelProgress(65)).toBe(0.5);
    expect(levelProgress(100)).toBe(1);
    expect(levelProgress(365)).toBe(1);
  });
});

describe('identityKey', () => {
  it('treats spacing, case and a leading "I am" as the same identity', () => {
    expect(identityKey('I am a Reader ')).toBe(identityKey('a reader'));
  });
});

describe('summarizeIdentities', () => {
  it('pools votes across habits that share an identity, Floors counting fully', () => {
    const checkIns = new Map<string, Map<string, Level>>([
      ['read', new Map([['2026-10-09', 'floor'], ['2026-10-10', 'ceiling']])],
      ['library', new Map([['2026-10-10', 'floor']])],
      ['walk', new Map([['2026-08-01', 'floor']])],
    ]);
    const result = summarizeIdentities(
      [
        { id: 'read', identity: 'a reader', startedOn: '2026-10-01' },
        { id: 'library', identity: 'A reader', startedOn: '2026-10-01' },
        { id: 'walk', identity: 'someone who moves', startedOn: '2026-08-01' },
        { id: 'plain', identity: null, startedOn: '2026-10-01' },
      ],
      checkIns,
      '2026-10-10',
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ identity: 'a reader', votes: 3, ceilingVotes: 1, last30: 3, habitIds: ['read', 'library'] });
    expect(result[1]).toMatchObject({ votes: 1, last30: 0 });
  });
});
