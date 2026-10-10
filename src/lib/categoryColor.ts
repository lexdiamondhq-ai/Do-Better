import type { Category } from '@/engine/playbook';
import type { CardColor } from '@/theme/tokens';

/** The card colour a Playbook recipe gets by default, by category. */
export const CATEGORY_COLOR: Record<Category, CardColor> = { body: 'tomato', mind: 'lilac', focus: 'sky', connection: 'rose', money: 'pine', rest: 'lilac', growth: 'sun' };
