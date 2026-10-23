// Art is painted at 16 px per tile; the game draws it at 2x, so tiles are 32x32 on screen.
export const ART_TILE = 16;
export const ZOOM = 2;
export const SCREEN_TILE = ART_TILE * ZOOM;

// Character sprite sheets (built from the art team's concepts by scripts/build-characters.py).
// One row of frames, each CHAR_FRAME_W x CHAR_FRAME_H sheet pixels, in this order: stand down,
// stand up, stand left, walk down x2, walk up x2, walk left x2. Facing right mirrors the left
// frames. The feet sit on the frame's bottom row.
export const CHARACTERS = ['maya', 'dev', 'zoya', 'rex', 'iris'] as const;
export type CharacterId = (typeof CHARACTERS)[number];
export const characterSheet = (id: CharacterId) => `/assets/characters/${id}.png`;
export const CHAR_FRAME_W = 48;
export const CHAR_FRAME_H = 72;
// Sheets are drawn at 0.6 size in art pixels, so a character stands about 43 art pixels
// (2.7 tiles) tall: big enough to read clearly, still fitting through doorways.
export const CHAR_DRAW_SCALE = 0.6;
// After the dusk lighting, characters are drawn again at this opacity so they stay readable.
export const CHAR_GLOW = 0.75;

// Movement in art pixels per frame (60 frames per second).
export const WALK_SPEED = 1.6;
export const SPRINT_SPEED = 2.6;

// The bandit's feet hitbox, relative to the point between his feet (art pixels).
export const HITBOX = { left: -5, right: 5, top: -5, bottom: 0 };

// Camera easing: the fraction of the remaining distance covered each frame.
export const CAMERA_EASE = 0.18;

// How far ahead of his feet the bandit reaches to interact (art pixels).
export const REACH = 12;
