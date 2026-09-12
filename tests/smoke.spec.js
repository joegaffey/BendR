import { test, expect } from '@playwright/test';
import { openApp, waitForRender, trackConsoleErrors, ORIGIN } from './helpers.js';
import { setRange } from './golden.js';
import { diffRatio } from './visual-diff.js';

test.describe('BendR web simulator — smoke', () => {
  test('loads and renders both lower views with no console errors', async ({ page }) => {
    const errors = await openApp(page);

    await expect(page.locator('#projCanvas')).toBeVisible();
    await expect(page.locator('#eyeCanvas')).toBeVisible();

    const sizes = await page.evaluate(() => ({
      proj: { w: document.querySelector('#projCanvas').width, h: document.querySelector('#projCanvas').height },
      eye: { w: document.querySelector('#eyeCanvas').width, h: document.querySelector('#eyeCanvas').height },
    }));
    expect(sizes.proj.w).toBeGreaterThan(0);
    expect(sizes.proj.h).toBeGreaterThan(0);
    expect(sizes.eye.w).toBeGreaterThan(0);
    expect(sizes.eye.h).toBeGreaterThan(0);

    await waitForRender(page);
    expect(errors).toEqual([]);
  });

  test('adds and removes a projector', async ({ page }) => {
    const errors = await openApp(page);

    await page.getByRole('button', { name: 'Add projector' }).click();
    await expect(page.getByRole('button', { name: 'Projector 2', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Delete projector' }).nth(1).click();
    await expect(page.getByRole('button', { name: 'Projector 2', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Projector 1', exact: true })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('exports a valid calibration JSON to the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    await openApp(page);

    await page.getByRole('button', { name: 'Add projector' }).click();
    await page.getByRole('button', { name: 'Copy JSON' }).click();

    // The button label is transient ("Copied" reverts after ~1.2s), so poll the
    // clipboard itself rather than racing the label.
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('"version"');

    const config = await page.evaluate(() => navigator.clipboard.readText().then(JSON.parse));
    expect(config.version).toBe(1);
    expect(config.projectors).toHaveLength(2);
    expect(config).toHaveProperty('screen');
    expect(config).toHaveProperty('eye');
    expect(config).toHaveProperty('source');
  });

  test('aim X offset pans the auto-aim target', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    await openApp(page);

    const aim = page.locator('.row:has-text("Aim X offset (m)") input[type=range]');
    const sceneBefore = await page.locator('#scene').screenshot();
    await setRange(aim, 0.5);
    await waitForRender(page);

    // The 3D marker/frustum must follow the aim target, not stay on screen centre.
    const sceneAfter = await page.locator('#scene').screenshot();
    expect(diffRatio(sceneBefore, sceneAfter)).toBeGreaterThan(0.002);

    await page.getByRole('button', { name: 'Copy JSON' }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('"version"');
    const cfg = await page.evaluate(() => navigator.clipboard.readText().then(JSON.parse));

    // Auto-aim should now point at (0.5, mid, radius): yaw = atan2(0.5 - x, radius - z).
    const pr = cfg.projectors[0];
    const expectedYaw = (Math.atan2(0.5 - pr.pose.x, cfg.screen.radius - pr.pose.z) * 180) / Math.PI;
    expect(pr.pose.yaw).toBeCloseTo(expectedYaw, 1);
    expect(Math.abs(pr.pose.yaw)).toBeGreaterThan(1); // sanity: it actually moved
  });

  test('loads a sim screenshot source without errors', async ({ page }) => {
    const errors = await openApp(page);

    const imageRequests = [];
    page.on('response', (res) => {
      if (res.url().includes('/assets/images/')) imageRequests.push(res.status());
    });

    const gameSelect = page.locator('select:has(option[value="iRacing"])');
    await gameSelect.selectOption('iRacing');
    await expect.poll(() => gameSelect.inputValue()).toBe('iRacing');
    await waitForRender(page);

    expect(imageRequests).toContain(200);
    expect(errors).toEqual([]);
  });

  test('launches a live-synced runtime output window', async ({ page, context }) => {
    await openApp(page);
    const popupErrors = [];

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('button[title="Launch this projector output"]').first().click(),
    ]);
    popupErrors.push(...trackConsoleErrors(popup));

    await popup.waitForLoadState('domcontentloaded');
    await expect(popup).toHaveURL(/#output=0&cfg=/);
    await popup.locator('#projCanvas').waitFor({ state: 'visible' });
    await waitForRender(popup);

    // Output mode hides the 3D scene and the eye view; only the warp remains.
    await expect(popup.locator('#eyeCanvas')).toBeHidden();
    await expect(popup.locator('#scene')).toBeHidden();
    expect(popupErrors).toEqual([]);
  });
});
