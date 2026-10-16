import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { SuitTag } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Chip, Display, Label, Page, PageTitle, Section } from '@/components/ui';
import { SUIT_INFO, SUITS, type Suit } from '@/engine/cards';
import { PRINCIPLES, RECIPES, type Recipe } from '@/engine/playbook';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, radius, space, suitColors } from '@/theme/tokens';

/** Do Better's ideas about keeping a habit, picked for where you are, and ready-made cards for each part of you. */
export default function Playbook() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const [suit, setSuit] = useState<Suit | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  if (!deck) return null;

  const inDeck = new Set(deck.cards.map((c) => c.habit.recipeKey).filter(Boolean));
  const shown = suit === 'all' ? SUITS : [suit];

  return (
    <Page header={<PageTitle eyebrow="The ideas behind the deck" title="Playbook" />}>
      {deck.recommendations.length ? (
        <Section title="For you, today">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.md }}>
            {deck.recommendations.map((r) => (
              <Pressable
                key={r.principle.key}
                onPress={r.principle.key === 'commitment' ? () => router.push('/call') : undefined}
                disabled={r.principle.key !== 'commitment'}
                accessibilityRole={r.principle.key === 'commitment' ? 'button' : undefined}
                style={{ width: 280, backgroundColor: t.cardBack, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}
              >
                <Label color={t.onRaisedSecondary}>{r.reason}</Label>
                <Display size={24} color={t.onCardBack}>{r.principle.title}</Display>
                <Body size={15} color={t.onCardBack} style={{ opacity: 0.85 }}>{r.principle.tryThis}</Body>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      <Section title="Ready-made cards">
        <Body size={14} color={t.textSecondary}>Every card belongs to a suit, the part of you it builds. Its kept days are dealt in that suit and count in its Court.</Body>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
          <Chip label="All" active={suit === 'all'} onPress={() => setSuit('all')} />
          {SUITS.map((k) => (
            <Chip key={k} label={`${SUIT_INFO[k].glyph} ${SUIT_INFO[k].part}`} active={suit === k} onPress={() => setSuit(k)} color={suitColors[k].glyph} ink="#FFFFFF" />
          ))}
        </ScrollView>
        {shown.map((k) => (
          <View key={k} style={{ gap: space.sm }}>
            <View style={{ gap: 2 }}>
              <SuitTag suit={k} name size={15} />
              <Body size={13} color={t.textSecondary}>{SUIT_INFO[k].about}</Body>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {RECIPES.filter((r) => r.suit === k).map((r) => (
                <RecipeCard key={r.key} recipe={r} added={inDeck.has(r.key)} onPress={() => router.push({ pathname: '/habit/edit', params: { recipe: r.key } })} />
              ))}
            </View>
          </View>
        ))}
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
                  </>
                ) : (
                  <Body size={13} color={t.textSecondary} numberOfLines={1}>{p.idea}</Body>
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
  const c = cardColors[suitColors[recipe.suit].habit];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}, ${SUIT_INFO[recipe.suit].part}. Floor ${recipe.floor}. Ceiling ${recipe.ceiling}.${added ? ' Already in your deck.' : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({ width: '48.5%', aspectRatio: 0.72, backgroundColor: c.bg, borderRadius: radius.lg, padding: space.lg, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1, transform: [{ rotate: pressed ? '-1.5deg' : '0deg' }] })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm }}>
        <Body weight="heavy" size={12} color={c.ink} style={{ opacity: 0.8, flex: 1 }}>{`↑ ${recipe.ceiling}`}</Body>
        <SuitGlyph suit={recipe.suit} size={16} color={c.ink} />
      </View>
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
