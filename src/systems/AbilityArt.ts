import { ABILITY_STRIPS, type AbilityStrip } from '../data/abilityArt';

// The painted ability effects (public/assets/abilities/, made by scripts/build-ability-sprites.py):
// one row of equal frames per ability, each drawn with its anchor (a body's feet, or a ring's
// middle) on the spot. Until a strip has loaded, or if it can't, the draw calls say so and the
// game keeps its own simple drawing instead.

type G = CanvasRenderingContext2D;

const strips = new Map<AbilityStrip, HTMLImageElement>();

/** A strip once it has loaded (it starts loading the first time it's asked for). */
function strip(name: AbilityStrip): HTMLImageElement | null {
  let img = strips.get(name);
  if (!img) {
    img = new Image();
    img.src = `/assets/abilities/${ABILITY_STRIPS[name].file}`;
    strips.set(name, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Start loading every strip now, so the first use doesn't show the fallback. */
export function preloadAbilityArt() {
  for (const name of Object.keys(ABILITY_STRIPS) as AbilityStrip[]) strip(name);
}

/**
 * Draws frame `frame` of a strip with its anchor at (x, y), `scale` art px per stored px,
 * turned by `rotate` (radians), mirrored when `flip`, and stretched `sy` times as tall. False (and nothing drawn) while the art
 * isn't there.
 */
export function drawAbilityFrame(g: G, name: AbilityStrip, frame: number, x: number, y: number, scale: number, opts: { flip?: boolean; alpha?: number; rotate?: number; sy?: number } = {}) {
  const img = strip(name);
  if (!img) return false;
  const s = ABILITY_STRIPS[name];
  const i = Math.max(0, Math.min(s.frames - 1, Math.floor(frame)));
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  if (opts.alpha !== undefined) g.globalAlpha *= opts.alpha;
  g.translate(x, y);
  if (opts.rotate) g.rotate(opts.rotate);
  if (opts.flip) g.scale(-1, 1);
  // Stretched up or down (a ring drawn as a circle on the floor).
  if (opts.sy) g.scale(1, opts.sy);
  g.drawImage(img, i * s.w, 0, s.w, s.h, -s.ax * scale, -s.ay * scale, s.w * scale, s.h * scale);
  g.restore();
  return true;
}

/** Is a strip ready to draw (so the caller can skip its own fallback drawing)? */
export const abilityArtReady = (name: AbilityStrip) => !!strip(name);
