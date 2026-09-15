---
paths:
  - "**/*.test.*"
  - "scripts/rls/**"
  - "scripts/*.sql"
  - "scripts/*.mjs"
  - "vitest.config.*"
---

# Pruebas — la regla que más veces costó una vuelta de revisión

**Una prueba verde por el motivo equivocado es peor que ninguna.** Antes de dar una negativa por
buena, pregúntate si seguiría verde con la guarda quitada. (T-001, T-003, T-005, T-006a)

## Pruebas unitarias
- El fichero de prueba vive junto al módulo (`app/login/esquemas.ts` → `esquemas.test.ts`); no hay carpeta `__tests__`. `npm test` es una pasada (`vitest run`); cobertura medida, no exigida. Entorno jsdom, `globals: true`, alias `@/`. (T-016)
- Primero la prueba que falla, y comprobar que falla por el motivo correcto (no por un import roto ni por una restricción ajena); luego el código.
- Una prueba de integración mete el vector **real** (el que produce TypeScript), no solo el helper de la base. (T-005)

## Banco de RLS (`scripts/rls/`)
- Toda negativa comprueba el **código de error exacto** con `assert_lanza_codigo` (42501 guarda, 23514 coherencia, 22P05 U+0000…); "lanza cualquier cosa" no es una prueba. (T-005)
- Toda negativa lleva su **gemela positiva** sobre el mismo perfil, y la que discrimina es la que falla con la guarda relajada (p. ej. `aal2` con un reto TOTP de hace diez minutos también se rechaza). Un arreglo ALTA sin su negativa "no está hecho, está escrito". (T-006a)
- Demostración de guarda: desactivar el disparador y comprobar que la prueba cambia de código o deja pasar; restaurar. Sin eso, no se sabe qué prueba la prueba. (T-005)
- `UPDATE 0` no prueba nada: puede ser la RLS ocultando la fila. Toda guarda de columna se prueba sobre una fila que el usuario **sí** puede actualizar. (T-001, T-002)
- `set local role authenticated` no cambia `auth.uid()`: eso sale de `request.jwt.claims`. Entre bloques, `reset role` + `reset request.jwt.claims`, o el siguiente hereda la sesión (y una ventana de desbloqueo abierta). (T-002)
- Sentencias que deben fallar dentro de una transacción larga: `savepoint` / `rollback to savepoint`. (T-002)
- Las condiciones globales ("el último administrador activo") se **establecen** dentro de la transacción del banco, no se suponen: la siembra de T-008 añadió un segundo administrador. (integración 06-09)
- El **número de módulo** del banco es una dependencia real (se abre por ruta y corre en orden alfabético): renumerar rompe pruebas. (integración 06-09)
- El banco corre también sobre la base **sembrada**, no solo vacía; cuentas exactas de filas pueden romperse con el seed. (T-003, T-008)
- Una política "cubierta" solo por nombre no está cubierta: el módulo de cobertura exige ejercerla. (T-003)
- `auth.mfa_factors` tiene sus propias trampas de siembra; consulta la bitácora de T-006a antes de tocar el banco de cuentas.
