import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Pile, PileLegend } from '@/components/Pile';
import { Body, Chip, Display, Label, Page, PageTitle, Section } from '@/components/ui';
import { bounceBacks, recentDays } from '@/engine/kept';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, radius, space } from '@/theme/tokens';

export default function PileScreen() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!deck) return null;

  if (deck.cards.length === 0) {
    return (
      <Page header={<PageTitle eyebrow="Last 30 days" title="Your pile" />}>
        <Body color={t.textSecondary}>Every day you keep a card, it lands here. Nothing ever comes off the pile.</Body>
      </Page>
    );
  }

  const view = deck.cards.find((c) => c.habit.id === selectedId) ?? deck.cards[0];
  const { habit, window30, allTime } = view;
  const c = cardColors[habit.color];
  const days30 = recentDays(deck.today, 30, habit.startedOn, view.checkIns);
  const days84 = recentDays(deck.today, 84, habit.startedOn, view.checkIns);
  const bounced = bounceBacks(habit.startedOn, deck.today, view.checkIns);

  return (
    <Page header={<PageTitle eyebrow="Last 30 days" title="Your pile" />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {deck.cards.map((v) => (
          <Chip key={v.habit.id} label={v.habit.name} active={v.habit.id === habit.id} color={cardColors[v.habit.color].bg} ink={cardColors[v.habit.color].ink} onPress={() => setSelectedId(v.habit.id)} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
        <Display size={112} color={t.text} style={{ lineHeight: 104 }}>{window30.keptDays}</Display>
        <View style={{ paddingBottom: 14, flex: 1 }}>
          <Display size={28} color={t.textSecondary}>{`/${window30.daysInWindow}`}</Display>
          <Body weight="bold" size={14}>{window30.daysInWindow < 30 ? `days kept since you started` : 'days kept in the last 30'}</Body>
        </View>
      </View>
      <Body weight="bold">
        {window30.ceilingDays > 0 ? `${window30.ceilingDays} of them reached the Ceiling. ` : 'Every one of them counts. '}
        {bounced > 0 ? `You bounced back after a miss ${bounced} ${bounced === 1 ? 'time' : 'times'}.` : ''}
      </Body>

      <View style={{ gap: space.md }}>
        <Pile days={days30} color={habit.color} />
        <PileLegend color={habit.color} />
      </View>

      <Section title="All time">
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {[
            { n: allTime.kept, label: 'kept days' },
            { n: allTime.ceiling, label: 'Ceilings' },
            { n: bounced, label: 'bounce-backs' },
          ].map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: c.bg, borderRadius: radius.md, padding: space.lg, gap: 2 }}>
              <Display size={34} color={c.ink}>{s.n}</Display>
              <Body weight="heavy" size={12} color={c.ink} style={{ opacity: 0.8 }}>{s.label}</Body>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Twelve weeks">
        <Pile days={days84} color={habit.color} columns={14} showArrows={false} />
      </Section>

      <Section title="Every card">
        <View style={{ gap: space.sm }}>
          {deck.cards.map((v) => {
            const col = cardColors[v.habit.color];
            return (
              <Pressable
                key={v.habit.id}
                onPress={() => router.push(`/habit/${v.habit.id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.md }}
              >
                <View style={{ width: 36, height: 48, borderRadius: 8, backgroundColor: col.bg }} />
                <View style={{ flex: 1 }}>
                  <Display size={18}>{v.habit.name}</Display>
                  <Body size={13} color={t.textSecondary}>{`${v.window30.keptDays} of ${v.window30.daysInWindow} days · ${v.allTime.kept} all time`}</Body>
                </View>
                <Label>Open</Label>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </Page>
  );
}
