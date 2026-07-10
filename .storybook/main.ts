/**
 * Storybook — the gate-evidence artifact (DESIGN-SYSTEM-001 §0.5, DS-16).
 * Plain vue3-vite (the design system is Nuxt-runtime-free by law §1.2), with the
 * same Tailwind pipeline and @ds alias as the app.
 */
import type { StorybookConfig } from '@storybook/vue3-vite'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

const config: StorybookConfig = {
  framework: '@storybook/vue3-vite',
  stories: ['../app/design-system/**/*.stories.ts'],
  async viteFinal(viteConfig) {
    // The framework expects the project's vite config to supply plugin-vue (we have
    // none — Nuxt owns the app pipeline). It must run BEFORE storybook's docgen
    // plugin, which appends JS to component modules; appending vue() last would feed
    // docgen raw SFC source and fail the template parse.
    const flat = await Promise.all((viteConfig.plugins ?? []).flat())
    const hasVue = flat.some((p) => p && typeof p === 'object' && 'name' in p && p.name === 'vite:vue')
    viteConfig.plugins = hasVue ? [...flat, tailwindcss()] : [vue(), ...flat, tailwindcss()]
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: {
        ...(viteConfig.resolve?.alias as Record<string, string> | undefined),
        '@ds': fileURLToPath(new URL('../app/design-system', import.meta.url)),
      },
    }
    return viteConfig
  },
}
export default config
