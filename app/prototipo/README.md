# Prototipo visual

`page.tsx` es **la maqueta de v0 tal cual salió** de `diseño/psicogestion.zip`, sin
tocar una línea. No se edita para «arreglarla»: es la referencia contra la que se
comparan las pantallas reales.

- **Datos inventados.** Ningún dato de esta pantalla sale de la base de datos.
- **No es código de producción.** Un solo Client Component de 49 KB; el proyecto
  renderiza en servidor por defecto (ver `CLAUDE.md`).
- Está exenta de ESLint en `eslint.config.mjs` justamente para poder conservarla
  intacta.
- Ruta pública en `proxy.ts` para poder mirarla sin sesión ni base de datos
  levantada. **Antes de producción: o se protege o se borra.**

Lo que sí es del proyecto son los tokens (`app/globals.css`), las fuentes
(`app/layout.tsx`) y el armazón (`components/armazon/`), destilados de aquí.

**Para decidir, lee `docs/interfaz.md`**, que es el destilado de esta pantalla: los siete
módulos, el vocabulario de componentes y los diez sitios donde este prototipo enseña más
de lo que la matriz de roles permite. Esto se abre para mirar, no para decidir.
