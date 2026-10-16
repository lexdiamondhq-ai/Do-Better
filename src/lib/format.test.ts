import { describe, expect, it } from 'vitest';

import { monthDay, shortDay } from './format';

describe('dates on screen', () => {
  it('give the year only when it is not this year', () => {
    expect(monthDay('2026-08-03', '2026-10-16')).not.toMatch(/2026/);
    expect(monthDay('2026-08-03', '2026-10-16')).toMatch(/3/);
    expect(monthDay('2025-08-03', '2026-10-16')).toMatch(/2025/);
  });

  it('read a calendar day as that day, wherever the phone is', () => {
    // Formatting starts from local midnight, so the 13th never turns into the 12th west of UTC.
    expect(shortDay('2026-10-13')).toMatch(/13/);
    expect(shortDay('2026-10-13')).not.toMatch(/12/);
  });
});
