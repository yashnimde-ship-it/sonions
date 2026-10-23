// Debug view of the reference extraction: extracted pixels over magenta, foliage tinted.
// Usage: node scripts/preview-extract.mjs <out.png>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from 'fast-png';
import { buildPlan } from '../map/mapBuilder.mjs';
import { EXTRACT_OPTIONS, REFERENCE } from '../map/referenceConfig.mjs';
import { extractMask, loadReference } from '../map/referenceExtract.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ref = loadReference(path.join(ROOT, REFERENCE));
const { mask, green } = extractMask(ref, buildPlan(), EXTRACT_OPTIONS);
const out = new Uint8Array(ref.w * ref.h * 4);
for (let i = 0; i < ref.w * ref.h; i++) {
  const c = mask[i] ? [ref.rgb[i * 3], ref.rgb[i * 3 + 1], ref.rgb[i * 3 + 2]] : [255, 0, 255];
  if (green[i]) c[2] = Math.min(255, c[2] + 60);
  out.set([...c, 255], i * 4);
}
fs.writeFileSync(process.argv[2], encode({ width: ref.w, height: ref.h, data: out, channels: 4, depth: 8 }));
console.log('wrote', process.argv[2]);
