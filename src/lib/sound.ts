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

const VOLUME: Record<SoundName, number> = { floor: 0.8, ceiling: 0.75, later: 0.6, flip: 0.7, cardUp: 0.7, joker: 0.8, face: 0.85, chips: 0.8, call: 0.6, tap: 0.4 };
const MUSIC_VOLUME = 0.32;

let soundsOn = true;
let musicWanted = false;
let musicPlaying = false;
let modeSet = false;
let music: AudioPlayer | null = null;
const players = new Map<SoundName, AudioPlayer>();

function ensureMode() {
  if (modeSet) return;
  modeSet = true;
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});
}

function player(name: SoundName): AudioPlayer {
  let p = players.get(name);
  if (!p) {
    p = createAudioPlayer(SOURCES[name]);
    p.volume = VOLUME[name];
    players.set(name, p);
  }
  return p;
}

/** Plays one effect from the start. Quietly does nothing if sound is off or the player fails. */
export function playSound(name: SoundName, delayMs = 0) {
  if (!soundsOn) return;
  const go = () => {
    try {
      ensureMode();
      const p = player(name);
      p.seekTo(0).catch(() => {});
      p.play();
    } catch {
      // A sound that can't play is never worth an error on screen.
    }
    // Browsers only allow audio after a tap, so the first effect is also the moment music can start.
    if (musicWanted && !musicPlaying) startMusic();
  };
  if (delayMs > 0) setTimeout(go, delayMs);
  else go();
}

function startMusic() {
  try {
    ensureMode();
    if (!music) {
      music = createAudioPlayer(require('../../assets/sounds/music.mp3'));
      music.loop = true;
      music.volume = MUSIC_VOLUME;
    }
    music.play();
    musicPlaying = Platform.OS !== 'web' || music.playing;
  } catch {
    musicPlaying = false;
  }
}

function stopMusic() {
  musicPlaying = false;
  try {
    music?.pause();
  } catch {
    // Nothing to stop.
  }
}

/** Called whenever the settings or the signed-in state change. */
export function setSoundSettings({ sounds, music: wantMusic }: { sounds: boolean; music: boolean }) {
  soundsOn = sounds;
  if (wantMusic === musicWanted) return;
  musicWanted = wantMusic;
  if (wantMusic) startMusic();
  else stopMusic();
}

/** In a browser, music waits for the first tap anywhere. */
export function resumeMusicAfterTap() {
  if (musicWanted && (!musicPlaying || (music && !music.playing))) startMusic();
}
