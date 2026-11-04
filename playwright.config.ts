import { defineConfig } from '@playwright/test';

// Chạy trên app Electron thật (đã build vào dist/). Mỗi lần chỉ một cửa sổ nên không chạy song song.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: 'tests/output/playwright',
});
