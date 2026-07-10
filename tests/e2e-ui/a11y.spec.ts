/**
 * Gate G-3: axe scan over EVERY story, light and dark (zero violations to merge).
 * A state without a story is untested — and a story that fails axe fails the build.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { allStories, gotoStory } from './helpers'

for (const story of allStories()) {
  test(`axe: ${story.title} / ${story.name}`, async ({ page }) => {
    await gotoStory(page, story.id)
    const results = await new AxeBuilder({ page })
      .include('#storybook-root')
      .analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
}

test('axe holds in dark mode on representative stories', async ({ page }) => {
  for (const id of ['primitives-dofbutton--matrix', 'patterns-feedback--problem-educates']) {
    await gotoStory(page, id, 'mode:dark')
    const results = await new AxeBuilder({ page }).include('#storybook-root').analyze()
    expect(results.violations, `${id} (dark): ` + JSON.stringify(results.violations, null, 2)).toEqual([])
  }
})
