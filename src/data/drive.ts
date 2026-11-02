import { DRIVE_STRIPS } from './driveArt.ts'; // .ts: also loaded by the Node server

// The Getaway Drive: while the Saboteur sets up, each Runner races their own van across town to
// the target house. Distances are road px (the 1024-wide road art: the road runs from x 272 to
// 752 in 3 lanes of 160), y counts up the road from the start line. Times in ms.

export const DRIVE = {
  /** The road's edges, and the middle of each lane. */
  roadLeft: 272,
  roadRight: 752,
  lanes: [352, 512, 672],
  /** Road px per stored sprite px: a van comes out about 110 wide, in a 160-wide lane. */
  spriteScale: 0.75,
  /** The 3-2-1 before the lights go green. */
  countdownMs: 3000,
  /** Speeds (road px per second): the gas is always down; S brakes; Shift is nitro. */
  topSpeed: 900,
  nitroSpeed: 1300,
  brakeSpeed: 380,
  /** How quickly the van gets up to speed (fraction of the gap closed per second). */
  accel: 0.9,
  brake: 3.5,
  /** Sideways speed at full steer (road px per second). */
  steer: 700,
  /** Nitro: 100 points, Shift burns this many a second, it creeps back on its own, a can tops it up. */
  nitroMax: 100,
  nitroBurn: 34,
  nitroRegen: 3,
  nitroCan: 35,
  /**
   * A clean drive at top speed reaches the gates this long before setup ends, leaving more room
   * for crashes and recovery on the shorter one-minute setup.
   */
  slackMs: 25_000,
  /**
   * Road between rows of hazards: wide at the start of town, tighter near the house; at nitro
   * speed the tightest still leaves time to change one lane.
   */
  gapStart: 640,
  gapEnd: 470,
  /** A traffic car's lane stays clear of other hazards this far ahead of it (it drives into it). */
  carClearAhead: 1300,
  /** How far up the road the screen shows, and where the van sits (fraction down the screen). */
  viewHeight: 1500,
  vanAt: 0.76,
} as const;

/** The drive's stakes: who gets in first, how late you can be, and what's too fast to be true. */
export const DRIVE_RULES = {
  /** Points for the first Runner to the house, and for each cash bundle picked up on the way. */
  firstIn: 50,
  cash: 10,
  /** A van still on the road this long after the heist starts is dropped at the house anyway. */
  lateCapMs: 20_000,
  /** The server refuses an arrival quicker than this share of a clean top-speed drive. */
  minShare: 0.75,
} as const;

/** What a van can run into, and what happens when it does. */
export const HAZARDS = {
  cone: { frame: 0, effect: 'knock' },
  cones: { frame: 1, effect: 'knock' },
  barrier: { frame: 2, effect: 'crash' },
  oil: { frame: 3, effect: 'spin' },
  pothole: { frame: 4, effect: 'bump' },
  plate: { frame: 5, effect: 'bump' },
  nitro: { frame: 6, effect: 'nitro' },
  cash: { frame: 7, effect: 'cash' },
} as const;
export type HazardKind = keyof typeof HAZARDS;
export type HitEffect = (typeof HAZARDS)[HazardKind]['effect'] | 'car';

/** What each kind of hit does: speed kept (fraction), spin-out time, screen shake. */
export const HIT = {
  knock: { keep: 0.6, spinMs: 0, shake: 5 },
  bump: { keep: 0.72, spinMs: 0, shake: 8 },
  spin: { keep: 0.65, spinMs: 900, shake: 4 },
  crash: { keep: 0.2, spinMs: 1000, shake: 16 },
  car: { keep: 0.22, spinMs: 1000, shake: 16 },
} as const;

/** Traffic (frames of the traffic sheet): how fast each drives up the road. Police flash 6/7. */
export const TRAFFIC = [
  { frame: 0, speed: 300 },
  { frame: 1, speed: 340 },
  { frame: 2, speed: 380 },
  { frame: 3, speed: 260 },
  { frame: 4, speed: 240 },
  { frame: 5, speed: 460 },
  { frame: 6, speed: 420, police: true },
] as const;

/** Roadside props (frames of the roadside sheet) the town is dressed with; the lamps are painted in. */
const PROPS = [1, 1, 1, 2, 3, 4, 5, 7] as const;

export interface DriveItem {
  id: number;
  /** A hazard or pickup on the road, or a traffic car. */
  kind: HazardKind | 'car';
  frame: number;
  x: number;
  y: number;
  /** Cars: road px per second, once the van can see them. */
  speed: number;
  police: boolean;
  /** Half the solid size, for hits (road px). */
  hw: number;
  hh: number;
}

export interface DriveProp {
  frame: number;
  x: number;
  y: number;
  /** Neon glows lie on the road under everything else; the rest stand on the pavement. */
  glow: boolean;
}

export interface DriveTrack {
  /** Where the gates are (the finish). */
  length: number;
  items: DriveItem[];
  props: DriveProp[];
}

/**
 * Where the road art goes: the start piece (the bottom half of the start/finish art) has its
 * start line at y 0, so its top edge is this far up the road, and the looping road runs on from
 * there in whole 2048-px pieces; the finish piece (the top half) caps the last one, its gates
 * this far above its bottom edge.
 */
export const ROAD_ART = { tile: 2048, startTop: 1632 - 1024, gateAbove: 1024 - 280 } as const;

/**
 * How long the drive is (to the gates) for a setup this long: about what top speed covers before
 * setup ends, minus the slack, rounded to whole pieces of road art.
 */
export function driveLength(setupMs: number) {
  const want = (DRIVE.topSpeed * Math.max(10_000, setupMs - DRIVE.countdownMs - DRIVE.slackMs)) / 1000;
  const pieces = Math.max(1, Math.round((want - ROAD_ART.gateAbove - ROAD_ART.startTop) / ROAD_ART.tile));
  return ROAD_ART.startTop + pieces * ROAD_ART.tile + ROAD_ART.gateAbove;
}

/** A tiny seeded random (mulberry32): every Runner in a round drives the same road. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string (a match id and round) as a seed. */
export function driveSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Half the solid size of a sprite frame, in road px (shrunk a little: near misses don't count). */
function half(sheet: 'hazards' | 'traffic', frame: number) {
  const [, , w, h] = DRIVE_STRIPS[sheet].hit[frame];
  return { hw: (w * DRIVE.spriteScale * 0.8) / 2, hh: (h * DRIVE.spriteScale * 0.8) / 2 };
}

/**
 * The road for one round. Rows of hazards and cars come every few hundred px, never closing
 * all 3 lanes, and the open lane never jumps more than one lane over from the last row, so
 * there's always a way through at full speed.
 */
export function buildTrack(seed: number, setupMs: number): DriveTrack {
  const r = rng(seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const length = driveLength(setupMs);
  const items: DriveItem[] = [];
  const props: DriveProp[] = [];
  let id = 0;
  const put = (kind: HazardKind | 'car', lane: number, y: number, extra: Partial<DriveItem> = {}) => {
    const frame = kind === 'car' ? (extra.frame ?? 0) : HAZARDS[kind].frame;
    const size = kind === 'car' ? half('traffic', frame) : half('hazards', frame);
    // A little wobble across the lane, so rows don't look ruled.
    const x = DRIVE.lanes[lane] + (r() - 0.5) * 24;
    items.push({ id: id++, kind, frame, x, y, speed: 0, police: false, ...size, ...extra });
  };
  // Lanes a car is about to drive up, until this far up the road.
  const carUntil = [0, 0, 0];
  let open = [0, 1, 2];
  let nextNitro = 2500;
  let y = 1300;
  while (y < length - 900) {
    const k = y / length;
    const busy = [0, 1, 2].filter((l) => carUntil[l] > y);
    // Which lanes stay open: at least one next to (or the same as) a lane open in the last row.
    const reachable = [0, 1, 2].filter((l) => !busy.includes(l) && open.some((o) => Math.abs(o - l) <= 1));
    if (!reachable.length) {
      y += 200;
      continue;
    }
    const keep = pick(reachable);
    // Later in the drive, more rows close two lanes.
    let closing = r() < 0.25 + 0.4 * k ? 2 : 1;
    let closed: number[] = [];
    // Whichever lane a van used to get through the last row, an open lane must be at most one
    // lane over (a van can't cross two lanes between rows): close fewer lanes until that holds.
    for (; closing >= 0; closing--) {
      const free = [0, 1, 2].filter((l) => l !== keep && !busy.includes(l));
      closed = [];
      for (let i = 0; i < closing && free.length; i++) closed.push(...free.splice(Math.floor(r() * free.length), 1));
      const nowOpen = [0, 1, 2].filter((l) => !closed.includes(l) && !busy.includes(l));
      if (open.every((o) => nowOpen.some((l) => Math.abs(l - o) <= 1))) break;
    }
    for (const lane of closed) {
      if (r() < 0.38) {
        const car = pick(TRAFFIC);
        put('car', lane, y, { frame: car.frame, speed: car.speed, police: 'police' in car });
        carUntil[lane] = y + DRIVE.carClearAhead;
      } else put(pick(['cone', 'cone', 'cones', 'barrier', 'oil', 'oil', 'pothole', 'plate'] as const), lane, y);
    }
    open = [0, 1, 2].filter((l) => !closed.includes(l) && !busy.includes(l));
    // Pickups: a nitro can now and then in the open lane; cash sometimes just past a hazard.
    if (y >= nextNitro) {
      put('nitro', keep, y + 40);
      nextNitro = y + 1800 + r() * 1400;
    } else if (closed.length && r() < 0.18) put('cash', closed[0], y + 170);
    y += DRIVE.gapStart + (DRIVE.gapEnd - DRIVE.gapStart) * k + r() * 120;
  }
  // The town: something on each pavement every few hundred px, and the odd neon glow on the road.
  for (const side of [216, 808]) {
    for (let py = 500; py < length + 400; py += 260 + r() * 420) props.push({ frame: pick(PROPS), x: side + (r() - 0.5) * 20, y: py, glow: false });
  }
  for (let py = 1500; py < length; py += 2400 + r() * 2600) props.push({ frame: 6, x: pick(DRIVE.lanes), y: py, glow: true });
  return { length, items, props };
}
