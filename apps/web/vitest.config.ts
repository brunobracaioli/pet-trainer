import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@specops/web',
    environment: 'node',
    include: ['app/**/*.test.ts'],
  },
})
