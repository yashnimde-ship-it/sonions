// Art is painted at 16 px per tile; the game draws it at 2x, so tiles are 32x32 on screen.
export const ART_TILE = 16;
export const ZOOM = 2;
export const SCREEN_TILE = ART_TILE * ZOOM;

// Bandit sprite sheet (made by the art team). One row of frames, each FRAME_W x FRAME_H
// art pixels, in this order: stand down, stand up, stand left, walk down x2, walk up x2,
// walk left x2. Facing right mirrors the left frames. The feet sit on the frame's
// bottom row. If bandit.png is missing, the generated placeholder is used instead.
export const BANDIT_SHEET = '/assets/characters/bandit.png';
export const BANDIT_PLACEHOLDER = '/assets/characters/bandit-placeholder.png';
export const BANDIT_FRAME_W = 16;
export const BANDIT_FRAME_H = 24;

// Movement in art pixels per frame (60 frames per second).
export const WALK_SPEED = 1.25;
export const SPRINT_SPEED = 2.25;

// The bandit's feet hitbox, relative to the point between his feet (art pixels).
export const HITBOX = { left: -5, right: 5, top: -5, bottom: 0 };

// Camera easing: the fraction of the remaining distance covered each frame.
export const CAMERA_EASE = 0.18;

// How far ahead of his feet the bandit reaches to interact (art pixels).
export const REACH = 12;
