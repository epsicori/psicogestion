// T-026a. Pruebas que hablan con la base local (`npm run test:facturacion`). Confirman filas y no son
// idempotentes: igual que `test:huellas`, exigen una base levantada y dejan datos de prueba.
import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Sin `dotenv` ni dependencias nuevas: Node 20+ trae `process.loadEnvFile`.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'vitest.server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/facturacion/**/*.bd.test.ts', 'lib/economico/**/*.bd.test.ts'],
    testTimeout: 30000,
  },
});
