// Convención de pruebas del proyecto: el fichero de prueba vive JUNTO al módulo
// que prueba (`app/login/esquemas.ts` → `app/login/esquemas.test.ts`).
// No existe carpeta `__tests__` paralela ni se creará.
import { configDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
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
      'supabase/.temp/**',
      'supabase/.branches/**',
    ],
  },
});
