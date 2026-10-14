// Convención de pruebas del proyecto: el fichero de prueba vive JUNTO al módulo
// que prueba (`app/login/esquemas.ts` → `app/login/esquemas.test.ts`).
// No existe carpeta `__tests__` paralela ni se creará.
import path from 'node:path';

import { configDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // T-011: lib/citas/ importa 'server-only' de verdad (protege el build de
      // producción). Vitest corre en jsdom, donde ese paquete lanza al
      // importarse: se sustituye SOLO en pruebas por un módulo vacío, sin
      // tocar la guarda real. Ver vitest.server-only-stub.ts.
      'server-only': path.resolve(__dirname, 'vitest.server-only-stub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // Las mismas exclusiones que eslint.config.mjs: sin ellas el corredor audita
    // los worktrees de la fábrica (.claude/) y la maqueta de v0 (diseño/, prototipo).
    exclude: [
      ...configDefaults.exclude,
      '.next/**',
      'app/prototipo/**',
      'diseño/**',
      '.claude/**',
      // Encargos y copias de referencia del CLI de volumen: se integran a mano, no se ejecutan aquí.
      'minimax/**',
      'supabase/.temp/**',
      'supabase/.branches/**',
      // Hablan con la base local: solo corren con vitest.bd.config.ts (npm run test:facturacion).
      '**/*.bd.test.ts',
    ],
  },
});
