// Lobby music, through Web Audio (like the sound effects), so it starts as soon as the browser
// lets sound play on any device (one tap unlocks everything) and fades smoothly even on phones.
// If public/local-assets/music/lobby.mp3 is there (it's kept out of git) that track loops;
// otherwise an original lounge theme is generated in code, so every copy of the game has music.

import { audioOut, onAudioUnlocked } from './Sound';

const SRC = '/local-assets/music/lobby.mp3';
const VOLUME = 0.3;
const FADE_S = 1.2;

let want = false;
let enabled = true;
/** The decoded track, or where loading it has got to. */
let track: AudioBuffer | 'none' | 'loading' | 'missing' = 'none';
/** What's playing now: its volume, and how to stop it. */
let playing: { bus: GainNode; stop: () => void } | null = null;

async function load(a: AudioContext) {
  track = 'loading';
  try {
    const res = await fetch(SRC);
    if (!res.ok) throw new Error(String(res.status));
    track = await a.decodeAudioData(await res.arrayBuffer());
  } catch {
    track = 'missing';
  }
  update();
}

function update() {
  const a = audioOut();
  if (!a) return;
  if (!want || !enabled) {
    if (playing) {
      const { bus, stop } = playing;
      playing = null;
      bus.gain.cancelScheduledValues(a.currentTime);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), a.currentTime);
      bus.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + FADE_S);
      setTimeout(() => {
        stop();
        bus.disconnect();
      }, FADE_S * 1000 + 100);
    }
    return;
  }
  // Until the browser lets sound play, wait: the next tap or key press calls update again.
  if (a.state !== 'running' || playing) return;
  if (track === 'none') {
    void load(a);
    return;
  }
  if (track === 'loading') return;
  const bus = a.createGain();
  bus.gain.setValueAtTime(0.0001, a.currentTime);
  bus.gain.exponentialRampToValueAtTime(VOLUME, a.currentTime + FADE_S);
  bus.connect(a.destination);
  if (track === 'missing') playing = { bus, stop: lounge(a, bus) };
  else {
    const src = a.createBufferSource();
    src.buffer = track;
    src.loop = true;
    src.connect(bus);
    src.start();
    playing = { bus, stop: () => src.stop() };
  }
}

/** Play the lobby music (true) or fade it out (false). */
export function setLobbyMusic(on: boolean) {
  want = on;
  update();
}

export function setMusicEnabled(on: boolean) {
  enabled = on;
  update();
}

onAudioUnlocked(update);

/**
 * The generated lobby theme: a slow lounge loop (Dm7, G7, Cmaj7, Am7 at 80 bpm) with soft
 * electric-piano chords, a walking bass, brushes on 2 and 4 and a little melody now and then.
 * Returns a function that stops it.
 */
function lounge(a: AudioContext, out: AudioNode) {
  const BEAT = 60 / 80;
  // Each bar: the chord (MIDI) and a four-note walking bass line.
  const BARS = [
    { chord: [62, 65, 69, 72], bass: [38, 41, 45, 43] },
    { chord: [55, 59, 62, 65], bass: [43, 47, 50, 49] },
    { chord: [60, 64, 67, 71], bass: [36, 40, 43, 45] },
    { chord: [57, 60, 64, 67], bass: [45, 43, 41, 40] },
  ];
  const MELODY = [74, 72, 69, 71, 72, 76, 74, 69];
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  const brush = a.createBuffer(1, Math.ceil(a.sampleRate * 0.12), a.sampleRate);
  const data = brush.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;

  const voice = (freq: number, t: number, dur: number, vol: number, type: OscillatorType) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  let beat = 0;
  let next = a.currentTime + 0.1;
  const timer = window.setInterval(() => {
    while (next < a.currentTime + 0.3) {
      const bar = BARS[Math.floor(beat / 4) % BARS.length];
      const b = beat % 4;
      // Chords on 1 and the "and" of 2, a soft sine with a triangle shimmer.
      if (b === 0 || b === 1) {
        const t = b === 0 ? next : next + BEAT / 2;
        for (const m of bar.chord) {
          voice(hz(m), t, BEAT * 1.8, 0.05, 'sine');
          voice(hz(m) * 2, t, BEAT * 0.8, 0.012, 'triangle');
        }
      }
      voice(hz(bar.bass[b]), next, BEAT * 0.9, 0.16, 'triangle');
      if (b === 1 || b === 3) {
        const src = a.createBufferSource();
        src.buffer = brush;
        const f = a.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 5000;
        const g = a.createGain();
        g.gain.value = 0.08;
        src.connect(f).connect(g).connect(out);
        src.start(next);
      }
      // A melody note on some beats of every other phrase.
      if (Math.floor(beat / 16) % 2 === 1 && (b === 0 || b === 2)) voice(hz(MELODY[(beat / 2) % MELODY.length]), next, BEAT * 1.2, 0.045, 'triangle');
      next += BEAT;
      beat++;
    }
  }, 60);
  return () => window.clearInterval(timer);
}

/** For playtests: which lobby music is loaded, and whether it's playing. */
export const lobbyMusicInfo = () => ({ source: typeof track === 'string' ? track : 'mp3', playing: !!playing });
