import { CAMERA_EASE } from '../config';

/**
 * Follows a target with gentle easing, clamped so it never shows past the edges of
 * the world. Works in art pixels; `viewW`/`viewH` is how much of the world fits on
 * screen, which changes when the browser is resized.
 */
export class CameraSystem {
  x = 0;
  y = 0;
  viewW = 0;
  viewH = 0;
  private worldW: number;
  private worldH: number;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  resize(viewW: number, viewH: number) {
    this.viewW = viewW;
    this.viewH = viewH;
  }

  private target(tx: number, ty: number): [number, number] {
    const clamp = (v: number, view: number, world: number) =>
      view >= world ? (world - view) / 2 : Math.min(world - view, Math.max(0, v));
    return [clamp(tx - this.viewW / 2, this.viewW, this.worldW), clamp(ty - this.viewH / 2, this.viewH, this.worldH)];
  }

  /** Jumps straight to the target (on spawn and after resizing). */
  snap(tx: number, ty: number) {
    [this.x, this.y] = this.target(tx, ty);
  }

  update(tx: number, ty: number) {
    const [gx, gy] = this.target(tx, ty);
    this.x += (gx - this.x) * CAMERA_EASE;
    this.y += (gy - this.y) * CAMERA_EASE;
    if (Math.abs(gx - this.x) < 0.05) this.x = gx;
    if (Math.abs(gy - this.y) < 0.05) this.y = gy;
  }
}
