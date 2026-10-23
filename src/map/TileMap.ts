import { ART_TILE } from '../config';

export interface Interactable {
  id: string;
  rect: [number, number, number, number];
  name: string;
  text: string;
  loot?: number;
}

export interface Light {
  x: number;
  y: number;
  r: number;
  kind: 'lamp' | 'soft';
}

export interface EstateJson {
  name: string;
  tileSize: number;
  width: number;
  height: number;
  tilesetColumns: number;
  tileCount: number;
  layers: Record<'floor' | 'walls' | 'objects' | 'overhead', number[]>;
  collision: { cell: number; width: number; height: number; data: string };
  areas: { names: string[]; data: number[] };
  indoor: number[];
  lights: Light[];
  interactables: Interactable[];
  spawn: { x: number; y: number; facing: 'up' | 'down' | 'left' | 'right' };
}

/**
 * The estate's tilemap. Tile layers are drawn once from the tileset into two
 * canvases: everything under the player, and the overhead layer above. Collision
 * is a separate half-tile grid, independent of the art.
 */
export class TileMap {
  readonly data: EstateJson;
  readonly below: HTMLCanvasElement;
  readonly above: HTMLCanvasElement;
  readonly widthPx: number;
  readonly heightPx: number;
  private collision: Uint8Array;

  constructor(data: EstateJson, tileset: HTMLImageElement) {
    this.data = data;
    this.widthPx = data.width * ART_TILE;
    this.heightPx = data.height * ART_TILE;
    this.below = this.render(tileset, ['floor', 'walls', 'objects']);
    this.above = this.render(tileset, ['overhead']);
    this.collision = Uint8Array.from(atob(data.collision.data), (c) => c.charCodeAt(0));
  }

  private render(tileset: HTMLImageElement, layers: (keyof EstateJson['layers'])[]): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.widthPx;
    c.height = this.heightPx;
    const ctx = c.getContext('2d')!;
    const { width, tilesetColumns: cols } = this.data;
    for (const name of layers) {
      const ids = this.data.layers[name];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (!id) continue;
        const sx = (id % cols) * ART_TILE;
        const sy = Math.floor(id / cols) * ART_TILE;
        ctx.drawImage(tileset, sx, sy, ART_TILE, ART_TILE, (i % width) * ART_TILE, Math.floor(i / width) * ART_TILE, ART_TILE, ART_TILE);
      }
    }
    return c;
  }

  /** Is the art-pixel point (x, y) blocked? Outside the map counts as blocked. */
  solidAt(x: number, y: number): boolean {
    const { cell, width, height } = this.data.collision;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return true;
    return this.collision[cy * width + cx] === 1;
  }

  /** Is any part of the box (art pixels) blocked? */
  boxBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
    const { cell } = this.data.collision;
    for (let y = Math.floor(y0 / cell) * cell; y < y1; y += cell)
      for (let x = Math.floor(x0 / cell) * cell; x < x1; x += cell) if (this.solidAt(Math.max(x, x0), Math.max(y, y0))) return true;
    return false;
  }

  areaAt(x: number, y: number): string {
    const tx = Math.floor(x / ART_TILE);
    const ty = Math.floor(y / ART_TILE);
    if (tx < 0 || ty < 0 || tx >= this.data.width || ty >= this.data.height) return '';
    return this.data.areas.names[this.data.areas.data[ty * this.data.width + tx]];
  }

  isIndoor(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.data.width || ty >= this.data.height) return false;
    return this.data.indoor[ty * this.data.width + tx] === 1;
  }
}
