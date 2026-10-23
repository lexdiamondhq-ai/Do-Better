import { useId, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BACK_COLORS } from '@/components/CardBack';
import { Chips } from '@/components/Chips';
import { HandFan, playedFaces } from '@/components/HandFan';
import { CardSlot, faceOfCourt, faceOfDay, PlayingCard } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Display, Label } from '@/components/ui';
import { SUIT_INFO, type Suit } from '@/engine/cards';
import { weekday } from '@/engine/day';
import { weekTotal, type BackKey } from '@/engine/game';
import { HANDS } from '@/engine/poker';
import { madeThisLine, stampsFor } from '@/engine/showdown';
import { weekOf } from '@/lib/format';
import { chipText, feltFor, FOOTER, habitLine, handLines, identityPhrase, SHARE_INSET, SHARE_LAYOUT, SHARE_TEXT_WIDTH, stampSize, suitedLine, type HabitLine, type ShareTarget } from '@/lib/share';
import { withAlpha } from '@/theme/color';
import { ThemeScope, useTheme } from '@/theme/ThemeProvider';

const { w: W, h: H } = SHARE_LAYOUT;
const { frame: FRAME, border: BORDER, pad: PAD } = SHARE_INSET;
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** The share card is a picture: its words stay the size they were drawn at, whatever the phone's text size. */
const FIXED = 1;

/**
 * The picture a shared hand or face card becomes: a 9:16 card in the colours of your card back, with the
 * felt inside lit by the suit that led. A hand shows its five cards with their ↓ and ↑ stamps, the stamp,
 * what it paid, what made it, a made call, the Suited line and the week's seven days. Habit names appear
 * only when `target.names` is on.
 *
 * It is laid out at 360 × 640 points and captured at 1080 × 1920 pixels.
 */
export function ShareCard({ target, habits, back, lead = null, cardRef }: { target: ShareTarget; habits?: readonly HabitLine[]; back: BackKey; lead?: Suit | null; cardRef?: Ref<View> }) {
  const base = useTheme();
  const colors = BACK_COLORS[back];
  const felt = feltFor(base, target.kind === 'face' ? target.suit : lead);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View ref={cardRef} collapsable={false} style={{ width: W, height: H, backgroundColor: colors.bg, padding: FRAME }}>
      <View style={{ flex: 1, borderRadius: 22, overflow: 'hidden', backgroundColor: felt.bg, borderWidth: BORDER, borderColor: withAlpha(colors.accent, 0.7) }}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`share${id}`} cx="50%" cy="34%" rx="80%" ry="55%" fx="50%" fy="34%">
              <Stop offset="0" stopColor={felt.glow} stopOpacity={1} />
              <Stop offset="1" stopColor={felt.bg} stopOpacity={1} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#share${id})`} />
        </Svg>
        <ThemeScope theme={felt.theme}>
          {/* A single card ('card') is drawn by its own preview (CardOut), not on this share card. */}
          <View style={{ flex: 1, padding: PAD }}>{target.kind === 'hand' ? <HandSide target={target} habits={habits} /> : target.kind === 'face' ? <FaceSide target={target} /> : null}</View>
        </ThemeScope>
      </View>
    </View>
  );
}

function Top({ right }: { right: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Label maxFontSizeMultiplier={FIXED}>Do Better</Label>
      <Label maxFontSizeMultiplier={FIXED}>{right}</Label>
    </View>
  );
}

function Footer() {
  const t = useTheme();
  const [name, ...rest] = FOOTER.split(' · ');
  return (
    <View style={{ alignItems: 'center', gap: 2, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }}>
      <Body size={13} weight="heavy" maxFontSizeMultiplier={FIXED}>
        {name}
      </Body>
      <Body size={12} weight="bold" color={t.textSecondary} maxFontSizeMultiplier={FIXED}>
        {rest.join(' · ')}
      </Body>
    </View>
  );
}

function HandSide({ target, habits }: { target: Extract<ShareTarget, { kind: 'hand' }>; habits?: readonly HabitLine[] }) {
  const t = useTheme();
  const { week } = target;
  const hand = week.hand;
  if (!hand) return null;
  const lines = handLines(hand);
  const suited = suitedLine(hand);
  const made = week.call && week.madeCall ? HANDS[week.call].name : null;
  const played = new Set(hand.cards.map((c) => (c.river ? 'river' : c.day)));
  const names = target.names && habits?.length ? habits.slice(0, 4) : [];
  const credit = madeThisLine(week);
  return (
    <View style={{ flex: 1, gap: 14 }}>
      <Top right={weekOf(week.start)} />
      <HandFan faces={playedFaces(hand.cards)} days={hand.cards.map((c) => c.day)} stamps={stampsFor(week)} size="md" width={86} spread={0.55} tilt={8} style={{ marginTop: 6 }} />
      <View style={{ alignItems: 'center' }}>
        {/* A picture can't wrap or scroll, so the stamp is sized to fit its line: "Three of a kind" whole, never "Three of a ki…". */}
        <Display size={stampSize(lines.name, SHARE_TEXT_WIDTH, 44)} maxFontSizeMultiplier={FIXED} numberOfLines={1} style={{ textAlign: 'center' }}>
          {lines.name}
        </Display>
        {lines.detail ? (
          <Display size={stampSize(lines.detail, SHARE_TEXT_WIDTH, 20)} color={t.textSecondary} maxFontSizeMultiplier={FIXED} numberOfLines={1} style={{ textAlign: 'center' }}>
            {lines.detail}
          </Display>
        ) : null}
      </View>
      <View style={{ alignItems: 'center' }}>
        <Chips value={weekTotal(week)} size={22} pill sign />
      </View>
      <View style={{ gap: 4, alignItems: 'center' }}>
        {credit ? (
          <Body size={13} weight="heavy" maxFontSizeMultiplier={FIXED} numberOfLines={2} style={{ textAlign: 'center' }}>
            {credit}
          </Body>
        ) : null}
        {made ? (
          <Body size={14} weight="heavy" maxFontSizeMultiplier={FIXED} style={{ textAlign: 'center' }}>
            {`✓ Called ${made} and made it`}
          </Body>
        ) : null}
        {suited && hand.suited ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SuitGlyph suit={hand.suited.suit} size={12} color={t.text} />
            <Body size={13} weight="bold" maxFontSizeMultiplier={FIXED}>
              {suited}
            </Body>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.slots.map((slot) => (
            <View key={slot.day} style={{ alignItems: 'center', gap: 4 }}>
              {slot.card ? (
                <PlayingCard face={faceOfDay(slot.card)} size="xs" width={34} dim={!played.has(slot.day)} />
              ) : (
                <CardSlot size="xs" color={t.dashed} style={{ width: 34, height: 48 }} />
              )}
              <Body size={10} weight="heavy" color={t.textSecondary} maxFontSizeMultiplier={FIXED}>
                {DAYS[weekday(slot.day)]}
              </Body>
            </View>
          ))}
        </View>
        {names.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 2, marginTop: 4 }}>
            {names.map((h) => (
              <Body key={h.name} size={13} weight="bold" maxFontSizeMultiplier={FIXED} numberOfLines={1}>
                {habitLine(h)}
              </Body>
            ))}
          </View>
        ) : null}
      </View>
      <Footer />
    </View>
  );
}

function FaceSide({ target }: { target: Extract<ShareTarget, { kind: 'face' }> }) {
  const t = useTheme();
  const { name, part } = SUIT_INFO[target.suit];
  const who = identityPhrase(target.identities, 'me', 1);
  const title = `${target.face.name} of ${name}`;
  return (
    <View style={{ flex: 1, gap: 16 }}>
      <Top right="The Court" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <PlayingCard face={faceOfCourt(target.suit, target.face)} size="xl" width={176} style={{ transform: [{ rotate: '-3deg' }] }} />
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Display size={stampSize(title, SHARE_TEXT_WIDTH, 34)} maxFontSizeMultiplier={FIXED} numberOfLines={1} style={{ textAlign: 'center' }}>
            {title}
          </Display>
          <Display size={20} color={t.textSecondary} maxFontSizeMultiplier={FIXED} style={{ textAlign: 'center' }}>
            {target.face.title}
          </Display>
        </View>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Body size={15} weight="heavy" maxFontSizeMultiplier={FIXED} style={{ textAlign: 'center' }}>
            {`${chipText(target.days)} ${part} days`}
          </Body>
          {who ? (
            <Body size={15} weight="bold" color={t.textSecondary} maxFontSizeMultiplier={FIXED} numberOfLines={2} style={{ textAlign: 'center' }}>
              {`“${who}.”`}
            </Body>
          ) : null}
        </View>
      </View>
      <Footer />
    </View>
  );
}
