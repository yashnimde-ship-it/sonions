// Made by scripts/build-ability-sprites.py: do not edit by hand.
// Each strip in public/assets/abilities/ is `frames` cells of w x h px in one row; a frame
// is drawn with its anchor (ax, ay: the body's feet, or the ring's middle) on the spot.

export const ABILITY_STRIPS = {
  'patch-wingman-scout': { file: 'patch-wingman-scout.png', frames: 8, w: 103, h: 72, ax: 51, ay: 70 },
  'beacon-anchor-return': { file: 'beacon-anchor-return.png', frames: 8, w: 100, h: 106, ax: 50, ay: 100 },
  'fuse-recon-scan': { file: 'fuse-recon-scan.png', frames: 8, w: 102, h: 101, ax: 51, ay: 50 },
  'rattle-shield-break': { file: 'rattle-shield-break.png', frames: 8, w: 106, h: 97, ax: 53, ay: 48 },
  'latch-decoy-echo': { file: 'latch-decoy-echo.png', frames: 8, w: 95, h: 90, ax: 48, ay: 89 },
  'scout-emp-knife-throw-pulse': { file: 'scout-emp-knife-throw-pulse.png', frames: 8, w: 132, h: 108, ax: 59, ay: 80 },
  'fuse-recon-beacon-two-bounce': { file: 'fuse-recon-beacon-two-bounce.png', frames: 8, w: 122, h: 129, ax: 65, ay: 83 },
  'latch-clone-shatter': { file: 'latch-clone-shatter.png', frames: 8, w: 110, h: 112, ax: 57, ay: 109 },
  'fuse-beacon-scan-loop': { file: 'fuse-beacon-scan-loop.png', frames: 8, w: 101, h: 98, ax: 51, ay: 87 },
  'fuse-scan-sweep-ring': { file: 'fuse-scan-sweep-ring.png', frames: 8, w: 230, h: 142, ax: 115, ay: 70 },
  'fuse-diamond-ping': { file: 'fuse-diamond-ping.png', frames: 8, w: 81, h: 78, ax: 40, ay: 39 },
  'scout-knife-spin': { file: 'scout-knife-spin.png', frames: 8, w: 94, h: 90, ax: 47, ay: 45 },
  'scout-knife-charge': { file: 'scout-knife-charge.png', frames: 8, w: 101, h: 89, ax: 56, ay: 82 },
  'scout-emp-wave-ring': { file: 'scout-emp-wave-ring.png', frames: 8, w: 171, h: 101, ax: 87, ay: 53 },
  'trap-disabled-overlay': { file: 'trap-disabled-overlay.png', frames: 8, w: 93, h: 88, ax: 48, ay: 48 },
  'velvet-sprint-trail': { file: 'velvet-sprint-trail.png', frames: 8, w: 114, h: 57, ax: 113, ay: 30 },
  'velvet-sprint-burst': { file: 'velvet-sprint-burst.png', frames: 8, w: 130, h: 65, ax: 61, ay: 64 },
  'switch-signal-divide': { file: 'switch-signal-divide.png', frames: 8, w: 187, h: 70, ax: 94, ay: 37 },
  'scout-tracker-ping': { file: 'scout-tracker-ping.png', frames: 8, w: 176, h: 168, ax: 88, ay: 83 },
  'fuse-loot-shift': { file: 'fuse-loot-shift.png', frames: 8, w: 130, h: 102, ax: 65, ay: 51 },
  'beacon-shockwave': { file: 'beacon-shockwave.png', frames: 8, w: 180, h: 152, ax: 90, ay: 74 },
  'velvet-burn-zone': { file: 'velvet-burn-zone.png', frames: 8, w: 170, h: 116, ax: 85, ay: 63 },
} as const;

export type AbilityStrip = keyof typeof ABILITY_STRIPS;
