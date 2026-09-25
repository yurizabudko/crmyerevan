import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * Сквозные тесты идут против настоящих API и NocoDB (из .env) — по одному,
 * потому что делят базу. Для каждого теста создаются свои пользователи.
 */
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    locale: 'ru-RU',
    timezoneId: 'Asia/Yerevan',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // На телефоне — основные сценарии партнёра (НФТ: mobile-first).
    {
      name: 'mobile',
      grep: /@mobile/,
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node --env-file-if-exists=../../.env ../api/dist/main.js',
          url: 'http://localhost:3000/api/health',
          reuseExistingServer: !CI,
          timeout: 60_000,
        },
        {
          command: 'pnpm --filter @crm/web preview --port 4173 --strictPort',
          url: 'http://localhost:4173',
          reuseExistingServer: !CI,
        },
      ],
});
