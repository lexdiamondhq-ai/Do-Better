import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUIT_INFO, SUITS } from '@/engine/cards';
import { FACES, RUNGS } from '@/engine/court';
import { KEPT_LO, RIVER_DAYS, TOP_LO } from '@/engine/deal';
import { CALL_HISTORY } from '@/engine/game';
import { HAND_LADDER, HANDS } from '@/engine/poker';
import { tick } from '@/lib/feel';
import { useTheme } from '@/theme/ThemeProvider';
import { fontScale, radius, space, suitColors, TAP, typeScale } from '@/theme/tokens';

import { ChipIcon, formatChips } from './Chips';
import { EXAMPLES, HandRow } from './HandFan';
import { SuitGlyph } from './Suit';
import { Body, Display, Label } from './ui';

/**
 * The rules, one tap away: every term in a line, in the app's own words. `<RulesButton topic="call"/>`
 * opens the sheet at that section. The words come from the engine's own numbers, so a retuned rule
 * can't leave the sheet behind (RulesSheet.test.ts checks the lines against the engine).
 */
export type RulesTopic = 'deal' | 'week' | 'call' | 'court' | 'comeback' | 'river';

export type Rule = { term: string; line: string };
export type RulesSection = { key: RulesTopic; title: string; chip: string; rules: Rule[] };

const faceDays = FACES.map((f) => `${f.name} at ${f.votes}`);

export const RULES: readonly RulesSection[] = [
  {
    key: 'deal',
    title: 'Every kept day deals a card',
    chip: 'The deal',
    rules: [
      { term: 'Floor', line: 'The least that still counts. Swipe the card down and the day is kept.' },
      { term: 'Ceiling', line: 'What a great day looks like. Swipe the card up.' },
      { term: 'Later', line: 'Swipe sideways and the card goes to the back of today’s deck.' },
      { term: 'Kept day', line: 'Keep at least one habit and the day deals one playing card.' },
      { term: 'Some kept', line: 'The card can be as low as 2, 3 or 4: each habit kept and each Ceiling lifts the lowest it can be.' },
      { term: 'Everything kept', line: `Keep every habit, even at the Floor, and the card is ${KEPT_LO} or better.` },
      { term: 'Everything at its Ceiling', line: `Every habit at its Ceiling deals ${TOP_LO} or better. A few Ceilings don’t lift a fully kept day past ${KEPT_LO}.` },
      { term: 'Up to the Ace', line: 'Every day can deal an Ace. Where the card lands is the luck of the deal, the same on every phone.' },
      { term: 'Suits', line: 'A card carries the suit of every habit you kept that day.' },
      { term: 'Only up', line: 'Keeping more later in the day can raise its card, never lower it.' },
    ],
  },
  {
    key: 'week',
    title: 'Every week plays as a poker hand',
    chip: 'The week',
    rules: [
      { term: 'The hand', line: 'Monday to Sunday, your best five cards make the hand.' },
      { term: 'Showdown', line: 'At Sunday midnight the hand pays chips into your stack. Chips never leave the stack.' },
      { term: 'No Flush', line: 'A day counts in the suit of every habit you kept, so five in one suit come too easily. It isn’t a hand here.' },
      { term: 'Suited', line: 'Five Ceiling days in one suit in a week. It pays nothing: it’s a line about the week, like “Clubs led the week”.' },
      { term: 'Warm-up week', line: 'Start on a Thursday to a Sunday and that first week is a warm-up: its cards deal and count in the Court, with no Showdown and no call.' },
      { term: 'Fresh deck', line: 'Every day deals from a fresh deck, so the same card can turn up twice in a week.' },
    ],
  },
  {
    key: 'river',
    title: 'The river card',
    chip: 'River',
    rules: [
      { term: 'River card', line: `Keep something on ${RIVER_DAYS} days of the week (saved days don’t count) and you earn one more card.` },
      { term: 'Face down', line: 'It has no suit, stays face down all week and turns at the Showdown.' },
    ],
  },
  {
    key: 'call',
    title: 'Call your hand',
    chip: 'Calls',
    rules: [
      { term: 'Call', line: 'Pick the hand you think this week will make. Make it or better and it pays again on top.' },
      { term: 'Safe ×1, Stretch ×2, Long shot ×3', line: `The called hand’s chips once more, twice more or three times more, priced from your last ${CALL_HISTORY} weeks.` },
      { term: 'Sure things', line: 'A hand you make most weeks pays nothing extra, so it isn’t offered.' },
      { term: 'When', line: 'A call stays open until the end of the first day this week you keep something.' },
      { term: 'No risk', line: 'Missing a call costs nothing. Your hand still pays.' },
    ],
  },
  {
    key: 'court',
    title: 'The Court',
    chip: 'Court',
    rules: [
      { term: 'Four suits', line: `Each habit builds one part of you: ${SUITS.map((s) => `${SUIT_INFO[s].glyph} ${SUIT_INFO[s].part}`).join(', ')}.` },
      { term: 'Days', line: 'The Court counts days per suit. A day counts once for a suit, however many of its habits you kept.' },
      { term: 'Face cards', line: `${faceDays.join(', ')} days.` },
      { term: 'Rungs', line: `Between the King and the Ace, rungs at ${RUNGS.slice(0, -1).join(', ')} and ${RUNGS[RUNGS.length - 1]} days mark the climb. They bring no Joker.` },
      { term: 'Kept for good', line: 'Days only add up. A face card, once earned, is never lost.' },
      { term: 'Joker', line: 'Each new face card deals a Joker on your next kept day. It has no suit and plays as any rank.' },
      { term: 'One a week', line: 'At most one Joker lands in a week. Any others wait for the weeks after, so none is ever lost.' },
    ],
  },
  {
    key: 'comeback',
    title: 'Coming back',
    chip: 'Comeback',
    rules: [
      { term: 'Saved day', line: 'Kept nothing yesterday? Keep anything today and yesterday gets a card too. It has no suit and counts for pairs and straights.' },
      { term: 'Two in a row', line: 'Miss two days running and the first of them stays empty.' },
      { term: 'Sunday', line: 'Sunday can’t be saved: the hand pays out at midnight.' },
      { term: 'Did it, forgot to log', line: 'Add yesterday the next day, while it’s still the same week. You can add it, not change it.' },
      { term: 'Comeback', line: 'After a missed day the card offers its First move, the smallest way back in.' },
      { term: 'No streaks', line: 'Nothing here resets to zero. Kept days only add up.' },
    ],
  },
];

/** The hands, weakest first, with what each pays. There is no Flush. */
export const HAND_PRICES = HAND_LADDER.map((kind) => ({ kind, name: HANDS[kind].name, chips: HANDS[kind].chips }));

/** A small "Rules" pill that opens the rules sheet, at `topic` when given. */
export function RulesButton({ topic, label = 'Rules', style }: { topic?: RulesTopic; label?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label === 'Rules' ? 'Rules' : `${label}, rules`}
        accessibilityHint="Opens how the game plays."
        hitSlop={6}
        onPress={() => {
          tick();
          setOpen(true);
        }}
        style={({ pressed }) => [
          { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1.5, borderColor: t.border, paddingLeft: 5, paddingRight: space.md, opacity: pressed ? 0.6 : 1 },
          style,
        ]}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.text, alignItems: 'center', justifyContent: 'center' }}>
          <Display size={14} color={t.bg} maxFontSizeMultiplier={fontScale.graphic}>
            ?
          </Display>
        </View>
        <Body size={typeScale.text.sm} weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
          {label}
        </Body>
      </Pressable>
      <RulesSheet visible={open} topic={topic} onClose={() => setOpen(false)} />
    </>
  );
}

/** The sheet itself, for screens that open it from their own control. */
export function RulesSheet({ visible, topic, onClose }: { visible: boolean; topic?: RulesTopic; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={onClose}>
      {visible ? <RulesBody topic={topic} onClose={onClose} /> : null}
    </Modal>
  );
}

const SECTION_SUIT: Record<RulesTopic, (typeof SUITS)[number]> = { deal: 'spades', week: 'hearts', river: 'diamonds', call: 'clubs', court: 'spades', comeback: 'hearts' };

function RulesBody({ topic, onClose }: { topic?: RulesTopic; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<RulesTopic, number>>>({});
  const jumped = useRef(false);
  // A page sheet starts below the status bar; anywhere else the sheet covers the whole screen.
  const top = Platform.OS === 'ios' ? space.lg : insets.top + space.md;

  const jump = (key: RulesTopic, animated: boolean) => {
    const y = offsets.current[key];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - space.md), animated });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: top, paddingHorizontal: space.xl, paddingBottom: space.xs, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Display size={typeScale.display.lg} header>
            How it plays
          </Display>
          <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={onClose} hitSlop={8} style={({ pressed }) => ({ minHeight: TAP, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.6 : 1 })}>
            <Body weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
              Done
            </Body>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 4 }} style={{ marginHorizontal: -space.xl, flexGrow: 0 }}>
          <View style={{ width: space.xl - space.sm }} />
          {RULES.map((s) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${s.chip}`}
              // 36 points tall, so the reach above and below makes it a full 44.
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => {
                tick();
                jump(s.key, true);
              }}
              style={({ pressed }) => ({ minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: s.key === topic ? t.text : t.border, opacity: pressed ? 0.6 : 1 })}
            >
              <Body size={typeScale.text.sm} weight="heavy" maxFontSizeMultiplier={fontScale.chrome}>
                {s.chip}
              </Body>
            </Pressable>
          ))}
          <View style={{ width: space.xl - space.sm }} />
        </ScrollView>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.xxxl, gap: space.xxl }}>
        {RULES.map((section) => (
          <View
            key={section.key}
            onLayout={(e) => {
              offsets.current[section.key] = e.nativeEvent.layout.y;
              // Open at the section asked for, once it has a place on the page.
              if (section.key === topic && !jumped.current) {
                jumped.current = true;
                jump(section.key, false);
              }
            }}
            style={{ gap: space.lg }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ width: 36, height: 48, borderRadius: 8, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: 'rgba(23, 18, 31, 0.14)', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
                <SuitGlyph suit={SECTION_SUIT[section.key]} size={20} color={suitColors[SECTION_SUIT[section.key]].glyph} />
              </View>
              <Display size={typeScale.display.md} header style={{ flex: 1 }}>
                {section.title}
              </Display>
            </View>
            {section.key === 'week' ? <Prices /> : null}
            <View style={{ gap: space.md }}>
              {section.rules.map((r) => (
                <View key={r.term} accessible accessibilityLabel={`${r.term}. ${r.line}`} style={{ gap: 2 }}>
                  <Body weight="heavy" size={typeScale.text.lg}>
                    {r.term}
                  </Body>
                  <Body size={typeScale.text.md} color={t.textSecondary}>
                    {r.line}
                  </Body>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** What each hand pays, strongest at the top, with a made-up example of each. */
function Prices() {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.bgRaised, borderRadius: radius.lg, paddingVertical: space.sm, paddingHorizontal: space.lg, borderWidth: t.edge === 'transparent' ? 0 : 1, borderColor: t.edge }}>
      <Label style={{ paddingVertical: space.sm }}>What each hand pays</Label>
      {[...HAND_PRICES].reverse().map((h, i) => (
        <View
          key={h.kind}
          accessible
          accessibilityLabel={`${h.name}, ${h.chips} chips`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}
        >
          <View aria-hidden>
            <HandRow faces={EXAMPLES[h.kind]} size="xs" overlap={0.3} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="heavy">{h.name}</Body>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <ChipIcon size={15} />
              <Display size={typeScale.display.sm} maxFontSizeMultiplier={fontScale.chrome}>
                {formatChips(h.chips)}
              </Display>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
