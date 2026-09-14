import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'notes-migration.test.ts',
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
});
