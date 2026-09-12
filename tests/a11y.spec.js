import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp } from './helpers.js';

// Known accessibility debt, recorded here so the suite stays green while new
// violations fail. Remove an entry once the underlying issue is fixed.
const KNOWN_VIOLATIONS = new Set([
  'label', // range/checkbox inputs have no associated <label for>
  'select-name', // selects have no accessible name
  'landmark-one-main', // no <main> landmark
  'meta-description', // no meta description
  'color-contrast', // muted panel text below AA on dark background
  'region', // content not contained by landmarks
]);

test.describe('BendR web simulator — accessibility', () => {
  test('has no accessibility violations beyond the recorded baseline', async ({ page }) => {
    await openApp(page);

    const results = await new AxeBuilder({ page }).analyze();
    const unexpected = results.violations.filter((v) => !KNOWN_VIOLATIONS.has(v.id));

    expect(
      unexpected.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      'unexpected accessibility violations',
    ).toEqual([]);
  });

  test('does not introduce any critical-impact violations', async ({ page }) => {
    await openApp(page);

    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' && !KNOWN_VIOLATIONS.has(v.id),
    );

    expect(critical.map((v) => v.id)).toEqual([]);
  });
});
