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
    // Informe HTML que genera `npm run test:cobertura` (Vitest/v8). Es salida
    // generada, como `.next`: está en .gitignore y no es código del proyecto.
    "coverage/**",
    // Generado localmente por la CLI de Supabase, no es código del proyecto.
    "supabase/.temp/**",
    "supabase/.branches/**",
    // Maqueta de v0 conservada tal cual como referencia visual, no es código del
    // proyecto: se lee, no se mantiene.
    "app/prototipo/page.tsx",
    // Descompresión de `diseño/psicogestion.zip`, que es lo versionado. Es el
    // proyecto de v0 entero, con sus propias dependencias (Base UI, CVA,
    // @vercel/analytics) que aquí no están instaladas ni van a estarlo: el ADR-040
    // prohíbe justamente esas librerías. Sin esta exclusión, lint y build fallan con
    // cientos de errores que no son del proyecto.
    "diseño/**",
    // Worktrees de los agentes de la fábrica. Contienen una copia entera del
    // proyecto, `.next` compilado incluido, y el ignore de `.next/**` es relativo a
    // la raíz: no alcanza a los anidados. Sin esta línea, `npm run lint` audita el
    // build de cada agente y devuelve miles de problemas que no son del proyecto.
    ".claude/**",
  ]),
]);

export default eslintConfig;
