import type { ReactNode } from 'react';

/**
 * The wear on a card face: soft corners, a crease, the thumb mark, a gilt edge, an Heirloom's foil suit.
 * It fills the card (absolute fill, no touches) and sits right after the suit watermark. On the dark
 * Comeback side (`dark`) it shows scuffs and gilt only. `depth` is the card's place in the deck (0 is the front):
 * the front card and the one behind it draw full wear, cards further back draw corners only.
 *
 * Stream 4 draws it. Until then it draws nothing.
 */
export function CardWear(p: { habitId: string; kept: number; dark?: boolean; depth?: number }): ReactNode {
  return null;
}
