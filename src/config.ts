// Art is painted at 16 px per tile; the game draws it at 2x, so tiles are 32x32 on screen.
export const ART_TILE = 16;
export const ZOOM = 2;
export const SCREEN_TILE = ART_TILE * ZOOM;

// Character sprite sheets (built from the art team's concepts by scripts/build-characters.py).
// One row of frames, each CHAR_FRAME_W x CHAR_FRAME_H sheet pixels, in this order: stand down,
// stand up, stand left, walk down x2, walk up x2, walk left x2. Facing right mirrors the left
// frames. The feet sit on the frame's bottom row.
export const CHARACTERS = ['maya', 'dev', 'zoya', 'rex', 'iris', 'theo', 'elise', 'felix', 'clara', 'miles'] as const;
export type CharacterId = (typeof CHARACTERS)[number];
export const characterSheet = (id: CharacterId) => `/assets/characters/${id}.png`;
export const CHAR_FRAME_W = 48;
/** Frames per sheet: 3 standing, then a 4-frame walk for down, up and left. */
export const CHAR_FRAMES = 15;
export const CHAR_FRAME_H = 72;
// Sheets are drawn at 0.4 size in art pixels, so a character stands about 29 art pixels
// (1.8 tiles) tall: crewmate-sized next to the furniture, like Among Us, so rooms feel open.
export const CHAR_DRAW_SCALE = 0.4;
/** The play camera keeps a character about this fraction of the screen height (Among Us). */
export const CHAR_SCREEN_FRACTION = 1 / 10;
// After the dusk lighting, characters are drawn again at this opacity so they stay readable.
export const CHAR_GLOW = 0.75;

// Movement in art pixels per frame (60 frames per second).
export const WALK_SPEED = 1.6;
export const SPRINT_SPEED = 2.6;

// The bandit's feet hitbox, relative to the point between his feet (art pixels).
// Two-thirds of the old box, matching the smaller characters (more room between furniture).
export const HITBOX = { left: -3.5, right: 3.5, top: -3.5, bottom: 0 };

// Camera easing: the fraction of the remaining distance covered each frame.
export const CAMERA_EASE = 0.18;

// How far ahead of his feet the bandit reaches to interact (art pixels).
export const REACH = 12;
