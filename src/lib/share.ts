import type { Suit } from '@/engine/cards';
import type { FaceInfo } from '@/engine/court';
import type { Week } from '@/engine/game';

/**
 * Sharing a hand or a face card as an image. Stub: workstream E builds it.
 */
export type ShareTarget =
  | { kind: 'hand'; week: Week; names?: boolean }
  | { kind: 'face'; suit: Suit; face: FaceInfo; identities: string[]; days: number };

export async function share(_target: ShareTarget): Promise<void> {}
