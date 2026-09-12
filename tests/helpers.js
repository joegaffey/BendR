import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_URL = '/web/index.html';
export const HARNESS_URL = '/tests/harness/shader.html';
export const ORIGIN = 'http://127.0.0.1:4173';

const threeRoot = resolve(fileURLToPath(new URL('../node_modules/three/', import.meta.url)));

// Serve the three.js CDN import-map URLs from the local node_modules copy so the
// suite is deterministic and runs offline. The app itself is unchanged (NFR-3).
// Accepts a Page or BrowserContext; context-level routing also covers popups.
export async function mockThree(target) {
  await target.route('https://unpkg.com/three@0.160.0/**', async (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace('/three@0.160.0/', '');
    try {
      const body = readFileSync(resolve(threeRoot, rel));
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body,
      });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

// Collect console errors and uncaught page errors. The missing favicon is a benign
// 404 (the app ships none) and is filtered out.
export function trackConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('favicon.ico')) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// Resolve after two animation frames, so a rendered frame is guaranteed.
export async function waitForRender(page) {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

export async function openApp(page) {
  await mockThree(page.context());
  const errors = trackConsoleErrors(page);
  await page.goto(APP_URL);
  await page.locator('#projCanvas').waitFor({ state: 'visible' });
  await waitForRender(page);
  return errors;
}
