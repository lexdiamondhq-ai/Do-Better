import type { Plan } from '@/engine/comeback';

import { useData } from './data';
import { usePrefs } from './prefs';

const NONE: Readonly<Record<string, Plan>> = Object.freeze({});

/**
 * This player's plans, by habit id: Your plan for each card's next Comeback, saved on this phone. Stream 2
 * fills in the demo's sample plan for any card without a saved one.
 */
export function usePlans(): Readonly<Record<string, Plan>> {
  const { seed } = useData();
  const { prefs } = usePrefs();
  return prefs.plans[seed] ?? NONE;
}
