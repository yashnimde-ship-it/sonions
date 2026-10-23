import { ART_TILE } from '../config';

export interface Interactable {
  id: string;
  rect: [number, number, number, number];
  name: string;
  text: string;
  loot?: number;
  /** Runtime diamond location (art pixels); the Saboteur may change it during setup. */
  lootPos?: { x: number; y: number };
}

/** A door from the reference: its spot (art px), its sprites in the atlas, its collision cells. */
export interface Door {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  atlas: [number, number]; // closed sprite here; the open one sits right of it
  cells: number[];
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
  doors: Door[];
  spawn: { x: number; y: number; facing: 'up' | 'down' | 'left' | 'right' };
}

/**
 * The estate's tilemap. Tile layers are drawn once from the tileset into two
 * canvases: everything under the player, and the overhead layer above. Collision
 * is a separate half-tile grid, independent of the tiles. Doors redraw their spot on
 * the lower canvas when they open or close.
 */
export class TileMap {
  readonly data: EstateJson;
  readonly below: HTMLCanvasElement;
  readonly above: HTMLCanvasElement;
  readonly widthPx: number;
  readonly heightPx: number;
  private collision: Uint8Array;
  private doorAtlas: HTMLImageElement;
  private readonly openDoors = new Set<string>();

  constructor(data: EstateJson, tileset: HTMLImageElement, doorAtlas: HTMLImageElement) {
    this.data = data;
    this.widthPx = data.width * ART_TILE;
    this.heightPx = data.height * ART_TILE;
    this.below = this.render(tileset, ['floor', 'walls', 'objects']);
    this.above = this.render(tileset, ['overhead']);
    this.collision = Uint8Array.from(atob(data.collision.data), (c) => c.charCodeAt(0));
    this.doorAtlas = doorAtlas;
    for (const door of data.doors) this.setDoor(door, false); // every door starts closed
  }

  isOpen(door: Door): boolean {
    return this.openDoors.has(door.id);
  }

  /** Opens or closes a door: swaps its sprite and blocks or frees its doorway. */
  setDoor(door: Door, open: boolean) {
    if (open) this.openDoors.add(door.id);
    else this.openDoors.delete(door.id);
    for (const c of door.cells) this.collision[c] = open ? 0 : 1;
    const ctx = this.below.getContext('2d')!;
    const [ax, ay] = door.atlas;
    ctx.drawImage(this.doorAtlas, ax + (open ? door.w : 0), ay, door.w, door.h, door.x, door.y, door.w, door.h);
  }

  /** Would the door's doorway overlap the box (art px)? So a door can't shut on the bandit. */
  doorOverlaps(door: Door, x0: number, y0: number, x1: number, y1: number): boolean {
    const { cell, width } = this.data.collision;
    return door.cells.some((c) => {
      const cx = (c % width) * cell;
      const cy = Math.floor(c / width) * cell;
      return cx < x1 && cx + cell > x0 && cy < y1 && cy + cell > y0;
    });
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
