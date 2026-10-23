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

export interface MoveInput {
  dx: number;
  dy: number;
  sprint: boolean;
}

/** The player. (x, y) is the point between his feet, in art pixels. */
export class Bandit {
  x: number;
  y: number;
  facing: Facing;
  moving = false;
  sheet: HTMLImageElement;
  private animTimer = 0;
  private step = 0;

  constructor(sheet: HTMLImageElement, x: number, y: number, facing: Facing) {
    this.sheet = sheet;
    this.x = x;
    this.y = y;
    this.facing = facing;
  }

  update(input: MoveInput, map: Walkable) {
    let { dx, dy } = input;
    this.moving = dx !== 0 || dy !== 0;
    if (!this.moving) {
      this.animTimer = 0;
      return;
    }
    // Face the direction of the strongest input; ties keep the current vertical/horizontal.
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? 'left' : 'right';
    else if (Math.abs(dy) > Math.abs(dx)) this.facing = dy < 0 ? 'up' : 'down';
    else if (dx && dy && !((this.facing === 'left' && dx < 0) || (this.facing === 'right' && dx > 0) || (this.facing === 'up' && dy < 0) || (this.facing === 'down' && dy > 0)))
      this.facing = dy < 0 ? 'up' : 'down';

    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const len = Math.hypot(dx, dy);
    dx = (dx / len) * speed;
    dy = (dy / len) * speed;
    // Move one axis at a time in small steps, so we slide along walls instead of sticking.
    this.moveAxis(map, dx, 0);
    this.moveAxis(map, 0, dy);

    this.animate(input.sprint);
  }

  private animate(sprint: boolean) {
    const period = sprint ? 6 : 10;
    if (++this.animTimer >= period) {
      this.animTimer = 0;
      this.step ^= 1;
    }
  }

  /**
   * A bandit controlled by another player: glide toward where the server says he is,
   * and animate like he's walking.
   */
  follow(x: number, y: number, facing: Facing, moving: boolean, sprint: boolean) {
    const far = Math.hypot(x - this.x, y - this.y) > 64;
    this.x = far ? x : this.x + (x - this.x) * 0.35;
    this.y = far ? y : this.y + (y - this.y) * 0.35;
    this.facing = facing;
    this.moving = moving;
    if (moving) this.animate(sprint);
    else this.animTimer = 0;
  }

  private blockedAt(map: Walkable, x: number, y: number) {
    return map.boxBlocked(x + HITBOX.left, y + HITBOX.top, x + HITBOX.right, y + HITBOX.bottom);
  }

  private moveAxis(map: Walkable, dx: number, dy: number) {
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
      if (!this.slideAround(map, sx, sy)) return;
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
    const px = Math.round(this.x - DRAW_W / 2 - camX);
    const py = Math.round(this.y - DRAW_H + 1 - camY);
    if (shadow) {
      // Soft shadow under the feet.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(px + DRAW_W / 2, py + DRAW_H - 1, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const sx = this.frame * FRAME_W;
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
