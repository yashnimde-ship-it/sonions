import { ART_TILE } from '../config';
import type { Light, TileMap } from '../map/TileMap';

// Dusk: a cool blue wash outdoors, interiors lit warmly, and pools of lamplight.
const DUSK = 'rgba(16, 18, 52, 0.5)';
const INDOOR_LIFT = 0.55;

/**
 * Draws the lighting over the visible part of the world. Only what's on screen is
 * processed: a darkness layer at art resolution with interiors and lamps cut out,
 * then a warm additive glow around each lamp.
 */
export class LightingSystem {
  private map: TileMap;
  private lights: Light[];
  private overlay = document.createElement('canvas');
  private octx = this.overlay.getContext('2d')!;
  private indoorMask = document.createElement('canvas');

  constructor(map: TileMap) {
    this.map = map;
    this.lights = map.data.lights;
    // Indoor tiles, as a mask for lifting the darkness inside the house.
    this.indoorMask.width = map.data.width;
    this.indoorMask.height = map.data.height;
    const m = this.indoorMask.getContext('2d')!;
    m.fillStyle = '#fff';
    for (let y = 0; y < map.data.height; y++) for (let x = 0; x < map.data.width; x++) if (map.isIndoor(x, y)) m.fillRect(x, y, 1, 1);
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number, scale: number) {
    const w = Math.ceil(viewW);
    const h = Math.ceil(viewH);
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w;
      this.overlay.height = h;
    }
    const o = this.octx;
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, w, h);
    o.fillStyle = DUSK;
    o.fillRect(0, 0, w, h);

    // Lift the darkness indoors (the mask is one pixel per tile, scaled up smoothly).
    o.globalCompositeOperation = 'destination-out';
    o.globalAlpha = INDOOR_LIFT;
    o.imageSmoothingEnabled = true;
    o.drawImage(this.indoorMask, -camX, -camY, this.map.data.width * ART_TILE, this.map.data.height * ART_TILE);
    o.globalAlpha = 1;

    const visible = this.lights.filter((l) => {
      const r = l.r * ART_TILE;
      const lx = l.x * ART_TILE - camX;
      const ly = l.y * ART_TILE - camY;
      return lx + r > 0 && ly + r > 0 && lx - r < w && ly - r < h;
    });
    for (const l of visible) {
      const lx = l.x * ART_TILE - camX;
      const ly = l.y * ART_TILE - camY;
      const r = l.r * ART_TILE;
      const g = o.createRadialGradient(lx, ly, 0, lx, ly, r);
      g.addColorStop(0, 'rgba(0,0,0,0.95)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g;
      o.fillRect(lx - r, ly - r, r * 2, r * 2);
    }
    o.globalCompositeOperation = 'source-over';

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.overlay, 0, 0, w * scale, h * scale);
    ctx.imageSmoothingEnabled = false;

    // Warm glow, added on top.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of visible) {
      const lx = (l.x * ART_TILE - camX) * scale;
      const ly = (l.y * ART_TILE - camY) * scale;
      const r = l.r * ART_TILE * scale * 0.8;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
      g.addColorStop(0, 'rgba(255, 196, 110, 0.32)');
      g.addColorStop(1, 'rgba(255, 196, 110, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
