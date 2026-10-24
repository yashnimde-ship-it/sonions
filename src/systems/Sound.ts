// Sound effects, made on the fly with the Web Audio API (no audio files to load). Short and
// quiet: a few oscillator notes and noise bursts per effect. Browsers only start audio after
// the player has clicked or pressed a key, so the context is created on the first sound.

import type { Surface } from '../data/surfaces';
import type { TrapKindId } from '../data/trapKinds';

export type SoundId = TrapKindId | 'found' | 'banked' | 'dropped' | 'empty' | 'hide' | 'win' | 'lose' | 'tick' | 'alert' | 'huntStart' | 'gunshot' | 'reload' | 'caught' | 'click' | 'flare' | 'heartbeat' | 'boost' | 'hurt' | 'footstep' | 'hideIn' | 'hideOut' | 'gateOpen' | 'award' | 'revive' | 'coin' | 'combo' | 'ping' | 'count' | 'go';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Footsteps have their own, louder bus (straight to the speakers, not through `master`). */
let stepBus: GainNode | null = null;
let enabled = true;
const unlockedListeners: (() => void)[] = [];

/** Call `fn` whenever sound becomes allowed (the first tap or key press, or after a resume). */
export function onAudioUnlocked(fn: () => void) {
  unlockedListeners.push(fn);
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/**
 * Create/resume the context during a user gesture so later sounds (server events, music) can
 * play. Call it from every tap, click and key press until sound is running: phones (iOS
 * especially) only unlock audio inside a real gesture, and a silent blip started there helps.
 */
export function unlockSound() {
  const a = audio();
  if (!a || a.state === 'running') return;
  const blip = a.createBufferSource();
  blip.buffer = a.createBuffer(1, 1, 22050);
  blip.connect(a.destination);
  blip.start(0);
  void a.resume();
}

/** The audio context for the soundtrack (it has its own volume and setting), or null. */
export function audioOut() {
  return audio();
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    stepBus = ctx.createGain();
    stepBus.gain.value = 0.9;
    stepBus.connect(ctx.destination);
    const c = ctx;
    c.addEventListener('statechange', () => {
      if (c.state === 'running') for (const fn of unlockedListeners) fn();
    });
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One note: a wave sliding from `from` to `to` Hz over `dur` seconds, starting `at` seconds in. */
function tone(a: AudioContext, type: OscillatorType, from: number, to: number, dur: number, at = 0, vol = 0.5, out: AudioNode = master!) {
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of noise through a filter (thuds, hisses, crackles). */
function noise(a: AudioContext, dur: number, at = 0, vol = 0.5, filter: BiquadFilterType = 'lowpass', freq = 800, out: AudioNode = master!) {
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

/**
 * One footstep on `surface`. `vol` is 0..1 (quieter far away, louder sprinting); `pan` puts it
 * left (-1) or right (1). Wood knocks, metal rings, carpet thuds softly, stone and tile click,
 * grass rustles.
 */
export function footstep(surface: Surface, vol: number, pan = 0) {
  if (!enabled || vol < 0.01) return;
  const a = audio();
  if (!a) return;
  const out = a.createStereoPanner();
  out.pan.value = Math.max(-1, Math.min(1, pan));
  out.connect(stepBus!);
  const v = vol * (0.85 + Math.random() * 0.3);
  const p = 0.92 + Math.random() * 0.16; // a little pitch wobble, so steps don't repeat exactly
  switch (surface) {
    // Mostly mid and high frequencies, which laptop and phone speakers can actually play, with
    // a little low thump for headphones.
    case 'wood':
      tone(a, 'triangle', 520 * p, 260, 0.06, 0, 0.45 * v, out);
      noise(a, 0.05, 0, 0.7 * v, 'bandpass', 1500 * p, out);
      tone(a, 'triangle', 160 * p, 90, 0.05, 0, 0.3 * v, out);
      break;
    case 'metal':
      tone(a, 'sine', 1800 * p, 1750 * p, 0.2, 0, 0.18 * v, out);
      tone(a, 'square', 950 * p, 900 * p, 0.08, 0, 0.08 * v, out);
      noise(a, 0.06, 0, 0.5 * v, 'highpass', 3500, out);
      tone(a, 'triangle', 200 * p, 110, 0.05, 0, 0.3 * v, out);
      break;
    case 'carpet':
      noise(a, 0.07, 0, 0.6 * v, 'bandpass', 900 * p, out);
      noise(a, 0.06, 0, 0.35 * v, 'lowpass', 400, out);
      break;
    case 'stone':
      noise(a, 0.045, 0, 0.7 * v, 'highpass', 2500 * p, out);
      tone(a, 'triangle', 300 * p, 160, 0.04, 0, 0.3 * v, out);
      break;
    case 'tile':
      noise(a, 0.04, 0, 0.65 * v, 'bandpass', 3000 * p, out);
      tone(a, 'triangle', 900 * p, 600, 0.035, 0, 0.25 * v, out);
      break;
    case 'grass':
      noise(a, 0.08, 0, 0.5 * v, 'bandpass', 4000 * p, out);
      noise(a, 0.05, 0, 0.3 * v, 'bandpass', 1800 * p, out);
      break;
  }
  setTimeout(() => out.disconnect(), 400);
}

export function play(id: SoundId) {
  if (!enabled) return;
  const a = audio();
  if (!a) return;
  switch (id) {
    case 'shock':
      for (let i = 0; i < 4; i++) tone(a, 'square', 900 + Math.random() * 600, 200, 0.07, i * 0.05, 0.25);
      noise(a, 0.25, 0, 0.3, 'highpass', 2000);
      break;
    case 'spring':
      tone(a, 'sine', 180, 900, 0.25, 0, 0.5);
      tone(a, 'sine', 900, 400, 0.2, 0.22, 0.3);
      break;
    case 'snare':
      noise(a, 0.12, 0, 0.4, 'bandpass', 1500);
      tone(a, 'triangle', 300, 120, 0.15, 0.03, 0.3);
      break;
    case 'glue':
      tone(a, 'sine', 220, 90, 0.35, 0, 0.45);
      noise(a, 0.3, 0.02, 0.2, 'lowpass', 400);
      break;
    case 'oil':
      tone(a, 'sine', 600, 200, 0.4, 0, 0.3);
      tone(a, 'sine', 500, 150, 0.4, 0.1, 0.2);
      break;
    case 'crusher':
      tone(a, 'sawtooth', 70, 50, 1.4, 0, 0.12);
      noise(a, 0.5, 1.5, 0.9, 'lowpass', 300);
      tone(a, 'sine', 90, 30, 0.4, 1.5, 0.7);
      break;
    case 'laser':
      tone(a, 'sawtooth', 1400, 300, 0.25, 0, 0.25);
      tone(a, 'square', 1600, 600, 0.15, 0.08, 0.15);
      break;
    case 'boulder':
      noise(a, 1, 0, 0.5, 'lowpass', 180);
      tone(a, 'sine', 60, 40, 1, 0, 0.4);
      break;
    case 'magnet':
      tone(a, 'sine', 120, 480, 1.2, 0, 0.3);
      tone(a, 'sine', 125, 490, 1.2, 0, 0.2);
      break;
    case 'gas':
      noise(a, 1.4, 0, 0.35, 'highpass', 3000);
      break;
    case 'blackout':
      tone(a, 'square', 220, 40, 0.6, 0, 0.3);
      noise(a, 0.15, 0, 0.4, 'highpass', 1500);
      break;
    case 'fakeLoot':
      noise(a, 0.8, 0, 1, 'lowpass', 600);
      tone(a, 'sine', 120, 30, 0.6, 0, 0.8);
      break;
    case 'found':
      [880, 1175, 1568].forEach((f, i) => tone(a, 'triangle', f, f, 0.18, i * 0.07, 0.35));
      break;
    case 'banked':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, 'square', f, f, 0.14, i * 0.08, 0.18));
      break;
    case 'dropped':
      tone(a, 'triangle', 700, 200, 0.3, 0, 0.35);
      break;
    case 'empty':
      noise(a, 0.18, 0, 0.25, 'lowpass', 700);
      break;
    case 'hide':
      tone(a, 'triangle', 1200, 600, 0.15, 0, 0.25);
      break;
    case 'win':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, 'square', f, f, 0.2, i * 0.1, 0.18));
      break;
    case 'lose':
      [392, 330, 262, 196].forEach((f, i) => tone(a, 'triangle', f, f * 0.95, 0.3, i * 0.16, 0.3));
      break;
    case 'tick':
      tone(a, 'square', 1000, 1000, 0.05, 0, 0.12);
      break;
    case 'gunshot':
      noise(a, 0.18, 0, 0.9, 'lowpass', 2200);
      tone(a, 'square', 180, 60, 0.12, 0, 0.5);
      break;
    case 'reload':
      tone(a, 'square', 900, 900, 0.03, 0, 0.2);
      tone(a, 'square', 600, 600, 0.03, 0.25, 0.2);
      tone(a, 'square', 1200, 1200, 0.04, 1.8, 0.25);
      break;
    case 'caught':
      [440, 330, 220].forEach((f, i) => tone(a, 'sawtooth', f, f * 0.9, 0.18, i * 0.12, 0.25));
      break;
    case 'click':
      tone(a, 'square', 2000, 2000, 0.02, 0, 0.15);
      break;
    case 'flare':
      // A hiss and a rising whistle as the flare goes up.
      noise(a, 0.7, 0, 0.45, 'highpass', 3000);
      tone(a, 'sine', 300, 1400, 0.35, 0, 0.25);
      break;
    case 'heartbeat':
      // Lub-dub, twice.
      [0, 0.22, 0.7, 0.92].forEach((at, i) => tone(a, 'sine', i % 2 ? 70 : 95, 45, 0.14, at, 0.7));
      break;
    case 'boost':
      tone(a, 'sawtooth', 200, 900, 0.3, 0, 0.18);
      noise(a, 0.3, 0, 0.3, 'bandpass', 1500);
      break;
    case 'hurt':
      tone(a, 'square', 320, 110, 0.22, 0, 0.35);
      noise(a, 0.1, 0, 0.4, 'lowpass', 1200);
      break;
    case 'footstep':
      tone(a, 'triangle', 130, 80, 0.06, 0, 0.3);
      break;
    case 'hideIn':
      // A wardrobe door swinging shut.
      noise(a, 0.12, 0, 0.35, 'lowpass', 600);
      tone(a, 'triangle', 220, 140, 0.12, 0.05, 0.3);
      break;
    case 'hideOut':
      // A hiding place opens and the hider slips back out.
      tone(a, 'triangle', 140, 280, 0.1, 0, 0.25);
      noise(a, 0.1, 0.03, 0.25, 'highpass', 900);
      break;
    case 'huntStart':
      // A short rising warning that marks the end of the hiding countdown.
      tone(a, 'square', 440, 660, 0.13, 0, 0.18);
      tone(a, 'square', 660, 990, 0.16, 0.14, 0.2);
      break;
    case 'gateOpen':
      // The main entrance grinds open, then a bright chime.
      tone(a, 'sawtooth', 90, 180, 0.7, 0, 0.12);
      [660, 880, 1320].forEach((f, i) => tone(a, 'square', f, f, 0.12, 0.6 + i * 0.12, 0.15));
      break
    case 'award':
      // A bright sparkle.
      [1320, 1760, 2640].forEach((f, i) => tone(a, 'triangle', f, f, 0.12, i * 0.06, 0.2));
      break;
    case 'revive':
      // A rising heal: up a major arpeggio.
      [523, 659, 784, 1047].forEach((f, i) => tone(a, 'triangle', f, f, 0.14, i * 0.08, 0.25));
      break;
    case 'coin':
      tone(a, 'square', 988, 988, 0.06, 0, 0.18);
      tone(a, 'square', 1319, 1319, 0.18, 0.06, 0.18);
      break;
    case 'combo':
      [784, 988, 1175, 1568].forEach((f, i) => tone(a, 'square', f, f * 1.02, 0.09, i * 0.05, 0.16));
      break;
    case 'ping':
      tone(a, 'sine', 1568, 1568, 0.08, 0, 0.25);
      tone(a, 'sine', 2093, 2093, 0.14, 0.08, 0.2);
      break;
    case 'count':
      tone(a, 'square', 523, 523, 0.14, 0, 0.22);
      break;
    case 'go':
      // A bright chord with a whoosh: the round is on.
      [523, 659, 784, 1047].forEach((f) => tone(a, 'square', f, f, 0.45, 0, 0.12));
      noise(a, 0.35, 0, 0.3, 'highpass', 2500);
      break;
    case 'alert':
      tone(a, 'square', 660, 660, 0.08, 0, 0.15);
      tone(a, 'square', 880, 880, 0.08, 0.1, 0.15);
      break;
  }
}
