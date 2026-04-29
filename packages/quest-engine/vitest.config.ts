import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@specops/quest-engine',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
