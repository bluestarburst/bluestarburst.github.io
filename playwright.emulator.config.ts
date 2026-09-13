import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORTFOLIO_E2E_PORT);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error('Use the isolated emulator runner; PORTFOLIO_E2E_PORT is required.');
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 45_000 },
  reporter: 'line',
  use: {
    baseURL,
    // The deterministic loopback Iroh relay uses its harness-generated TLS
    // certificate. Production relay certificates remain browser-validated.
    ignoreHTTPSErrors: true,
    // Capability responses contain credentials; retain assertion diagnostics only.
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `HOST=127.0.0.1 PORT=${port} ./node_modules/.bin/react-router-serve ./build/server/index.js`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
