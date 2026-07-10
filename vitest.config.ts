import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@domains': fileURLToPath(new URL('./domains', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@contracts': fileURLToPath(new URL('./contracts', import.meta.url)),
      '@platform': fileURLToPath(new URL('./platform', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
