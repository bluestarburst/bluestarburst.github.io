import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 45_000 },
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4189',
    // The deterministic loopback Iroh relay uses its harness-generated TLS
    // certificate. Production relay certificates remain browser-validated.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: './node_modules/.bin/react-router build && PORT=4189 ./node_modules/.bin/react-router-serve ./build/server/index.js',
    url: 'http://127.0.0.1:4189',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
