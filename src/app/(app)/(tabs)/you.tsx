import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { CardBack } from '@/components/CardBack';
import { ask } from '@/components/Ask';
import { Chips, formatChips } from '@/components/Chips';
import { CardSlot, faceOfCourt, PlayingCard, SuitTag } from '@/components/PlayingCard';
import { SuitGlyph } from '@/components/Suit';
import { Body, Button, Display, Label, Page, PageTitle, Section } from '@/components/ui';
import { SUIT_INFO } from '@/engine/cards';
import type { CourtSuit } from '@/engine/court';
import { BACKS, TABLES, type TableKey } from '@/engine/game';
import { useAuth } from '@/lib/auth';
import { useData } from '@/lib/data';
import { useDeck, useLook } from '@/lib/deck';
import { usePrefs } from '@/lib/prefs';
import { playSound } from '@/lib/sound';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space, suitColors, themes, tables } from '@/theme/tokens';

/** Who you are becoming: your north star, the Court of face cards each part of you has earned, and your winnings. */
export default function You() {
  const t = useTheme();
  const router = useRouter();
  const deck = useDeck();
  const { demo, endDemo } = useAuth();
  const { back: myBack, table: myTable, setLook } = useLook();
  const { prefs, setPrefs } = usePrefs();
  const { saveProfile } = useData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  if (!deck) return null;

  const { game } = deck;
  const faces = deck.court.filter((c) => c.face).length;

  async function save() {
    setBusy(true);
    try {
      await saveProfile({ northStar: draft });
      setEditing(false);
    } catch (e) {
      ask('That didn’t save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  function pickTable(key: TableKey) {
    Haptics.selectionAsync();
    setLook({ table: key });
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
            <Display size={28} color={t.onCardBack}>{deck.profile.northStar ?? 'Write one sentence about who you’re becoming.'}</Display>
            <Body size={13} weight="bold" color={t.onCardBack} style={{ opacity: 0.55 }}>Tap to {deck.profile.northStar ? 'edit' : 'write it'}</Body>
          </Pressable>
        )}
      </View>

      <Section title="The Court" action={<Label>{`${faces} of 4 suits crowned`}</Label>}>
        <Body size={14} color={t.textSecondary}>
          Every kept day counts for a part of you. Ten kept days earn a suit its Jack, then come the Queen, the King and the Ace. Each new face card deals you a Joker.
        </Body>
        <View style={{ gap: space.sm }}>
          {deck.court.map((suit) => (
            <CourtRow key={suit.suit} suit={suit} onFind={() => router.push('/playbook')} />
          ))}
        </View>
      </Section>

      <Section title="Your stack">
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Chips value={game.stack} size={40} color={t.text} />
          <Body size={13} weight="bold" color={t.textSecondary} style={{ paddingBottom: 6 }}>{`${game.weeks.length} ${game.weeks.length === 1 ? 'week' : 'weeks'} played`}</Body>
        </View>
        <Body size={14} color={t.textSecondary}>Chips never leave your stack. Bigger stacks open new tables, and each table recolours the whole app.</Body>
        <View style={{ gap: space.sm }}>
          {TABLES.map((table) => {
            const open = game.tables.has(table.key);
            const on = myTable === table.key;
            const look = table.key === 'kitchen' ? (t.scheme === 'dark' && on ? themes.dark : themes.light) : tables[table.key];
            return (
              <Pressable
                key={table.key}
                disabled={!open}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !open }}
                onPress={() => pickTable(table.key)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.md, borderWidth: on ? 2 : 0, borderColor: t.accent, opacity: open ? 1 : 0.55 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: look.accent }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body weight="heavy">{table.name}</Body>
                  <Body size={13} color={t.textSecondary}>{table.about}</Body>
                </View>
                <Body size={12} weight="heavy" color={on ? t.text : t.textSecondary}>{on ? 'SEATED' : open ? 'SIT' : `${formatChips(table.chips)}`}</Body>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Card backs" action={<Label>{`${game.backs.size} of ${BACKS.length}`}</Label>}>
        <Body size={14} color={t.textSecondary}>Each back unlocks its own way, at the Showdown of the week that earns it. Days still to come wear the one you pick.</Body>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.md }}>
          {BACKS.map((b) => {
            const open = game.backs.has(b.key);
            const on = myBack === b.key;
            return (
              <Pressable
                key={b.key}
                disabled={!open}
                accessibilityRole="radio"
                accessibilityLabel={`${b.name} card back${open ? '' : `. ${b.how}`}`}
                accessibilityState={{ selected: on, disabled: !open }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setLook({ back: b.key });
                }}
                style={{ alignItems: 'center', gap: 6, width: 84 }}
              >
                <View style={{ padding: 3, borderRadius: 14, borderWidth: 2, borderColor: on ? t.accent : 'transparent' }}>
                  <View>
                    <CardBack back={b.key} size="md" />
                    {!open ? (
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, backgroundColor: 'rgba(10,8,14,0.62)', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                        <Body size={11} weight="heavy" color="#FFFFFF" style={{ textAlign: 'center' }}>{b.how}</Body>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Body size={12} weight="heavy" color={open ? t.text : t.textFaint}>{b.name}</Body>
              </Pressable>
            );
          })}
        </ScrollView>
      </Section>

      <Section title="Your numbers">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {[
            { n: deck.totals.kept, label: 'habit-days kept' },
            { n: deck.totals.ceilings, label: 'Ceilings reached' },
            { n: deck.totals.rescues, label: 'days saved by a comeback' },
            { n: deck.totals.jokers, label: 'Jokers dealt' },
          ].map((s) => (
            <View key={s.label} style={{ width: '48.5%', backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg }}>
              <Display size={30}>{formatChips(s.n)}</Display>
              <Body size={13} weight="bold" color={t.textSecondary}>{s.label}</Body>
            </View>
          ))}
          <View style={{ width: '100%', backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg, gap: 2 }}>
            <Label>Best hand ever</Label>
            <Display size={22}>{game.bestEver?.hand.title ?? 'Your first Showdown is Sunday'}</Display>
          </View>
        </View>
      </Section>

      <Section title="Sound">
        <Toggle label="Music" about="A slow tune for the card room while you play." on={prefs.music} onChange={(music) => setPrefs({ music })} />
        <Toggle
          label="Sounds"
          about="A sound for each swipe, card and Showdown."
          on={prefs.sounds}
          onChange={(sounds) => {
            setPrefs({ sounds });
            if (sounds) playSound('tap');
          }}
        />
        <Body size={13} color={t.textSecondary}>Your phone’s silent switch turns both off.</Body>
      </Section>

      <View style={{ gap: space.sm }}>
        {deck.archived.length ? <Body size={13} color={t.textSecondary}>{`${deck.archived.length} archived ${deck.archived.length === 1 ? 'card' : 'cards'}. Their kept days still count.`}</Body> : null}
        <Button label="How the game works" variant="ghost" onPress={() => router.push({ pathname: '/onboarding', params: { tour: '1' } })} />
        {demo ? <Body size={13} color={t.textSecondary} style={{ textAlign: 'center' }}>This is the demo deck. Nothing in it is saved.</Body> : null}
        <Button label={demo ? 'Leave the demo' : 'Sign out'} variant="quiet" onPress={() => (demo ? endDemo() : supabase.auth.signOut())} />
      </View>
    </Page>
  );
}

function CourtRow({ suit, onFind }: { suit: CourtSuit; onFind: () => void }) {
  const t = useTheme();
  const info = SUIT_INFO[suit.suit];
  const color = t.scheme === 'dark' ? suitColors[suit.suit].bright : suitColors[suit.suit].glyph;
  const from = suit.face?.votes ?? 0;
  const progress = suit.next ? (suit.votes - from) / (suit.next.face.votes - from) : 1;
  const empty = suit.habitIds.length === 0;
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, backgroundColor: t.bgRaised, borderRadius: radius.lg, padding: space.md, alignItems: 'center' }}>
      {suit.face ? (
        <PlayingCard face={faceOfCourt(suit.suit, suit.face)} size="md" />
      ) : (
        <CardSlot size="md" color={t.dashed}>
          <SuitGlyph suit={suit.suit} size={30} color={t.textFaint} />
        </CardSlot>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <SuitTag suit={suit.suit} name color={color} />
        <Display size={20}>{suit.face ? `${suit.face.name} · ${suit.face.title}` : empty ? 'Empty seat' : 'Earning its Jack'}</Display>
        <Body size={13} color={t.textSecondary} numberOfLines={2}>
          {suit.identities.length ? `I’m ${suit.identities.slice(0, 3).join(', ')}` : info.about}
        </Body>
        {empty ? (
          <Pressable onPress={onFind} hitSlop={8}>
            <Body size={13} weight="heavy">{`Find a ${info.part} habit in the Playbook →`}</Body>
          </Pressable>
        ) : (
          <>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface, overflow: 'hidden', marginTop: 2 }}>
              <View style={{ width: `${Math.max(3, Math.min(1, progress) * 100)}%`, height: '100%', backgroundColor: color }} />
            </View>
            <Body size={12} weight="bold" color={t.textSecondary}>
              {`${suit.votes} kept days · ${suit.next ? `${suit.next.needed} to the ${suit.next.face.name}` : 'every face earned'}${suit.lastWeek ? ` · +${suit.lastWeek} this week` : ''}`}
            </Body>
          </>
        )}
      </View>
    </View>
  );
}


function Toggle({ label, about, on, onChange }: { label: string; about: string; on: boolean; onChange: (on: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={label}
      onPress={() => onChange(!on)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.bgRaised, borderRadius: radius.md, padding: space.lg }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="heavy">{label}</Body>
        <Body size={13} color={t.textSecondary}>{about}</Body>
      </View>
      <View style={{ width: 52, height: 32, borderRadius: 16, padding: 3, backgroundColor: on ? t.text : t.border, alignItems: on ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: on ? t.bg : t.bgRaised }} />
      </View>
    </Pressable>
  );
}
