import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Body, Chip, Display, Label, Page, PageTitle, Section } from '@/components/ui';
import { CATEGORIES, PRINCIPLES, RECIPES, type Category, type Recipe } from '@/engine/playbook';
import { CATEGORY_COLOR } from '@/lib/categoryColor';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, radius, space } from '@/theme/tokens';

export default function Playbook() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  if (!deck) return null;

  const inDeck = new Set(deck.cards.map((c) => c.habit.recipeKey).filter(Boolean));
  const recipes = RECIPES.filter((r) => category === 'all' || r.category === category);

  return (
    <Page header={<PageTitle eyebrow="The ideas behind the deck" title="Playbook" />}>
      {deck.recommendations.length ? (
        <Section title="For you, today">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.md }}>
            {deck.recommendations.map((r) => (
              <View key={r.principle.key} style={{ width: 280, backgroundColor: t.cardBack, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
                <Label color={t.onCardBack} style={{ opacity: 0.6 }}>{r.reason}</Label>
                <Display size={24} color={t.onCardBack}>{r.principle.title}</Display>
                <Body size={15} color={t.onCardBack} style={{ opacity: 0.85 }}>{r.principle.tryThis}</Body>
                <Body size={12} weight="bold" color={t.onCardBack} style={{ opacity: 0.5 }}>{r.principle.source}</Body>
              </View>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      <Section title="Ready-made cards">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
          <Chip label="All" active={category === 'all'} onPress={() => setCategory('all')} />
          {(Object.keys(CATEGORIES) as Category[]).map((k) => (
            <Chip key={k} label={CATEGORIES[k]} active={category === k} onPress={() => setCategory(k)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {recipes.map((r) => (
            <RecipeCard key={r.key} recipe={r} added={inDeck.has(r.key)} onPress={() => router.push({ pathname: '/habit/edit', params: { recipe: r.key } })} />
          ))}
        </View>
      </Section>

      <Section title="The ideas">
        <View style={{ gap: space.sm }}>
          {Object.values(PRINCIPLES).map((p) => {
            const expanded = open === p.key;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : p.key)}
                style={{ backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg, gap: space.sm }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                  <Display size={19} style={{ flex: 1 }}>{p.title}</Display>
                  <Display size={19} color={t.textSecondary}>{expanded ? '–' : '+'}</Display>
                </View>
                {expanded ? (
                  <>
                    <Body>{p.idea}</Body>
                    <Body weight="bold">{`Try this: ${p.tryThis}`}</Body>
                    <Body size={12} weight="bold" color={t.textSecondary}>{p.source}</Body>
                  </>
                ) : (
                  <Body size={13} color={t.textSecondary} numberOfLines={1}>{p.source}</Body>
                )}
              </Pressable>
            );
          })}
        </View>
      </Section>
    </Page>
  );
}

function RecipeCard({ recipe, added, onPress }: { recipe: Recipe; added: boolean; onPress: () => void }) {
  const c = cardColors[CATEGORY_COLOR[recipe.category]];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}. Floor ${recipe.floor}. Ceiling ${recipe.ceiling}.${added ? ' Already in your deck.' : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({ width: '48.5%', aspectRatio: 0.72, backgroundColor: c.bg, borderRadius: radius.lg, padding: space.lg, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1, transform: [{ rotate: pressed ? '-1.5deg' : '0deg' }] })}
    >
      <Body weight="heavy" size={12} color={c.ink} style={{ opacity: 0.8 }}>{`↑ ${recipe.ceiling}`}</Body>
      <View style={{ gap: 4 }}>
        <Display size={26} color={c.ink}>{recipe.name}</Display>
        <Body size={12} weight="bold" color={c.ink} style={{ opacity: 0.8 }}>{`I’m ${recipe.identity}`}</Body>
      </View>
      <View style={{ gap: 6 }}>
        <Body weight="heavy" size={12} color={c.ink} style={{ opacity: 0.8 }}>{`↓ ${recipe.floor}`}</Body>
        <Label color={c.ink}>{added ? 'In your deck' : '+ Add to deck'}</Label>
      </View>
    </Pressable>
  );
}
