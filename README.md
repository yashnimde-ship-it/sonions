# Bandit

A top-down pixel-art heist game set in a cozy suburban estate at dusk. Sneak in
from the street, explore the house and grounds, and steal everything worth taking.

Built with the same stack as the FireRed remake: **TypeScript + Canvas + Vite**,
with art generated at build time and compiled into a tilemap.

## Run

```bash
npm install
npm run assets      # paint the estate and compile tiles, collision and data
npm run dev         # http://localhost:5173 (any free port)
```

Open the printed URL in Chrome. Other scripts:

| Command | What it does |
| --- | --- |
| `npm run assets` | Regenerate everything in `public/assets/` from `map/` |
| `npm run check` | Flood-fill the collision map from the spawn point and confirm every room and interactable is reachable |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build |

## Controls

| Key | Action |
| --- | --- |
| W A S D / Arrow keys | Move |
| Shift | Sprint |
| E (or Enter / Space) | Interact: examine, or steal loot. Also closes messages |

Nine items are worth stealing (look for the twinkle): the toolbox, cookie jar, TV,
laptop, jewelry box, gold watch, game console, piggy bank and silverware.

## Map

- **96 x 64 tiles, 32 x 32 px each on screen (3072 x 2048 px).** Art is painted at 16 px
  per tile, the reference image's own resolution, and drawn at 2x for a crisp 16-bit look.
- Layout recreated from `public/reference/estate-map-reference.png` (16 reference pixels
  = 1 tile): garage with the red car and driveway, storage room, kitchen, three
  bathrooms, master bedroom, living room, study, dining room, two more bedrooms,
  hallways, front porch, pool with deck and floats, pergola deck, vegetable garden,
  shed, doghouse, fences and gates, sidewalk and road.

## Architecture

```
map/                      build-time map definition and painters (Node, ES modules)
  mapData.mjs             the layout: rooms, hallways, doors, windows, grounds, objects,
                          trees, lights, interactables, spawn — all in tile coordinates
  tileDefinitions.mjs     ground, floor, wall, door, window, fence and road painters
  furniture.mjs           object painters (beds, sofas, kitchen, car, pool, trees, ...)
  mapBuilder.mjs          house plan + the four art layers
  collisionMap.mjs        collision grid derived from the data (not from the art)
  bandit.mjs              PLACEHOLDER bandit sprite (the real one comes from the art team)
  draw.mjs                pixel drawing primitives and the dusk palette
scripts/
  generate-assets.mjs     paints, dedupes 16x16 tiles into a tileset, writes the map JSON
  check-reachability.mjs  verifies every room and interactable can be reached
src/                      the game (TypeScript, Canvas 2D)
  main.ts                 loading, input, fixed 60 fps loop, rendering order
  config.ts               zoom, speeds, hitbox, camera easing
  map/TileMap.ts          builds the layers from the tileset; collision and area queries
  entities/Bandit.ts      movement with per-axis collision, sprinting, animation
  systems/CameraSystem.ts follow with easing, clamped to the world, resize-aware
  systems/InteractionSystem.ts  what's in reach, prompts, loot tracking
  systems/LightingSystem.ts     dusk, lit interiors, lamp light (visible area only)
  ui/HUD.ts               fixed DOM HUD: loot, area name, prompt, messages
public/assets/            generated: tiles/tileset.png, map/estate.json, characters/bandit-placeholder.png
                          provided by the art team: characters/bandit.png
```

**How the map is built.** `mapBuilder` first builds a plan: room interiors, then
walls (shared walls stay walls), then any hallway edge facing outdoors becomes an
exterior wall, then doors and windows are carved in. It paints four layers:

1. **floor**: ground, lawn, paths, pool deck, interior floors and wall faces
2. **walls**: walls, windows and doorways
3. **objects**: furniture, props, fences, tree trunks (drawn under the bandit)
4. **overhead**: tree canopies and pergola beams (drawn over the bandit)

The generator cuts every layer into 16x16 tiles and deduplicates them into one
tileset (about 2,000 unique tiles); the map JSON stores each layer as tile IDs.

**Collision** is a separate 192 x 128 grid of half-tile cells, built from walls,
fences and each object's footprint (trimmed so you can stand right next to
furniture; small props block their lower half; trees block their trunk). The bandit
collides with his feet hitbox, moving one axis at a time so he slides along walls.

**Rendering.** The layers are drawn once into two canvases at load. Each frame
draws only the camera's visible rectangle at 2x with nearest-neighbor scaling, then
the bandit, the overhead layer, and the lighting overlay (computed for the visible
area only). The HUD is DOM, so it stays fixed while the world scrolls.

## Bandit sprite (art team)

The bandit character is made by the art team; this project focuses on the map.
Drop the sprite sheet in as **`public/assets/characters/bandit.png`** and the game uses it
automatically. Until then it falls back to a generated placeholder
(`bandit-placeholder.png`), and `npm run assets` never writes `bandit.png`.

Expected format (set in `src/config.ts`):

- One row of frames, each `BANDIT_FRAME_W` x `BANDIT_FRAME_H` art pixels (currently 16 x 24;
  art is drawn at 2x, so that's 32 x 48 on screen). Transparent background.
- Frame order: stand down, stand up, stand left, walk down 1, walk down 2, walk up 1,
  walk up 2, walk left 1, walk left 2. Facing right mirrors the left frames.
- Feet on the bottom row of each frame; the collision hitbox is the 10 x 5 px area at the feet.

If the sheet uses a different frame size or order, change `BANDIT_FRAME_W/H` in
`src/config.ts` and the `STAND`/`WALK` tables in `src/entities/Bandit.ts`.

## Placeholders and limits

- The bandit sprite is a placeholder until the art team's `bandit.png` is added (see above).
- All map art is procedurally generated pixel art made for this project; the reference
  image is only used as a layout guide and is never drawn in the game.
- Doors are always open doorways; there are no door animations or locked doors.
- No other characters yet (no homeowners or dog AI), no sound, no minimap, and no win
  screen beyond a message when all nine items are taken.
- Loot is not saved between sessions.
