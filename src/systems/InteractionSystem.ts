import { ART_TILE, REACH } from '../config';
import type { Bandit } from '../entities/Bandit';
import type { Door, Interactable, TileMap } from '../map/TileMap';

export type Target = { kind: 'item'; item: Interactable } | { kind: 'door'; door: Door };
type Hitbox = { left: number; right: number; top: number; bottom: number };

const AHEAD: Record<Bandit['facing'], [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** What the bandit can reach, what he's stolen, and the result of pressing E. */
export class InteractionSystem {
  readonly items: Interactable[];
  readonly doors: Door[];
  readonly looted = new Set<string>();

  constructor(items: Interactable[], doors: Door[]) {
    this.items = items;
    this.doors = doors;
  }

  get totalLoot() {
    return this.items.filter((i) => this.looted.has(i.id)).reduce((sum, i) => sum + (i.loot ?? 0), 0);
  }

  get lootables() {
    return this.items.filter((i) => i.loot);
  }

  /** The door or object in reach: probe a point just ahead of the bandit's feet (and his body). */
  nearby(b: Bandit): Target | null {
    const [ax, ay] = AHEAD[b.facing];
    const probes: [number, number][] = [
      [b.x + ax * REACH, b.y - 4 + ay * REACH],
      [b.x + ax * (REACH / 2), b.y - 4 + ay * (REACH / 2)],
    ];
    for (const [px, py] of probes) {
      const door = this.doors.find((d) => px >= d.x && px < d.x + d.w && py >= d.y && py < d.y + d.h);
      if (door) return { kind: 'door', door };
      const tx = Math.floor(px / ART_TILE);
      const ty = Math.floor(py / ART_TILE);
      const hit = this.items.find((i) => tx >= i.rect[0] && tx <= i.rect[2] && ty >= i.rect[1] && ty <= i.rect[3]);
      if (hit) return { kind: 'item', item: hit };
    }
    return null;
  }

  /** Label for the on-screen prompt. */
  promptFor(target: Target, map: TileMap): string {
    if (target.kind === 'door') return `E  ${map.isOpen(target.door) ? 'Close' : 'Open'} ${target.door.name}`;
    const item = target.item;
    if (item.loot && !this.looted.has(item.id)) return `E  Steal ${item.name} ($${item.loot})`;
    return `E  Check ${item.name}`;
  }

  /** Opens or closes a door. Returns a message only when it can't (bandit in the doorway). */
  toggleDoor(door: Door, map: TileMap, b: Bandit, hit: Hitbox): string | null {
    if (!map.isOpen(door)) {
      map.setDoor(door, true);
      return null;
    }
    if (map.doorOverlaps(door, b.x + hit.left, b.y + hit.top, b.x + hit.right, b.y + hit.bottom)) return 'Step out of the doorway first.';
    map.setDoor(door, false);
    return null;
  }

  /** Performs the interaction and returns the message to show. */
  interact(item: Interactable): string {
    if (item.loot) {
      if (this.looted.has(item.id)) return `You already took the ${item.name}.`;
      this.looted.add(item.id);
      const left = this.lootables.length - this.looted.size;
      const suffix = left === 0 ? " That's everything. Time to slip away!" : '';
      return `${item.text} (+$${item.loot})${suffix}`;
    }
    return item.text;
  }
}
