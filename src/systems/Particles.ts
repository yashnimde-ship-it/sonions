// Little bursts of pixels and floating text ("+1", "REVIVED!") for the moments that should feel
// good: finding a diamond, banking it, reviving a teammate. World coordinates (art px); drawn
// in the same pass as the world, so they sit over the map and under the HUD.

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
}

const POP_MS = 1100;

export class Particles {
  private bits: Bit[] = [];
  private pops: Pop[] = [];

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

  /** Text that pops up from (x, y), floats and fades. */
  pop(x: number, y: number, text: string, color = '#ffe39a') {
    this.pops.push({ x, y, text, color, at: performance.now() });
  }

  clear() {
    this.bits.length = 0;
    this.pops.length = 0;
  }

  /** Step and draw; ctx is in world space (art px, already scaled). */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    ctx.save();
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= 0.96;
      b.vy = b.vy * 0.96 + 0.06;
      if (--b.life <= 0) {
        this.bits.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, (b.life / b.max) * 1.5);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - camX, b.y - camY, b.size, b.size);
    }
    const now = performance.now();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '7px "Press Start 2P"';
    ctx.lineWidth = 2;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      const t = (now - p.at) / POP_MS;
      if (t >= 1) {
        this.pops.splice(i, 1);
        continue;
      }
      // A quick overshoot in size, then up and away.
      const grow = t < 0.15 ? 0.6 + (t / 0.15) * 0.7 : 1.3 - Math.min(0.3, (t - 0.15) * 1.5);
      ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      ctx.save();
      ctx.translate(p.x - camX, p.y - camY - t * 22);
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
