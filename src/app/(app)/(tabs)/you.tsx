import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { AchievementCard } from '@/components/AchievementCard';
import { Body, Button, Display, Label, Page, PageTitle, Section } from '@/components/ui';
import { votesToNextLevel } from '@/engine/identity';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/data';
import { useDeck } from '@/lib/deck';
import { useTheme } from '@/theme/ThemeProvider';
import { cardColors, fonts, radius, space } from '@/theme/tokens';

export default function You() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { saveProfile } = useData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  if (!deck) return null;

  const earned = deck.achievements.filter((s) => s.unlockedOn);
  const recent = [...earned].sort((a, b) => (b.unlockedOn ?? '').localeCompare(a.unlockedOn ?? '')).slice(0, 3);
  const colorFor = (habitIds: string[]) => deck.cards.find((c) => habitIds.includes(c.habit.id))?.habit.color ?? 'lilac';

  async function save() {
    setBusy(true);
    try {
      await saveProfile({ northStar: draft });
      setEditing(false);
    } catch (e) {
      Alert.alert('That didn’t save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page header={<PageTitle eyebrow="Identity" title="Who you’re becoming" />}>
      <View style={{ backgroundColor: t.cardBack, borderRadius: radius.card, padding: space.xl, gap: space.md }}>
        <Label color={t.onCardBack} style={{ opacity: 0.6 }}>Your north star</Label>
        {editing ? (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              multiline
              placeholder="I’m becoming someone who…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: t.onCardBack, minHeight: 80 }}
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Save" busy={busy} onPress={save} colors={{ bg: t.onCardBack, fg: t.cardBack }} style={{ flex: 1 }} />
              <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} colors={{ bg: 'transparent', fg: t.onCardBack }} style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Edit your north star"
            onPress={() => {
              setDraft(deck.profile.northStar ?? '');
              setEditing(true);
            }}
            style={{ gap: space.sm }}
          >
            <Display size={30} color={t.onCardBack}>{deck.profile.northStar ?? 'Write one sentence about who you’re becoming.'}</Display>
            <Body size={13} weight="bold" color={t.onCardBack} style={{ opacity: 0.55 }}>Tap to {deck.profile.northStar ? 'edit' : 'write it'}</Body>
          </Pressable>
        )}
      </View>

      <Section title="Your identities">
        {deck.identities.length === 0 ? (
          <Body color={t.textSecondary}>Give a card an identity, like “a reader” or “someone who moves every day”. Every kept day becomes a vote for that person.</Body>
        ) : (
          <View style={{ gap: space.md }}>
            {deck.identities.map((id) => {
              const col = cardColors[colorFor(id.habitIds)];
              const next = votesToNextLevel(id.votes);
              const into = next ? (id.votes - id.level.from) / (next.next.from - id.level.from) : 1;
              return (
                <View key={id.identity} style={{ backgroundColor: col.bg, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
                  <Label color={col.ink} style={{ opacity: 0.75 }}>{id.level.label}</Label>
                  <Display size={30} color={col.ink}>{`I’m ${id.identity}`}</Display>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
                    <Display size={44} color={col.ink}>{id.votes}</Display>
                    <Body weight="heavy" size={14} color={col.ink} style={{ paddingBottom: 6 }}>{id.votes === 1 ? 'vote' : 'votes'} · {id.last30} this month</Body>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(23,18,31,0.18)', overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(1, into) * 100}%`, height: '100%', backgroundColor: col.ink }} />
                  </View>
                  <Body size={13} weight="bold" color={col.ink} style={{ opacity: 0.8 }}>
                    {next ? `${next.needed} more to “${next.next.label}”` : 'You are this person now. Keep voting.'}
                  </Body>
                </View>
              );
            })}
          </View>
        )}
      </Section>

      <Section
        title="Your collection"
        action={
          <Pressable onPress={() => router.push('/achievements')} hitSlop={10}>
            <Label color={t.text}>{`${earned.length} of ${deck.achievements.length} · See all`}</Label>
          </Pressable>
        }
      >
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(recent.length ? recent : deck.closest).map((s) => (
            <Pressable key={s.achievement.id} style={{ flex: 1 }} onPress={() => router.push('/achievements')}>
              <AchievementCard state={s} />
            </Pressable>
          ))}
        </View>
        {deck.closest[0] ? (
          <Body size={14} color={t.textSecondary}>{`Next up: ${deck.closest[0].achievement.title}. ${deck.closest[0].achievement.description}`}</Body>
        ) : null}
      </Section>

      <Section title="Your numbers">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {[
            { n: deck.metrics.kept, label: 'kept days' },
            { n: deck.metrics.ceiling, label: 'Ceilings' },
            { n: deck.metrics.floorSaves, label: 'days the Floor saved' },
            { n: deck.metrics.bounceBacks, label: 'bounce-backs' },
            { n: deck.metrics.fullHouse, label: 'full houses' },
            { n: deck.metrics.best30, label: 'best 30 days' },
          ].map((s) => (
            <View key={s.label} style={{ width: '48.5%', backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg }}>
              <Display size={30}>{s.n}</Display>
              <Body size={13} weight="bold" color={t.textSecondary}>{s.label}</Body>
            </View>
          ))}
        </View>
      </Section>

      <View style={{ gap: space.sm }}>
        {deck.archived.length ? <Body size={13} color={t.textSecondary}>{`${deck.archived.length} archived ${deck.archived.length === 1 ? 'card' : 'cards'}. Their kept days still count.`}</Body> : null}
        <Button label="Sign out" variant="quiet" onPress={() => supabase.auth.signOut()} />
      </View>
    </Page>
  );
}
