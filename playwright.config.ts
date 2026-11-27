import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'node tests/serve-landing.mjs',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: 'npm run build:hub && npm run preview -w @ecosystem/hub',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: 'npm run build:sportapp && npm run preview -w @ecosystem/sportapp',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: 'npm run build:sidequest && npm run preview -w @ecosystem/sidequest',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: 'npm run build:ecosystem && npm run preview -w @ecosystem/ecosystem',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: 'npm run build:vault -w @ecosystem/ecosystem && npm run preview:vault -w @ecosystem/ecosystem',
      url: 'http://127.0.0.1:4178',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
