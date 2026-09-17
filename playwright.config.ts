import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  outputDir: '.codex/local/test-results',
  use: {
    baseURL: 'http://localhost:8085',
    channel: 'chrome',
    headless: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/expo/bin/cli start --web --port 8085 --localhost',
    url: 'http://localhost:8085',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
