import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.mjs', 'packages/world/tests/**/*.test.ts'],
  env: { CORTICO_LANGUAGE: 'zh' }, testTimeout: 20000, pool: 'forks' } });
