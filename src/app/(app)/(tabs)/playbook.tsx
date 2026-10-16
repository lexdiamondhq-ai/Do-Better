import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ask } from '@/components/Ask';
import { Arrow } from '@/components/Pile';
import { SuitGlyph } from '@/components/Suit';
import { Body, Chip, Display, Label, Page, PageTitle, Section } from '@/components/ui';
import { SUIT_INFO, SUITS, type Suit } from '@/engine/cards';
import { archivedDay } from '@/engine/day';
import { IDEA_GROUPS, PRINCIPLES, recipePlaces, RECIPES, type IdeaGroup, type IdeaGroupKey, type Recipe, type RecipePlace, type Recommendation } from '@/engine/playbook';
import { useData } from '@/lib/data';
import { useAdded, useDeck, type Added, type HabitView } from '@/lib/deck';
import * as feel from '@/lib/feel';
import type { Habit } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { contrast, mix, withAlpha } from '@/theme/color';
import { cardColors, fontScale, INK, radius, space, suitColors, typeScale, WHITE, type CardColor, type Theme } from '@/theme/tokens';

/** A ready-made card in a carousel: narrow enough that the next one peeks in, so the row reads as a hand. */
const RECIPE_W = 150;
const RECIPE_GAP = space.md;
/** The floating tab bar's height, for the receipt that sits just above it. */
const TAB_BAR = 56;

/** Each group of ideas wears the colour of a card, so the list reads as four cards, not one slab. */
const GROUP_COLORS: Record<IdeaGroupKey, CardColor> = { floor: 'pine', plays: 'sky', ceiling: 'tomato', comeback: 'lilac' };

/**
 * Do Better's ideas about keeping a habit. The cards that need a hand come first, each one a button that
 * opens the right field; then ready-made cards, one fanned hand per part of you, and a blank one to make your own.
 */
export default function Playbook() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { refresh, restoreHabit } = useData();
  const { added, noteAdded, clearAdded } = useAdded();
  const { width } = useWindowDimensions();
  const [suit, setSuit] = useState<Suit | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  if (!deck) return null;

  const places = recipePlaces([...deck.cards.map((c) => c.habit), ...deck.archived]);
  const shown = suit === 'all' ? SUITS : [suit];
  const recs = deck.recommendations;
  const recWidth = recs.length === 1 ? width - space.xl * 2 : Math.min(300, width - space.xl * 2 - 40);
  // The card that just joined the deck, once it is in the deck to show.
  const joined = added ? deck.cards.find((c) => c.habit.id === added.id) : undefined;

  const follow = (r: Recommendation) => {
    if (r.habitId && r.field) router.push({ pathname: '/habit/edit', params: { id: r.habitId, focus: r.field } });
    else if (r.href) router.push(r.href);
  };

  /** Brings an archived ready-made card back, rather than making a second one with none of its days. */
  const bringBack = (habit: Habit) => {
    const kept = deck.archivedKept[habit.id] ?? 0;
    const days = `${kept} ${kept === 1 ? 'day' : 'days'}`;
    // A card archived today simply comes back. One archived before starts again today, so the hands
    // already played never change, and the days it kept stay where they are, in the Court.
    const sameDay = !!habit.archivedAt && archivedDay(habit.archivedAt, deck.profile.timezone) === deck.today;
    const message = sameDay
      ? `It comes back just as it was${kept ? `, with its ${days} kept` : ''}.`
      : `It comes back with your own Floor and Ceiling, and starts again today.${kept ? ` The ${days} you kept it still count in your Court.` : ''}`;
    ask(`Bring ${habit.name} back?`, message, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Return to deck',
        onPress: () => {
          restoreHabit(habit.id)
            .then((back) => {
              feel.ceiling();
              noteAdded({ id: back.id, name: back.name, back: true });
            })
            .catch((e: unknown) => ask('That card didn’t come back', e instanceof Error ? e.message : 'Try again.'));
        },
      },
    ]);
  };

  const pressRecipe = (r: Recipe, place: RecipePlace | undefined) => {
    if (place?.kind === 'in') router.push({ pathname: '/habit/[id]', params: { id: place.habitId } });
    else if (place?.kind === 'out') {
      const habit = deck.archived.find((h) => h.id === place.habitId);
      if (habit) bringBack(habit);
    } else router.push({ pathname: '/habit/edit', params: { recipe: r.key } });
  };

  return (
    <View style={{ flex: 1 }}>
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
            const have = recipes.filter((r) => places.get(r.key)?.kind === 'in').length;
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
                      <Label color={suitText(t, k)} style={{ marginLeft: 'auto', marginTop: 3 }}>
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
                    const place = places.get(r.key);
                    return (
                      <RecipeCard
                        key={r.key}
                        recipe={r}
                        tilt={i % 2 === 0 ? -2 : 2}
                        place={place?.kind ?? null}
                        kept={place?.kind === 'out' ? (deck.archivedKept[place.habitId] ?? 0) : 0}
                        onPress={() => pressRecipe(r, place)}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}
        </Section>

        <Section title="The ideas">
          <Body size={14} color={t.textSecondary}>
            {`${Object.keys(PRINCIPLES).length} ideas, sorted by the part of a card they help. Tap one to read it.`}
          </Body>
          {IDEA_GROUPS.map((g) => (
            <IdeaGroupCard key={g.key} group={g} open={open} onToggle={(key) => setOpen(open === key ? null : key)} />
          ))}
        </Section>
      </Page>
      {added && joined ? (
        <Receipt
          key={`${added.id}:${added.back}`}
          added={added}
          color={joined.habit.color}
          onSee={() => {
            clearAdded();
            router.navigate('/');
          }}
          onClose={clearAdded}
        />
      ) : null}
    </View>
  );
}

/** A suit's colour as ink on the page: its deep shade on the light table, its bright one on a dark table. */
function suitInk(t: Theme, suit: Suit) {
  return t.scheme === 'dark' ? suitColors[suit].bright : suitColors[suit].glyph;
}

/** A suit's colour for small text on the page: its ink deepened until it reads at 4.5:1 (Hearts on the light table). */
function suitText(t: Theme, suit: Suit) {
  const ink = suitInk(t, suit);
  for (let step = 0; step <= 10; step++) {
    const c = mix(ink, t.text, step / 10);
    if (contrast(c, t.bg) >= 4.5) return c;
  }
  return t.text;
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
          <Label color={t.textSecondary} numberOfLines={3} style={{ flex: 1 }}>
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

/**
 * A ready-made card, fanned a little left or right like a hand being spread. Its corner says whether it
 * is in your deck, and a card you archived says so, with the days it kept, in place of who it makes you.
 */
function RecipeCard({ recipe, tilt, place, kept, onPress }: { recipe: Recipe; tilt: number; place: RecipePlace['kind'] | null; kept: number; onPress: () => void }) {
  const c = cardColors[suitColors[recipe.suit].habit];
  const out = place === 'out';
  const hint = place === 'in' ? 'In your deck. Opens its page' : out ? `Out of the deck, with ${kept} kept ${kept === 1 ? 'day' : 'days'}. Asks to bring it back` : 'Opens it ready to add to your deck';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}, ${SUIT_INFO[recipe.suit].part}. Floor: ${recipe.floor}. Ceiling: ${recipe.ceiling}.`}
      accessibilityHint={hint}
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
      {/* A card set aside: a dashed rim inside the edge, like the empty seat it left in the deck. */}
      {out ? <View aria-hidden pointerEvents="none" style={{ position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: radius.lg - 5, borderWidth: 2, borderStyle: 'dashed', borderColor: c.ink }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 3, paddingTop: 2 }}>
          <Arrow up color={c.ink} size={13} />
          <Body weight="heavy" size={12} color={c.ink} numberOfLines={3} maxFontSizeMultiplier={fontScale.graphic} style={{ flex: 1, lineHeight: 15 }}>
            {recipe.ceiling}
          </Body>
        </View>
        <CornerChip place={place} ink={c.ink} bg={c.bg} />
      </View>
      <View style={{ gap: 3 }}>
        <Display size={22} color={c.ink} numberOfLines={2} maxFontSizeMultiplier={fontScale.graphic}>
          {recipe.name}
        </Display>
        <Body size={12} weight={out ? 'heavy' : 'bold'} color={c.ink} numberOfLines={2} maxFontSizeMultiplier={fontScale.graphic} style={{ lineHeight: 15 }}>
          {out ? `Out of the deck\n${kept} kept ${kept === 1 ? 'day' : 'days'}` : `I’m ${recipe.identity}`}
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

/** "+" to add, a filled tick once the card is in your deck, or a curved arrow to bring an archived one back. */
function CornerChip({ place, ink, bg }: { place: RecipePlace['kind'] | null; ink: string; bg: string }) {
  const filled = place !== null;
  return (
    <View
      aria-hidden
      style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ink, backgroundColor: filled ? ink : 'transparent' }}
    >
      <Svg width={14} height={14} viewBox="0 0 20 20">
        {place === 'in' ? (
          <Path d="M4 10.5 L8.2 14.5 L16 5.5" stroke={bg} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : place === 'out' ? (
          <ReturnArrow color={bg} />
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

/** A curved arrow coming back round, the Comeback's mark. Drawn inside a 20 by 20 box. */
function ReturnArrow({ color, width = 3 }: { color: string; width?: number }) {
  return (
    <>
      <Path d="M5.2 7.5 A6.2 6.2 0 1 1 4.2 12.4" stroke={color} strokeWidth={width} strokeLinecap="round" fill="none" />
      <Path d="M4.6 2.8 L5.2 7.5 L9.8 6.6" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

/**
 * One group of ideas as a big card in its own colour, with a mark for the part of a card it helps.
 * Each idea folds to its title until tapped.
 */
function IdeaGroupCard({ group, open, onToggle }: { group: IdeaGroup; open: string | null; onToggle: (key: string) => void }) {
  const c = cardColors[GROUP_COLORS[group.key]];
  const rule = withAlpha(c.ink, 0.28);
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.lg, paddingTop: space.lg, overflow: 'hidden', boxShadow: '0 5px 14px rgba(23, 18, 31, 0.14)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <View aria-hidden style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] }}>
          <GroupMark kind={group.key} color={c.bg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Display size={typeScale.display.sm} color={c.ink} header>
            {group.title}
          </Display>
          <Body size={13} weight="bold" color={c.ink}>
            {group.about}
          </Body>
        </View>
      </View>
      {group.principles.map((key) => {
        const p = PRINCIPLES[key];
        const expanded = open === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? `${p.title}. ${p.idea} ${p.tryThis}` : p.title}
            onPress={() => {
              feel.tick();
              onToggle(key);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              minHeight: 52,
              justifyContent: 'center',
              gap: space.sm,
              borderTopWidth: 1,
              borderTopColor: rule,
              // A shade darker, never lighter, so white ink keeps its contrast on the open idea.
              backgroundColor: pressed || expanded ? withAlpha(INK, 0.14) : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Body size={typeScale.text.lg} weight="heavy" color={c.ink} style={{ flex: 1 }}>
                {p.title}
              </Body>
              <OpenMark open={expanded} color={c.ink} />
            </View>
            {expanded ? (
              <View style={{ gap: space.sm, paddingBottom: space.xs }}>
                <Body size={15} color={c.ink}>
                  {p.idea}
                </Body>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <View style={{ width: 3, borderRadius: 2, backgroundColor: c.ink }} />
                  <Body size={15} weight="bold" color={c.ink} style={{ flex: 1 }}>
                    {p.tryThis}
                  </Body>
                </View>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The mark of each group: the Floor's arrow down, a clock for When it plays, the Ceiling's arrow up, the Comeback's curve. */
function GroupMark({ kind, color }: { kind: IdeaGroupKey; color: string }) {
  if (kind === 'floor' || kind === 'ceiling') return <Arrow up={kind === 'ceiling'} color={color} size={22} />;
  return (
    <Svg width={22} height={22} viewBox="0 0 20 20">
      {kind === 'plays' ? (
        <>
          <Circle cx={10} cy={10} r={7.2} stroke={color} strokeWidth={2.4} fill="none" />
          <Path d="M10 5.8 V10 L13 11.8" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <ReturnArrow color={color} width={2.6} />
      )}
    </Svg>
  );
}

/**
 * "Walk is in your deck": a card that just joined, shown above the tab bar with a way to go and play it.
 * It goes by itself after a few seconds.
 */
function Receipt({ added, color, onSee, onClose }: { added: Added; color: CardColor; onSee: () => void; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const c = cardColors[color];
  const title = added.back ? `${added.name} is back in your deck` : `${added.name} is in your deck`;
  const body = 'It’s on Today, ready to play.';
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
  }, [title]);
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18).stiffness(200)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: Math.max(insets.bottom, space.md) + TAB_BAR + space.md }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.text, borderRadius: radius.lg, padding: space.md, paddingLeft: space.lg, boxShadow: '0 10px 28px rgba(10, 8, 14, 0.3)' }}
      >
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} accessibilityHint="Closes this" onPress={onClose} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View aria-hidden style={{ width: 34, height: 46, borderRadius: 8, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] }}>
            <Svg width={18} height={18} viewBox="0 0 20 20">
              <Path d="M4 10.5 L8.2 14.5 L16 5.5" stroke={c.ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Display size={18} color={t.bg} numberOfLines={2}>
              {title}
            </Display>
            <Body size={typeScale.text.sm} weight="bold" color={t.bg}>
              {body}
            </Body>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See it on Today"
          onPress={onSee}
          hitSlop={6}
          style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: c.bg, justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}
        >
          <Body weight="heavy" size={typeScale.text.md} color={c.ink} maxFontSizeMultiplier={fontScale.chrome}>
            See it
          </Body>
        </Pressable>
      </View>
    </Animated.View>
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
