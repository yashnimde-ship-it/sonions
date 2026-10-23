import { BANDIT_FRAME_H, BANDIT_FRAME_W, HITBOX, SPRINT_SPEED, WALK_SPEED } from '../config';
import type { TileMap } from '../map/TileMap';

export type Facing = 'up' | 'down' | 'left' | 'right';

const FRAME_W = BANDIT_FRAME_W;
const FRAME_H = BANDIT_FRAME_H;
// Sheet order (FireRed's sAnimTable_Standard): 0-2 stand down/up/left, 3-4 walk down,
// 5-6 walk up, 7-8 walk left. Right is the left frames mirrored.
const STAND: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 2 };
const WALK: Record<Facing, [number, number]> = { down: [3, 4], up: [5, 6], left: [7, 8], right: [7, 8] };

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
  private sheet: HTMLImageElement;
  private animTimer = 0;
  private step = 0;

  constructor(sheet: HTMLImageElement, x: number, y: number, facing: Facing) {
    this.sheet = sheet;
    this.x = x;
    this.y = y;
    this.facing = facing;
  }

  update(input: MoveInput, map: TileMap) {
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

    const period = input.sprint ? 6 : 10;
    if (++this.animTimer >= period) {
      this.animTimer = 0;
      this.step ^= 1;
    }
  }

  private blockedAt(map: TileMap, x: number, y: number) {
    return map.boxBlocked(x + HITBOX.left, y + HITBOX.top, x + HITBOX.right, y + HITBOX.bottom);
  }

  private moveAxis(map: TileMap, dx: number, dy: number) {
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps;
      const sy = dy / steps;
      if (this.blockedAt(map, this.x + sx, this.y + sy)) return;
      this.x += sx;
      this.y += sy;
    }
  }

  private get frame() {
    return this.moving ? WALK[this.facing][this.step] : STAND[this.facing];
  }

  /** Draws in art pixels relative to the camera; the feet sit at (x, y). */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const px = Math.round(this.x - FRAME_W / 2 - camX);
    const py = Math.round(this.y - FRAME_H + 1 - camY);
    // Soft shadow under the feet.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(px + FRAME_W / 2, py + FRAME_H - 1, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const sx = this.frame * FRAME_W;
    if (this.facing === 'right') {
      ctx.save();
      ctx.translate(px + FRAME_W, py);
      ctx.scale(-1, 1);
      ctx.drawImage(this.sheet, sx, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
      ctx.restore();
    } else {
      ctx.drawImage(this.sheet, sx, 0, FRAME_W, FRAME_H, px, py, FRAME_W, FRAME_H);
    }
  }
}
