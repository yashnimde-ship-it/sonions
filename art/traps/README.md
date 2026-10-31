# Vault Breakers — trap sprite pack

Twelve standalone transparent PNG concepts for the Heist trap set. These are art assets only; no game code was changed.

## Files

| File | Trap |
|---|---|
| `shock-plate.png` | Shock Plate |
| `spring-floor.png` | Spring Floor |
| `snare.png` | Snare |
| `glue-floor.png` | Glue Floor |
| `oil-slick.png` | Oil Slick |
| `crusher.png` | Crusher |
| `laser-grid.png` | Laser Grid |
| `rolling-boulder.png` | Rolling Boulder |
| `magnet.png` | Magnet |
| `confusion-gas.png` | Confusion Gas |
| `blackout.png` | Blackout |
| `fake-loot.png` | Fake Loot |

## Integration notes

- Every sprite is a transparent RGBA PNG. Intrinsic dimensions vary; preserve aspect ratio and use `object-fit: contain` or the engine's equivalent when placing them in cards or in-world.
- The pack is a consistent polished pixel-art direction with dark steel, restrained brass, and a distinct accent color per trap.
- These are static prototype sprites. In-game activation, hitboxes, animation frames, balancing, and visibility rules still need to be implemented in the game.
- Suggested starting point for UI icons: render in a square slot with `contain`; the Snare, Oil Slick, and Laser Grid are wider silhouettes and may need a wider in-world footprint.
