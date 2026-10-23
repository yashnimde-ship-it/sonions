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
};
