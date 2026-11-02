import { DRIVE_BACKGROUNDS, DRIVE_STRIPS, type DriveStrip } from '../data/driveArt';
import { buildTrack, DRIVE, DRIVE_RULES, HAZARDS, HIT, ROAD_ART, type DriveItem, type DriveTrack, type HitEffect } from '../data/drive';
import { driveEngine, play } from './Sound';

// The Getaway Drive (src/data/drive.ts has the rules): a Runner's own van racing across town
// while the Saboteur sets up. It runs on its own: the game feeds it the controls 60 times a
// second and lets it draw the whole screen. Road px go up the road; the screen follows the van.

type G = CanvasRenderingContext2D;

const images = new Map<string, HTMLImageElement>();
/** An image once it has loaded (it starts loading the first time it's asked for). */
function image(file: string): HTMLImageElement | null {
  let img = images.get(file);
  if (!img) {
    img = new Image();
    img.src = `/assets/drive/${file}`;
    images.set(file, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Start loading the drive's art now, so the countdown isn't drawn without it. */
export function preloadDriveArt() {
  for (const s of Object.values(DRIVE_STRIPS)) image(s.file);
  for (const b of Object.values(DRIVE_BACKGROUNDS)) image(b.file);
}

/** Frame `frame` of a strip, its middle at (x, y) on screen, `k` screen px per stored px. */
function sprite(g: G, name: DriveStrip, frame: number, x: number, y: number, k: number, rotate = 0, alpha = 1) {
  const s = DRIVE_STRIPS[name];
  const img = image(s.file);
  if (!img) return false;
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y);
  if (rotate) g.rotate(rotate);
  g.drawImage(img, frame * s.w, 0, s.w, s.h, (-s.w * k) / 2, (-s.h * k) / 2, s.w * k, s.h * k);
  g.restore();
  return true;
}

/** A drive sprite (a HUD icon, a van) for drawing elsewhere: the Saboteur's crew ETA. */
export const drawDriveIcon = sprite;

/**
 * One of the crew on the drive, as the server last told it (the game keeps these): their name
 * and paint, where their van was and how fast it was going up the road, and whether (and in
 * which place) they've got to the house.
 */
export interface CrewVan {
  name: string;
  color: number;
  x: number;
  y: number;
  vy: number;
  at: number;
  arrived: boolean;
  place: number;
}

/** Where a crew van is now: on from its last report at its last speed (half a second at most). */
export function crewY(v: CrewVan, length: number, now: number) {
  return v.arrived ? length + 100 : v.y + v.vy * Math.min(0.5, (now - v.at) / 1000);
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;

/** Effects that play out on the road: a crash cloud, a knocked cone, a word, a spark. */
type Fx =
  | { kind: 'crash'; x: number; y: number; at: number }
  | { kind: 'flying'; sheet: DriveStrip; frame: number; x: number; y: number; vx: number; vy: number; spin: number; at: number }
  | { kind: 'text'; text: string; color: string; x: number; y: number; at: number }
  | { kind: 'spark'; x: number; y: number; vx: number; vy: number; color: string; at: number };

const CRASH_MS = 560;
const FLY_MS = 750;
const TEXT_MS = 900;
const SPARK_MS = 380;
/** Where a car that got hit ends up: shunted sideways, stopped. */
const SHUNT = 70;

export class DriveGame {
  readonly track: DriveTrack;
  /** The van: across the road, up the road (its middle), and how fast it's going. */
  x: number = DRIVE.lanes[1];
  y = -160;
  speed = 0;
  nitro: number = DRIVE.nitroMax / 2;
  hits = 0;
  cash = 0;
  /** Ms from the green light to the gates, once there. */
  finishMs: number | null = null;
  /** The whole crew's vans (mine too, under `me`), kept up to date by the game; my place once in. */
  crew = new Map<string, CrewVan>();
  me = '';
  place = 0;
  /** My place in the race as shown (it changes only once it has held a moment, so no flicker). */
  private rank = 0;
  private rankWant = 0;
  private rankSince = 0;
  private vx = 0;
  private readonly green: number;
  private spinFrom = 0;
  private spinUntil = 0;
  private shakeUntil = 0;
  private shake = 0;
  private burning = false;
  private braking = false;
  private countShown = 4;
  /** Cars start driving off once the van can see them: since when (performance.now()). */
  private seen = new Map<number, number>();
  /** Things already hit (no second hit), and those now gone from the road. */
  private used = new Set<number>();
  private removed = new Set<number>();
  /** Cars that got hit: when, where they'd got to, and which way they were shunted. */
  private shunted = new Map<number, { at: number; y: number; dir: number }>();
  private fx: Fx[] = [];
  private engine: ReturnType<typeof driveEngine> | null = null;
  private readonly halfW: number;
  private readonly halfH: number;

  /** My van's paint (a frame of the vans sheet). */
  readonly color: number;

  /** `green`: when the light goes green (performance.now ms; the server sets it for the crew). */
  constructor(seed: number, setupMs: number, color: number, green: number) {
    this.color = color;
    this.track = buildTrack(seed, setupMs);
    this.green = green;
    const [, , w, h] = DRIVE_STRIPS.vans.hit[color];
    this.halfW = (w * DRIVE.spriteScale) / 2;
    this.halfH = (h * DRIVE.spriteScale) / 2;
  }

  /** Has the light gone green? */
  started(now: number) {
    return now >= this.green;
  }

  /** Ms driven so far (0 in the countdown), or the finish time. */
  clock(now: number) {
    return this.finishMs ?? Math.max(0, now - this.green);
  }

  /** How far along the drive the van is (0 at the start line, 1 at the gates). */
  progress() {
    return Math.max(0, Math.min(1, (this.y + this.halfH) / this.track.length));
  }

  /** Where a car is now: it drives up its lane once seen, and stays put after a hit. */
  private carY(it: DriveItem, now: number) {
    const hit = this.shunted.get(it.id);
    if (hit) return hit.y;
    const since = this.seen.get(it.id);
    return it.y + (since === undefined ? 0 : (it.speed * (now - since)) / 1000);
  }

  private itemY(it: DriveItem, now: number) {
    return it.kind === 'car' ? this.carY(it, now) : it.y;
  }

  private itemX(it: DriveItem, now: number) {
    const hit = this.shunted.get(it.id);
    if (!hit) return it.x;
    const k = Math.min(1, (now - hit.at) / 400);
    return it.x + hit.dir * SHUNT * (1 - (1 - k) ** 2);
  }

  /** One fixed update (1/60 s). */
  update(input: { dx: number; dy: number; sprint: boolean }, now: number) {
    const dt = 1 / 60;
    if (now < this.green) {
      // The 3-2-1, then GO.
      const n = Math.ceil((this.green - now) / 1000);
      if (n < this.countShown) {
        this.countShown = n;
        play('count');
      }
      return;
    }
    if (this.countShown > 0) {
      this.countShown = 0;
      play('go');
      this.engine = driveEngine();
    }
    if (this.finishMs !== null) {
      // Over the line: roll up to the gates and stop.
      this.speed *= 0.94;
      this.y += this.speed * dt;
      this.x += (DRIVE.lanes[1] - this.x) * 0.04;
      this.engine?.set(this.speed / DRIVE.topSpeed, false);
      if (this.speed < 20) this.stop();
      return;
    }
    const spinning = now < this.spinUntil;
    this.braking = input.dy > 0 && !spinning;
    this.burning = input.sprint && this.nitro > 0 && !spinning && !this.braking;
    const target = spinning ? 160 : this.braking ? DRIVE.brakeSpeed : this.burning ? DRIVE.nitroSpeed : DRIVE.topSpeed;
    const rate = target < this.speed ? DRIVE.brake : DRIVE.accel;
    this.speed += (target - this.speed) * (1 - Math.exp(-rate * dt));
    if (this.burning) this.nitro = Math.max(0, this.nitro - DRIVE.nitroBurn * dt);
    else this.nitro = Math.min(DRIVE.nitroMax, this.nitro + DRIVE.nitroRegen * dt);
    // Steering: quick to answer, but not instant (no steering mid-spin).
    const want = spinning ? 0 : input.dx * DRIVE.steer;
    this.vx += (want - this.vx) * Math.min(1, (spinning ? 3 : 12) * dt);
    this.x += this.vx * dt;
    this.y += this.speed * dt;
    // The kerbs: the van can ride up on them, scraping (slower, sparks), but not past them.
    const left = DRIVE.roadLeft + this.halfW * 0.55;
    const right = DRIVE.roadRight - this.halfW * 0.55;
    if (this.x < left || this.x > right) {
      this.x = Math.max(left, Math.min(right, this.x));
      this.vx = 0;
    }
    if (this.x < DRIVE.roadLeft + this.halfW || this.x > DRIVE.roadRight - this.halfW) {
      this.speed *= 0.985;
      if (Math.random() < 0.5) {
        const side = this.x < 512 ? -1 : 1;
        this.spark(this.x + side * this.halfW * 0.9, this.y - this.halfH * 0.3 * Math.random(), side * 60, -this.speed * 0.3, '#ffd36e', now);
      }
    }
    this.collide(now, spinning);
    this.race(now);
    for (const it of this.track.items) if (it.kind === 'car' && !this.seen.has(it.id) && it.y < this.y + DRIVE.viewHeight * DRIVE.vanAt + 200) this.seen.set(it.id, now);
    if (this.y + this.halfH >= this.track.length - 40) {
      this.finishMs = now - this.green;
      this.burning = false;
      this.braking = false;
      play('gateOpen');
      this.text('MADE IT!', '#ffd84a', this.x, this.y + this.halfH + 40, now);
    }
    this.engine?.set(this.speed / DRIVE.topSpeed, this.burning);
  }

  private collide(now: number, spinning: boolean) {
    for (const it of this.track.items) {
      if (this.used.has(it.id)) continue;
      const iy = this.itemY(it, now);
      if (Math.abs(iy - this.y) > 400) continue;
      const ix = this.itemX(it, now);
      if (Math.abs(ix - this.x) >= it.hw + this.halfW * 0.8 || Math.abs(iy - this.y) >= it.hh + this.halfH * 0.85) continue;
      const effect: HitEffect = it.kind === 'car' ? 'car' : HAZARDS[it.kind].effect;
      if (effect === 'nitro') {
        this.used.add(it.id);
        this.removed.add(it.id);
        this.nitro = Math.min(DRIVE.nitroMax, this.nitro + DRIVE.nitroCan);
        play('boost');
        this.text('+NITRO', '#7fe8ff', ix, iy + 30, now);
        continue;
      }
      if (effect === 'cash') {
        this.used.add(it.id);
        this.removed.add(it.id);
        this.cash++;
        play('coin');
        this.text('+CASH', '#9be86a', ix, iy + 30, now);
        continue;
      }
      // Mid-spin the van slides through anything else unharmed (one crash at a time).
      if (spinning) continue;
      this.used.add(it.id);
      this.hits++;
      const h = HIT[effect];
      this.speed *= h.keep;
      this.shake = h.shake;
      this.shakeUntil = now + 320;
      if (h.spinMs) {
        this.spinFrom = now;
        this.spinUntil = now + h.spinMs;
      }
      const side = ix < this.x ? -1 : 1;
      if (effect === 'car') {
        this.shunted.set(it.id, { at: now, y: iy, dir: side });
        this.fx.push({ kind: 'crash', x: (ix + this.x) / 2, y: (iy + this.y) / 2, at: now });
        this.vx = -side * 260;
        play('crusher');
      } else if (effect === 'crash') {
        this.removed.add(it.id);
        this.fx.push({ kind: 'crash', x: ix, y: iy, at: now });
        this.fx.push({ kind: 'flying', sheet: 'hazards', frame: it.frame, x: ix, y: iy, vx: side * 260, vy: 520, spin: side * 7, at: now });
        play('crusher');
      } else if (effect === 'knock') {
        this.removed.add(it.id);
        this.fx.push({ kind: 'flying', sheet: 'hazards', frame: it.frame, x: ix, y: iy, vx: side * 340 + (Math.random() - 0.5) * 120, vy: this.speed * 0.9, spin: side * 10, at: now });
        play('whoosh');
      } else if (effect === 'spin') {
        play('oil');
      } else {
        for (let i = 0; i < 6; i++) this.spark(this.x + (Math.random() - 0.5) * this.halfW, this.y + this.halfH * 0.6, (Math.random() - 0.5) * 200, -80, '#c9c2b0', now);
        play('spring');
      }
      if (effect !== 'bump') for (let i = 0; i < 10; i++) this.spark(ix, iy, (Math.random() - 0.5) * 500, (Math.random() - 0.3) * 500, '#ffcf5a', now);
    }
  }

  /** How many vans are racing (me included). */
  private racers() {
    return Math.max(1, [...this.crew.keys()].filter((id) => id !== this.me).length + 1);
  }

  /** My place now: behind everyone already in, and everyone further up the road. */
  private standing(now: number) {
    if (this.place) return this.place;
    let ahead = 0;
    for (const [id, v] of this.crew) if (id !== this.me && (v.arrived || crewY(v, this.track.length, now) > this.y)) ahead++;
    return ahead + 1;
  }

  /** Overtakes: my place goes up once it has held for a moment, with a cheer. */
  private race(now: number) {
    if (this.racers() < 2) return;
    const want = this.standing(now);
    if (want !== this.rankWant) {
      this.rankWant = want;
      this.rankSince = now;
    }
    if (want === this.rank || now - this.rankSince < 250) return;
    if (this.rank && want < this.rank) {
      this.text('OVERTAKE!', '#9be86a', this.x, this.y + this.halfH + 70, now);
      play('whoosh');
    }
    this.rank = want;
  }

  private spark(x: number, y: number, vx: number, vy: number, color: string, now: number) {
    this.fx.push({ kind: 'spark', x, y, vx, vy, color, at: now });
  }

  private text(text: string, color: string, x: number, y: number, now: number) {
    this.fx.push({ kind: 'text', text, color, x, y, at: now });
  }

  /** A word floating up over my van (points for getting in first). */
  cheer(text: string, color: string, now: number) {
    this.text(text, color, this.x, this.y + this.halfH + 120, now);
  }

  /** The engine off (the drive's over, or the round moved on). */
  stop() {
    this.engine?.stop();
    this.engine = null;
  }

  /**
   * The whole screen: the town scrolling past, the van, and the drive's own HUD. `setupLeft` is
   * how long until the heist starts (ms).
   */
  draw(g: G, w: number, h: number, dpr: number, now: number, setupLeft: number) {
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#07080f';
    g.fillRect(0, 0, w, h);
    // Road px -> screen px: the road is as tall as the screen allows (narrower on a phone).
    const s = Math.min(h / DRIVE.viewHeight, w / 1024);
    const ox = w / 2 - 512 * s;
    const vanY = h * DRIVE.vanAt;
    // A shake moves the whole street together (one offset a frame).
    const shake = now < this.shakeUntil ? this.shake * s * 2 * ((this.shakeUntil - now) / 320) : 0;
    const [jx, jy] = shake ? [(Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake] : [0, 0];
    const pieces = Math.round((this.track.length - ROAD_ART.gateAbove - ROAD_ART.startTop) / ROAD_ART.tile);
    // The view follows the van but stays on the art: not below the garage at the start, nor past
    // the house at the finish (there the van drives on up the screen into the gates).
    const artTop = ROAD_ART.startTop + pieces * ROAD_ART.tile + 1024;
    const artBottom = ROAD_ART.startTop - 1024;
    const camY = Math.max(artBottom + (h - vanY) / s, Math.min(artTop - vanY / s, this.y));
    const sx = (x: number) => ox + x * s + jx;
    const sy = (y: number) => vanY - (y - camY) * s + jy;
    const top = camY + vanY / s;
    const bottom = camY - (h - vanY) / s;
    const road = image(DRIVE_BACKGROUNDS.road.file);
    const ends = image(DRIVE_BACKGROUNDS.ends.file);
    const T = ROAD_ART.tile;
    const firstK = Math.floor((bottom - ROAD_ART.startTop) / T) - 1;
    const lastK = Math.floor((top - ROAD_ART.startTop) / T);
    // The streets either side: more of the same city, darkened.
    if (road) {
      for (let col = 1; ox - (col - 1) * 1024 * s > 0 || ox + (col + 1) * 1024 * s < w; col++) {
        for (const dir of [-1, 1]) {
          const cx = ox + dir * col * 1024 * s;
          if (cx > w || cx + 1024 * s < 0) continue;
          for (let k = firstK; k <= lastK; k++) g.drawImage(road, cx, sy(ROAD_ART.startTop + (k + 1) * T), 1024 * s, T * s + 1);
        }
      }
      g.fillStyle = 'rgba(5,6,14,0.72)';
      g.fillRect(0, 0, ox, h);
      g.fillRect(ox + 1024 * s, 0, w - ox - 1024 * s, h);
      // Our street: whole pieces of road from the start piece to the finish piece.
      for (let k = Math.max(0, firstK); k <= Math.min(pieces - 1, lastK); k++) g.drawImage(road, sx(0), sy(ROAD_ART.startTop + (k + 1) * T), 1024 * s, T * s + 1);
    }
    if (ends) {
      g.drawImage(ends, 0, 1024, 1024, 1024, sx(0), sy(ROAD_ART.startTop), 1024 * s, 1024 * s + 1);
      g.drawImage(ends, 0, 0, 1024, 1024, sx(0), sy(ROAD_ART.startTop + pieces * T + 1024), 1024 * s, 1024 * s + 1);
    }
    const k = DRIVE.spriteScale * s;
    const onScreen = (y: number) => y < top + 300 && y > bottom - 300;
    // Neon glows lie on the road; the town's props stand on the pavements.
    g.save();
    g.globalCompositeOperation = 'screen';
    for (const p of this.track.props) if (p.glow && onScreen(p.y)) sprite(g, 'roadside', p.frame, sx(p.x), sy(p.y), k * 1.3);
    g.restore();
    // Hazards and pickups, then traffic.
    for (const it of this.track.items) {
      if (it.kind === 'car' || this.removed.has(it.id) || !onScreen(it.y)) continue;
      const pickup = it.kind === 'nitro' || it.kind === 'cash';
      const bob = pickup ? 1 + 0.08 * Math.sin(now / 160 + it.id) : 1;
      if (pickup) this.glow(g, sx(it.x), sy(it.y), 60 * s * bob, it.kind === 'nitro' ? '127,232,255' : '155,232,106');
      sprite(g, 'hazards', it.frame, sx(it.x), sy(it.y), k * bob);
    }
    for (const it of this.track.items) {
      if (it.kind !== 'car') continue;
      const y = this.carY(it, now);
      if (!onScreen(y)) continue;
      const hit = this.shunted.get(it.id);
      const frame = it.police ? (Math.floor(now / 220) % 2 ? 7 : 6) : it.frame;
      const turn = hit ? hit.dir * 0.35 * Math.min(1, (now - hit.at) / 400) : 0;
      // Headlights on the road ahead of each car.
      this.glow(g, sx(it.x), sy(y + it.hh + 40), 50 * s, '255,226,150', 0.25);
      sprite(g, 'traffic', frame, sx(this.itemX(it, now)), sy(y), k, turn);
    }
    for (const p of this.track.props) if (!p.glow && onScreen(p.y)) sprite(g, 'roadside', p.frame, sx(p.x), sy(p.y), k * 0.62);
    // The rest of the crew, racing the same road: see-through ghost vans with their names.
    for (const [id, v] of this.crew) {
      if (id === this.me) continue;
      const y = crewY(v, this.track.length, now);
      if (!onScreen(y)) continue;
      sprite(g, 'vans', v.color, sx(v.x), sy(y), k, 0, 0.42);
      g.globalAlpha = 0.85;
      this.label(g, v.name.toUpperCase(), sx(v.x), sy(y) - (this.halfH + 26) * s, Math.max(7, 22 * s), '#e8e2ff');
      g.globalAlpha = 1;
    }
    // The van: its headlights, the nitro flame out the back, the brake lights, a spin.
    const spin = now < this.spinUntil ? ((now - this.spinFrom) / (this.spinUntil - this.spinFrom)) * Math.PI * 2 : 0;
    const lean = (this.vx / DRIVE.steer) * 0.13;
    const vx = sx(this.x);
    const vy = sy(this.y);
    this.glow(g, vx, vy - (this.halfH + 70) * s, 80 * s, '255,230,160', 0.3);
    if (this.burning) {
      for (let i = 0; i < 3; i++) {
        const lx = ox + (DRIVE.roadLeft + Math.random() * (DRIVE.roadRight - DRIVE.roadLeft)) * s;
        const ly = Math.random() * h;
        g.fillStyle = 'rgba(200,245,255,0.35)';
        g.fillRect(lx, ly, 2 * dpr, 60 * s + Math.random() * 120 * s);
      }
      const flame = DRIVE_STRIPS.nitro;
      const fk = k * 0.55;
      // The flame strip's top sits at its cell's middle + hit[1]: line that up with the bumper.
      const anchor = flame.hit[0][1] * fk;
      sprite(g, 'nitro', Math.floor(now / 50) % 8, vx - Math.sin(lean) * this.halfH * s, vy + this.halfH * s * 0.9 - anchor, fk, lean);
    }
    if (this.braking) this.glow(g, vx, vy + this.halfH * s, 45 * s, '255,60,60', 0.6);
    // A cyan pool of light under my own van, so it never gets lost among same-coloured traffic.
    g.save();
    g.translate(vx, vy);
    g.scale(1, 1.6);
    this.glow(g, 0, 0, this.halfW * 2.8 * s, '90,230,255', 0.75);
    g.restore();
    if (!sprite(g, 'vans', this.color, vx, vy, k, spin + lean)) {
      g.fillStyle = '#9c2a3a';
      g.fillRect(vx - this.halfW * s, vy - this.halfH * s, this.halfW * 2 * s, this.halfH * 2 * s);
    }
    this.drawFx(g, sx, sy, s, k, dpr, now);
    // A moody edge to the screen.
    const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
    this.drawHud(g, w, h, ox, s, now, setupLeft);
    g.restore();
  }

  /** A soft round light (r screen px), `rgb` as 'r,g,b'. */
  private glow(g: G, x: number, y: number, r: number, rgb: string, alpha = 0.45) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},${alpha})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  private drawFx(g: G, sx: (x: number) => number, sy: (y: number) => number, s: number, k: number, dpr: number, now: number) {
    this.fx = this.fx.filter((f) => now - f.at < (f.kind === 'crash' ? CRASH_MS : f.kind === 'flying' ? FLY_MS : f.kind === 'text' ? TEXT_MS : SPARK_MS));
    for (const f of this.fx) {
      const t = (now - f.at) / 1000;
      if (f.kind === 'crash') sprite(g, 'crash', Math.floor((t * 1000 * 8) / CRASH_MS), sx(f.x), sy(f.y), k * 1.1);
      else if (f.kind === 'flying') {
        const fade = 1 - (t * 1000) / FLY_MS;
        sprite(g, f.sheet, f.frame, sx(f.x + f.vx * t), sy(f.y + f.vy * t), k * (1 + t * 0.6), f.spin * t, fade);
      } else if (f.kind === 'spark') {
        g.fillStyle = f.color;
        g.globalAlpha = 1 - (t * 1000) / SPARK_MS;
        g.fillRect(sx(f.x + f.vx * t), sy(f.y + f.vy * t), 3 * dpr, 3 * dpr);
        g.globalAlpha = 1;
      } else {
        const p = (t * 1000) / TEXT_MS;
        g.globalAlpha = 1 - p * p;
        this.label(g, f.text, sx(f.x), sy(f.y) - p * 50 * dpr, Math.max(10 * dpr, 34 * s), f.color);
        g.globalAlpha = 1;
      }
    }
  }

  /** Pixel text with a dark outline, centred on (x, y). */
  private label(g: G, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') {
    g.font = `${Math.round(size)}px "Press Start 2P", monospace`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, size / 4);
    g.strokeStyle = '#07080f';
    g.lineJoin = 'round';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }

  private drawHud(g: G, w: number, h: number, ox: number, s: number, now: number, setupLeft: number) {
    const u = Math.min(h / 900, w / 700);
    const roadW = 1024 * s;
    // Progress, up the left edge of our street: the house at the top, my van climbing to it.
    const px = ox + 70 * s;
    const pTop = h * 0.24;
    const pBot = h * 0.86;
    g.fillStyle = 'rgba(232,226,255,0.55)';
    g.fillRect(px - 6 * u, pTop - 1 * u, 12 * u, pBot - pTop + 2 * u);
    g.fillStyle = 'rgba(7,8,15,0.9)';
    g.fillRect(px - 4 * u, pTop, 8 * u, pBot - pTop);
    g.fillStyle = '#ffd84a';
    g.fillRect(px - 3 * u, pBot - (pBot - pTop) * this.progress(), 6 * u, (pBot - pTop) * this.progress());
    sprite(g, 'hud', 1, px, pTop - 26 * u, 0.22 * u);
    for (const [id, v] of this.crew) {
      if (id === this.me) continue;
      const p = Math.max(0, Math.min(1, crewY(v, this.track.length, now) / this.track.length));
      sprite(g, 'vans', v.color, px, pBot - (pBot - pTop) * p, 0.11 * u, 0, 0.6);
    }
    sprite(g, 'vans', this.color, px, pBot - (pBot - pTop) * this.progress(), 0.14 * u);
    // My place in the race, up the right edge (with a medal on the podium).
    if (this.racers() > 1 && (this.rank || this.place)) {
      const place = this.place || this.rank;
      const py = h * 0.21;
      const rx = ox + roadW - 80 * s;
      if (place <= 3) sprite(g, 'hud', 3 + place, rx, py, 0.2 * u);
      this.label(g, ordinal(place), rx, py + (place <= 3 ? 34 : 0) * u, 13 * u, place === 1 ? '#ffd84a' : '#ffffff');
      this.label(g, `OF ${this.racers()}`, rx, py + (place <= 3 ? 52 : 18) * u, 7 * u, '#9aa3c7');
    }
    // Speed and nitro, up the right edge.
    const rx = ox + roadW - 80 * s;
    sprite(g, 'hud', 3, rx, h * 0.62, 0.3 * u);
    // Shown as km/h, top speed about 160.
    this.label(g, `${Math.round(this.speed * 0.18)}`, rx, h * 0.62 + 52 * u, 16 * u, '#ffffff');
    this.label(g, 'KM/H', rx, h * 0.62 + 72 * u, 8 * u, '#9aa3c7');
    const nTop = h * 0.32;
    const nH = h * 0.18;
    sprite(g, 'hud', 2, rx, nTop - 28 * u, 0.2 * u);
    g.fillStyle = 'rgba(7,8,15,0.75)';
    g.fillRect(rx - 9 * u, nTop, 18 * u, nH);
    const full = this.nitro / DRIVE.nitroMax;
    g.fillStyle = this.burning ? '#e8fdff' : '#38d6f0';
    g.fillRect(rx - 6 * u, nTop + nH * (1 - full) + 3 * u, 12 * u, Math.max(0, nH * full - 6 * u));
    this.label(g, 'SHIFT', rx, nTop + nH + 14 * u, 7 * u, '#9aa3c7');
    // Crashes and cash, and the drive's clock.
    const clock = this.clock(now) / 1000;
    this.label(g, `${Math.floor(clock / 60)}:${(clock % 60).toFixed(1).padStart(4, '0')}`, w / 2, h * 0.17, 14 * u, '#ffffff');
    this.label(g, `CRASHES ${this.hits}   CASH ${this.cash}`, w / 2, h * 0.17 + 24 * u, 8 * u, '#c9cde8');
    // The heist started without me: how late I am, and when the crew drops me at the house anyway.
    if (setupLeft < 0 && this.finishMs === null) {
      const late = -setupLeft / 1000;
      g.fillStyle = 'rgba(40,6,14,0.82)';
      g.fillRect(w / 2 - 250 * u, h * 0.17 + 40 * u, 500 * u, 66 * u);
      g.globalAlpha = 0.75 + 0.25 * Math.sin(now / 120);
      this.label(g, 'THE HEIST HAS STARTED!', w / 2, h * 0.17 + 58 * u, 15 * u, '#ff5a6e');
      g.globalAlpha = 1;
      this.label(g, `${Math.floor(late)}s LATE · DROPPED AT THE HOUSE IN ${Math.max(0, Math.ceil(DRIVE_RULES.lateCapMs / 1000 - late))}s`, w / 2, h * 0.17 + 88 * u, 9 * u, '#ffd0d6');
    }
    // The 3-2-1, the controls, GO.
    if (now < this.green) {
      const n = Math.ceil((this.green - now) / 1000);
      const pop = 1 + 0.35 * (1 - ((this.green - now) % 1000) / 1000) ** 4;
      // Kept below the round's role card, which is up for the whole count.
      this.label(g, 'GETAWAY DRIVE', w / 2, h * 0.42, 18 * u, '#ffd84a');
      this.label(g, `${n}`, w / 2, h * 0.54, 54 * u * pop, '#ffffff');
      this.label(g, 'A/D STEER   SHIFT NITRO   S BRAKE', w / 2, h * 0.63, 8 * u, '#9be8ff');
    } else if (now - this.green < 900) {
      const p = (now - this.green) / 900;
      g.globalAlpha = 1 - p;
      this.label(g, 'GO!', w / 2, h * 0.54, 54 * u * (1 + p * 0.5), '#9be86a');
      g.globalAlpha = 1;
    } else if (now - this.green < 6000 && this.finishMs === null) {
      g.globalAlpha = Math.min(1, (6000 - (now - this.green)) / 800);
      this.label(g, 'A/D STEER   SHIFT NITRO   S BRAKE', w / 2, h * 0.63, 8 * u, '#9be8ff');
      g.globalAlpha = 1;
    }
    if (this.finishMs !== null) {
      const t = this.finishMs / 1000;
      g.fillStyle = 'rgba(7,8,15,0.72)';
      g.fillRect(w / 2 - 230 * u, h * 0.36, 460 * u, 130 * u);
      this.label(g, this.place && this.racers() > 1 ? `YOU MADE IT ${ordinal(this.place)}!` : 'YOU MADE IT!', w / 2, h * 0.36 + 34 * u, 22 * u, '#ffd84a');
      this.label(g, `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}  ·  ${this.hits} CRASHES`, w / 2, h * 0.36 + 72 * u, 9 * u, '#ffffff');
      this.label(g, setupLeft > 0 ? `THE HEIST STARTS IN ${Math.ceil(setupLeft / 1000)}s` : 'GET IN THERE!', w / 2, h * 0.36 + 102 * u, 8 * u, '#9be8ff');
    }
  }
}
