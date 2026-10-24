// The heist soundtrack, made on the fly with the Web Audio API like the sound effects. While
// sneaking it's a quiet minor-key pad and a slow pulse; as the danger (intensity 0..1) rises it
// adds a ticking hi-hat, a plucked arpeggio, a heartbeat kick and finally a high tension note.

import { audioOut } from './Sound';

const BPM = 92;
/** A 16th note, in seconds. */
const STEP = 60 / BPM / 4;
/** A minor, two bars per chord: Am, F, Dm, E (MIDI notes). */
const CHORDS = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
const VOLUME = 0.16;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

let enabled = true;
let playing = false;
/** Where the intensity is heading, and where it is now (it eases there). */
let target = 0;
let level = 0;
let ac: AudioContext | null = null;
let bus: GainNode | null = null;
let padFilter: BiquadFilterNode | null = null;
let pad: OscillatorNode[] = [];
let hiss: AudioBuffer | null = null;
let timer = 0;
let nextTime = 0;
let step = 0;

function start() {
  const a = audioOut();
  if (!a) return;
  ac = a;
  playing = true;
  bus = a.createGain();
  bus.gain.setValueAtTime(0.0001, a.currentTime);
  bus.gain.exponentialRampToValueAtTime(VOLUME, a.currentTime + 1.5);
  bus.connect(a.destination);
  // The pad: two detuned saws and a soft triangle an octave down, through a lowpass that opens
  // up with the intensity.
  padFilter = a.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 300;
  const padGain = a.createGain();
  padGain.gain.value = 0.18;
  padFilter.connect(padGain).connect(bus);
  pad = (['sawtooth', 'sawtooth', 'triangle'] as OscillatorType[]).map((type, i) => {
    const o = a.createOscillator();
    o.type = type;
    o.frequency.value = hz(CHORDS[0][0] - (i === 2 ? 24 : 12));
    o.detune.value = i === 1 ? 9 : 0;
    o.connect(padFilter!);
    o.start();
    return o;
  });
  hiss = a.createBuffer(1, Math.ceil(a.sampleRate * 0.05), a.sampleRate);
  const data = hiss.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  nextTime = a.currentTime + 0.05;
  step = 0;
  timer = window.setInterval(schedule, 40);
}

function stop() {
  playing = false;
  window.clearInterval(timer);
  const a = ac;
  const b = bus;
  const oscs = pad;
  if (!a || !b) return;
  b.gain.cancelScheduledValues(a.currentTime);
  b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), a.currentTime);
  b.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1.2);
  setTimeout(() => {
    for (const o of oscs) o.stop();
    b.disconnect();
  }, 1300);
  bus = null;
  pad = [];
}

/** Schedule the notes for the next moment (a little ahead, so timing stays tight). */
function schedule() {
  if (!ac || !bus) return;
  level += (target - level) * (target > level ? 0.06 : 0.02);
  while (nextTime < ac.currentTime + 0.15) {
    playStep(step, nextTime);
    nextTime += STEP;
    step++;
  }
}

function playStep(s: number, t: number) {
  const i = s % 16;
  const chord = CHORDS[Math.floor(s / 32) % CHORDS.length];
  if (i === 0) {
    pad.forEach((o, k) => o.frequency.setTargetAtTime(hz(chord[k === 2 ? 0 : k] - (k === 2 ? 24 : 12)), t, 0.25));
    padFilter?.frequency.setTargetAtTime(260 + level * 1500, t, 0.5);
  }
  // Bass pulse: on the beat, on every 8th once things heat up.
  if (i % 4 === 0 || (level > 0.55 && i % 2 === 0)) note(hz(chord[0] - 24), t, 'triangle', 0.22, 0.3 * (0.6 + level));
  // Hi-hat: 8ths, then 16ths.
  if ((level > 0.3 && i % 2 === 0) || level > 0.75) hat(t, (0.05 + 0.1 * level) * (i % 4 === 2 ? 1.3 : 1));
  // Arpeggio: a sparse note while sneaking, running 8ths when tense.
  if ((level > 0.2 && i % 8 === 0) || (level > 0.45 && i % 2 === 0)) note(hz(chord[(i / 2) % 3] + 12), t, 'triangle', 0.18, 0.05 + 0.07 * level);
  // Heartbeat: lub-dub on beats 1 and 3.
  if (level > 0.6 && (i === 0 || i === 8)) {
    kick(t, 0.5 * level);
    kick(t + 0.15, 0.3 * level);
  }
  // At the very top: a high tense note held across the bar.
  if (level > 0.82 && i === 0) note(hz(chord[2] + 24), t, 'sine', STEP * 16, 0.035);
}

function note(freq: number, t: number, type: OscillatorType, dur: number, vol: number) {
  const o = ac!.createOscillator();
  const g = ac!.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hat(t: number, vol: number) {
  const src = ac!.createBufferSource();
  src.buffer = hiss;
  const f = ac!.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ac!.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(bus!);
  src.start(t);
}

function kick(t: number, vol: number) {
  const o = ac!.createOscillator();
  const g = ac!.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(bus!);
  o.start(t);
  o.stop(t + 0.2);
}

/** Each frame in a heist: how tense it is (0..1), or null for no soundtrack. */
export function setHeistMusic(intensity: number | null) {
  if (intensity === null || !enabled) {
    if (playing) stop();
    return;
  }
  target = Math.max(0, Math.min(1, intensity));
  if (!playing) {
    level = target;
    start();
  }
}

export function setHeistMusicEnabled(on: boolean) {
  enabled = on;
  if (!on && playing) stop();
}

/** For playtests: the intensity the music is at now. */
export const heistMusicLevel = () => (playing ? level : -1);
