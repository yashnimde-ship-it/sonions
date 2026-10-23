// What a placed trap looks like when it goes off, drawn for everyone in the heist (over the
// lighting, so it reads in the dark). Each kind has its own animation; the trap's own sprite
// is drawn by the caller underneath.

import { trapKind, type TrapKindId } from '../data/trapKinds';

type G = CanvasRenderingContext2D;

export interface Fired {
  id: string;
  kind: TrapKindId;
  x: number;
  y: number;
  /** performance.now() when it went off. */
  at: number;
}

/** The crusher's shadow grows this long before the press slams down. */
export const CRUSHER_WARN_MS = 1500;

/** How long each animation runs (ms); effects that linger (gas, blackout, glue) run longer. */
export const FX_MS: Record<TrapKindId, number> = {
  shock: 700,
  spring: 700,
  snare: 2500,
  glue: 5000,
  oil: 5000,
  crusher: CRUSHER_WARN_MS + 700,
  // 0.8s visible warning followed by a 4s live beam.
  laser: 4800,
  boulder: 1100,
  magnet: 1500,
  gas: 4000,
  blackout: 6000,
  fakeLoot: 900,
};

const rect = (g: G, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

const circle = (g: G, x: number, y: number, r: number, c: string, alpha = 1) => {
  g.globalAlpha = alpha;
  g.fillStyle = c;
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
};

const ring = (g: G, x: number, y: number, r: number, c: string, width: number, alpha = 1) => {
  g.globalAlpha = alpha;
  g.strokeStyle = c;
  g.lineWidth = width;
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
};

/** A jagged bolt from (x0, y0) to (x1, y1). */
function bolt(g: G, x0: number, y0: number, x1: number, y1: number, seed: number, c: string, width: number) {
  g.strokeStyle = c;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const off = Math.sin(seed * 12.9 + i * 7.3) * 5;
    g.lineTo(x0 + (x1 - x0) * t + off, y0 + (y1 - y0) * t + off * 0.6);
  }
  g.lineTo(x1, y1);
  g.stroke();
}

/** Draw one going-off trap at its spot (minus the camera), `t` ms after it fired. */
export function drawFired(g: G, f: Fired, camX: number, camY: number, now: number) {
  const t = now - f.at;
  const dur = FX_MS[f.kind];
  if (t < 0 || t > dur) return;
  const p = t / dur;
  const x = f.x - camX;
  const y = f.y - camY;
  const k = trapKind(f.kind)!;
  const frame = Math.floor(t / 60);
  g.save();
  switch (f.kind) {
    case 'shock': {
      // A white flash, then crackling blue bolts out to the edges.
      if (t < 120) circle(g, x, y, 22, '#e6f8ff', 0.7 * (1 - t / 120));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + frame;
        bolt(g, x, y, x + Math.cos(a) * 20, y + Math.sin(a) * 16 - 4, frame + i, i % 2 ? '#9fe0ff' : '#ffffff', 1.5);
      }
      ring(g, x, y, 6 + p * 22, '#9fe0ff', 2, 1 - p);
      break;
    }
    case 'spring': {
      // The pad punches up, a dust ring blows out, and a BOING.
      const up = Math.sin(Math.min(1, t / 250) * Math.PI) * 8;
      rect(g, x - 12, y - 12 - up, 24, 24, 'rgba(242,182,50,0.35)');
      ring(g, x, y + 4, 8 + p * 26, '#d9c8a0', 3, 0.7 * (1 - p));
      g.globalAlpha = 1 - p;
      g.fillStyle = '#ffd25a';
      g.font = '8px "Press Start 2P"';
      g.textAlign = 'center';
      g.fillText('BOING!', x, y - 22 - p * 12);
      break;
    }
    case 'snare': {
      // The rope loop snaps tight: a shrinking ring, then a knot that twitches.
      const r = Math.max(5, 16 * (1 - Math.min(1, t / 300)));
      ring(g, x, y - 2, r, '#d8b56a', 2);
      ring(g, x, y - 2, r - 2, '#9a7a3c', 1);
      if (t > 300) {
        const jx = Math.sin(t / 50) * 1.5;
        rect(g, x - 2 + jx, y - 4, 4, 4, '#7a5a28');
        rect(g, x + 4 + jx, y - 2, 10, 1, '#d8b56a');
      }
      break;
    }
    case 'glue': {
      // A splat that spreads, then bubbles that pop for as long as it's sticky.
      const spread = Math.min(1, t / 250);
      circle(g, x, y, 22 * spread, '#e8a21c', 0.45 * (1 - p * 0.6));
      for (let i = 0; i < 5; i++) {
        const bt = (t / 700 + i * 0.21) % 1;
        const bx = x + Math.cos(i * 2.4) * 14;
        const by = y + Math.sin(i * 2.4) * 10;
        ring(g, bx, by - bt * 4, 1 + bt * 3, '#ffd86b', 1, (1 - bt) * (1 - p));
      }
      break;
    }
    case 'oil': {
      // Rainbow ripples rolling out across the slick.
      const colors = ['#2d52ff', '#7b3cff', '#d44bd8', '#18d4c8'];
      for (let i = 0; i < 4; i++) {
        const rt = (t / 900 + i / 4) % 1;
        ring(g, x, y, 4 + rt * 24, colors[i], 2, 0.8 * (1 - rt) * (1 - p * 0.7));
      }
      break;
    }
    case 'crusher': {
      // A shadow that grows under the press for 1.5 s, a red warning ring; then SLAM.
      if (t < CRUSHER_WARN_MS) {
        const w = t / CRUSHER_WARN_MS;
        g.globalAlpha = 0.25 + 0.45 * w;
        g.fillStyle = '#000000';
        g.beginPath();
        g.ellipse(x, y, 14 * w + 2, (14 * w + 2) * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        ring(g, x, y, 16, Math.floor(t / 120) % 2 ? '#ff4a5a' : '#ffd23a', 2);
        // The press creeping down overhead.
        rect(g, x - 11, y - 46 + w * 14, 22, 8, '#3a3e4a');
        rect(g, x - 7, y - 41 + w * 14, 14, 3, '#ff9a30');
      } else {
        const s = (t - CRUSHER_WARN_MS) / 700;
        rect(g, x - 12, y - 14, 24, 14, '#2b2d37');
        rect(g, x - 12, y - 14, 24, 2, '#7a808c');
        ring(g, x, y, 10 + s * 30, '#d9c8a0', 4, 1 - s);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          rect(g, x + Math.cos(a) * (12 + s * 20), y + Math.sin(a) * (8 + s * 12) - s * 6, 2, 2, '#b8b0a4');
        }
        if (s < 0.25) {
          g.fillStyle = '#ffffff';
          g.font = '8px "Press Start 2P"';
          g.textAlign = 'center';
          g.fillText('SLAM!', x, y - 24);
        }
      }
      break;
    }
    case 'laser': {
      if (t < 800) {
        // The posts stutter before the beam locks on, giving the Runner a readable cue.
        const flicker = Math.floor(t / 70) % 2 ? 0.8 : 0.18;
        g.globalAlpha = flicker;
        for (const by of [-3, 5]) rect(g, x - 19, y + by, 38, 1, '#ff5965');
        for (const sx of [x - 20, x + 20]) {
          rect(g, sx - 2, y - 8, 4, 16, '#ff3b4a');
          circle(g, sx, y, 4 + (t / 800) * 3, '#ffd0d4', 0.8);
        }
        g.globalAlpha = 1;
      } else {
        // The grid stays bright for four full seconds. Pulses race along each beam.
        const live = t - 800;
        const flare = Math.floor(live / 90) % 2 ? 1 : 0.7;
        for (const by of [-3, 5]) {
          rect(g, x - 19, y + by - 3, 38, 7, `rgba(255,59,74,${0.42 * flare})`);
          rect(g, x - 19, y + by, 38, 1, '#ffffff');
          const pulseX = x - 19 + ((live / 4 + (by > 0 ? 19 : 0)) % 38);
          circle(g, pulseX, y + by, 3, '#fff6d8', 0.95);
        }
        for (let i = 0; i < 5; i++) {
          const sx = i % 2 ? x - 20 : x + 20;
          rect(g, sx + Math.sin(live / 30 + i) * 6, y - 8 + ((live / 10 + i * 7) % 18), 2, 2, '#ffd0d4');
        }
      }
      break;
    }
    case 'boulder': {
      // The boulder rolls off down its lane, spinning, kicking up dust behind it.
      const bx = x - 14 + p * (k.w + 48);
      const by = y - 1;
      circle(g, bx, by, 11, '#7a7d89');
      circle(g, bx - 2, by - 3, 6, '#9a9ca6');
      const a = p * 10;
      g.strokeStyle = '#575963';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(bx + Math.cos(a) * 9, by + Math.sin(a) * 9);
      g.lineTo(bx - Math.cos(a) * 9, by - Math.sin(a) * 9);
      g.stroke();
      for (let i = 1; i < 5; i++) circle(g, bx - i * 8, by + 8 - i, 3 + i, '#b8b0a4', 0.35 * (1 - i / 5) * (1 - p));
      break;
    }
    case 'magnet': {
      // Cyan rings collapse into the magnet, pulling.
      for (let i = 0; i < 3; i++) {
        const rt = 1 - ((t / 500 + i / 3) % 1);
        ring(g, x, y, 6 + rt * 58, '#22e6e6', 2, 0.9 * (1 - rt * 0.5));
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t / 300;
        const r = 60 * (1 - ((t / 400 + i / 8) % 1));
        rect(g, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 2, 2, '#a0ffff');
      }
      break;
    }
    case 'gas': {
      // Green and purple clouds billow out of the vent and hang there.
      const grow = Math.min(1, t / 600);
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + t / 1500;
        const r = (10 + (i % 3) * 10) * grow;
        circle(g, x + 8 + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 8 + (i % 3) * 3, i % 2 ? '#9a52d8' : '#5ac94a', 0.35 * (1 - p * 0.8));
      }
      if (t < 1200) {
        g.globalAlpha = 1 - t / 1200;
        g.fillStyle = '#c8f0a0';
        g.font = '7px "Press Start 2P"';
        g.textAlign = 'center';
        g.fillText('HISS...', x, y - 22);
      }
      break;
    }
    case 'blackout': {
      // The fuse box sparks and the lights die (the darkness itself is drawn on the victims' screens).
      if (t < 600) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + frame;
          bolt(g, x, y - 4, x + Math.cos(a) * 14, y - 4 + Math.sin(a) * 14, frame + i, '#d8b8ff', 1.5);
        }
        circle(g, x, y, 18, '#9b6cff', 0.5 * (1 - t / 600));
      }
      rect(g, x - 2, y - 18, 4, 4, Math.floor(t / 300) % 2 ? '#ff4a5a' : '#3a0a14');
      break;
    }
    case 'fakeLoot': {
      // The "treasure" blows apart: a flash, a fireball ring, flying debris and smoke.
      if (t < 120) circle(g, x, y - 4, 26, '#fff4c0', 0.9 * (1 - t / 120));
      ring(g, x, y - 4, 6 + p * 34, '#ff9a30', 5, 1 - p);
      circle(g, x, y - 4, 16 * (1 - p), '#ff5a2a', 0.7 * (1 - p));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const d = 6 + p * (26 + (i % 3) * 8);
        rect(g, x + Math.cos(a) * d, y - 4 + Math.sin(a) * d - p * p * -20, 3, 3, i % 3 ? '#c8922a' : '#5a3a14');
      }
      for (let i = 0; i < 4; i++) circle(g, x + (i - 1.5) * 8, y - 10 - p * 20, 6 + p * 8, '#4a4450', 0.4 * (1 - p));
      if (p < 0.5) {
        g.fillStyle = '#ffe39a';
        g.font = '8px "Press Start 2P"';
        g.textAlign = 'center';
        g.fillText('BOOM!', x, y - 30);
      }
      break;
    }
  }
  g.restore();
}
