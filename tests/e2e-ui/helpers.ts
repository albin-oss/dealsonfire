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
}
