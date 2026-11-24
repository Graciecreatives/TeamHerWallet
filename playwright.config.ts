import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3198',
    browserName: 'chromium',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node .output/server/index.mjs',
    url: 'http://127.0.0.1:3198/api/health',
    env: { PORT: '3198', HOST: '127.0.0.1' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
