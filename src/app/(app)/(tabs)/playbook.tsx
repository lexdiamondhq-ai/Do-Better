import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { Arrow } from '@/components/Pile';
import { SuitGlyph } from '@/components/Suit';
import { Body, Chip, Display, Label, Page, PageTitle, raisedStyle, Section } from '@/components/ui';
import { SUIT_INFO, SUITS, type Suit } from '@/engine/cards';
import { PRINCIPLES, RECIPES, type Recipe, type Recommendation } from '@/engine/playbook';
import { useData } from '@/lib/data';
import { useDeck, type HabitView } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/color';
import { cardColors, fontScale, radius, space, suitColors, WHITE, type CardColor, type Theme } from '@/theme/tokens';

/** A ready-made card in a carousel: narrow enough that the next one peeks in, so the row reads as a hand. */
const RECIPE_W = 150;
const RECIPE_GAP = space.md;

/**
 * Do Better's ideas about keeping a habit. The cards that need a hand come first, each one a button that
 * opens the right field; then ready-made cards, one fanned hand per part of you, and a blank one to make your own.
 */
export default function Playbook() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { refresh } = useData();
  const { width } = useWindowDimensions();
  const [suit, setSuit] = useState<Suit | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  if (!deck) return null;

  const byRecipe = new Map(deck.cards.filter((c) => c.habit.recipeKey).map((c) => [c.habit.recipeKey as string, c.habit.id]));
  const shown = suit === 'all' ? SUITS : [suit];
  const recs = deck.recommendations;
  const recWidth = recs.length === 1 ? width - space.xl * 2 : Math.min(300, width - space.xl * 2 - 40);

  const follow = (r: Recommendation) => {
    if (r.habitId && r.field) router.push({ pathname: '/habit/edit', params: { id: r.habitId, focus: r.field } });
    else if (r.href) router.push(r.href);
  };

  return (
    <Page header={<PageTitle eyebrow="The ideas behind the deck" title="Playbook" />} onRefresh={refresh}>
      {recs.length ? (
        <Section title="For you, today">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={recWidth + space.md}
            decelerationRate="fast"
            style={{ marginHorizontal: -space.xl }}
            contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.md }}
          >
            {recs.map((r) => (
              <AdviceCard key={r.principle.key} rec={r} width={recWidth} card={deck.cards.find((c) => c.habit.id === r.habitId)} onPress={() => follow(r)} />
            ))}
          </ScrollView>
        </Section>
      ) : null}

      <Section title="Ready-made cards">
        <Body size={14} color={t.textSecondary}>
          Each one is a starting point you can change. Its suit is the part of you it builds, and its kept days count in that suit’s Court.
        </Body>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
          <Chip label="All" active={suit === 'all'} onPress={() => setSuit('all')} />
          {SUITS.map((k) => {
            const active = suit === k;
            return (
              <Chip
                key={k}
                label={SUIT_INFO[k].part}
                accessibilityLabel={`${SUIT_INFO[k].part}, ${SUIT_INFO[k].name}`}
                icon={<SuitGlyph suit={k} size={15} color={active ? WHITE : suitInk(t, k)} />}
                active={active}
                onPress={() => setSuit(k)}
                color={suitColors[k].glyph}
                ink={WHITE}
              />
            );
          })}
        </ScrollView>

        <MakeYourOwn onPress={() => router.push('/habit/edit')} />

        {shown.map((k) => {
          const recipes = RECIPES.filter((r) => r.suit === k);
          const have = recipes.filter((r) => byRecipe.has(r.key)).length;
          return (
            <View key={k} style={{ gap: space.sm }}>
              <View style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <SuitGlyph suit={k} size={20} color={suitInk(t, k)} />
                  <Display size={22} header style={{ flexShrink: 1 }}>
                    {SUIT_INFO[k].part}
                  </Display>
                  <Label color={t.textSecondary} style={{ marginTop: 3 }}>
                    {SUIT_INFO[k].name}
                  </Label>
                  {have ? (
                    <Label color={suitInk(t, k)} style={{ marginLeft: 'auto', marginTop: 3 }}>
                      {`${have} in your deck`}
                    </Label>
                  ) : null}
                </View>
                <Body size={13} color={t.textSecondary}>
                  {SUIT_INFO[k].about}
                </Body>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={RECIPE_W + RECIPE_GAP}
                decelerationRate="fast"
                style={{ marginHorizontal: -space.xl, marginBottom: -space.md }}
                contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.xl, gap: RECIPE_GAP }}
              >
                {recipes.map((r, i) => {
                  const habitId = byRecipe.get(r.key);
                  return (
                    <RecipeCard
                      key={r.key}
                      recipe={r}
                      tilt={i % 2 === 0 ? -2 : 2}
                      added={!!habitId}
                      onPress={() => (habitId ? router.push({ pathname: '/habit/[id]', params: { id: habitId } }) : router.push({ pathname: '/habit/edit', params: { recipe: r.key } }))}
                    />
                  );
                })}
              </ScrollView>
            </View>
          );
        })}
      </Section>

      <Section title="The ideas">
        <View style={[raisedStyle(t), { borderRadius: radius.lg, overflow: 'hidden' }]}>
          {Object.values(PRINCIPLES).map((p, i) => {
            const expanded = open === p.key;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={p.title}
                onPress={() => setOpen(expanded ? null : p.key)}
                style={({ pressed }) => ({
                  paddingHorizontal: space.lg,
                  paddingVertical: space.md + 2,
                  gap: space.sm,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: withAlpha(t.onRaised, 0.12),
                  backgroundColor: pressed ? withAlpha(t.onRaised, 0.06) : 'transparent',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Display size={18} color={t.onRaised} style={{ flex: 1 }}>
                    {p.title}
                  </Display>
                  <OpenMark open={expanded} color={t.onRaised} />
                </View>
                {expanded ? (
                  <View style={{ gap: space.sm, paddingBottom: space.xs }}>
                    <Body size={15} color={t.onRaised}>
                      {p.idea}
                    </Body>
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      <View style={{ width: 3, borderRadius: 2, backgroundColor: t.onRaised }} />
                      <Body size={15} weight="bold" color={t.onRaised} style={{ flex: 1 }}>
                        {p.tryThis}
                      </Body>
                    </View>
                  </View>
                ) : (
                  <Body size={13} color={t.onRaisedSecondary} numberOfLines={1}>
                    {p.idea}
                  </Body>
                )}
              </Pressable>
            );
          })}
        </View>
      </Section>
    </Page>
  );
}

/** A suit's colour as ink on the page: its deep shade on the light table, its bright one on a dark table. */
function suitInk(t: Theme, suit: Suit) {
  return t.scheme === 'dark' ? suitColors[suit].bright : suitColors[suit].glyph;
}

/**
 * One piece of advice. An ink outline sets it apart from the Comeback card and the cards in your deck; when
 * it is about one of your cards, that card's colour and name lead it. The whole card is the button.
 */
function AdviceCard({ rec, width, card, onPress }: { rec: Recommendation; width: number; card?: HabitView; onPress: () => void }) {
  const t = useTheme();
  const acts = !!rec.cta && (!!(rec.habitId && rec.field) || !!rec.href);
  const text = rec.text ?? rec.principle.tryThis;
  return (
    <Pressable
      disabled={!acts}
      onPress={onPress}
      accessibilityRole={acts ? 'button' : undefined}
      accessibilityLabel={`${rec.reason}. ${rec.principle.title}. ${text}`}
      accessibilityHint={acts ? rec.cta : undefined}
      style={({ pressed }) => ({
        width,
        borderWidth: 2,
        borderColor: t.text,
        backgroundColor: t.bgRaised,
        borderRadius: radius.lg,
        padding: space.lg,
        gap: space.md,
        justifyContent: 'space-between',
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {card ? <MiniCard color={card.habit.color} /> : <Spark color={t.text} />}
          <Label color={t.textSecondary} numberOfLines={2} style={{ flex: 1 }}>
            {rec.reason}
          </Label>
        </View>
        <Display size={22}>{rec.principle.title}</Display>
        <Body size={15} color={t.textSecondary}>
          {text}
        </Body>
      </View>
      {acts ? (
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.text, borderRadius: radius.pill, paddingHorizontal: space.lg, minHeight: 40 }}>
          <Body size={15} weight="heavy" color={t.bg} maxFontSizeMultiplier={fontScale.chrome}>
            {`${rec.cta} →`}
          </Body>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A ready-made card, fanned a little left or right like a hand being spread. Its corner says whether it is in your deck. */
function RecipeCard({ recipe, tilt, added, onPress }: { recipe: Recipe; tilt: number; added: boolean; onPress: () => void }) {
  const c = cardColors[suitColors[recipe.suit].habit];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}, ${SUIT_INFO[recipe.suit].part}. Floor: ${recipe.floor}. Ceiling: ${recipe.ceiling}.`}
      accessibilityHint={added ? 'In your deck. Opens its page' : 'Opens it ready to add to your deck'}
      onPress={onPress}
      style={({ pressed }) => ({
        width: RECIPE_W,
        aspectRatio: 0.7,
        backgroundColor: c.bg,
        borderRadius: radius.lg,
        padding: 14,
        justifyContent: 'space-between',
        boxShadow: '0 5px 12px rgba(23, 18, 31, 0.16)',
        transform: [{ rotate: pressed ? '0deg' : `${tilt}deg` }, { scale: pressed ? 0.96 : 1 }],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 3, paddingTop: 2 }}>
          <Arrow up color={c.ink} size={13} />
          <Body weight="heavy" size={12} color={c.ink} numberOfLines={3} maxFontSizeMultiplier={fontScale.graphic} style={{ flex: 1, lineHeight: 15 }}>
            {recipe.ceiling}
          </Body>
        </View>
        <CornerChip added={added} ink={c.ink} bg={c.bg} />
      </View>
      <View style={{ gap: 3 }}>
        <Display size={22} color={c.ink} numberOfLines={2} maxFontSizeMultiplier={fontScale.graphic}>
          {recipe.name}
        </Display>
        <Body size={12} weight="bold" color={c.ink} numberOfLines={2} maxFontSizeMultiplier={fontScale.graphic} style={{ lineHeight: 15 }}>
          {`I’m ${recipe.identity}`}
        </Body>
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <Arrow up={false} color={c.ink} size={13} />
        <Body weight="heavy" size={12} color={c.ink} numberOfLines={3} maxFontSizeMultiplier={fontScale.graphic} style={{ flex: 1, lineHeight: 15 }}>
          {recipe.floor}
        </Body>
      </View>
    </Pressable>
  );
}

/** "+" to add, or a filled tick once the card is in your deck. */
function CornerChip({ added, ink, bg }: { added: boolean; ink: string; bg: string }) {
  return (
    <View
      aria-hidden
      style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ink, backgroundColor: added ? ink : 'transparent' }}
    >
      <Svg width={14} height={14} viewBox="0 0 20 20">
        {added ? (
          <Path d="M4 10.5 L8.2 14.5 L16 5.5" stroke={bg} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : (
          <>
            <Line x1={10} y1={3.5} x2={10} y2={16.5} stroke={ink} strokeWidth={3} strokeLinecap="round" />
            <Line x1={3.5} y1={10} x2={16.5} y2={10} stroke={ink} strokeWidth={3} strokeLinecap="round" />
          </>
        )}
      </Svg>
    </View>
  );
}

/** A blank card to start from: no recipe, nothing filled in. */
function MakeYourOwn({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Make your own card"
      accessibilityHint="Opens a blank card"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.lg,
        padding: space.lg,
        borderRadius: radius.lg,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: t.text,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View
        aria-hidden
        style={{ width: 54, height: 76, borderRadius: 12, backgroundColor: t.bgRaised, borderWidth: 2, borderColor: t.text, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] }}
      >
        <Svg width={24} height={24} viewBox="0 0 20 20">
          <Line x1={10} y1={3} x2={10} y2={17} stroke={t.text} strokeWidth={2.6} strokeLinecap="round" />
          <Line x1={3} y1={10} x2={17} y2={10} stroke={t.text} strokeWidth={2.6} strokeLinecap="round" />
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Display size={21}>Make your own</Display>
        <Body size={14} color={t.textSecondary}>
          A blank card. Your name for it, your Floor, your Ceiling.
        </Body>
      </View>
    </Pressable>
  );
}

/** A tiny card in a habit's colour, for advice about that card. */
function MiniCard({ color }: { color: CardColor }) {
  const c = cardColors[color];
  return <View aria-hidden style={{ width: 14, height: 19, borderRadius: 4, backgroundColor: c.bg, transform: [{ rotate: '-8deg' }] }} />;
}

/** A small four-point spark for advice about the whole deck. */
function Spark({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 20 20" aria-hidden>
      <Path d="M10 1 C11 7 13 9 19 10 C13 11 11 13 10 19 C9 13 7 11 1 10 C7 9 9 7 10 1 Z" fill={color} />
    </Svg>
  );
}

function OpenMark({ open, color }: { open: boolean; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" aria-hidden>
      <Line x1={4} y1={10} x2={16} y2={10} stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      {open ? null : <Line x1={10} y1={4} x2={10} y2={16} stroke={color} strokeWidth={2.6} strokeLinecap="round" />}
    </Svg>
  );
}
