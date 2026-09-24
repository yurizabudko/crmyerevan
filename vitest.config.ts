import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['{apps,packages}/*/src/**/*.test.{ts,tsx}'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['{apps,packages}/*/src/**/*.int.test.ts'],
          // Интеграционные тесты работают с одним экземпляром NocoDB — без параллелизма.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
