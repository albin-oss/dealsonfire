/** Story helpers: enumerate the built index, load a story in the plain iframe view. */
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

export interface StoryEntry {
  id: string
  title: string
  name: string
}

export function allStories(): StoryEntry[] {
  const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8')) as {
    entries: Record<string, { id: string; title: string; name: string; type: string }>
  }
  return Object.values(index.entries)
    .filter((e) => e.type === 'story')
    .map(({ id, title, name }) => ({ id, title, name }))
}

export async function gotoStory(page: Page, id: string, globals?: string): Promise<void> {
  const params = new URLSearchParams({ id, viewMode: 'story' })
  if (globals) params.set('globals', globals)
  await page.goto(`/iframe.html?${params.toString()}`)
  await page.waitForSelector('#storybook-root :first-child', { state: 'attached' })
  // C11 closure finding: scans must never race a ONE-SHOT animation — axe once
  // caught a toast mid-fade (200ms leave transition of a 6s auto-settle) and
  // read the blended colors as a contrast violation. Wait until every finite
  // animation/transition has finished; infinite ones (skeleton pulse, spinners)
  // ARE the stable state and are deliberately ignored. Bounded: worst finite
  // tempo is 1100ms (celebration) — 10s covers chained one-shots safely.
  await page.waitForFunction(
    () => document.getAnimations().every((a) => {
      const timing = a.effect?.getComputedTiming()
      return timing?.iterations === Infinity || a.playState === 'finished'
    }),
    undefined,
    { timeout: 10_000 },
  )
}
