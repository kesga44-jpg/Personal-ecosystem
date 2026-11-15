import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['apps/**/*.{test,spec}.{ts,tsx}', 'packages/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true
  }
});
