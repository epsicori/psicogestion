import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generado localmente por la CLI de Supabase, no es código del proyecto.
    "supabase/.temp/**",
    "supabase/.branches/**",
    // Maqueta de v0 conservada tal cual como referencia visual, no es código del
    // proyecto: se lee, no se mantiene.
    "app/prototipo/page.tsx",
  ]),
]);

export default eslintConfig;
