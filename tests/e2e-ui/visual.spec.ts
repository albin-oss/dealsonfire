/**
 * Gate G-5/G-6/G-7/G-8 axes: screenshot baselines across scope × mode × RTL for
 * representative stories. Baselines are platform-tagged by Playwright; CI runs Linux
 * baselines, local runs darwin — each platform owns its snapshots.
 */
import { test, expect } from '@playwright/test'
import { gotoStory } from './helpers'

const AXES: Array<{ name: string; globals: string }> = [
  { name: 'workspace-light', globals: 'scope:workspace;mode:light;direction:ltr' },
  { name: 'workspace-dark', globals: 'scope:workspace;mode:dark;direction:ltr' },
  { name: 'storefront-light', globals: 'scope:storefront;mode:light;direction:ltr' },
  { name: 'workspace-rtl', globals: 'scope:workspace;mode:light;direction:rtl' },
]

const STORIES = [
  'primitives-dofbutton--matrix',
  'primitives-fields--inputs',
  'primitives-formatters--money',
  'patterns-feedback--empty-state-teaches',
  'patterns-proposal-confirmation--proposal-card',
  'primitives-surfaces--cards',
  'layouts-workspace--five-nouns',
  'primitives-feedback-set--status-and-progress',
]

for (const story of STORIES) {
  for (const axis of AXES) {
    test(`visual: ${story} @ ${axis.name}`, async ({ page }) => {
      await gotoStory(page, story, axis.globals)
      await page.waitForTimeout(450) // settle transitions (deliberate band ceiling — parallel runs load slower)
      await expect(page.locator('#storybook-root')).toHaveScreenshot(`${story}--${axis.name}.png`)
    })
  }
}
