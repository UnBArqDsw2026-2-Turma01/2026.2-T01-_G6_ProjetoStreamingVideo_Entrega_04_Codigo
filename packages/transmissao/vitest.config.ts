import { defineConfig } from 'vitest/config';

// configuracao (Builder, SG1) e servico usam Vitest; canal (Observer, SG3) usa node:test via tsx.
export default defineConfig({
  test: { include: ['test/configuracao/**/*.test.ts', 'test/servico/**/*.test.ts'] },
});
