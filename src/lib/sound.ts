import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

import type { Suit } from '@/engine/cards';
import { keepSound, suitTone, type KeySound, type Tone, type ToneStep } from '@/engine/chord';

/**
 * The table's music and one sound for each thing you do. Every sound is made by
 * scripts/make-sounds.py, so it can be tuned there and regenerated.
 *
 * The phone's silent switch wins: nothing plays while it's on, and music mixes with whatever else
 * is playing instead of stopping it.
 */

const SOURCES = {
  floor: require('../../assets/sounds/floor.mp3'),
  ceiling: require('../../assets/sounds/ceiling.mp3'),
  later: require('../../assets/sounds/later.mp3'),
  flip: require('../../assets/sounds/flip.mp3'),
  cardUp: require('../../assets/sounds/card-up.mp3'),
  joker: require('../../assets/sounds/joker.mp3'),
  face: require('../../assets/sounds/face.mp3'),
  chips: require('../../assets/sounds/chips.mp3'),
  call: require('../../assets/sounds/call.mp3'),
  tap: require('../../assets/sounds/tap.mp3'),
  /** A card landing in its slot in the week: a brush across the felt and a soft tap. */
  deal: require('../../assets/sounds/deal.mp3'),
  // The day's chord (src/engine/chord.ts): each keep ends on its suit's note. Spades F, Hearts A,
  // Diamonds C, Clubs D. A Floor sounds it softly, a Ceiling runs up to its octave, a Comeback steps up into it.
  'floor-spades': require('../../assets/sounds/floor-spades.mp3'),
  'floor-hearts': require('../../assets/sounds/floor-hearts.mp3'),
  'floor-diamonds': require('../../assets/sounds/floor-diamonds.mp3'),
  'floor-clubs': require('../../assets/sounds/floor-clubs.mp3'),
  'ceiling-spades': require('../../assets/sounds/ceiling-spades.mp3'),
  'ceiling-hearts': require('../../assets/sounds/ceiling-hearts.mp3'),
  'ceiling-diamonds': require('../../assets/sounds/ceiling-diamonds.mp3'),
  'ceiling-clubs': require('../../assets/sounds/ceiling-clubs.mp3'),
  'resolve-spades': require('../../assets/sounds/resolve-spades.mp3'),
  'resolve-hearts': require('../../assets/sounds/resolve-hearts.mp3'),
  'resolve-diamonds': require('../../assets/sounds/resolve-diamonds.mp3'),
  'resolve-clubs': require('../../assets/sounds/resolve-clubs.mp3'),
  // The notes a finished day strums and a Showdown hand rings, and a low F for cards with no suit.
  'ring-f4': require('../../assets/sounds/ring-f4.mp3'),
  'ring-a4': require('../../assets/sounds/ring-a4.mp3'),
  'ring-c5': require('../../assets/sounds/ring-c5.mp3'),
  'ring-d5': require('../../assets/sounds/ring-d5.mp3'),
  'ring-f5': require('../../assets/sounds/ring-f5.mp3'),
  'ring-a5': require('../../assets/sounds/ring-a5.mp3'),
  'ring-c6': require('../../assets/sounds/ring-c6.mp3'),
  'ring-d6': require('../../assets/sounds/ring-d6.mp3'),
  'ring-low': require('../../assets/sounds/ring-low.mp3'),
} as const;

export type SoundName = keyof typeof SOURCES;

/** Every sound by name, so a test can check each keep sound and note has a file. */
export const SOUND_NAMES = Object.keys(SOURCES) as SoundName[];

// Every keep sound and ringing note the engine can ask for has a file here, or this line fails to type.
const covered: [Exclude<KeySound | Tone, SoundName>] extends [never] ? true : never = true;
void covered;

/**
 * The sounds loaded as soon as sounds are on, so the first of each is never late. The day's chord (a
 * keep sound for each suit and the ring notes) would add some 30 players, so each of those is made the
 * first time it plays, and a strum makes all of its notes before the first one rings.
 */
const EAGER = new Set<SoundName>(['floor', 'ceiling', 'later', 'flip', 'cardUp', 'joker', 'face', 'chips', 'call', 'tap', 'deal']);

/**
 * The card-room tune: a 72 second loop. Phones play the AAC file, which loops without a gap; browsers
 * play the MP3. Only the file for the platform being built is bundled.
 */
const MUSIC = Platform.OS === 'web' ? require('../../assets/sounds/music.mp3') : require('../../assets/sounds/music.m4a');

/** Ring notes stay quiet: a full day strums up to eight of them at once. */
const RING = 0.4;
const VOLUME: Record<SoundName, number> = {
  floor: 0.8,
  ceiling: 0.75,
  later: 0.6,
  flip: 0.7,
  cardUp: 0.7,
  joker: 0.8,
  face: 0.85,
  chips: 0.8,
  call: 0.6,
  tap: 0.4,
  deal: 0.6,
  'floor-spades': 0.8,
  'floor-hearts': 0.8,
  'floor-diamonds': 0.8,
  'floor-clubs': 0.8,
  'ceiling-spades': 0.75,
  'ceiling-hearts': 0.75,
  'ceiling-diamonds': 0.75,
  'ceiling-clubs': 0.75,
  'resolve-spades': 0.8,
  'resolve-hearts': 0.8,
  'resolve-diamonds': 0.8,
  'resolve-clubs': 0.8,
  'ring-f4': RING,
  'ring-a4': RING,
  'ring-c5': RING,
  'ring-d5': RING,
  'ring-f5': RING,
  'ring-a5': RING,
  'ring-c6': RING,
  'ring-d6': RING,
  'ring-low': RING,
};
/**
 * Sounds that can fire again before the last one ends get a second player, so the first isn't cut short.
 * A ring note can come twice in one hand's chord (three Jokers ring the low F three times).
 */
const VOICES: Partial<Record<SoundName, number>> = {
  ceiling: 2,
  chips: 2,
  flip: 2,
  deal: 2,
  'ring-f4': 2,
  'ring-a4': 2,
  'ring-c5': 2,
  'ring-d5': 2,
  'ring-f5': 2,
  'ring-a5': 2,
  'ring-c6': 2,
  'ring-d6': 2,
  'ring-low': 2,
};
const MUSIC_VOLUME = 0.32;
const FADE_IN_MS = 1000;
const FADE_OUT_MS = 400;

let soundsOn = true;
let musicWanted = false;
let musicPlaying = false;
let modeSet = false;
let music: AudioPlayer | null = null;
let fade: ReturnType<typeof setInterval> | null = null;
const pools = new Map<SoundName, { players: AudioPlayer[]; next: number }>();

/** Whether the page has been tapped or typed on, kept for browsers that can't say so themselves. */
let touched = false;

/**
 * A browser refuses to play anything until the page has been tapped or typed on, and the refusal is a
 * promise rejection inside the player that nothing here can catch. So on the web nothing is asked to
 * play before then: sounds before the first tap are skipped, and music waits for it.
 */
function mayPlay(): boolean {
  if (Platform.OS !== 'web') return true;
  // A browser that can say whether the page has been used is always asked: it knows which keys count.
  const activation = (globalThis as { navigator?: { userActivation?: { hasBeenActive?: unknown } } }).navigator?.userActivation;
  if (activation && typeof activation.hasBeenActive === 'boolean') return activation.hasBeenActive;
  return touched;
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  // The events a browser counts as the page being used, for browsers that can't say so themselves.
  const wake = (e: Event) => {
    if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') return;
    touched = true;
    resumeMusicAfterTap();
  };
  for (const type of ['pointerup', 'touchend', 'keydown', 'click']) document.addEventListener(type, wake, { capture: true, passive: true });
}

function ensureMode() {
  if (modeSet) return;
  modeSet = true;
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});
}

function pool(name: SoundName) {
  let p = pools.get(name);
  if (!p) {
    const players = Array.from({ length: VOICES[name] ?? 1 }, () => {
      const player = createAudioPlayer(SOURCES[name]);
      player.volume = VOLUME[name];
      return player;
    });
    p = { players, next: 0 };
    pools.set(name, p);
  }
  return p;
}

/** Loads the everyday effects up front once sounds are on, so the first flip of a Showdown isn't late. */
function preload() {
  try {
    ensureMode();
    for (const name of EAGER) pool(name);
  } catch {
    // Effects load on first play instead.
  }
}

/** Makes the players for sounds about to play, so a note due in a moment is ready when it's due. */
function warm(names: Iterable<SoundName>) {
  if (!soundsOn) return;
  try {
    ensureMode();
    for (const name of names) pool(name);
  } catch {
    // They load on first play instead.
  }
}

/**
 * Gets the sounds a deck will ask for ready ahead of time, a moment after it shows: each of its suits'
 * keep sounds and ring notes, so the first keep of each suit and the first strum aren't late. Only the
 * deck's own suits, so a small deck never makes players it won't use.
 */
export function warmDeckSounds(suits: Iterable<Suit>) {
  const names = new Set<SoundName>(['ring-low']);
  for (const suit of suits) {
    names.add(keepSound(suit, 'floor'));
    names.add(keepSound(suit, 'ceiling'));
    names.add(keepSound(suit, 'floor', { comeback: true }));
    names.add(suitTone(suit));
    names.add(suitTone(suit, true));
  }
  warm(names);
}

/** Plays one effect from the start. Quietly does nothing if sound is off or the player fails. */
export function playSound(name: SoundName, delayMs = 0) {
  if (!soundsOn) return;
  const go = () => {
    if (!soundsOn || !mayPlay()) return;
    try {
      ensureMode();
      const p = pool(name);
      const player = p.players[p.next];
      p.next = (p.next + 1) % p.players.length;
      player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // A sound that can't play is never worth an error on screen.
    }
    // Browsers only allow audio after a tap, so the first effect is also the moment music can start.
    if (musicWanted && !musicPlaying) startMusic();
  };
  if (delayMs > 0) setTimeout(go, delayMs);
  else go();
}

/**
 * Plays a strum or a hand's chord, each note `delayMs` after `startMs`. Every note's player is made
 * before the first rings, so a strum that starts 380 ms after the last keep is ready on time. The sounds
 * switch applies to each note as it comes, so turning sounds off mid-strum stops the rest.
 *
 * Returns the moment the notes count from (Date.now()), sounds on or off, so whatever moves in time with
 * them counts from the same moment.
 */
export function playTones(steps: readonly ToneStep[], startMs = 0): number {
  const from = Date.now();
  if (!soundsOn || !steps.length) return from;
  warm(steps.map((s) => s.tone));
  for (const step of steps) playSound(step.tone, Math.max(0, startMs + step.delayMs));
  return from;
}

/** Moves the music's volume to `to` over `ms`, then runs `done`. */
function ramp(to: number, ms: number, done?: () => void) {
  if (fade) clearInterval(fade);
  fade = null;
  const player = music;
  if (!player) return;
  const from = player.volume;
  const steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  fade = setInterval(() => {
    i++;
    try {
      player.volume = from + (to - from) * (i / steps);
    } catch {
      // The player went away; nothing left to fade.
    }
    if (i >= steps) {
      if (fade) clearInterval(fade);
      fade = null;
      done?.();
    }
  }, 50);
}

function startMusic() {
  if (!mayPlay()) {
    musicPlaying = false;
    return;
  }
  try {
    ensureMode();
    if (!music) {
      music = createAudioPlayer(MUSIC);
      music.loop = true;
      music.volume = 0;
      // The player says when it is really playing: a browser can refuse until the first tap, and a
      // phone call or another app can pause it.
      music.addListener('playbackStatusUpdate', (status) => {
        musicPlaying = status.playing;
      });
    }
    if (!music.playing) music.volume = 0;
    music.play();
    musicPlaying = Platform.OS !== 'web' || music.playing;
    ramp(MUSIC_VOLUME, FADE_IN_MS);
  } catch {
    musicPlaying = false;
  }
}

function stopMusic() {
  musicPlaying = false;
  const player = music;
  if (!player) return;
  ramp(0, FADE_OUT_MS, () => {
    try {
      if (!musicWanted) player.pause();
    } catch {
      // Nothing to stop.
    }
  });
}

/** Called whenever the settings or the signed-in state change. Music is on unless the player turns it off. */
export function setSoundSettings({ sounds, music: wantMusic }: { sounds: boolean; music: boolean }) {
  const was = soundsOn;
  soundsOn = sounds;
  if (sounds && (!was || !pools.size)) preload();
  if (wantMusic === musicWanted) return;
  musicWanted = wantMusic;
  if (wantMusic) startMusic();
  else stopMusic();
}

/** In a browser, music waits for the first tap anywhere. */
export function resumeMusicAfterTap() {
  if (musicWanted && (!musicPlaying || (music && !music.playing))) startMusic();
}
