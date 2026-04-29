import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@specops/domain',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
