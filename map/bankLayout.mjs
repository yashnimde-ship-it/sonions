// The Royal Reserve Bank, traced from public/reference/bank-reference.png (the original
// 877 x 672 art scaled to 1536 x 1184: 96 x 74 tiles at 16 px). Boxes are [x0, y0, x1, y1] in
// tiles, end exclusive. Built by scripts/generate-museum.mjs (npm run bank). The walls are the
// art's cream wall lines, traced by scripts/trace-bank-walls.py into map/bankWalls.mjs; the
// few the tracer can't see (the diagonal behind the tellers, the stone front) are added here.

import { BANK_WALLS } from './bankWalls.mjs';

export const NAME = 'Royal Reserve Bank';
export const REFERENCE = 'public/reference/bank-reference.png';
export const WIDTH = 96;
export const HEIGHT = 74;
export const FOLIAGE = false;

const pad = ([x0, y0, x1, y1], p = 0.35) => [x0 - p, y0 - p, x1 + p, y1 + p];

/** The numbered room badges painted into the art, filled from the floor beside them. */
export const LABELS = [
  { box: pad([9.9, 11.0, 12.4, 13.3]), from: 'left', span: 1.0 }, // 15
  { box: pad([21.8, 11.5, 24.4, 13.8]), from: 'down', span: 1.0 }, // 14
  { box: pad([35.0, 11.6, 37.6, 13.9]), from: 'down', span: 1.0 }, // 13
  { box: pad([54.7, 11.6, 57.2, 13.8]), from: 'left', span: 1.0 }, // 10
  { box: pad([70.8, 11.4, 73.3, 13.6]), from: 'down', span: 1.0 }, // 11
  { box: pad([83.5, 25.1, 86.2, 27.4]), from: 'up', span: 1.0 }, // 12
  { box: pad([48.6, 25.2, 51.4, 27.6]), from: 'left', span: 1.0 }, // 04
  { box: pad([16.0, 26.1, 18.8, 28.4]), from: 'up', span: 0.9 }, // 03
  { box: pad([36.2, 37.1, 39.1, 39.5]), from: 'up', span: 1.0 }, // 02
  { box: pad([10.4, 39.5, 13.2, 41.9]), from: 'up', span: 0.9 }, // 06
  { box: pad([83.8, 46.8, 86.4, 49.1]), from: 'left', span: 1.0 }, // 09
  { box: pad([36.6, 54.1, 39.4, 56.4]), from: 'left', span: 1.0 }, // 07 (west)
  { box: pad([49.5, 54.3, 52.7, 56.9]), from: 'left', span: 1.0 }, // 07 (middle)
  { box: pad([63.4, 54.1, 66.2, 56.6]), from: 'left', span: 1.0 }, // 07 (east)
  { box: pad([8.9, 56.9, 12.0, 60.1]), from: 'up', span: 0.9 }, // 05
  { box: pad([83.3, 59.4, 86.1, 61.8]), from: 'up', span: 0.9 }, // 08
  { box: pad([45.3, 66.2, 48.0, 68.5]), from: 'left', span: 1.0 }, // 01
];

/** The building, in pieces; the street in front (y >= STREET) is outside but walkable. */
const BUILDING = [
  // Each stops at the outer wall's line (outside it is solid), so nobody walks round the back.
  [2.0, 5.2, 75.0, 62.6], // the main block: offices, lobby, back rooms
  [75.0, 10.8, 93.8, 41.0], // the vault and its corridor
  [75.0, 40.0, 92.6, 67.6], // restrooms and the ATM lounge
  [61.6, 24.0, 76.6, 48.4], // the east hall
  [70.4, 48.0, 76.6, 69.8], // ... down to the staff exit
  [2.0, 47.0, 32.6, 67.2], // the conference room and the west foyer
  [21.6, 66.0, 26.0, 68.8], // the foyer's side entrance
  [31.6, 61.0, 65.0, 68.6], // the entrance hall
];
const STREET = 68.6;
export function inside(x, y) {
  return y >= STREET || BUILDING.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
}

/** Rooms, for the HUD (all indoors). Later entries win where they overlap. */
export const ROOMS = [
  { name: 'Main Lobby', box: [16.6, 18.0, 62.4, 48.6] },
  { name: 'Utility Room', box: [2.0, 4.6, 16.6, 17.8] },
  { name: 'Server Room', box: [16.6, 4.6, 28.8, 17.8] },
  { name: 'Staff Lounge', box: [29, 4.6, 41.6, 19] },
  { name: 'Back Office', box: [42.2, 4.6, 65.0, 25.4] },
  { name: 'Security Room', box: [65.0, 4.6, 75.4, 15.8] },
  { name: 'Teller Counter', box: [33.0, 19.8, 58.6, 34.0] },
  { name: 'East Hall', box: [62.0, 15.8, 75.4, 48.6] },
  { name: 'East Hall', box: [70.0, 48.6, 75.4, 69.8] },
  { name: 'Vault', box: [75.4, 10.2, 94.6, 37.8] },
  { name: 'Vault Corridor', box: [75.4, 37.8, 94.0, 40.8] },
  { name: 'Restrooms', box: [77, 41, 93.0, 56] },
  { name: 'ATM Lounge', box: [77, 57, 93.0, 67] },
  { name: 'Waiting Lounge', box: [2.0, 17.8, 30.0, 33.6] },
  { name: "Manager's Office", box: [2.0, 34.4, 16, 50] },
  { name: 'Conference Room', box: [2.0, 50.6, 16.6, 67.6] },
  { name: 'West Foyer', box: [16.6, 48.6, 32.0, 67.0] },
  { name: 'Office 1', box: [32.0, 48.6, 44.8, 61.6] },
  { name: 'Office 2', box: [44.8, 48.6, 57.4, 61.6] },
  { name: 'Office 3', box: [57.4, 48.6, 70.0, 61.6] },
  { name: 'Entrance Hall', box: [32.0, 61.6, 64.6, 67.6] },
];

/** Outside, for the HUD (indoor rooms above take precedence). */
export const ZONES = [
  { name: 'Street', box: [0, 0, 96, 74] },
  { name: 'Front Steps', box: [34, 67.6, 58, 74] },
];

/** Walls the tracer can't see. */
export const WALLS = [
  ...BANK_WALLS,
  // The vault, sealed on every side but its door (82.4-86.0 in the south wall, posts either side).
  [75.0, 10.4, 76.2, 38.8], [75.0, 10.4, 94.0, 11.4], [93.2, 10.4, 94.2, 38.8],
  [75.0, 37.2, 81.0, 38.8], [87.4, 37.2, 94.2, 38.8],
  // Between the back rooms (utility | server | staff lounge | back office).
  [16.2, 5.0, 17.0, 17.6], [28.6, 5.0, 29.4, 20.2], [41.6, 5.0, 42.4, 19.8],
  // Behind the tellers: the back office's wall runs down on a diagonal, in steps.
  [47.8, 15.0, 48.8, 18.2],
  ...Array.from({ length: 8 }, (_, i) => [48.2 + i, 17.4 + i, 49.6 + i, 18.8 + i]),
  // The stone front either side of the main doors, and the street's far side.
  [28.0, 65.6, 38.6, 68.6],
  [53.8, 65.6, 66.0, 68.6],
  [0, 73.6, 96, 74],
];
/** Furniture, counters and fixtures that block movement. */
export const SOLIDS = [
  // Utility room
  [5.6, 8.8, 9.2, 12.2], [5.0, 13.6, 10.0, 16.4], [10.6, 8.6, 11.8, 10.4], [12.8, 10.6, 14.0, 12.2],
  // Server room
  [18.2, 6.4, 24.4, 14.6], [24.8, 5.8, 27.6, 14.6], [17.2, 15.0, 23.0, 16.6], [27.0, 13.6, 28.4, 16.8],
  // Staff lounge
  [30.2, 5.8, 37.4, 8.4], [30.4, 9.0, 35.8, 13.0], [38.8, 6.2, 40.6, 8.2], [30.4, 14.8, 32.0, 16.6], [39.6, 15.0, 41.4, 17.0], [38.8, 7.4, 41.4, 14.6], [32.6, 17.0, 41.4, 18.6],
  // Back office
  [46.4, 6.0, 53.4, 9.0], [55.0, 6.0, 62.4, 9.0], [49.4, 10.8, 53.4, 15.0], [62.6, 9.4, 64.6, 17.0], [55.6, 19.8, 60.4, 22.8],
  // Security room
  [66.0, 5.2, 74.4, 10.6], [72.6, 11.6, 74.6, 13.8],
  // East corridor
  [71.2, 20.4, 74.6, 25.6], [71.8, 27.0, 74.4, 33.0],
  // The vault: its great round door on the back wall, the gold and the deposit boxes
  [79.0, 12.6, 91.0, 24.4], [76.6, 25.4, 80.8, 29.0], [87.4, 25.4, 92.0, 29.0], [76.6, 30.0, 79.8, 33.6],
  [81.6, 29.4, 86.4, 33.6], [88.0, 30.0, 91.6, 33.6], [77.0, 35.0, 82.0, 37.2], [86.6, 35.0, 93.0, 37.2] /* a walkway between the rows, up from the door */,
  // Waiting lounge
  [4.8, 24.6, 7.8, 29.6], [11.6, 21.8, 16.8, 24.6], [9.6, 25.6, 14.2, 28.4], [20.6, 25.2, 23.0, 28.8], [24.2, 24.8, 27.2, 29.4], [12.6, 29.8, 21.4, 32.4],
  // (The teller counter and the velvet ropes follow their shapes: see COUNTER and ROPES below.)
  // Lobby plants, bench and cabinet
  [17.6, 36.4, 19.6, 39.0], [23.0, 46.0, 26.0, 49.0], [50.2, 44.4, 53.2, 48.4], [59.6, 46.4, 65.6, 48.4], [66.4, 39.6, 69.8, 48.6],
  // Manager's office
  [2.6, 35.0, 8.6, 38.0], [11.6, 35.0, 15.4, 38.0], [2.2, 39.2, 3.4, 45.0], [4.8, 42.0, 11.6, 44.6], [6.0, 38.8, 8.6, 42.0], [6.6, 48.0, 10.6, 50.0], [11.4, 48.0, 15.0, 50.0],
  // Conference room
  [7.4, 52.6, 14.6, 64.0],
  // Offices
  [35.6, 52.6, 43.6, 56.2], [49.6, 52.6, 56.6, 56.2], [62.4, 52.6, 69.0, 56.2],
  [36.0, 49.4, 42.6, 51.0], [48.6, 49.4, 55.0, 51.0], [58.4, 49.4, 62.4, 51.0], [65.4, 49.4, 69.4, 51.0], // cabinets along the top walls
  [34.0, 58.8, 35.8, 61.0], [47.0, 58.8, 48.8, 61.0], [60.2, 58.8, 62.0, 61.0], // potted plants
  // Restrooms and the ATMs
  [77.6, 41.2, 90.4, 43.2], [79.0, 49.0, 91.0, 51.0], [80.0, 54.4, 90.0, 56.0], [79.8, 60.6, 89.6, 65.8],
  // Out front: planters, banners, lamp posts
  [8.6, 71.0, 14.0, 73.4], [21.8, 71.0, 27.2, 73.4], [28.4, 67.0, 33.0, 73.8], [33.4, 63.0, 35.6, 69.0], [56.6, 63.0, 59.6, 69.0],
  [61.6, 66.0, 65.0, 73.8], [63.8, 71.0, 68.6, 73.6], [82.4, 71.0, 87.8, 73.6],
];

const door = (id, name, box) => ({ id, name, box, side: true });
/** Doorways (the gaps between the gold door posts); closed, a leaf fills the gap. */
export const DOORS = [
  door('door-vault', 'vault door', [82.4, 37.2, 86.0, 38.8]),
  door('door-utility', 'utility room door', [11.0, 17.0, 13.4, 18.4]),
  door('door-server', 'server room door', [24.0, 17.0, 26.0, 18.4]),
  door('door-lounge', 'staff lounge door', [31.6, 19.0, 34.4, 20.4]),
  door('door-office', 'back office door', [45.4, 14.8, 46.8, 16.0]),
  door('door-security', 'security room door', [69.0, 14.8, 71.4, 16.0]),
  door('door-tellers', 'tellers door', [62.4, 24.4, 63.9, 25.6]),
  door('door-manager', "manager's door", [8.0, 33.2, 11.0, 34.6]),
  door('door-manager-e', "manager's side door", [16.0, 39.4, 17.4, 43.0]),
  door('door-conference', 'conference room door', [9.0, 50.2, 12.0, 51.4]),
  door('door-conference-e', 'conference room side door', [16.0, 57.6, 17.6, 61.0]),
  door('door-foyer', 'foyer door', [21.6, 53.4, 25.6, 54.8]),
  door('door-foyer-out', 'side entrance', [22.0, 65.8, 25.6, 67.2]),
  door('door-office1', 'office door', [34.4, 48.0, 36.0, 49.4]),
  door('door-office2', 'office door', [46.4, 48.0, 48.2, 49.4]),
  door('door-office1-s', 'office back door', [38.6, 61.0, 40.8, 62.4]),
  door('door-office2-s', 'office back door', [50.8, 61.0, 53.0, 62.4]),
  door('door-office3', 'office door', [62.8, 48.0, 65.0, 49.4]),
  door('door-office3-s', 'office back door', [63.4, 61.0, 65.6, 62.4]),
  door('door-restroom', 'restroom door', [75.6, 45.6, 77.6, 48.4]),
  door('door-atm', 'ATM lounge door', [76.4, 59.4, 78.6, 63.4]),
  door('door-side-exit', 'staff exit', [74.2, 67.2, 75.6, 68.4]),
];

/** Half-tile cells (as boxes) whose centres pass `test`, within [x0, y0, x1, y1]. */
const cellsWhere = (test, [x0, y0, x1, y1]) => {
  const out = [];
  for (let y = y0; y < y1; y += 0.5) for (let x = x0; x < x1; x += 0.5) if (test(x + 0.25, y + 0.25)) out.push([x, y, x + 0.5, y + 0.5]);
  return out;
};
const inPolygon = (poly, x, y) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const nearSegment = ([ax, ay, bx, by], r) => (x, y) => {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= r;
};
/**
 * The teller counter: the band between its lobby-side edge (the lit front) and its teller-side
 * edge (the green top's inner rim), measured off the art, from the staff lounge wall round to
 * the east hall.
 */
const COUNTER = [
  [36.6, 20.2], [36.8, 22], [37.6, 26], [39.2, 29], [41.6, 31.4], [45, 33.2], [50, 34.4], [55, 34.8], [60, 34.6], [62.2, 34.4],
  [62.2, 30.6], [61, 30.8], [55, 31.2], [50, 30.8], [45.6, 29.6], [42.5, 27.6], [40, 25], [39, 22], [39, 20.2],
];
SOLIDS.push(...cellsWhere((x, y) => inPolygon(COUNTER, x, y), [36, 19.5, 63, 35.5]));
// The counter's east end meets the wall behind the tellers: no way round it.
SOLIDS.push([62.0, 25.0, 63.0, 31.0]);
/** The velvet ropes, post to post (tiles). */
const ROPES = [[34.3, 23.4, 36.8, 23.4], [33.7, 29.7, 35.0, 33.0], [35.0, 33.0, 37.1, 34.9], [43.8, 38.4, 46.8, 39.4], [46.8, 39.4, 49.8, 39.4]];
for (const rope of ROPES) SOLIDS.push(...cellsWhere(nearSegment(rope, 0.45), [rope[0] - 1, Math.min(rope[1], rope[3]) - 1, rope[2] + 1, Math.max(rope[1], rope[3]) + 1]));

/** The gold posts either side of each doorway are solid (the tracer only sees cream lines). */
const POST = 1.4;
export const DOOR_POSTS = DOORS.map(({ box: [x0, y0, x1, y1] }) =>
  x1 - x0 >= y1 - y0
    ? [[x0 - POST, y0, x0, y1], [x1, y0, x1 + POST, y1]]
    : [[x0, y0 - POST, x1, y0], [x0, y1, x1, y1 + POST]],
).flat();
SOLIDS.push(...DOOR_POSTS);

/** A wall along y0-y1 (or x0-x1), from a to b, with gaps for the named doors. */
const along = (axis, [c0, c1], [a, b], ids = []) => {
  const gaps = ids.map((id) => DOORS.find((d) => d.id === id).box).map(([x0, y0, x1, y1]) => (axis === 'h' ? [x0, x1] : [y0, y1])).sort((p, q) => p[0] - q[0]);
  const out = [];
  let at = a;
  for (const [g0, g1] of [...gaps, [b, b]]) {
    if (g0 > at) out.push(axis === 'h' ? [at, c0, g0, c1] : [c0, at, c1, g0]);
    at = Math.max(at, g1);
  }
  return out;
};
/**
 * Every room with doors gets its outline as walls, open only at its doors: the traced lines
 * break where they meet, and a closed door has to actually close the room.
 */
SOLIDS.push(
  ...along('h', [17.0, 18.0], [2.0, 28.8], ['door-utility', 'door-server']),
  ...along('h', [19.2, 20.2], [28.6, 42.4], ['door-lounge']),
  ...along('h', [14.8, 15.8], [42.4, 48.4], ['door-office']),
  ...along('h', [24.4, 25.4], [55.6, 65.4], ['door-tellers']),
  ...along('v', [64.6, 65.4], [5.0, 25.4]),
  ...along('h', [14.8, 15.8], [65.0, 75.0], ['door-security']),
  ...along('h', [33.4, 34.4], [2.0, 17.2], ['door-manager']),
  ...along('v', [16.2, 17.2], [33.4, 50.8], ['door-manager-e']),
  ...along('h', [50.0, 51.0], [2.0, 17.2], ['door-conference']),
  ...along('v', [16.2, 17.2], [50.4, 67.4], ['door-conference-e']),
  ...along('h', [53.0, 54.2], [17.0, 32.2], ['door-foyer']),
  ...along('h', [65.6, 66.6], [17.0, 32.2], ['door-foyer-out']),
  ...along('v', [31.6, 32.4], [48.0, 66.6]),
  ...along('h', [48.0, 49.0], [31.6, 70.8], ['door-office1', 'door-office2', 'door-office3']),
  ...along('h', [61.0, 62.0], [31.6, 70.8], ['door-office1-s', 'door-office2-s', 'door-office3-s']),
  ...along('v', [44.4, 45.2], [48.0, 62.0]),
  ...along('v', [57.2, 58.0], [48.0, 62.0]),
  ...along('v', [70.0, 70.8], [48.0, 62.0]),
  ...along('h', [40.2, 41.2], [76.2, 92.6]),
  ...along('v', [76.6, 77.6], [40.2, 56.8], ['door-restroom']),
  ...along('h', [56.0, 57.0], [76.2, 92.6]),
  ...along('v', [76.2, 77.2], [56.4, 68.4], ['door-atm']),
  ...along('h', [67.0, 68.2], [70.4, 76.6], ['door-side-exit']),
);

/** Furniture to search (where diamonds can be hidden). rect is [x0, y0, x1, y1] in tiles, inclusive. */
export const INTERACTABLES = [
  { id: 'generator', rect: [6, 9, 8, 11], name: 'generator panel', loot: 120, text: 'The backup generator panel. Humming.' },
  { id: 'maintenance', rect: [6, 14, 9, 15], name: 'maintenance console', loot: 90, text: 'A maintenance console, covered in sticky notes.' },
  { id: 'servers', rect: [19, 7, 23, 14], name: 'server racks', loot: 200, text: "The bank's servers, blinking away." },
  { id: 'backup-servers', rect: [25, 7, 26, 14], name: 'backup servers', loot: 180, text: 'Backup servers. Everything twice.' },
  { id: 'coffee', rect: [33, 17, 40, 17], name: 'coffee counter', loot: 60, text: 'The staff coffee counter. Someone hid biscuits here.' },
  { id: 'fridge', rect: [38, 8, 40, 10], name: 'staff fridge', loot: 40, text: "Somebody's lunch. Labelled. Hands off." },
  { id: 'vending', rect: [38, 11, 40, 13], name: 'vending machine', loot: 50, text: 'A vending machine full of coins.' },
  { id: 'clerk-desks', rect: [47, 6, 53, 8], name: 'clerk desks', loot: 150, text: 'The clerks\' desks, piled with forms.' },
  { id: 'loan-desks', rect: [55, 6, 62, 8], name: 'loan desks', loot: 170, text: 'Loan papers and a very good pen.' },
  { id: 'files', rect: [62, 10, 63, 16], name: 'filing cabinets', loot: 140, text: 'Filing cabinets, A to Z.' },
  { id: 'cctv', rect: [66, 6, 74, 10], name: 'CCTV console', loot: 100, text: 'Every camera in the bank, on one wall.' },
  { id: 'records', rect: [72, 21, 74, 25], name: 'records cabinet', loot: 160, text: 'Old ledgers in a carved cabinet.' },
  { id: 'gold-west', rect: [77, 26, 80, 28], name: 'gold bars', loot: 900, text: 'Stacked gold bars. Heavier than they look.' },
  { id: 'gold-east', rect: [88, 26, 91, 28], name: 'gold bars', loot: 900, text: 'More gold. It never ends.' },
  { id: 'gold-reserve', rect: [82, 30, 85, 32], name: 'gold reserve', loot: 1200, text: 'The reserve: the biggest pile in the vault.' },
  { id: 'deposit-west', rect: [77, 31, 79, 33], name: 'deposit boxes', loot: 600, text: 'Safe deposit boxes. Somebody kept their pearls here.' },
  { id: 'deposit-east', rect: [88, 31, 91, 33], name: 'deposit boxes', loot: 600, text: 'Safe deposit boxes, row upon row.' },
  { id: 'teller-drawers', rect: [44, 30, 51, 32], name: 'teller drawers', loot: 300, text: "The tellers' cash drawers." },
  { id: 'lounge-sofa', rect: [13, 30, 20, 31], name: 'lounge sofa', loot: 50, text: 'Coins down the back of the sofa.' },
  { id: 'side-cabinet', rect: [20, 25, 22, 28], name: 'side cabinet', loot: 80, text: 'Magazines and a small brass key.' },
  { id: 'manager-desk', rect: [5, 42, 11, 44], name: "manager's desk", loot: 260, text: "The manager's desk. Locked drawers, not very well." },
  { id: 'bookshelf', rect: [3, 35, 8, 37], name: 'bookshelf', loot: 70, text: 'Banking law, volumes one to forty.' },
  { id: 'conference-table', rect: [8, 53, 14, 63], name: 'conference table', loot: 110, text: 'The boardroom table. Very long, very polished.' },
  { id: 'office-desk-1', rect: [38, 53, 43, 55], name: 'office desk', loot: 120, text: 'An advisor\'s desk.' },
  { id: 'office-desk-2', rect: [51, 53, 55, 55], name: 'office desk', loot: 120, text: 'An advisor\'s desk, very tidy.' },
  { id: 'office-desk-3', rect: [64, 53, 68, 55], name: 'office desk', loot: 120, text: 'An advisor\'s desk, very messy.' },
  { id: 'display-cabinet', rect: [67, 44, 69, 48], name: 'display cabinet', loot: 140, text: 'Commemorative coins behind glass.' },
  { id: 'atms', rect: [80, 61, 89, 65], name: 'ATMs', loot: 400, text: 'Three ATMs, full of cash.' },
  { id: 'sinks', rect: [80, 49, 90, 50], name: 'restroom sinks', loot: 30, text: 'A ring left by a sink.' },
];

/** Lamps for the lighting pass (the art is already lit, so these are gentle). */
export const LIGHTS = [
  { x: 9, y: 11, r: 7, kind: 'soft' }, { x: 22, y: 11, r: 7, kind: 'soft' }, { x: 35, y: 12, r: 7, kind: 'soft' },
  { x: 54, y: 11, r: 9, kind: 'soft' }, { x: 70, y: 10, r: 6, kind: 'soft' }, { x: 85, y: 24, r: 10, kind: 'soft' },
  { x: 16, y: 26, r: 9, kind: 'soft' }, { x: 38, y: 40, r: 12, kind: 'soft' }, { x: 50, y: 28, r: 9, kind: 'soft' },
  { x: 9, y: 42, r: 7, kind: 'soft' }, { x: 10, y: 58, r: 8, kind: 'soft' }, { x: 24, y: 59, r: 7, kind: 'soft' },
  { x: 38, y: 55, r: 6, kind: 'soft' }, { x: 51, y: 55, r: 6, kind: 'soft' }, { x: 64, y: 55, r: 6, kind: 'soft' },
  { x: 84, y: 47, r: 7, kind: 'soft' }, { x: 84, y: 62, r: 7, kind: 'soft' }, { x: 69, y: 30, r: 6, kind: 'soft' },
  { x: 34.5, y: 64.5, r: 4, kind: 'lamp' }, { x: 58, y: 64.5, r: 4, kind: 'lamp' },
];

export const SPAWN = { x: 46, y: 71.4, facing: 'up' };
