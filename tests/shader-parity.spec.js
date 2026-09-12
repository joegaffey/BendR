import { test, expect } from '@playwright/test';
import { HARNESS_URL, mockThree } from './helpers.js';
import { expectedPixel } from './geometry-oracle.mjs';

// GPU/CPU parity for the warp shader. The harness renders the app's actual GLSL
// (extracted from web/index.html) offscreen to a UV-ramp texture; this test compares
// each output pixel against the independent CPU ray-trace in geometry-oracle.mjs.
test.describe('BendR shader parity', () => {
  test('projector-output warp matches the CPU reference', async ({ page }) => {
    await mockThree(page.context());
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => window.__parityReady === true);

    const error = await page.evaluate(() => window.__parityError || null);
    expect(error, `harness error: ${error}`).toBeNull();

    const { size, pixels, config } = await page.evaluate(() => window.__parity);

    let lit = 0;
    let mismatched = 0;
    const TOL = 4; // out of 255; absorbs RGBA8 quantisation + float differences
    const worst = { diff: 0, px: -1, py: -1, got: null, want: null };

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const { color, lit: isLit } = expectedPixel(config, px, py, size);
        if (isLit) lit++;

        const o = (py * size + px) * 4;
        const got = [pixels[o], pixels[o + 1], pixels[o + 2]];
        const want = color.map((c) => Math.round(c * 255));
        const diff = Math.max(
          Math.abs(got[0] - want[0]),
          Math.abs(got[1] - want[1]),
          Math.abs(got[2] - want[2]),
        );
        if (diff > TOL) {
          mismatched++;
          if (diff > worst.diff) {
            worst.diff = diff;
            worst.px = px;
            worst.py = py;
            worst.got = got;
            worst.want = want;
          }
        }
      }
    }

    const total = size * size;
    const mismatchRatio = mismatched / total;

    // The test is only meaningful if the panel actually lights a good part of the screen.
    expect(lit, 'expected a substantial lit region').toBeGreaterThan(1000);
    expect(
      mismatchRatio,
      `mismatch ratio ${mismatchRatio.toFixed(4)} (worst at ${worst.px},${worst.py}: ` +
        `got ${worst.got} want ${worst.want})`,
    ).toBeLessThan(0.02);
  });
});
