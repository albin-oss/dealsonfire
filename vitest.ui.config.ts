import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

/** UI test suite (UI-FOUNDATION-001): components + pattern composables in happy-dom. */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@ds': fileURLToPath(new URL('./app/design-system', import.meta.url)),
    },
  },
  test: {
    include: ['tests/ui/**/*.test.ts'],
    environment: 'happy-dom',
  },
})
