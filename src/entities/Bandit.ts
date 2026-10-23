import { CHAR_DRAW_SCALE, CHAR_FRAME_H, CHAR_FRAME_W, HITBOX, SPRINT_SPEED, WALK_SPEED } from '../config';

/** Anything the bandit can walk around in: the estate or the lobby. */
export interface Walkable {
  boxBlocked(x0: number, y0: number, x1: number, y1: number): boolean;
}

export type Facing = 'up' | 'down' | 'left' | 'right';

const FRAME_W = CHAR_FRAME_W;
const FRAME_H = CHAR_FRAME_H;
// On-screen size in art pixels.
export const DRAW_W = FRAME_W * CHAR_DRAW_SCALE;
export const DRAW_H = FRAME_H * CHAR_DRAW_SCALE;
// Sheet order (FireRed's sAnimTable_Standard): 0-2 stand down/up/left, 3-4 walk down,
// 5-6 walk up, 7-8 walk left. Right is the left frames mirrored.
const STAND: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 2 };
const WALK: Record<Facing, [number, number]> = { down: [3, 4], up: [5, 6], left: [7, 8], right: [7, 8] };

// How far the bandit slides sideways to get around a corner he walks into (art pixels).
const CORNER_SLIDE = 7;
// How quickly the bandit reaches full speed, and how quickly he stops (fraction per frame).
const ACCEL = 0.3;
const FRICTION = 0.4;

export interface MoveInput {
  dx: number;
  dy: number;
  sprint: boolean;
}

const FACING_VECTOR: Record<Facing, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

interface Puff {
  x: number;
  y: number;
  age: number;
}

/** The player. (x, y) is the point between his feet, in art pixels. */
export class Bandit {
  x: number;
  y: number;
  facing: Facing;
  moving = false;
  sheet: HTMLImageElement;
  /** Velocity in art px per frame. */
  vx = 0;
  vy = 0;
  /** True when the last update pushed into something solid (used to bump doors open). */
  bumped = false;
  /** Speed multiplier while carrying loot (1 when empty-handed). Dashes ignore it. */
  carryMult = 1;
  /** Frames left stunned by a trap: no moving, no dashing. */
  stunFrames = 0;
  private sprinting = false;
  private animTimer = 0;
  private step = 0;
  /** Walk cycle phase, for the bob. */
  private phase = 0;
  private puffs: Puff[] = [];
  /** Frames of dash left (Quickstep), and the dash velocity. */
  private dashFrames = 0;
  private dashVx = 0;
  private dashVy = 0;
  /** Frames left to leave after-images, and the recent positions they're drawn at. */
  private trailFrames = 0;
  private trail: { x: number; y: number; frame: number }[] = [];

  constructor(sheet: HTMLImageElement, x: number, y: number, facing: Facing) {
    this.sheet = sheet;
    this.x = x;
    this.y = y;
    this.facing = facing;
  }

  update(input: MoveInput, map: Walkable) {
    if (this.stunFrames > 0) {
      // Stunned: controls do nothing; any dash in progress is cut short.
      this.stunFrames--;
      this.dashFrames = 0;
      input = { dx: 0, dy: 0, sprint: false };
    }
    const { dx, dy } = input;
    const pushing = dx !== 0 || dy !== 0;
    if (pushing) {
      // Face the direction of the strongest input; ties keep the current vertical/horizontal.
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? 'left' : 'right';
      else if (Math.abs(dy) > Math.abs(dx)) this.facing = dy < 0 ? 'up' : 'down';
      else if (!((this.facing === 'left' && dx < 0) || (this.facing === 'right' && dx > 0) || (this.facing === 'up' && dy < 0) || (this.facing === 'down' && dy > 0)))
        this.facing = dy < 0 ? 'up' : 'down';
    }

    // Ease toward the target velocity: quick to start, quicker to stop. A dash overrides it.
    const speed = (input.sprint ? SPRINT_SPEED : WALK_SPEED) * this.carryMult;
    if (this.dashFrames > 0) {
      this.dashFrames--;
      this.vx = this.dashVx;
      this.vy = this.dashVy;
      // Come out of the dash at walking pace instead of skidding.
      if (!this.dashFrames) {
        this.vx = Math.sign(this.dashVx) * Math.min(Math.abs(this.dashVx), speed);
        this.vy = Math.sign(this.dashVy) * Math.min(Math.abs(this.dashVy), speed);
      }
    } else {
      const len = Math.hypot(dx, dy) || 1;
      const k = pushing ? ACCEL : FRICTION;
      this.vx += ((dx / len) * speed - this.vx) * k;
      this.vy += ((dy / len) * speed - this.vy) * k;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
      if (Math.abs(this.vy) < 0.05) this.vy = 0;
    }

    this.unstick(map);
    const x0 = this.x;
    const y0 = this.y;
    // Move one axis at a time in small steps, so we slide along walls instead of sticking.
    if (!this.moveAxis(map, this.vx, 0)) this.vx = this.dashVx = 0;
    if (!this.moveAxis(map, 0, this.vy)) this.vy = this.dashVy = 0;
    const moved = Math.hypot(this.x - x0, this.y - y0);
    this.bumped = pushing && moved < speed * 0.25;
    this.moving = moved > 0.1;
    this.sprinting = input.sprint && this.moving;
    if (this.moving) this.animate(moved, this.sprinting);
    else this.rest();
    this.updatePuffs();
    this.updateTrail();
  }

  /**
   * Quickstep: shoot `distance` art px over `frames` frames, the way he's moving, or the
   * way he's facing when standing still. Walls stop him as usual.
   */
  dash(distance: number, frames: number) {
    let [dx, dy] = Math.hypot(this.vx, this.vy) > 0.3 ? [this.vx, this.vy] : FACING_VECTOR[this.facing];
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    this.dashFrames = frames;
    this.dashVx = (dx * distance) / frames;
    this.dashVy = (dy * distance) / frames;
    this.showTrail(frames + 8);
  }

  /** Knocked silly for `frames` frames. */
  stun(frames: number) {
    this.stunFrames = Math.max(this.stunFrames, frames);
  }

  get stunned() {
    return this.stunFrames > 0;
  }

  get dashing() {
    return this.dashFrames > 0;
  }

  /** After-images for a while (also used to show other players' dashes). */
  showTrail(frames: number) {
    this.trailFrames = frames;
  }

  private updateTrail() {
    if (this.trailFrames > 0) {
      this.trailFrames--;
      this.trail.unshift({ x: this.x, y: this.y, frame: this.frame });
    }
    if (this.trail.length > 12 || (this.trailFrames <= 0 && this.trail.length)) this.trail.pop();
  }

  private animate(distance: number, sprint: boolean) {
    this.phase += distance * 0.22;
    const period = sprint ? 6 : 9;
    if (++this.animTimer >= period) {
      this.animTimer = 0;
      this.step ^= 1;
      if (sprint) this.puffs.push({ x: this.x - Math.sign(this.vx) * 4, y: this.y - 1, age: 0 });
    }
  }

  private rest() {
    this.animTimer = 0;
    this.phase = 0;
  }

  private updatePuffs() {
    for (const p of this.puffs) p.age++;
    this.puffs = this.puffs.filter((p) => p.age < 18);
  }

  /**
   * A bandit controlled by another player: glide toward where the server says he is,
   * and animate like he's walking.
   */
  follow(x: number, y: number, facing: Facing, moving: boolean, sprint: boolean, stunned = false) {
    this.stunFrames = stunned ? 1 : 0;
    const far = Math.hypot(x - this.x, y - this.y) > 64;
    const nx = far ? x : this.x + (x - this.x) * 0.35;
    const ny = far ? y : this.y + (y - this.y) * 0.35;
    const moved = Math.hypot(nx - this.x, ny - this.y);
    this.vx = nx - this.x;
    this.x = nx;
    this.y = ny;
    this.facing = facing;
    this.moving = moving;
    this.sprinting = moving && sprint;
    if (moving) this.animate(Math.max(moved, 1), this.sprinting);
    else this.rest();
    this.updatePuffs();
    this.updateTrail();
  }

  private blockedAt(map: Walkable, x: number, y: number) {
    return map.boxBlocked(x + HITBOX.left, y + HITBOX.top, x + HITBOX.right, y + HITBOX.bottom);
  }

  /** Moves along one axis; returns false if something stopped him. */
  private moveAxis(map: Walkable, dx: number, dy: number): boolean {
    if (!dx && !dy) return true;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps;
      const sy = dy / steps;
      if (!this.blockedAt(map, this.x + sx, this.y + sy)) {
        this.x += sx;
        this.y += sy;
        continue;
      }
      // Blocked: if a small sideways shift clears the corner, slide toward the gap
      // instead of stopping dead on a door frame or table edge.
      if (!this.slideAround(map, sx, sy)) return false;
    }
    return true;
  }

  /**
   * If he's inside something solid (a door shut on him by another player), pops him out
   * to the nearest free spot, so nobody is ever stuck for good.
   */
  private unstick(map: Walkable) {
    if (!this.blockedAt(map, this.x, this.y)) return;
    for (let r = 1; r <= 32; r++)
      for (let a = 0; a < 16; a++) {
        const nx = this.x + Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
        const ny = this.y + Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
        if (!this.blockedAt(map, nx, ny)) {
          this.x = nx;
          this.y = ny;
          return;
        }
      }
  }

  /** Tries shifting 1..CORNER_SLIDE px perpendicular to the move; steps 1 px toward the nearest opening. */
  private slideAround(map: Walkable, sx: number, sy: number): boolean {
    const horizontal = sx !== 0;
    for (let d = 1; d <= CORNER_SLIDE; d++)
      for (const sign of [-1, 1]) {
        const ox = horizontal ? 0 : sign * d;
        const oy = horizontal ? sign * d : 0;
        if (this.blockedAt(map, this.x + ox, this.y + oy)) continue;
        if (this.blockedAt(map, this.x + ox + sx, this.y + oy + sy)) continue;
        this.x += horizontal ? 0 : sign;
        this.y += horizontal ? sign : 0;
        return true;
      }
    return false;
  }

  private get frame() {
    return this.moving ? WALK[this.facing][this.step] : STAND[this.facing];
  }

  /** Draws in art pixels relative to the camera; the feet sit at (x, y). */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, shadow = true) {
    // A little hop in the walk cycle; a bigger one when sprinting.
    const bob = this.moving ? Math.abs(Math.sin(this.phase)) * (this.sprinting ? 2.5 : 1.5) : 0;
    const px = Math.round(this.x - DRAW_W / 2 - camX);
    const py = Math.round(this.y - DRAW_H + 1 - camY - bob);
    if (shadow) {
      for (const p of this.puffs) {
        const t = p.age / 18;
        ctx.fillStyle = `rgba(214, 200, 180, ${0.45 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY - t * 4, 2 + t * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Soft shadow under the feet; it shrinks a touch as he hops.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(Math.round(this.x - camX), Math.round(this.y - camY), 9 - bob, 3.5 - bob * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Quickstep after-images, fading behind him.
    if (shadow)
      this.trail.forEach((t, i) => {
        if (i % 3 !== 2) return;
        ctx.save();
        ctx.globalAlpha = 0.35 * (1 - i / this.trail.length);
        this.blit(ctx, t.frame, Math.round(t.x - DRAW_W / 2 - camX), Math.round(t.y - DRAW_H + 1 - camY));
        ctx.restore();
      });
    this.blit(ctx, this.frame, px, py);
    if (shadow && this.stunned) this.drawStars(ctx, px + DRAW_W / 2, py + 2);
  }

  /** Stars circling a stunned bandit's head. */
  private drawStars(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const t = performance.now() / 180;
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      const x = Math.round(cx + Math.cos(a) * 9);
      const y = Math.round(cy + Math.sin(a) * 3);
      ctx.fillStyle = '#ffe39a';
      ctx.fillRect(x - 1, y - 2, 2, 5);
      ctx.fillRect(x - 2, y - 1, 5, 2);
      ctx.fillStyle = '#fff6d0';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  private blit(ctx: CanvasRenderingContext2D, frame: number, px: number, py: number) {
    const sx = frame * FRAME_W;
    if (this.facing === 'right') {
      ctx.save();
      ctx.translate(px + DRAW_W, py);
      ctx.scale(-1, 1);
      ctx.drawImage(this.sheet, sx, 0, FRAME_W, FRAME_H, 0, 0, DRAW_W, DRAW_H);
      ctx.restore();
    } else {
      ctx.drawImage(this.sheet, sx, 0, FRAME_W, FRAME_H, px, py, DRAW_W, DRAW_H);
    }
  }
}
