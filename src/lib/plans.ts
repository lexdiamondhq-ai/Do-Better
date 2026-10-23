import { useMemo } from 'react';

import type { Plan } from '@/engine/comeback';

import { useAuth } from './auth';
import { useData } from './data';
import { demoPlans } from './demo';
import { usePrefs } from './prefs';

const NONE: Readonly<Record<string, Plan>> = Object.freeze({});

/**
 * This player's plans, by habit id: Your plan for each card's next Comeback, saved on this phone. In the
 * demo deck, Walk's sample plan (`demoPlans`) fills in for any card without a plan saved here.
 */
export function usePlans(): Readonly<Record<string, Plan>> {
  const { seed, today } = useData();
  const { demo } = useAuth();
  const { prefs } = usePrefs();
  const saved = prefs.plans[seed] ?? NONE;
  const inDemo = !!demo && demo.seed === seed;
  return useMemo(() => (inDemo ? { ...demoPlans(today), ...saved } : saved), [inDemo, today, saved]);
}
