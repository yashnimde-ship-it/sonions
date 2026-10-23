// Settings for extracting assets from the reference image (see referenceExtract.mjs).

export const REFERENCE = 'public/reference/estate-map-reference.png';

export const EXTRACT_OPTIONS = {
  floorTolerance: 30,
  grassTolerance: 26,
  outlineLum: 30,
  barrierGrow: 0,
  // Patches of plain lawn in the reference (reference pixels), used to learn the grass colors.
  lawnSamples: [
    [230, 760, 260, 790], [1000, 760, 1030, 790], [700, 140, 740, 165], [1200, 640, 1240, 670],
    [180, 440, 210, 470], [1150, 230, 1180, 260], [900, 70, 930, 90], [420, 765, 450, 790],
  ],
  lawnSeeds: [],
  // Exterior windows drawn as pale strips in the wall that the plan's WINDOWS list
  // doesn't cover exactly: solid, in tiles [x0, y0, x1, y1] (end exclusive).
  extraWalls: [
    [18.6, 33.2, 19.9, 35.8], // living room, west
    [7.8, 8.2, 9.0, 19.8], // garage, west
    [67, 45.8, 72, 47.0], // purple bedroom, south
    [75.3, 35.8, 76.8, 38.6], // purple bedroom, east
    [75.3, 21.8, 76.6, 25.6], // blue bedroom, east
    [42.4, 6.3, 48.6, 8.0], // bathroom, north
  ],
};
