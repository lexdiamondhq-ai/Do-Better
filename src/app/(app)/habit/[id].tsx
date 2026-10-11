import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pile, PileLegend } from '@/components/Pile';
import { faceOfCourt, PlayingCard, SuitTag } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Centered, Display, Label, Section } from '@/components/ui';
import { SUIT_INFO } from '@/engine/cards';
import { best30, bounceBacks, recentDays } from '@/engine/kept';
import { PRINCIPLES, RECIPES } from '@/engine/playbook';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, radius, space } from '@/theme/tokens';

/** One card, turned over: everything it has added up to, and why you keep it. */
export default function HabitDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const deck = useDeck();
  const view = deck?.cards.find((c) => c.habit.id === id);

  if (!deck || !view) {
    return (
      <Centered>
        <Display size={26}>This card has left the deck.</Display>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Centered>
    );
  }

  const { habit, checkIns, window30, allTime } = view;
  const c = cardColors[habit.color];
  const bounced = bounceBacks(habit.startedOn, deck.today, checkIns);
  const best = best30(habit.startedOn, deck.today, checkIns);
  const court = deck.court.find((s) => s.suit === habit.suit);
  const suit = SUIT_INFO[habit.suit];
  const recipe = RECIPES.find((r) => r.key === habit.recipeKey);
  const principle = recipe ? PRINCIPLES[recipe.principle] : null;
  const floorDays = allTime.kept - allTime.ceiling;

  const stats = [
    { n: allTime.kept, label: 'kept days' },
    { n: allTime.ceiling, label: 'Ceilings' },
    { n: floorDays, label: 'saved by the Floor' },
    { n: bounced, label: 'bounce-backs' },
    { n: best, label: 'best 30 days' },
    { n: window30.missedDays, label: 'misses this month' },
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl, gap: space.xl }}>
      <View style={{ backgroundColor: c.bg, paddingTop: insets.top + space.md, paddingHorizontal: space.xl, paddingBottom: space.xxl, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, gap: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Display size={26} color={c.ink}>←</Display>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/habit/edit', params: { id: habit.id } })} hitSlop={12} accessibilityRole="button">
            <Body weight="heavy" color={c.ink}>Edit</Body>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SuitGlyph suit={habit.suit} size={15} color={c.ink} />
          <Label color={c.ink} style={{ opacity: 0.8 }}>{`${suit.name} · ${suit.part}${habit.identity ? ` · I'm ${habit.identity.replace(/^(i am|i'm)\s+/i, '')}` : ''}`}</Label>
        </View>
        <Display size={habit.name.length > 12 ? 48 : 64} color={c.ink}>{habit.name}</Display>
        <View style={{ gap: space.sm }}>
          <Body weight="bold" color={c.ink}>{`↑ Ceiling · ${habit.ceilingLabel}`}</Body>
          <Body weight="bold" color={c.ink}>{`↓ Floor · ${habit.floorLabel}`}</Body>
          {habit.twoMinuteLabel ? <Body weight="bold" color={c.ink} style={{ opacity: 0.8 }}>{`⏱ Two minutes · ${habit.twoMinuteLabel}`}</Body> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
          <Display size={84} color={c.ink} style={{ lineHeight: 80 }}>{window30.keptDays}</Display>
          <Body weight="heavy" color={c.ink} style={{ paddingBottom: 10, flex: 1 }}>{`of ${window30.daysInWindow} days kept${window30.daysInWindow < 30 ? ' since you started' : ' in the last 30'}`}</Body>
        </View>
      </View>

      <View style={{ paddingHorizontal: space.xl, gap: space.xl }}>
        <View style={{ gap: space.md }}>
          <Pile days={recentDays(deck.today, 30, habit.startedOn, checkIns)} color={habit.color} />
          <PileLegend color={habit.color} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {stats.map((s) => (
            <View key={s.label} style={{ width: '31.5%', backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.md, gap: 2 }}>
              <Display size={30}>{s.n}</Display>
              <Body weight="heavy" size={12} color={t.textSecondary}>{s.label}</Body>
            </View>
          ))}
        </View>

        {court ? (
          <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center', backgroundColor: t.cardBack, borderRadius: radius.lg, padding: space.lg }}>
            {court.face ? <PlayingCard face={faceOfCourt(court.suit, court.face)} size="md" /> : null}
            <View style={{ flex: 1, gap: space.xs }}>
              <SuitTag suit={court.suit} name color={t.onCardBack} />
              <Display size={22} color={t.onCardBack}>
                {court.face ? `${court.face.name} of ${suit.name} · ${court.face.title}` : `${court.votes} ${court.votes === 1 ? 'vote' : 'votes'} for your ${suit.part.toLowerCase()}`}
              </Display>
              <Body size={14} color={t.onCardBack} style={{ opacity: 0.8 }}>
                {`Every day you keep ${habit.name} is a vote in the Court of ${suit.name}. `}
                {court.next ? `${court.next.needed} more to the ${court.next.face.name}, and a Joker the day you earn it.` : 'Every face card is earned. This is who you are.'}
                {court.habitIds.length > 1 ? ` ${court.habitIds.length} cards vote in ${suit.name}.` : ''}
              </Body>
            </View>
          </View>
        ) : null}

        {!habit.identity ? (
          <Pressable onPress={() => router.push({ pathname: '/habit/edit', params: { id: habit.id } })} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.dashed, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
            <Display size={22}>Who does this make you?</Display>
            <Body color={t.textSecondary}>{`${PRINCIPLES.identity.tryThis} (${PRINCIPLES.identity.source})`}</Body>
          </Pressable>
        ) : null}

        {habit.why || habit.anchor || habit.whenWhere ? (
          <Section title="Why and when">
            <View style={{ gap: space.md }}>
              {habit.why ? <Display size={24} style={{ lineHeight: 30 }}>{`“${habit.why}”`}</Display> : null}
              {habit.anchor ? <Body weight="bold">{`Cue · ${habit.anchor}`}</Body> : null}
              {habit.whenWhere ? <Body weight="bold">{`Plan · ${habit.whenWhere}`}</Body> : null}
            </View>
          </Section>
        ) : null}

        {principle ? (
          <View style={{ backgroundColor: c.soft, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
            <Label color={c.ink}>The idea behind this card</Label>
            <Display size={22} color={c.ink}>{principle.title}</Display>
            <Body color={c.ink}>{principle.idea}</Body>
            <Body size={13} weight="bold" color={c.ink} style={{ opacity: 0.7 }}>{principle.source}</Body>
          </View>
        ) : null}

        <Section title="Twelve weeks">
          <Pile days={recentDays(deck.today, 84, habit.startedOn, checkIns)} color={habit.color} columns={14} showArrows={false} />
        </Section>

        <Body size={13} color={t.textSecondary} style={{ textAlign: 'center' }}>{`In your deck since ${habit.startedOn}.`}</Body>
      </View>
    </ScrollView>
  );
}
