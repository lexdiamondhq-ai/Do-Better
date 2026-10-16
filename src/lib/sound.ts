import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

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
} as const;

export type SoundName = keyof typeof SOURCES;

/**
 * The card-room tune: a 72 second loop. Phones play the AAC file, which loops without a gap; browsers
 * play the MP3. Only the file for the platform being built is bundled.
 */
const MUSIC = Platform.OS === 'web' ? require('../../assets/sounds/music.mp3') : require('../../assets/sounds/music.m4a');

const VOLUME: Record<SoundName, number> = { floor: 0.8, ceiling: 0.75, later: 0.6, flip: 0.7, cardUp: 0.7, joker: 0.8, face: 0.85, chips: 0.8, call: 0.6, tap: 0.4 };
/** Sounds that can fire again before the last one ends get a second player, so the first isn't cut short. */
const VOICES: Partial<Record<SoundName, number>> = { ceiling: 2, chips: 2, flip: 2 };
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

/** Loads every effect up front once sounds are on, so the first flip of a Showdown isn't late. */
function preload() {
  try {
    ensureMode();
    for (const name of Object.keys(SOURCES) as SoundName[]) pool(name);
  } catch {
    // Effects load on first play instead.
  }
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
