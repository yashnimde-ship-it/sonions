import '@fontsource/press-start-2p';
import { ART_TILE, BANDIT_PLACEHOLDER, BANDIT_SHEET, ZOOM } from './config';
import { Bandit } from './entities/Bandit';
import { type EstateJson, TileMap } from './map/TileMap';
import { CameraSystem } from './systems/CameraSystem';
import { InteractionSystem } from './systems/InteractionSystem';
import { LightingSystem } from './systems/LightingSystem';
import { HUD } from './ui/HUD';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Missing ${src}. Run: npm run assets`));
    img.src = src;
  });
}

const KEYS: Record<string, string> = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyE: 'interact', Enter: 'interact', Space: 'interact',
};

async function boot() {
  const [data, tileset, banditSheet] = await Promise.all([
    fetch('/assets/map/estate.json').then((r) => {
      if (!r.ok) throw new Error('Missing /assets/map/estate.json. Run: npm run assets');
      return r.json() as Promise<EstateJson>;
    }),
    loadImage('/assets/tiles/tileset.png'),
    // The art team's sprite if it's there; otherwise the generated stand-in.
    loadImage(BANDIT_SHEET).catch(() => {
      console.info('bandit.png not found; using the placeholder sprite');
      return loadImage(BANDIT_PLACEHOLDER);
    }),
  ]);

  const map = new TileMap(data, tileset);
  const bandit = new Bandit(banditSheet, data.spawn.x * ART_TILE, data.spawn.y * ART_TILE, data.spawn.facing);
  const camera = new CameraSystem(map.widthPx, map.heightPx);
  const interactions = new InteractionSystem(data.interactables);
  const lighting = new LightingSystem(map);
  const hud = new HUD();
  hud.setLoot(0, 0, interactions.lootables.length);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  let scale = ZOOM;

  // The canvas fills the window; how much of the world shows depends on its size.
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = ZOOM * dpr;
    camera.resize(canvas.width / scale, canvas.height / scale);
    camera.snap(bandit.x, bandit.y - 8);
  }
  resize();
  window.addEventListener('resize', resize);

  const held = new Set<string>();
  let pressed = new Set<string>();
  window.addEventListener('keydown', (e) => {
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    if (!e.repeat) pressed.add(k);
    held.add(k);
  });
  window.addEventListener('keyup', (e) => held.delete(KEYS[e.code]));
  window.addEventListener('blur', () => held.clear());

  if (import.meta.env.DEV) Object.assign(window, { game: { bandit, camera, map, interactions, hud } }); // for playtests

  function update() {
    const justPressed = pressed;
    pressed = new Set();

    if (hud.messageOpen) {
      if (justPressed.has('interact')) hud.hideMessage();
      bandit.update({ dx: 0, dy: 0, sprint: false }, map);
    } else {
      const dx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      const dy = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
      bandit.update({ dx, dy, sprint: held.has('sprint') }, map);

      const near = interactions.nearby(bandit);
      hud.setPrompt(near ? interactions.promptFor(near) : null);
      if (near && justPressed.has('interact')) {
        hud.showMessage(interactions.interact(near));
        hud.setPrompt(null);
        hud.setLoot(interactions.totalLoot, interactions.looted.size, interactions.lootables.length);
      }
    }
    hud.setArea(map.areaAt(bandit.x, bandit.y - 4));
    camera.update(bandit.x, bandit.y - 8);
  }

  let frame = 0;
  function draw() {
    frame++;
    // Snap the camera to whole screen pixels so the art stays crisp.
    const camX = Math.round(camera.x * scale) / scale;
    const camY = Math.round(camera.y * scale) / scale;
    const vw = camera.viewW;
    const vh = camera.viewH;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e1014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Only the visible part of each layer is drawn (camera culling).
    const blit = (layer: HTMLCanvasElement) => {
      const sx = Math.max(0, camX);
      const sy = Math.max(0, camY);
      const sw = Math.min(layer.width - sx, vw - (sx - camX));
      const sh = Math.min(layer.height - sy, vh - (sy - camY));
      if (sw <= 0 || sh <= 0) return;
      ctx.drawImage(layer, sx, sy, sw, sh, (sx - camX) * scale, (sy - camY) * scale, sw * scale, sh * scale);
    };
    blit(map.below);

    // Twinkles on anything still worth stealing.
    ctx.save();
    ctx.scale(scale, scale);
    for (const item of interactions.lootables) {
      if (interactions.looted.has(item.id)) continue;
      const cx = ((item.rect[0] + item.rect[2] + 1) / 2) * ART_TILE - camX;
      const cy = item.rect[1] * ART_TILE + 4 - camY;
      const phase = (frame + item.id.length * 13) % 90;
      if (phase > 30) continue;
      const s = phase < 15 ? phase / 15 : (30 - phase) / 15;
      ctx.fillStyle = `rgba(255, 246, 200, ${0.9 * s})`;
      ctx.fillRect(Math.round(cx) - 2, Math.round(cy), 5, 1);
      ctx.fillRect(Math.round(cx), Math.round(cy) - 2, 1, 5);
    }
    bandit.draw(ctx, camX, camY);
    ctx.restore();

    blit(map.above);
    lighting.draw(ctx, camX, camY, vw, vh, scale);
  }

  // Fixed 60 updates per second; draw once per animation frame.
  let last = performance.now();
  let acc = 0;
  function tick(now: number) {
    acc += Math.min(now - last, 250);
    last = now;
    while (acc >= 1000 / 60) {
      update();
      acc -= 1000 / 60;
    }
    draw();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin', `<pre style="position:fixed;z-index:9;color:#f88;padding:16px">${String(err)}</pre>`);
});
