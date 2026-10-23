# Bandit

A top-down pixel-art heist game set in a cozy suburban estate at dusk. Sneak in
from the street, explore the house and grounds, and steal everything worth taking.

Built with the same stack as the FireRed remake: **TypeScript + Canvas + Vite**.
The map art is cut straight out of the reference image at build time and compiled
into a tilemap, so the game looks exactly like the reference.

## Run

```bash
npm install
npm run assets      # paint the estate and compile tiles, collision and data
npm run dev         # http://localhost:5173 (any free port)
```

Open the printed URL in Chrome. Other scripts:

| Command | What it does |
| --- | --- |
| `npm run assets` | Regenerate everything in `public/assets/` from the reference and `map/` |
| `npm run assets -- --procedural` | Same, but with the older hand-written painters instead of the reference art |
| `npm run check` | Flood-fill the collision map from the spawn point and confirm every room and interactable is reachable |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build |

## Controls

| Key | Action |
| --- | --- |
| W A S D / Arrow keys | Move |
| Shift | Sprint |
| E (or Enter / Space) | Interact: open or close doors, examine, steal loot. Also closes messages |

Every wooden door starts **closed** and blocks the way. Walk up to one and press E to
open it (E again closes it; a door won't close while you're standing in it). That
includes the front door, the patio and back doors, and the roll-up garage door. The
pale strips on vertical walls are doorways seen edge-on and are always open.

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
  referenceExtract.mjs    separates furniture and props from floor and lawn in the reference
  referenceLayers.mjs     builds the art layers and per-object sprites from the reference
  referenceConfig.mjs     reference path, extraction settings, extra window walls
  artWalls.mjs            reads the house walls from the reference (for collision)
  furniture.mjs           procedural object painters (only with --procedural)
  mapBuilder.mjs          house plan (used for collision and areas) + procedural layers
  collisionMap.mjs        collision grid derived from the data (not from the art)
  bandit.mjs              PLACEHOLDER bandit sprite (the real one comes from the art team)
  draw.mjs                pixel drawing primitives and the dusk palette
scripts/
  generate-assets.mjs     paints, dedupes 16x16 tiles into a tileset, writes the map JSON
  check-reachability.mjs  verifies every room and interactable can be reached
  preview-extract.mjs     debug view of what the extraction counts as furniture
src/                      the game (TypeScript, Canvas 2D)
  main.ts                 loading, input, fixed 60 fps loop, rendering order
  config.ts               zoom, speeds, hitbox, camera easing
  map/TileMap.ts          builds the layers from the tileset; collision and area queries
  entities/Bandit.ts      movement with per-axis collision, sprinting, animation
  systems/CameraSystem.ts follow with easing, clamped to the world, resize-aware
  systems/InteractionSystem.ts  what's in reach, prompts, loot tracking
  systems/LightingSystem.ts     dusk, lit interiors, lamp light (visible area only)
  ui/HUD.ts               fixed DOM HUD: loot, area name, prompt, messages
public/assets/            generated: tiles/tileset.png, map/estate.json, map/doors.png, furniture/*.png (+ furniture.json),
                          characters/bandit-placeholder.png
                          provided by the art team: characters/bandit.png
```

**How the map is built.** `mapBuilder` builds a plan from `mapData`: room interiors,
then walls (shared walls stay walls), then any hallway edge facing outdoors becomes an
exterior wall, then doors and windows are carved in. The plan was traced from the
reference and drives collision and area names.

The art comes from the reference itself (16 reference pixels = 1 tile, so nothing is
scaled). For each room, the floor colors are learned along the walls and the floor
is flood-filled away; what's left is furniture. Outdoors, the same happens against
the lawn. That gives four layers:

1. **floor**: the reference's floors, walls and ground, with the area under each
   piece of furniture filled from the same floor pattern a tile or more away
2. **walls**: empty in reference mode (walls are part of the floor art)
3. **objects**: the furniture and props cut out of the reference (drawn under the bandit)
4. **overhead**: tree canopies (drawn over the bandit, so he walks behind them)

Every object in `mapData` is also exported as its own transparent PNG in
`public/assets/furniture/`, listed with its position in `furniture.json`.

The generator cuts every layer into 16x16 tiles and deduplicates them into one
tileset (about 2,000 unique tiles); the map JSON stores each layer as tile IDs.

**Collision** is a separate 192 x 128 grid of half-tile cells. Walls are read straight
from the reference (`artWalls.mjs`): the thick dark-navy wall bands are kept and thin
furniture outlines are dropped, so collision follows the drawn walls exactly; exterior
windows (pale strips) are kept solid. Then come fences and each object's footprint (trimmed so you can stand right next to
furniture; small props block their lower half), plus the trees, bushes and hedges
traced from the reference (trees block their trunk). The bandit
collides with his feet hitbox, moving one axis at a time so he slides along walls.

**Rendering.** The layers are drawn once into two canvases at load. Each frame
draws only the camera's visible rectangle at 2x with nearest-neighbor scaling, then
the bandit, the overhead layer, and the lighting overlay (computed for the visible
area only). The HUD is DOM, so it stays fixed while the world scrolls.

**Doors.** `DOOR_SLABS` in `mapData.mjs` lists each wooden door in the reference. The
generator writes a closed sprite (the reference as drawn) and an open one (frame kept,
the opening tinted with the floor beyond, leaves folded back) to `map/doors.png`, and
each door's collision cells to the map JSON. Those cells are open in the saved grid;
the game closes every door at start and opens it on E (`TileMap.setDoor`). `npm run check`
verifies everything is reachable with doors open and reports what the doors guard.

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
- The map art is the reference image, cut into layers. Where furniture was removed,
  the floor underneath is filled in from nearby floor, so it can look streaky if a
  piece is ever moved.
- Doors open instantly (no swing animation) and none are locked yet.
- No other characters yet (no homeowners or dog AI), no sound, no minimap, and no win
  screen beyond a message when all nine items are taken.
- Loot is not saved between sessions.
