import { defineConfig } from '@playwright/test'

/**
 * Two E2E surfaces (DESIGN-SYSTEM-001 G-gates + UI-COM-001 §10):
 *  - storybook: component gate evidence (axe/keyboard/visual per story)
 *  - app: the built workspace shell (navigation, palette, postures, axe)
 * Both run against production builds: `npm run build && npm run build:storybook` first.
 */
export default defineConfig({
  fullyParallel: true,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  projects: [
    {
      name: 'storybook',
      testDir: 'tests/e2e-ui',
      use: { baseURL: 'http://127.0.0.1:6006', viewport: { width: 900, height: 700 } },
    },
    {
      name: 'app',
      testDir: 'tests/e2e-app',
      // cold-render warmup runs before any test's clock starts (see global-setup.ts)
      globalSetup: './tests/e2e-app/global-setup.ts',
      use: { baseURL: 'http://127.0.0.1:3100', viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'npx http-server storybook-static -p 6006 -s',
      url: 'http://127.0.0.1:6006',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'node .output/server/index.mjs',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: true,
      timeout: 30_000,
      env: { PORT: '3100', NITRO_PORT: '3100' },
    },
  ],
})
