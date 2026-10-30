// Little bursts of pixels and floating text ("+1", "REVIVED!") for the moments that should feel
// good: finding a diamond, banking it, reviving a teammate; big slammed words ("KNOCKOUT!") and
// shockwave rings for the biggest ones. World coordinates (art px); drawn in the same pass as
// the world, so they sit over the map and under the HUD.

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  at: number;
  /** A slam: big, punched in from huge, and on screen for longer. */
  slam?: boolean;
}
interface Ring {
  x: number;
  y: number;
  color: string;
  at: number;
  r: number;
}

const POP_MS = 1100;
const SLAM_MS = 1500;
const RING_MS = 450;

export class Particles {
  private bits: Bit[] = [];
  private pops: Pop[] = [];
  private rings: Ring[] = [];

  /** A ring of pixels flying out from (x, y), falling a little. */
  burst(x: number, y: number, color: string, count = 16, speed = 1.6) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const v = speed * (0.5 + Math.random());
      const max = 30 + Math.random() * 25;
      this.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, life: max, max, color, size: 1 + Math.random() * 1.5 });
    }
    if (this.bits.length > 600) this.bits.splice(0, this.bits.length - 600);
  }

  /** One glinting speck that drifts up and fades (a carried diamond's trail). */
  sparkle(x: number, y: number, color: string) {
    const max = 18 + Math.random() * 14;
    this.bits.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 0.3, vy: -0.25 - Math.random() * 0.3, life: max, max, color, size: Math.random() < 0.3 ? 2 : 1 });
  }

  /** Text that pops up from (x, y), floats and fades. */
  pop(x: number, y: number, text: string, color = '#ffe39a') {
    this.pops.push({ x, y, text, color, at: performance.now() });
  }

  /** A big word punched onto the map ("KNOCKOUT!"): it lands from huge, holds, then floats off. */
  slam(x: number, y: number, text: string, color: string) {
    this.pops.push({ x, y, text, color, at: performance.now(), slam: true });
  }

  /** A shockwave: a circle that races out to `r` and thins away. */
  ring(x: number, y: number, color: string, r = 40) {
    this.rings.push({ x, y, color, at: performance.now(), r });
  }

  clear() {
    this.bits.length = 0;
    this.pops.length = 0;
    this.rings.length = 0;
  }

  /** Step and draw; ctx is in world space (art px, already scaled). `step` false holds the
   *  pixels where they are (a hit-stop). */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, step = true) {
    ctx.save();
    const now = performance.now();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const t = (now - r.at) / RING_MS;
      if (t >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - (1 - t) ** 3;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.ellipse(r.x - camX, r.y - camY, 4 + r.r * e, (4 + r.r * e) * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      if (step) {
        b.x += b.vx;
        b.y += b.vy;
        b.vx *= 0.96;
        b.vy = b.vy * 0.96 + 0.06;
        if (--b.life <= 0) {
          this.bits.splice(i, 1);
          continue;
        }
      }
      ctx.globalAlpha = Math.min(1, (b.life / b.max) * 1.5);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - camX, b.y - camY, b.size, b.size);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      const t = (now - p.at) / (p.slam ? SLAM_MS : POP_MS);
      if (t >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      let grow: number;
      let rise: number;
      if (p.slam) {
        // Slammed down from three times the size, a bounce, a long hold, then up and away.
        grow = t < 0.08 ? 3 - (t / 0.08) * 2.15 : t < 0.16 ? 0.85 + ((t - 0.08) / 0.08) * 0.15 : 1;
        rise = t < 0.7 ? t * 6 : 4.2 + (t - 0.7) * 50;
        ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : Math.min(1, t / 0.04);
        ctx.font = '12px "Press Start 2P"';
        ctx.lineWidth = 3;
      } else {
        // A quick overshoot in size, then up and away.
        grow = t < 0.15 ? 0.6 + (t / 0.15) * 0.7 : 1.3 - Math.min(0.3, (t - 0.15) * 1.5);
        rise = t * 22;
        ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
        ctx.font = '7px "Press Start 2P"';
        ctx.lineWidth = 2;
      }
      ctx.save();
      ctx.translate(p.x - camX, p.y - camY - rise);
      // A slam lands with a little tilt that settles.
      if (p.slam && t < 0.25) ctx.rotate(Math.sin(t * 60) * 0.06 * (1 - t / 0.25));
      ctx.scale(grow, grow);
      ctx.strokeStyle = 'rgba(14,10,26,0.9)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}
