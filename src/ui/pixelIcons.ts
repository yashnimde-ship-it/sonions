// Tiny pixel-art icons for the lobby menu, drawn from ASCII grids ('#' = filled) and turned
// into crisp SVGs. Used as CSS masks, so each icon takes the text colour of its button.

const ICONS = {
  home: [
    '.....##.....',
    '....####....',
    '...######...',
    '..########..',
    '.##########.',
    '############',
    '.##########.',
    '.###....###.',
    '.###.##.###.',
    '.###.##.###.',
    '.###.##.###.',
    '.##########.',
  ],
  loadout: [
    '....####....',
    '...#....#...',
    '..########..',
    '.##########.',
    '.##.####.##.',
    '.##########.',
    '.###....###.',
    '.###.##.###.',
    '.###....###.',
    '.##########.',
    '.##########.',
    '..##....##..',
  ],
  map: [
    '###...#.....',
    '#.###.###...',
    '#..#.##..###',
    '#..#..#..#.#',
    '#.##..#..#.#',
    '#..#..##.#.#',
    '#..#..#..#.#',
    '#..##.#.##.#',
    '#..#..#..#.#',
    '###...###..#',
    '...###..####',
    '.....#......',
  ],
  settings: [
    '....####....',
    '.##.####.##.',
    '.##########.',
    '..###..###..',
    '####....####',
    '###......###',
    '###......###',
    '####....####',
    '..###..###..',
    '.##########.',
    '.##.####.##.',
    '....####....',
  ],
  exit: [
    '.#######....',
    '.#.....#....',
    '.#.....#....',
    '.#.....#.#..',
    '.#.....#.##.',
    '.#..########',
    '.#..########',
    '.#.....#.##.',
    '.#.....#.#..',
    '.#.....#....',
    '.#.....#....',
    '.#######....',
  ],
  person: [
    '....####....',
    '...######...',
    '...######...',
    '...######...',
    '....####....',
    '............',
    '..########..',
    '.##########.',
    '.##########.',
    '.##########.',
    '.##########.',
    '............',
  ],
} as const;

export type IconName = keyof typeof ICONS;

/** An SVG data URL of the icon, pixels as squares, no smoothing. */
export function iconUrl(name: IconName): string {
  const rows = ICONS[name];
  const rects: string[] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** An <i> that shows the icon in the current text colour. */
export function iconHtml(name: IconName): string {
  return `<i class="px-icon" style="--icon:${iconUrl(name).replace(/"/g, "'")}"></i>`;
}
