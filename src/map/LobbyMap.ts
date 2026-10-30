import { ART_TILE } from '../config';

export interface Portal {
  size: number;
  /** Tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LobbyJson {
  name: string;
  width: number;
  height: number;
  collision: { cell: number; width: number; height: number; data: string };
  portals: Portal[];
  /** Where to stand to customize; `prompt` is where its sign hangs (tiles). */
  wardrobe: { x: number; y: number; w: number; h: number; prompt?: { x: number; y: number } };
  /** Around the planning table: E picks the map. */
  table?: { x: number; y: number; w: number; h: number; prompt?: { x: number; y: number } };
  /** At the garage door (the getaway car): E starts the heist, or readies up. */
  car?: { x: number; y: number; w: number; h: number; prompt?: { x: number; y: number } };
  /** Lamps: x, y and radius in tiles. */
  lights: { x: number; y: number; r: number }[];
  spawn: { x: number; y: number };
}

// Evening in the safehouse: a light purple shade with warm pools around the lamps. The art
// is already lit, so this mostly ties the players into the scene.
const SHADE = 'rgba(14, 8, 30, 0.22)';
const GLOW = 'rgba(255, 170, 80, 0.14)';

/**
 * The safehouse lobby: the room image (floor layer plus props, composed by
 * scripts/generate-lobby.mjs) and a collision grid.
 */
export class LobbyMap {
  readonly data: LobbyJson;
  readonly image: HTMLImageElement;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Darkness with the lamps cut out, drawn over the room and its players. */
  readonly shade: HTMLCanvasElement;
  /** Warm light around each lamp, added on top. */
  readonly glow: HTMLCanvasElement;
  private collision: Uint8Array;

  constructor(data: LobbyJson, image: HTMLImageElement) {
    this.data = data;
    this.image = image;
    this.widthPx = data.width * ART_TILE;
    this.heightPx = data.height * ART_TILE;
    this.collision = Uint8Array.from(atob(data.collision.data), (c) => c.charCodeAt(0));
    // The lamps never move, so the lighting is drawn once.
    this.shade = this.canvas();
    this.glow = this.canvas();
    const s = this.shade.getContext('2d')!;
    s.fillStyle = SHADE;
    s.fillRect(0, 0, this.widthPx, this.heightPx);
    s.globalCompositeOperation = 'destination-out';
    const g = this.glow.getContext('2d')!;
    for (const l of data.lights) {
      const [x, y, r] = [l.x * ART_TILE, l.y * ART_TILE, l.r * ART_TILE];
      const cut = s.createRadialGradient(x, y, 0, x, y, r);
      cut.addColorStop(0, 'rgba(0,0,0,0.95)');
      cut.addColorStop(1, 'rgba(0,0,0,0)');
      s.fillStyle = cut;
      s.fillRect(x - r, y - r, r * 2, r * 2);
      const warm = g.createRadialGradient(x, y, 0, x, y, r * 0.8);
      warm.addColorStop(0, GLOW);
      warm.addColorStop(1, 'rgba(255, 170, 80, 0)');
      g.fillStyle = warm;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  private canvas() {
    const c = document.createElement('canvas');
    c.width = this.widthPx;
    c.height = this.heightPx;
    return c;
  }

  solidAt(x: number, y: number): boolean {
    const { cell, width, height } = this.data.collision;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return true;
    return this.collision[cy * width + cx] === 1;
  }

  boxBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
    const { cell } = this.data.collision;
    for (let y = Math.floor(y0 / cell) * cell; y < y1; y += cell)
      for (let x = Math.floor(x0 / cell) * cell; x < x1; x += cell) if (this.solidAt(Math.max(x, x0), Math.max(y, y0))) return true;
    return false;
  }

  /** Is the art-pixel point inside the box given in tiles? */
  static inside(box: { x: number; y: number; w: number; h: number }, x: number, y: number) {
    return x >= box.x * ART_TILE && x < (box.x + box.w) * ART_TILE && y >= box.y * ART_TILE && y < (box.y + box.h) * ART_TILE;
  }
}
