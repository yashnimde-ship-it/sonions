import { type TrapSpot, trapPosition, trapRules } from '../data/traps';

/**
 * How Midnight Museum's exhibit traps look. To Runners they're just exhibits until one
 * fires: everyone sees the red warning while it arms, then its effect. The Saboteur also
 * sees each trap's area (dim while it recharges) so they know what to click.
 * Coordinates are art pixels; the context is already scaled to the world.
 */
export interface TrapView {
  now: number;
  /** When it last fired (performance.now ms), if ever. */
  firedAt?: number;
  ready: boolean;
  jammed: boolean;
  saboteur: boolean;
  hover: boolean;
}

const box = (t: TrapSpot) => {
  const w = t.w ?? 28;
  const h = t.h ?? 28;
  return { x: t.x - w / 2, y: t.y - h / 2, w, h };
};

/** Under the players: the Saboteur's view of each trap's area and path. */
export function drawExhibitIdle(ctx: CanvasRenderingContext2D, t: TrapSpot, camX: number, camY: number, v: TrapView) {
  if (!v.saboteur) return;
  const b = box(t);
  const x = Math.round(b.x - camX) + 0.5;
  const y = Math.round(b.y - camY) + 0.5;
  ctx.save();
  ctx.globalAlpha = v.ready ? (v.hover ? 1 : 0.7) : 0.3;
  ctx.strokeStyle = v.hover ? '#ff4fb0' : '#ffb02e';
  ctx.setLineDash([3, 2]);
  ctx.lineWidth = 1;
  if (t.kind === 'spotlight') {
    ctx.beginPath();
    ctx.arc(t.x - camX, t.y - camY, b.w / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else ctx.strokeRect(x, y, b.w - 1, b.h - 1);
  if (t.kind === 'rolling' && t.toX !== undefined && t.toY !== undefined) {
    ctx.beginPath();
    ctx.moveTo(t.x - camX, t.y - camY);
    ctx.lineTo(t.toX - camX, t.toY - camY);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // A small icon in the middle so it reads at a glance.
  ctx.fillStyle = v.hover ? '#ff4fb0' : '#ffb02e';
  ctx.fillRect(Math.round(t.x - camX) - 2, Math.round(t.y - camY) - 6, 4, 8);
  ctx.fillRect(Math.round(t.x - camX) - 2, Math.round(t.y - camY) + 4, 4, 3);
  ctx.restore();
}

/** Over the lighting: the warning while arming, then the trap's effect while active. */
export function drawExhibitEffect(ctx: CanvasRenderingContext2D, t: TrapSpot, camX: number, camY: number, v: TrapView) {
  if (v.firedAt === undefined || v.jammed) return;
  const r = trapRules(t);
  const phase = v.now - v.firedAt;
  if (phase >= r.armMs + r.activeMs) return;
  const b = box(t);
  const x = b.x - camX;
  const y = b.y - camY;
  ctx.save();
  if (phase < r.armMs) {
    // Warning: the area flashes red, with a "!" over it.
    const on = Math.floor(phase / 110) % 2 === 0;
    ctx.fillStyle = `rgba(255, 50, 60, ${on ? 0.38 : 0.14})`;
    ctx.strokeStyle = '#ff3b4a';
    ctx.lineWidth = 1;
    if (t.kind === 'spotlight') {
      ctx.beginPath();
      ctx.arc(t.x - camX, t.y - camY, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (t.kind === 'rolling' && t.toX !== undefined) {
      const len = t.toX - t.x;
      ctx.fillRect(x, y, len + b.w, b.h);
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, len + b.w - 1, b.h - 1);
    } else {
      ctx.fillRect(x, y, b.w, b.h);
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, b.w - 1, b.h - 1);
    }
    bang(ctx, t.x - camX, b.y - camY - 6, on);
    if (t.kind === 'skeleton') creak(ctx, x, y, b.w, phase);
    if (t.kind === 'painting') wobblePainting(ctx, t.x - camX, y - 4, b.w, phase);
    ctx.restore();
    return;
  }
  const k = (phase - r.armMs) / r.activeMs; // 0..1 through the active window
  switch (t.kind) {
    case 'skeleton':
      fallingBones(ctx, x, y, b.w, b.h, k);
      break;
    case 'painting':
      swingingPainting(ctx, t.x - camX, y, b.w, b.h, k);
      break;
    case 'spotlight':
      spotlight(ctx, t.x - camX, t.y - camY, b.w / 2, k);
      break;
    case 'rolling': {
      const [px, py] = trapPosition(t, k);
      displayStand(ctx, px - camX, py - camY);
      break;
    }
    case 'sarcophagus':
      mummyScare(ctx, t.x - camX, t.y - camY, b.w, k);
      break;
  }
  ctx.restore();
}

function bang(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean) {
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.fillStyle = '#0e0a1a';
  ctx.fillRect(px - 4, py - 9, 8, 13);
  ctx.fillStyle = on ? '#ff3b4a' : '#ffd0d0';
  ctx.fillRect(px - 2, py - 7, 4, 6);
  ctx.fillRect(px - 2, py, 4, 2);
}

/** Cracks and dust over a skeleton that's about to give way. */
function creak(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, phase: number) {
  ctx.fillStyle = 'rgba(230, 214, 180, 0.8)';
  for (let i = 0; i < 4; i++) {
    const dx = ((i * 37 + Math.floor(phase / 60) * 13) % Math.max(4, w - 4)) + 2;
    const dy = (phase / 8 + i * 7) % 14;
    ctx.fillRect(Math.round(x + dx), Math.round(y - 14 + dy), 1, 1);
  }
}

function bone(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, vertical: boolean) {
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.fillStyle = '#3a2c1c';
  if (vertical) {
    ctx.fillRect(px - 2, py - 1, 5, len + 2);
    ctx.fillStyle = '#efe3c4';
    ctx.fillRect(px - 1, py, 3, len);
    ctx.fillRect(px - 2, py, 5, 2);
    ctx.fillRect(px - 2, py + len - 2, 5, 2);
  } else {
    ctx.fillRect(px - 1, py - 2, len + 2, 5);
    ctx.fillStyle = '#efe3c4';
    ctx.fillRect(px, py - 1, len, 3);
    ctx.fillRect(px, py - 2, 2, 5);
    ctx.fillRect(px + len - 2, py - 2, 2, 5);
  }
}

/** Ribs and vertebrae dropping into the corridor, then a cloud of dust. */
function fallingBones(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number) {
  const n = Math.max(4, Math.round((w * h) / 500));
  const drop = Math.min(1, k * 2.2);
  for (let i = 0; i < n; i++) {
    const bx = x + ((i * 53) % Math.max(8, w - 10)) + 4;
    const by = y + ((i * 29) % Math.max(8, h - 10));
    const fall = (1 - drop) * 40;
    bone(ctx, bx, by - fall, 6 + (i % 3) * 3, i % 2 === 0);
  }
  if (drop >= 1) {
    ctx.fillStyle = `rgba(214, 196, 160, ${0.5 * (1 - k)})`;
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  }
}

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, Math.round(w) + 2, Math.round(h) + 2);
  ctx.fillStyle = '#d9a83a';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.fillStyle = '#2f5a3a';
  ctx.fillRect(Math.round(x) + 3, Math.round(y) + 3, Math.max(0, Math.round(w) - 6), Math.max(0, Math.round(h) - 6));
  ctx.fillStyle = '#6fa0c8';
  ctx.fillRect(Math.round(x) + 3, Math.round(y) + 3, Math.max(0, Math.round(w) - 6), Math.max(0, Math.round((h - 6) / 3)));
}

function wobblePainting(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, phase: number) {
  const tilt = Math.sin(phase / 50) * 2;
  frame(ctx, cx - w / 2 + tilt, top - 10, w, 10);
}

/** The painting swings out from the wall and sweeps down across the floor in front of it. */
function swingingPainting(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number, k: number) {
  const reach = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * h;
  frame(ctx, cx - w / 2, top - 6, w, Math.max(6, reach));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(cx - w / 2, top - 6 + Math.max(6, reach), w, 3);
}

/** A hard white spotlight snapping onto the floor. */
function spotlight(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number) {
  const a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, k - 0.8) / 0.2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255, 255, 235, ${0.75 * a})`);
  g.addColorStop(0.7, `rgba(255, 250, 210, ${0.45 * a})`);
  g.addColorStop(1, 'rgba(255, 250, 210, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // The beam, from the ceiling rig above.
  ctx.fillStyle = `rgba(255, 250, 220, ${0.18 * a})`;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - r - 30);
  ctx.lineTo(cx + 6, cy - r - 30);
  ctx.lineTo(cx + r * 0.8, cy);
  ctx.lineTo(cx - r * 0.8, cy);
  ctx.fill();
}

/** A glass display case on a wheeled base, rumbling along its track. */
function displayStand(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const x = Math.round(cx) - 12;
  const y = Math.round(cy) - 22;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x, y + 24, 24, 3);
  ctx.fillStyle = '#2a1608';
  ctx.fillRect(x - 1, y + 13, 26, 11);
  ctx.fillStyle = '#7a4a22';
  ctx.fillRect(x, y + 14, 24, 9);
  ctx.fillStyle = '#d9a83a';
  ctx.fillRect(x, y + 14, 24, 2);
  ctx.fillStyle = '#16121c';
  ctx.fillRect(x + 2, y + 22, 4, 3);
  ctx.fillRect(x + 18, y + 22, 4, 3);
  // Glass case with a golden relic inside.
  ctx.fillStyle = 'rgba(190, 230, 255, 0.55)';
  ctx.fillRect(x + 3, y, 18, 14);
  ctx.fillStyle = '#e8f6ff';
  ctx.fillRect(x + 3, y, 18, 1);
  ctx.fillRect(x + 4, y + 2, 1, 9);
  ctx.fillStyle = '#ffc94a';
  ctx.fillRect(x + 9, y + 6, 6, 7);
  ctx.fillStyle = '#fff2a8';
  ctx.fillRect(x + 10, y + 7, 2, 2);
}

/** The sarcophagus lid bursts: a golden mask lunges out with a shockwave. Harmless but alarming. */
function mummyScare(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, k: number) {
  const ring = 8 + k * w * 0.6;
  ctx.strokeStyle = `rgba(255, 210, 90, ${0.8 * (1 - k)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, ring, ring * 0.45, 0, 0, Math.PI * 2);
  ctx.stroke();
  const s = 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.6;
  const mx = Math.round(cx);
  const my = Math.round(cy - 18 - k * 6);
  const hw = Math.round(8 * s);
  const hh = Math.round(11 * s);
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(mx - hw - 1, my - hh - 1, hw * 2 + 2, hh * 2 + 2);
  ctx.fillStyle = '#e8b440';
  ctx.fillRect(mx - hw, my - hh, hw * 2, hh * 2);
  ctx.fillStyle = '#2a5ab0'; // striped headdress
  for (let i = -hh; i < hh; i += 4) ctx.fillRect(mx - hw, my + i, 2, 2), ctx.fillRect(mx + hw - 2, my + i, 2, 2);
  ctx.fillStyle = '#16121c'; // eyes
  ctx.fillRect(mx - Math.round(4 * s), my - Math.round(3 * s), Math.round(3 * s), Math.round(2 * s));
  ctx.fillRect(mx + Math.round(1 * s), my - Math.round(3 * s), Math.round(3 * s), Math.round(2 * s));
  ctx.fillRect(mx - Math.round(2 * s), my + Math.round(4 * s), Math.round(4 * s), Math.round(3 * s)); // gaping mouth
}
