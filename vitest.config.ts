import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
