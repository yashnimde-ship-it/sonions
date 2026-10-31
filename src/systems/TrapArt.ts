// The twelve traps' art. Each has a painted sprite from the trap art pack (TRAP_ART below); the
// pixel art painted in code (cached as sprites) is what Runners see of the disguised traps (the
// Snare, the Fake Loot chest), and stands in for a sprite until its image has loaded.
// 'runner' is what Runners see; 'saboteur' is everything (the snare's rope, the fake chest's eye).

import { TRAP_KINDS, type TrapKind, type TrapKindId } from '../data/trapKinds';

export type TrapView = 'runner' | 'saboteur';
type G = CanvasRenderingContext2D;

const PAD = 2;

/** Fill a rectangle in whole pixels. Coordinates are relative to the trap's centre. */
const r = (g: G, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};

/** A filled pixel disc. */
const disc = (g: G, cx: number, cy: number, rad: number, c: string) => {
  g.fillStyle = c;
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad * 0.5) g.fillRect(cx + x, cy + y, 1, 1);
};

/** A one-pixel ring. */
const ring = (g: G, cx: number, cy: number, rad: number, c: string, dash = 0) => {
  g.fillStyle = c;
  const steps = Math.round(rad * 8);
  for (let i = 0; i < steps; i++) {
    if (dash && Math.floor(i / dash) % 2) continue;
    const a = (i / steps) * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad), 1, 1);
  }
};

/** A small repeatable random stream, so each animation frame has fixed sparks and puffs. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** An up arrow, `s` px half-width. */
const arrow = (g: G, cx: number, cy: number, s: number, c: string) => {
  for (let i = 0; i <= s; i++) r(g, cx - i, cy - s + i, i * 2 + 1, 1, c);
  r(g, cx - Math.floor(s / 2), cy + 1, Math.floor(s / 2) * 2 + 1, s, c);
};

/** A blobby outline: radius `base` wobbled by a few sines. Returns whether (x, y) is inside, and how deep. */
const blob = (base: number, seed: number) => (x: number, y: number) => {
  const a = Math.atan2(y, x);
  const rad = base + 3 * Math.sin(a * 3 + seed) + 2 * Math.sin(a * 5 + seed * 2) + 1.5 * Math.sin(a * 8 + seed * 3);
  return rad - Math.hypot(x, y);
};

interface Art {
  frames: number;
  frameMs: number;
  paint(g: G, frame: number, view: TrapView): void;
}

const ART: Record<TrapKindId, Art> = {
  // A dark steel plate with a recessed centre, red lines of current crackling round it.
  shock: {
    frames: 6,
    frameMs: 110,
    paint(g, f) {
      r(g, -14, -14, 28, 28, '#15131b');
      r(g, -13, -13, 26, 26, '#4a4d5a');
      r(g, -12, -12, 24, 24, '#2b2d37');
      r(g, -12, -12, 24, 1, '#6a6e7c');
      r(g, -12, -12, 1, 24, '#6a6e7c');
      for (const [bx, by] of [[-10, -10], [8, -10], [-10, 8], [8, 8]]) {
        r(g, bx, by, 3, 3, '#8a8e9c');
        r(g, bx + 1, by + 1, 1, 1, '#3a3d4a');
      }
      r(g, -7, -7, 14, 14, '#15131b');
      r(g, -6, -6, 12, 12, '#3a3d4a');
      for (let i = 0; i <= 4; i++) r(g, -i, -4 + i, i * 2 + 1, 1, '#14131a'), r(g, -i, 4 - i, i * 2 + 1, 1, '#14131a');
      r(g, -1, -1, 2, 2, '#ff3b4a');
      // Red glow lines on the edges.
      for (const s of [-1, 1]) {
        r(g, -9, s * 11 - (s < 0 ? 0 : 1), 18, 1, '#a82434');
        r(g, s * 11 - (s < 0 ? 0 : 1), -9, 1, 18, '#a82434');
      }
      // Sparks arcing off the plate.
      const rand = rng(f * 977 + 13);
      for (let i = 0; i < 5; i++) {
        const side = Math.floor(rand() * 4);
        let x = side < 2 ? (rand() - 0.5) * 24 : side === 2 ? -13 : 13;
        let y = side >= 2 ? (rand() - 0.5) * 24 : side === 0 ? -13 : 13;
        const dx = side === 2 ? -1 : side === 3 ? 1 : (rand() - 0.5) * 2;
        const dy = side === 0 ? -1 : side === 1 ? 1 : (rand() - 0.5) * 2;
        for (let s = 0; s < 4; s++) {
          r(g, x, y, 1, 1, s < 2 ? '#ffd0d4' : '#ff3b4a');
          x += dx * 2 + (rand() - 0.5) * 2;
          y += dy * 2 + (rand() - 0.5) * 2;
        }
      }
    },
  },

  // A yellow-and-black bordered pad with two chevrons that bounce.
  spring: {
    frames: 4,
    frameMs: 160,
    paint(g, f) {
      r(g, -16, -16, 32, 32, '#15131b');
      for (let i = 0; i < 32; i += 4) {
        const c = (i / 4) % 2 ? '#15131b' : '#f2b632';
        r(g, -16 + i, -16, 4, 3, c);
        r(g, -16 + i, 13, 4, 3, c);
        r(g, -16, -16 + i, 3, 4, c);
        r(g, 13, -16 + i, 3, 4, c);
      }
      r(g, -12, -12, 24, 24, '#4c4f57');
      r(g, -11, -11, 22, 22, '#6f737b');
      r(g, -11, -11, 22, 1, '#8c9099');
      r(g, -12, -12, 24, 1, '#f2b632');
      r(g, -12, 11, 24, 1, '#f2b632');
      r(g, -12, -12, 1, 24, '#f2b632');
      r(g, 11, -12, 1, 24, '#f2b632');
      const lift = [0, -1, -2, -1][f];
      for (const [ay, shade] of [[-5, '#ffd25a'], [5, '#f2b632']] as const) {
        arrow(g, 1, ay + lift + 1, 5, '#15131b');
        arrow(g, 0, ay + lift, 5, shade);
        arrow(g, 0, ay + lift + 1, 3, '#c98a1a');
      }
    },
  },

  // A woven rug. Only the Saboteur sees the rope loop lying on it.
  snare: {
    frames: 1,
    frameMs: 1000,
    paint(g, _f, view) {
      r(g, -16, -12, 32, 24, '#3d1016');
      r(g, -15, -11, 30, 22, '#c9a24a');
      r(g, -14, -10, 28, 20, '#8f2a30');
      for (let y = -8; y < 8; y += 4)
        for (let x = -12; x < 12; x += 4) {
          const on = (((x + 12) / 4) + ((y + 8) / 4)) % 2 === 0;
          r(g, x, y, 4, 4, on ? '#a8383b' : '#7a2128');
          if (on) r(g, x + 1, y + 1, 2, 2, '#d8a060');
        }
      r(g, -14, -10, 28, 1, '#b84a4a');
      for (let x = -16; x < 16; x += 2) {
        r(g, x, -13, 1, 1, '#d9c8a0');
        r(g, x, 12, 1, 1, '#d9c8a0');
      }
      if (view === 'saboteur') {
        // The rope: a loop with a knot and a long tail.
        ring(g, -2, 0, 7, '#9a7a3c');
        ring(g, -2, -1, 7, '#d8b56a');
        ring(g, -2, 0, 5, '#9a7a3c');
        ring(g, -2, -1, 5, '#e6c987');
        r(g, 5, 2, 8, 1, '#d8b56a');
        r(g, 12, 3, 3, 1, '#9a7a3c');
        r(g, 4, -1, 3, 3, '#7a5a28');
        r(g, 4, -1, 2, 2, '#d8b56a');
      }
    },
  },

  // A sticky amber puddle, 3x3 tiles, with a gloss and a few drips.
  glue: {
    frames: 4,
    frameMs: 220,
    paint(g, f) {
      const inside = blob(19, 1.3);
      for (let y = -24; y < 24; y++)
        for (let x = -24; x < 24; x++) {
          const d = inside(x, y);
          if (d < 0) continue;
          const c = d < 1.6 ? '#9a5c0c' : d < 3 ? '#cf8414' : (x * 7 + y * 13) % 17 === 0 ? '#ffc94a' : '#e8a21c';
          r(g, x, y, 1, 1, c);
        }
      // Gloss streaks and bubbles.
      r(g, -12, -11, 7, 2, '#fff0a0');
      r(g, -13, -9, 2, 4, '#fff0a0');
      r(g, 6, 5, 4, 1, '#ffe27a');
      disc(g, 9, -8, 2, '#ffd86b');
      r(g, 8, -9, 1, 1, '#fff7c8');
      disc(g, -6, 10, 1, '#ffd86b');
      // A drip creeping off the edge.
      const drip = [0, 1, 2, 3][f];
      r(g, 14, 12, 2, 2 + drip, '#cf8414');
      r(g, 14, 14 + drip, 2, 1, '#ffc94a');
      if (f % 2) r(g, -3, -2, 1, 1, '#fff7c8');
      else r(g, 5, 2, 1, 1, '#fff7c8');
    },
  },

  // A rainbow-sheened black puddle whose colours slide round.
  oil: {
    frames: 6,
    frameMs: 180,
    paint(g, f) {
      const inside = blob(18, 4.1);
      const bands = ['#2d52ff', '#7b3cff', '#d44bd8', '#18d4c8', '#3a7bff'];
      for (let y = -24; y < 24; y++)
        for (let x = -24; x < 24; x++) {
          const d = inside(x, y);
          if (d < 0) continue;
          let c = '#120d22';
          if (d >= 2.2) {
            const t = x * 0.45 + y * 0.7 + 3 * Math.sin(x / 5 + f * 0.9) + f * 2.5;
            const band = ((Math.floor(t / 3.5) % 11) + 11) % 11;
            c = band < bands.length ? bands[band] : '#1a1330';
          }
          r(g, x, y, 1, 1, c);
        }
      r(g, -9, -10, 6, 1, '#cfe0ff');
      r(g, -10, -9, 1, 3, '#cfe0ff');
      if (f % 3 === 0) r(g, 7, 4, 1, 1, '#ffffff');
      if (f % 3 === 1) r(g, -5, 8, 1, 1, '#ffffff');
      if (f % 3 === 2) r(g, 2, -6, 1, 1, '#ffffff');
    },
  },

  // A hazard ring on the floor with the machine's piston hanging over it.
  crusher: {
    frames: 4,
    frameMs: 200,
    paint(g, f) {
      disc(g, 0, 0, 14, '#15131b');
      ring(g, 0, 0, 14, '#f2d23a', 2);
      ring(g, 0, 0, 13, '#15131b', 2);
      disc(g, 0, 0, 10, '#2b2b32');
      ring(g, 0, 0, 10, '#4a4a55');
      ring(g, 0, 0, 6, '#3a3a42');
      // The press: wooden posts, a steel housing, a rod and a glowing head.
      for (const x of [-17, 14]) {
        r(g, x, -44, 4, 40, '#6b4423');
        r(g, x, -44, 1, 40, '#8a5a30');
        r(g, x + 3, -44, 1, 40, '#4a2e16');
      }
      r(g, -17, -46, 34, 7, '#4a4e5a');
      r(g, -17, -46, 34, 1, '#8a909c');
      for (let x = -14; x < 14; x += 6) r(g, x, -44, 2, 2, '#aab0bc');
      r(g, -4, -39, 8, 12, '#9aa0ac');
      r(g, -4, -39, 2, 12, '#c8ced8');
      r(g, -11, -27, 22, 8, '#3a3e4a');
      r(g, -11, -27, 22, 1, '#7a808c');
      const glow = ['#ff9a30', '#ffb040', '#ffc860', '#ffb040'][f];
      r(g, -7, -22, 14, 3, glow);
      r(g, -4, -23, 8, 1, '#ffe8a0');
      // A bead of oil about to fall.
      r(g, -1, -18 + f * 2, 2, 2, '#ff9a30');
    },
  },

  // Two steel posts with a pair of flickering red beams between them.
  laser: {
    frames: 4,
    frameMs: 90,
    paint(g, f) {
      r(g, -20, -4, 40, 12, 'rgba(0,0,0,0.18)');
      for (const x of [-24, 20]) {
        r(g, x, -16, 5, 26, '#3a3e4a');
        r(g, x, -16, 1, 26, '#7a808c');
        r(g, x + 4, -16, 1, 26, '#23252d');
        r(g, x - 1, 8, 7, 3, '#4a4e5a');
        r(g, x - 1, -18, 7, 3, '#5a5f6c');
        r(g, x + 1, -11, 3, 3, f % 2 ? '#ffc860' : '#ff9a30');
        r(g, x + 1, 0, 3, 3, f % 2 ? '#ff9a30' : '#ffc860');
      }
      for (const y of [-3, 5]) {
        r(g, -19, y - 1, 38, 3, `rgba(255,59,74,${f % 2 ? 0.25 : 0.4})`);
        r(g, -19, y, 38, 1, f === 2 ? '#ffb0b6' : '#ff3b4a');
      }
      // Dust motes caught in the light.
      const rand = rng(f * 31 + 7);
      for (let i = 0; i < 3; i++) r(g, -16 + rand() * 32, -6 + rand() * 14, 1, 1, '#ffd0d4');
    },
  },

  // A dark lane with chevrons on the floor and the boulder waiting at one end.
  boulder: {
    frames: 4,
    frameMs: 140,
    paint(g, f) {
      r(g, -24, -12, 48, 24, 'rgba(24,20,34,0.62)');
      r(g, -24, -12, 48, 1, '#6a6e7c');
      r(g, -24, 11, 48, 1, '#6a6e7c');
      for (let k = 0; k < 3; k++) {
        const x = -2 + k * 8 + f * 2;
        if (x > 18) continue;
        for (let i = 0; i < 5; i++) {
          r(g, x + 4 - Math.abs(i - 2) * 2 + 0, -5 + i * 2, 2, 2, k === 2 ? '#8a8e9c' : '#c8cad2');
        }
      }
      r(g, -24, 12, 3, 1, '#15131b');
      // Boulder: shadow, a grey sphere shaded from the top left, and cracks.
      r(g, -25, 7, 22, 4, 'rgba(0,0,0,0.35)');
      disc(g, -14, -1, 11, '#4e505b');
      disc(g, -15, -2, 10, '#7a7d89');
      disc(g, -16, -4, 7, '#9a9ca6');
      disc(g, -17, -5, 3, '#c8cad2');
      for (const [x, y, w, h] of [[-20, 0, 6, 1], [-14, -4, 1, 5], [-10, 3, 5, 1], [-19, -9, 4, 1], [-8, -2, 3, 1]] as const) r(g, x, y, w, h, '#575963');
      r(g, -9, -1, 1, 3, '#575963');
    },
  },

  // A red horseshoe magnet on a steel base inside cyan pulse rings.
  magnet: {
    frames: 4,
    frameMs: 150,
    paint(g, f) {
      const outer = 15 - f;
      ring(g, 0, 2, outer, '#22e6e6', 3);
      ring(g, 0, 2, outer - 4, f % 2 ? '#a0ffff' : '#22e6e6', 2);
      ring(g, 0, 2, 7, '#18a8b0');
      r(g, -8, 6, 16, 5, '#2b2d37');
      r(g, -7, 5, 14, 5, '#5a5f6c');
      r(g, -7, 5, 14, 1, '#8a909c');
      r(g, -6, -4, 12, 9, '#7a7e8a');
      r(g, -5, -3, 10, 8, '#d83a3a');
      r(g, -5, -3, 2, 8, '#ff6a6a');
      r(g, -2, -3, 4, 4, '#7a7e8a');
      for (const x of [-7, 3]) {
        r(g, x, -12, 4, 10, '#d83a3a');
        r(g, x, -12, 1, 10, '#ff6a6a');
        r(g, x, -12, 4, 4, '#dfe3ec');
        r(g, x, -9, 4, 1, '#8a909c');
      }
      r(g, -1, -6 - (f % 2), 2, 1, '#a0ffff');
    },
  },

  // A wall vent breathing out clouds of green and purple.
  gas: {
    frames: 6,
    frameMs: 170,
    paint(g, f) {
      r(g, -15, -11, 18, 22, '#15131b');
      r(g, -14, -10, 16, 20, '#6a6e78');
      r(g, -13, -9, 14, 18, '#3a3a42');
      for (let i = 0; i < 5; i++) {
        r(g, -11, -7 + i * 3, 10, 1, '#0c0b10');
        r(g, -11, -6 + i * 3, 10, 1, '#4a8a42');
      }
      for (const [x, y] of [[-14, -10], [-1, -10], [-14, 8], [-1, 8]]) r(g, x, y, 2, 2, '#9aa0ac');
      const rand = rng(777);
      for (let i = 0; i < 9; i++) {
        const t = (f / 6 + i / 9) % 1;
        const green = i % 2 === 0;
        const rad = 3 + Math.floor(t * 5);
        const x = 2 + t * 14;
        const y = (rand() - 0.5) * 18 + Math.sin(t * 6 + i) * 3;
        g.globalAlpha = 0.85 * (1 - t * 0.75);
        disc(g, Math.round(x), Math.round(y), rad, green ? '#5ac94a' : '#9a52d8');
        g.globalAlpha = 0.6 * (1 - t);
        disc(g, Math.round(x) - 1, Math.round(y) - 1, Math.max(1, rad - 2), green ? '#9af07a' : '#c88cf0');
      }
      g.globalAlpha = 1;
    },
  },

  // A purple fuse box with a lightning bolt, humming.
  blackout: {
    frames: 2,
    frameMs: 400,
    paint(g, f) {
      r(g, -11, -15, 22, 30, '#0c0a14');
      r(g, -10, -14, 20, 28, '#6a4cc8');
      r(g, -9, -13, 18, 26, '#2b2250');
      r(g, -8, -12, 16, 24, '#15101f');
      r(g, -10, -14, 20, 1, '#a58cff');
      for (const [x, y] of [[-9, -13], [7, -13], [-9, 11], [7, 11]]) r(g, x, y, 2, 2, '#9aa0ac');
      // The bolt.
      const bolt: [number, number, number, number][] = [[1, -9, 4, 3], [-1, -6, 4, 3], [-3, -3, 7, 3], [-1, 0, 4, 3], [-3, 3, 4, 3], [-3, 6, 2, 2]];
      for (const [x, y, w, h] of bolt) r(g, x - 1, y, w + 2, h, f ? '#7a4cd8' : '#5a3cb0');
      for (const [x, y, w, h] of bolt) r(g, x, y, w, h, f ? '#fff2a0' : '#d8b8ff');
      // Cables out the bottom.
      for (const x of [-6, -1, 4]) {
        r(g, x, 15, 2, 5, '#14131a');
        r(g, x, 15, 1, 5, '#3a3a46');
      }
      r(g, 8, 5, 1, 1, f ? '#ffe86a' : '#6a4cc8');
    },
  },

  // A treasure chest that looks perfectly real. The Saboteur sees an eye over it.
  fakeLoot: {
    frames: 4,
    frameMs: 200,
    paint(g, f, view) {
      r(g, -13, 6, 26, 5, 'rgba(0,0,0,0.3)');
      r(g, -11, -3, 22, 12, '#3d2410');
      r(g, -10, -2, 20, 10, '#8a5a1e');
      r(g, -10, -2, 20, 1, '#a8742c');
      r(g, -11, -10, 22, 8, '#3d2410');
      r(g, -10, -9, 20, 6, '#c8922a');
      r(g, -10, -9, 20, 2, '#f2c84a');
      r(g, -8, -11, 16, 2, '#c8922a');
      for (const x of [-7, 5]) {
        r(g, x, -10, 2, 18, '#5a3a14');
        r(g, x, -10, 1, 18, '#7a5220');
      }
      r(g, -2, -4, 4, 5, '#f2e08a');
      r(g, -1, -2, 2, 2, '#3d2410');
      for (const [x, y] of [[-9, 8], [8, 8], [-12, 3], [11, 4]]) r(g, x, y, 2, 2, '#f2c84a');
      if (view === 'saboteur') {
        const glow = ['#1ad0c0', '#2fe0c8', '#6af0dc', '#2fe0c8'][f];
        g.fillStyle = glow;
        // An eye: white almond, teal iris, dark pupil.
        r(g, -7, -22, 14, 7, '#0c0a14');
        r(g, -6, -21, 12, 5, '#e8fffa');
        r(g, -4, -22, 8, 1, glow);
        r(g, -4, -15, 8, 1, glow);
        r(g, -2, -21, 5, 5, glow);
        r(g, -1, -20, 3, 3, '#0c0a14');
        r(g, 0, -20, 1, 1, '#ffffff');
        ring(g, 0, 3, 13, glow, 3);
      }
    },
  },
};

const sprites = new Map<string, HTMLCanvasElement>();

function sprite(kind: TrapKind, view: TrapView, frame: number): HTMLCanvasElement {
  const key = `${kind.id}:${view}:${frame}`;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = kind.w + PAD * 2 + 16;
  c.height = kind.h + kind.up + PAD * 2 + 16;
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, kind.up + 8 + PAD + kind.h / 2);
  ART[kind.id].paint(g, frame, view);
  sprites.set(key, c);
  return c;
}

/** The sprite for this moment, and where its top-left sits relative to the trap's centre. */
export function trapSprite(kind: TrapKind, view: TrapView, nowMs: number) {
  const art = ART[kind.id];
  const img = sprite(kind, view, Math.floor(nowMs / art.frameMs) % art.frames);
  return { img, dx: -img.width / 2, dy: -(kind.up + 8 + PAD + kind.h / 2) };
}

/**
 * The trap art pack: one painted sprite per trap, in public/assets/traps (made from the originals
 * in art/traps by scripts/build-trap-sprites.py). `box` is how big it stands in the world (art
 * px): the sprite is fitted into it whole ("contain"), centred across the trap's footprint with its
 * base on (just past) the footprint's bottom edge, so tall parts (the crusher's frame, the laser's
 * posts) rise above it; a box no taller than the footprint is centred on it instead. The wide ones
 * (Snare, Oil Slick, Laser Grid) get wide boxes.
 */
export const TRAP_ART: Record<TrapKindId, { file: string; box: { w: number; h: number } }> = {
  shock: { file: 'shock-plate.png', box: { w: 32, h: 32 } },
  spring: { file: 'spring-floor.png', box: { w: 38, h: 34 } },
  snare: { file: 'snare.png', box: { w: 46, h: 24 } },
  glue: { file: 'glue-floor.png', box: { w: 56, h: 52 } },
  oil: { file: 'oil-slick.png', box: { w: 60, h: 34 } },
  crusher: { file: 'crusher.png', box: { w: 42, h: 46 } },
  laser: { file: 'laser-grid.png', box: { w: 56, h: 38 } },
  boulder: { file: 'rolling-boulder.png', box: { w: 34, h: 34 } },
  magnet: { file: 'magnet.png', box: { w: 34, h: 40 } },
  gas: { file: 'confusion-gas.png', box: { w: 50, h: 46 } },
  blackout: { file: 'blackout.png', box: { w: 30, h: 32 } },
  fakeLoot: { file: 'fake-loot.png', box: { w: 36, h: 32 } },
};

const painted = new Map<TrapKindId, HTMLImageElement>();

/** A trap's painted sprite once it has loaded (it starts loading the first time it's asked for). */
function paintedSprite(id: TrapKindId): HTMLImageElement | null {
  let img = painted.get(id);
  if (!img) {
    img = new Image();
    img.src = `/assets/traps/${TRAP_ART[id].file}`;
    painted.set(id, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Painted art is drawn smoothly (it's scaled down from a big image), then the setting goes back. */
function drawSmooth(g: G, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const was = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, x, y, w, h);
  g.imageSmoothingEnabled = was;
}

/** Where a trap's painted sprite is drawn for a trap centred on (x, y): its rectangle, or null
 *  while the sprite is still loading. Effects that play on the art (the Gadget Lab's) use it. */
export function trapArtRect(kind: TrapKind, x: number, y: number) {
  const img = paintedSprite(kind.id);
  if (!img) return null;
  const { box } = TRAP_ART[kind.id];
  const fit = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const w = img.naturalWidth * fit;
  const h = img.naturalHeight * fit;
  // Flat ones no taller than their footprint (the Oil Slick, the Snare) sit centred on it.
  const base = box.h <= kind.h ? y + h / 2 : y + kind.h / 2 + Math.max(0, Math.min(4, (box.h - kind.h) / 2));
  return { x: x - w / 2, y: base - h, w, h, img };
}

/** Draw a trap centred on art-pixel (x, y), already minus the camera. Runners see the disguised
 *  traps (Snare, Fake Loot) as they always have; everything else is the painted sprite. */
export function drawTrap(g: G, kind: TrapKind, view: TrapView, x: number, y: number, nowMs: number) {
  const r = view === 'saboteur' || !kind.disguised ? trapArtRect(kind, x, y) : null;
  if (r) {
    drawSmooth(g, r.img, r.x, r.y, r.w, r.h);
    return;
  }
  const s = trapSprite(kind, view, nowMs);
  g.drawImage(s.img, Math.round(x + s.dx), Math.round(y + s.dy));
}

/** A trap's icon for its card: the painted sprite fitted whole into a w x h box, centred, with
 *  barely any margin (the sprites are trimmed tight), so wide ones (Snare, Oil Slick, Laser Grid,
 *  Glue Floor) use the box's full width. The code-painted art stands in until it has loaded. */
export function drawTrapIcon(g: G, kind: TrapKind, w: number, h: number, nowMs: number) {
  const img = paintedSprite(kind.id);
  const pad = Math.round(Math.min(w, h) * 0.03);
  const src = img ?? trapSprite(kind, 'saboteur', nowMs).img;
  const sw = img ? img.naturalWidth : src.width;
  const sh = img ? img.naturalHeight : src.height;
  const fit = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
  const dw = sw * fit;
  const dh = sh * fit;
  if (img) drawSmooth(g, img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  else {
    g.imageSmoothingEnabled = false;
    g.drawImage(src, Math.round((w - dw) / 2), Math.round((h - dh) / 2), Math.round(dw), Math.round(dh));
  }
}

export { TRAP_KINDS };
