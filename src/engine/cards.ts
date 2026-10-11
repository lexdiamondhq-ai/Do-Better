/**
 * The playing cards behind the game. Every day you keep a habit is dealt as one card. Its suit is the
 * part of you the habit builds and its rank says how good the day was. A week of cards makes a poker hand.
 */

/** The four parts of a person. Every habit belongs to one, and every card carries the suits of the habits behind it. */
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export type SuitInfo = {
  glyph: string;
  /** The card name: "Spades". */
  name: string;
  /** The part of you it stands for: "Body". */
  part: string;
  /** One line on what belongs in it. */
  about: string;
};

export const SUIT_INFO: Record<Suit, SuitInfo> = {
  spades: { glyph: '♠', name: 'Spades', part: 'Body', about: 'Moving, strength, food and sleep. Looking after the body you live in.' },
  hearts: { glyph: '♥', name: 'Hearts', part: 'Heart', about: 'Family, friends, kindness and gratitude. The people you show up for.' },
  diamonds: { glyph: '♦', name: 'Diamonds', part: 'Craft', about: 'Work, focus, money and making things. What you build.' },
  clubs: { glyph: '♣', name: 'Clubs', part: 'Mind', about: 'Reading, learning, calm and reflection. How you grow.' },
};

export function isSuit(value: unknown): value is Suit {
  return typeof value === 'string' && (SUITS as readonly string[]).includes(value);
}

/** 2 to 14, where 11 is a Jack and 14 an Ace. Aces also play low in a 5-4-3-2-A straight. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const LABEL: Record<Rank, string> = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const NAME: Record<Rank, string> = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const PLURAL: Record<Rank, string> = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };

/** The corner index: "10", "J", "A". */
export const rankLabel = (r: Rank) => LABEL[r];
/** "King". */
export const rankName = (r: Rank) => NAME[r];
/** "Kings". */
export const rankPlural = (r: Rank) => PLURAL[r];

export function isRank(n: number): n is Rank {
  return Number.isInteger(n) && n >= 2 && n <= 14;
}

/** A card in a hand: one rank and one suit. */
export type Card = { rank: Rank; suit: Suit };

/** "King of Clubs", for screen readers and captions. */
export function cardName(c: Card): string {
  return `${rankName(c.rank)} of ${SUIT_INFO[c.suit].name}`;
}

/** "K♣". */
export function cardShort(c: Card): string {
  return `${rankLabel(c.rank)}${SUIT_INFO[c.suit].glyph}`;
}
