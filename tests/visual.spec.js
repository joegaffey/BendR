import { test, expect } from '@playwright/test';
import { openApp, waitForRender } from './helpers.js';
import { diffRatio, isBlank } from './visual-diff.js';
import { expectGolden, setRange } from './golden.js';

// Golden-image regression for the two warp views. The acceptance criteria for the
// warp are visual (straight grid, invisible seam), so screenshots are the primary
// correctness signal. Run `npm run test:update` after an intentional change.
test.describe('BendR web simulator — visual regression', () => {
  test('projector output and eye view match the golden images', async ({ page }, testInfo) => {
    await openApp(page);

    await expectGolden(page.locator('#projCanvas'), 'projector-output.png', testInfo);
    await expectGolden(page.locator('#eyeCanvas'), 'eye-view.png', testInfo);
  });

  test('canvases render actual content, not a flat fill', async ({ page }) => {
    await openApp(page);

    const projShot = await page.locator('#projCanvas').screenshot();
    const eyeShot = await page.locator('#eyeCanvas').screenshot();

    expect(isBlank(projShot), 'projector output should not be a flat colour').toBe(false);
    expect(isBlank(eyeShot), 'eye view should not be a flat colour').toBe(false);
  });

  test('freezing the warp makes a moved projector visibly mis-calibrate', async ({ page }, testInfo) => {
    // The frozen warp runs the two-pass eye renderer (four supersampled emit targets)
    // every frame; under CI's software GL that is far slower than the other tests.
    test.slow();
    await openApp(page);

    const eye = page.locator('#eyeCanvas');
    const aligned = await eye.screenshot();

    // Freeze the warp, then move the projector: the Eye View uses the actual pose for
    // coverage but the calibration pose for the emitted image, so the stale warp lands
    // in the wrong place.
    await page.locator('.row.check:has-text("Warp follows projector") input').uncheck();
    await setRange(page.locator('.row:has-text("Pos X (m)") input[type=range]'), 1);
    await waitForRender(page);

    const misaligned = await eye.screenshot();
    await testInfo.attach('misaligned.png', { body: misaligned, contentType: 'image/png' });
    expect(diffRatio(aligned, misaligned)).toBeGreaterThan(0.05);

    // Recalibrating snaps the warp to the actual pose, restoring the aligned view.
    await page.getByRole('button', { name: 'Recalibrate (snap warp to pose)' }).click();
    await waitForRender(page);
    const recalibrated = await eye.screenshot();
    expect(diffRatio(aligned, recalibrated)).toBeLessThan(0.01);
  });

  test('does not flip the image when the projector moves sideways behind the screen', async ({ page }) => {
    test.slow();
    await openApp(page);

    // With the default z = -1.3, the projector crosses the cylinder radius
    // (x = sqrt(1.5^2 - 1.3^2) = 0.748) while remaining behind the screen arc. It is
    // front projection the whole way, so the emitted image must change smoothly: a
    // spurious rear-projection mirror used to flip it (~0.17 pixel diff at the step)
    // where a smooth pose change stays well under 0.1.
    const posX = page.locator('.row:has-text("Pos X (m)") input[type=range]');
    const proj = page.locator('#projCanvas');

    let prev = null;
    let maxStep = 0;
    for (const x of [0.72, 0.75, 0.78]) {
      await setRange(posX, x);
      await waitForRender(page);
      const shot = await proj.screenshot();
      if (prev) maxStep = Math.max(maxStep, diffRatio(prev, shot));
      prev = shot;
    }

    expect(maxStep).toBeLessThan(0.12);
  });
});
