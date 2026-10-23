import { useEffect, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import type { Rank } from '@/engine/cards';
import type { Day } from '@/engine/day';
import type { BackKey } from '@/engine/game';
import type { HandKind, PlayedCard } from '@/engine/poker';
import type { Beat } from '@/engine/rhythm';
import { fanOrder, type Stamp } from '@/engine/showdown';
import { useData } from '@/lib/data';
import * as feel from '@/lib/feel';
import { hasSeen, usePrefs } from '@/lib/prefs';
import { useTheme } from '@/theme/ThemeProvider';
import { cardFace, fontScale, fonts, INK, radius, space } from '@/theme/tokens';

import { CardBack } from './CardBack';
import { CARD_SIZES, cardLabel, faceOfPlayed, PlayingCard, StampSeal, stampSpot, type CardFace, type CardHighlight, type CardSize } from './PlayingCard';

/** A made-up hand of each kind, for the Hall of Hands and the call sheet. */
export const EXAMPLES: Record<HandKind, CardFace[]> = {
  'high-card': [c(14, 'spades'), c(11, 'hearts'), c(8, 'clubs'), c(5, 'diamonds'), c(3, 'spades')],
  pair: [c(13, 'hearts'), c(13, 'clubs'), c(9, 'spades'), c(6, 'diamonds'), c(2, 'hearts')],
  'two-pair': [c(12, 'spades'), c(12, 'diamonds'), c(7, 'hearts'), c(7, 'clubs'), c(4, 'spades')],
  'three-of-a-kind': [c(8, 'clubs'), c(8, 'hearts'), c(8, 'diamonds'), c(13, 'spades'), c(3, 'hearts')],
  straight: [c(9, 'diamonds'), c(8, 'spades'), c(7, 'hearts'), c(6, 'clubs'), c(5, 'diamonds')],
  flush: [c(14, 'clubs'), c(11, 'clubs'), c(9, 'clubs'), c(6, 'clubs'), c(3, 'clubs')],
  'full-house': [c(11, 'hearts'), c(11, 'spades'), c(11, 'clubs'), c(4, 'diamonds'), c(4, 'hearts')],
  'four-of-a-kind': [c(9, 'spades'), c(9, 'hearts'), c(9, 'diamonds'), c(9, 'clubs'), c(14, 'spades')],
  'straight-flush': [c(9, 'hearts'), c(8, 'hearts'), c(7, 'hearts'), c(6, 'hearts'), c(5, 'hearts')],
  'royal-flush': [c(14, 'diamonds'), c(13, 'diamonds'), c(12, 'diamonds'), c(11, 'diamonds'), c(10, 'diamonds')],
  'five-of-a-kind': [c(12, 'spades'), c(12, 'hearts'), c(12, 'diamonds'), c(12, 'clubs'), { kind: 'joker', as: { rank: 12, suit: 'spades' } }],
};

function c(rank: Extract<CardFace, { kind: 'card' }>['rank'], suit: Extract<CardFace, { kind: 'card' }>['suit']): CardFace {
  return { kind: 'card', rank, suit };
}

export function playedFaces(cards: readonly PlayedCard[]): CardFace[] {
  return cards.map(faceOfPlayed);
}

/** A card in a fan: a face, or a card still face down (the river before the Showdown). */
export type FanItem = CardFace | { kind: 'back'; back: BackKey };

/**
 * What a fan of played cards can say about each card, by the day it came from: `days` lists each face's
 * day in order, `stamps` the ↓ or ↑ stamped on it and `captions` the line read when it is held.
 */
export type FanNotes = { days?: readonly Day[]; stamps?: Readonly<Record<Day, Stamp>>; captions?: Readonly<Record<Day, string>> };

export type FanSpot = { left: number; top: number; rotate: number };

/** The prefs key of the one-time "Hold a card to read it." under the first fan that can be read. */
export const HOLD_HINT = 'hold-hint';
/** The height the hint takes under a fan, so a screen laying out round it knows where things land. */
export const HOLD_HINT_H = 26;

/** How high a held card rises out of the fan, and how high a card lifts on its beat of the Showdown's rhythm. */
const HOLD_LIFT = 10;
const BEAT_LIFT = 8;
/** Stamps press into the cards one after another, this far apart. */
const STAMP_GAP_MS = 80;

/**
 * Where each card of a fan sits: spread `spread` card widths apart, tilted up to `tilt` degrees at the
 * ends and dropping a little toward them, the way a hand is held. The Showdown flies cards into these
 * same spots, so the fan it lands on and the fan drawn here match exactly.
 */
export function fanLayout(count: number, cardW: number, cardH: number, spread = 0.56, tilt = 9): { width: number; height: number; spots: FanSpot[] } {
  const step = cardW * spread;
  const mid = (count - 1) / 2;
  const drop = cardH * 0.035;
  const spots = Array.from({ length: count }, (_, i) => {
    const off = i - mid;
    return { left: i * step, top: drop * off * off, rotate: mid ? (off / mid) * tilt : 0 };
  });
  return { width: cardW + step * Math.max(0, count - 1), height: cardH + drop * mid * mid + 4, spots };
}

/** The widest card a fan of five can use and still fit `space` points across, never above `max`. */
export function fanCardWidth(space: number, max = 150, spread = 0.55): number {
  return Math.floor(Math.min(max, space / (1 + 4 * spread + 0.05)));
}

/** The rank a fan item plays as: a Joker as the rank it stands for, a card face down as nothing. */
function rankOf(item: FanItem): Rank | null {
  if (item.kind === 'card') return item.rank;
  if (item.kind === 'joker') return item.as?.rank ?? null;
  return null;
}

/** Display order for a fan's items, as indexes: a straight climbs low to high, any other hand keeps its groups first. */
export function fanItemOrder(items: readonly FanItem[]): number[] {
  return fanOrder(items.map(rankOf));
}

type Props = {
  faces: readonly FanItem[];
  size?: CardSize;
  width?: number;
  spread?: number;
  tilt?: number;
  highlight?: CardHighlight;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** The Showdown's rhythm: each beat lifts its card (an index into `faces`) and springs it back. Nothing lifts under Reduce Motion. */
  rhythm?: readonly Beat[];
  /** Stamps press into the cards this many milliseconds after the fan appears, left to right. Left out, they are simply there. */
  stampsAt?: number;
  /**
   * The one-time "Hold a card to read it." under the fan. Left out, the fan shows it if it hasn't been
   * shown before; `true` shows it (the screen has checked), `false` never does. It fades once a card is held.
   */
  hint?: boolean;
} & FanNotes;

/**
 * Cards held in a fan, the way you'd hold a hand at the table. `width` draws each card that many points
 * wide (in the layout of `size`), so a fan can be sized to fit the screen. With `accessibilityLabel`
 * the fan reads as one picture, instead of five card names in a row. A straight always fans low to high.
 *
 * Each card can carry the day it came from (`days`): its ↓ or ↑ stamp, and a caption. With captions,
 * holding a card lifts it out of the fan and reads its caption in a slip under the fan; let go and it
 * drops back. A screen reader hears each card's caption as its name.
 */
export function HandFan(props: Props) {
  const { faces, size = 'md', width, spread = 0.56, tilt = 9, highlight, accessibilityLabel, style, days, stamps, captions, rhythm, stampsAt } = props;
  if (captions || rhythm || stampsAt !== undefined) return <LiveFan {...props} />;
  const base = CARD_SIZES[size];
  const w = width ?? base.w;
  const h = (w * base.h) / base.w;
  const fan = fanLayout(faces.length, w, h, spread, tilt);
  const order = fanItemOrder(faces);
  const grouped = !!accessibilityLabel;
  return (
    <View
      accessible={grouped}
      accessibilityRole={grouped ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[{ width: fan.width, height: fan.height, alignSelf: 'center' }, style]}
    >
      {order.map((o, p) => {
        const face = faces[o];
        const spot = fan.spots[p];
        const at: ViewStyle = { position: 'absolute', left: spot.left, top: spot.top, transform: [{ rotate: `${spot.rotate}deg` }] };
        const day = days?.[o];
        return face.kind === 'back' ? (
          <CardBack key={o} back={face.back} size={size} width={w} style={at} />
        ) : (
          <PlayingCard key={o} face={face} size={size} width={w} highlight={highlight} stamp={day ? stamps?.[day] : undefined} peek={p < faces.length - 1 ? spread : undefined} style={at} />
        );
      })}
    </View>
  );
}

/** A fan that moves: stamps that press in, cards that lift on the Showdown's beats, and cards that can be held and read. */
function LiveFan({ faces, size = 'md', width, spread = 0.56, tilt = 9, highlight, style, days, stamps, captions, rhythm, stampsAt, hint }: Props) {
  const { seed } = useData();
  const { prefs, ready, markSeen } = usePrefs();
  const [held, setHeld] = useState<number | null>(null);
  // Whether this is the first fan to show the hint, decided once so the fan never changes size under you.
  const [firstLook] = useState(() => ready && !hasSeen(prefs, seed, HOLD_HINT));
  const [heldOnce, setHeldOnce] = useState(false);
  const base = CARD_SIZES[size];
  const w = width ?? base.w;
  const h = (w * base.h) / base.w;
  const fan = fanLayout(faces.length, w, h, spread, tilt);
  const order = fanItemOrder(faces);
  const readable = !!captions && Object.keys(captions).length > 0;
  const showHint = readable && (hint ?? firstLook);

  // Shown once is seen: the next fan goes without it.
  useEffect(() => {
    if (showHint) markSeen(seed, HOLD_HINT);
  }, [showHint, markSeen, seed]);
  // Only stamped cards take a turn pressing in, so the stamps land one after another with no gaps.
  const stamped = order.filter((o) => days?.[o] && stamps?.[days[o]]);

  const hold = (p: number) => {
    setHeld(p);
    setHeldOnce(true);
    feel.tick();
  };

  const heldDay = held === null ? undefined : days?.[order[held]];
  const caption = heldDay ? captions?.[heldDay] : undefined;
  const heldMid = held === null ? 0 : fan.spots[held].left + w / 2;

  return (
    <View style={[{ width: fan.width, alignSelf: 'center', zIndex: 3 }, style]}>
      <View style={{ width: fan.width, height: fan.height }}>
        {order.map((o, p) => {
          const face = faces[o];
          const spot = fan.spots[p];
          const day = days?.[o];
          const stamp = day ? stamps?.[day] : undefined;
          const beat = rhythm?.find((b) => b.card === o);
          const turn = stamped.indexOf(o);
          return (
            <FanCard
              key={o}
              face={face}
              size={size}
              w={w}
              h={h}
              spot={spot}
              z={held === p ? 50 : p}
              highlight={highlight}
              stamp={stamp}
              peek={p < faces.length - 1 && held !== p ? spread : undefined}
              caption={day ? captions?.[day] : undefined}
              beatAt={beat ? beat.at : null}
              stampAt={stampsAt !== undefined && turn >= 0 ? stampsAt + turn * STAMP_GAP_MS : null}
              onHold={() => hold(p)}
              onRelease={() => setHeld(null)}
            />
          );
        })}
      </View>
      {caption ? <Slip text={caption} mid={heldMid} width={fan.width} top={fan.height + 6} /> : null}
      {showHint ? <HoldHint gone={heldOnce} /> : null}
    </View>
  );
}

function FanCard({
  face,
  size,
  w,
  h,
  spot,
  z,
  highlight,
  stamp,
  peek,
  caption,
  beatAt,
  stampAt,
  onHold,
  onRelease,
}: {
  face: FanItem;
  size: CardSize;
  w: number;
  h: number;
  spot: FanSpot;
  z: number;
  highlight?: CardHighlight;
  stamp?: Stamp;
  peek?: number;
  caption?: string;
  beatAt: number | null;
  stampAt: number | null;
  onHold: () => void;
  onRelease: () => void;
}) {
  const reduced = useReducedMotion();
  const beat = useSharedValue(0);
  const lift = useSharedValue(0);
  const press = useSharedValue(stampAt === null || reduced ? 1 : 0);

  // The card's beat of the Showdown's rhythm: up sharply, then a springy drop back into the fan.
  useEffect(() => {
    if (beatAt === null || reduced) return;
    beat.set(withDelay(beatAt, withSequence(withTiming(-BEAT_LIFT, { duration: 70, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9, stiffness: 280, mass: 0.6 }))));
  }, [beat, beatAt, reduced]);

  // The stamp comes down from above the card and lands with a little squash, like ink on a rubber stamp.
  useEffect(() => {
    if (stampAt === null || reduced) press.set(1);
    else press.set(withDelay(stampAt, withSpring(1, { damping: 11, stiffness: 340, mass: 0.6 })));
  }, [press, stampAt, reduced]);

  const placed = useAnimatedStyle(() => ({ transform: [{ translateY: beat.get() + lift.get() }, { rotate: `${spot.rotate}deg` }] }));
  const inked = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, press.get()) * 2.5), transform: [{ scale: 2.4 - 1.4 * press.get() }] }));

  const at: ViewStyle = { position: 'absolute', left: spot.left, top: spot.top, width: w, height: h, zIndex: z };
  if (face.kind === 'back') {
    return (
      <Animated.View style={[at, placed]}>
        <CardBack back={face.back} size={size} width={w} />
      </Animated.View>
    );
  }
  const seal = stamp ? stampSpot(size, w) : null;
  const card = (
    <>
      <PlayingCard face={face} size={size} width={w} highlight={highlight} peek={peek} accessibilityLabel={caption ?? cardLabel(face, highlight, stamp)} />
      {seal && stamp ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: seal.x - seal.r, top: seal.y - seal.r }, inked]}>
          <StampSeal stamp={stamp} r={seal.r} onInk={face.kind === 'joker'} />
        </Animated.View>
      ) : null}
    </>
  );
  return (
    <Animated.View style={[at, placed]}>
      {caption ? (
        <Pressable
          // The card inside is what a screen reader reads, by its caption; this only takes the hold.
          accessible={false}
          accessibilityRole="none"
          onLongPress={() => {
            lift.set(withSpring(-HOLD_LIFT, { damping: 14, stiffness: 260 }));
            onHold();
          }}
          onPressOut={() => {
            lift.set(withSpring(0, { damping: 14, stiffness: 260 }));
            onRelease();
          }}
          delayLongPress={260}
          style={{ width: w, height: h }}
        >
          {card}
        </Pressable>
      ) : (
        card
      )}
    </Animated.View>
  );
}

/** The held card's caption, on a slip of card stock under the fan, with a notch pointing up at the card. */
function Slip({ text, mid, width, top }: { text: string; mid: number; width: number; top: number }) {
  const show = useSharedValue(0);
  useEffect(() => {
    show.set(withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) }));
  }, [show]);
  const style = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ translateY: (1 - show.get()) * -6 }] }));
  const outer = 12;
  const notch = Math.max(18, Math.min(width + outer * 2 - 18, mid + outer));
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[{ position: 'absolute', top, left: -outer, right: -outer, zIndex: 60 }, style]}>
      <View style={{ position: 'absolute', top: -6, left: notch - 7, width: 14, height: 14, backgroundColor: cardFace.bg, transform: [{ rotate: '45deg' }], borderRadius: 2 }} />
      <View style={{ backgroundColor: cardFace.bg, borderRadius: radius.md, paddingVertical: space.sm + 2, paddingHorizontal: space.lg, boxShadow: '0px 10px 28px rgba(0, 0, 0, 0.35)' }}>
        <Text maxFontSizeMultiplier={fontScale.chrome} style={{ fontFamily: fonts.bodyHeavy, fontSize: 15, lineHeight: 21, color: INK, textAlign: 'center' }}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}

function HoldHint({ gone }: { gone: boolean }) {
  const t = useTheme();
  const fade = useSharedValue(1);
  useEffect(() => {
    if (gone) fade.set(withTiming(0, { duration: 300 }));
  }, [fade, gone]);
  const style = useAnimatedStyle(() => ({ opacity: fade.get() }));
  return (
    <Animated.View style={[{ height: HOLD_HINT_H, justifyContent: 'flex-end' }, style]}>
      <Text numberOfLines={1} maxFontSizeMultiplier={fontScale.chrome} style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18, color: t.textSecondary, textAlign: 'center' }}>
        Hold a card to read it.
      </Text>
    </Animated.View>
  );
}

/** Cards in a straight row, overlapping a little, for lists. A straight runs low to high here too. */
export function HandRow({
  faces,
  size = 'xs',
  overlap = 0.18,
  highlight,
  accessibilityLabel,
  days,
  stamps,
  captions,
}: {
  faces: readonly CardFace[];
  size?: CardSize;
  overlap?: number;
  highlight?: boolean | CardHighlight;
  accessibilityLabel?: string;
} & FanNotes) {
  const s = CARD_SIZES[size];
  const order = fanItemOrder(faces);
  // A called hand wears one check, on its last card, rather than five.
  const mark = (p: number) => (highlight === 'called' ? (p === faces.length - 1 ? 'called' : undefined) : highlight);
  const grouped = !!accessibilityLabel;
  return (
    <View accessible={grouped} accessibilityRole={grouped ? 'image' : undefined} accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row' }}>
      {order.map((o, p) => {
        const day = days?.[o];
        return (
          <PlayingCard
            key={o}
            face={faces[o]}
            size={size}
            highlight={mark(p)}
            stamp={day ? stamps?.[day] : undefined}
            // A row's cards can't be held (holding the row shares it), so each card's caption is read as its name.
            accessibilityLabel={day ? captions?.[day] : undefined}
            style={{ marginLeft: p ? -s.w * overlap : 0 }}
          />
        );
      })}
    </View>
  );
}
