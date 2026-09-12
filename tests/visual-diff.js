import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Fraction of differing pixels between two PNG buffers (0..1). Different image
// dimensions are treated as a total mismatch.
export function diffRatio(bufferA, bufferB) {
  const a = PNG.sync.read(bufferA);
  const b = PNG.sync.read(bufferB);
  if (a.width !== b.width || a.height !== b.height) return 1;
  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  return changed / (a.width * a.height);
}

// True when a PNG buffer is essentially a single flat colour (e.g. an all-black
// canvas that never rendered).
export function isBlank(buffer) {
  const img = PNG.sync.read(buffer);
  const first = [img.data[0], img.data[1], img.data[2]];
  for (let i = 4; i < img.data.length; i += 4) {
    if (
      Math.abs(img.data[i] - first[0]) > 4 ||
      Math.abs(img.data[i + 1] - first[1]) > 4 ||
      Math.abs(img.data[i + 2] - first[2]) > 4
    ) {
      return false;
    }
  }
  return true;
}
