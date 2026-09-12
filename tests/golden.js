import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { diffRatio } from './visual-diff.js';

const GOLDEN_DIR = new URL('./golden/', import.meta.url);

// Compare an element screenshot against a committed golden image. On first run (or
// with UPDATE_SNAPSHOTS=1) the golden is written instead, so a new baseline is a
// deliberate, reviewable file. We roll this by hand rather than use toHaveScreenshot
// because Playwright's element-stability wait never settles on a live WebGL canvas.
export async function expectGolden(locator, name, testInfo, maxDiff = 0.01) {
  const file = fileURLToPath(new URL(name, GOLDEN_DIR));
  const shot = await locator.screenshot();

  if (testInfo) await testInfo.attach(name, { body: shot, contentType: 'image/png' });

  const update =
    process.env.UPDATE_SNAPSHOTS === '1' || process.argv.includes('--update-snapshots');
  if (!existsSync(file) || update) {
    mkdirSync(fileURLToPath(GOLDEN_DIR), { recursive: true });
    writeFileSync(file, shot);
    return;
  }

  const ratio = diffRatio(readFileSync(file), shot);
  expect(ratio, `${name} pixel diff ratio (run UPDATE_SNAPSHOTS=1 to rebaseline)`).toBeLessThan(
    maxDiff,
  );
}

// Set a range input and fire the event the app listens for.
export async function setRange(locator, value) {
  await locator.evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
