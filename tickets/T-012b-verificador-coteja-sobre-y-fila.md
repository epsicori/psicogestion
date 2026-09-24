---
id: T-012b
titulo: El verificador coteja el sobre sellado con las columnas de la fila
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-012a]
bloquea: [T-012]
estado: pendiente
territorio:
  - supabase/migrations/*_verificador_coteja_sobre_y_fila.sql
  - scripts/rls/14-cadena-huellas.sql
  - scripts/rls/README.md
  - scripts/verificar-huellas.mjs
  - docs/architecture.md
---

# Contexto

`public.verificar_cadena_huellas()` (`supabase/migrations/20260829210000_cadena_de_huellas.sql:515-596`)
recalcula cada huella sobre los bytes guardados de `contenido_canonico`, pero **no compara
ninguna columna de la fila con el sobre sellado**. Las comprobaciones 6.2–6.10 de
`fn_sellar_version_nota()` solo corren `before insert`. Por eso quien levante los cerrojos
(`grant update … to postgres` + `disable trigger impedir_modificacion_notas_clinicas_versiones`)
puede ejecutar `update … set alcance = 'conjunta'` y la cadena sigue «sana»: la huella no cambia
porque el sobre no ha cambiado. La política `notas_clinicas_versiones_lectura` lee **la columna**,
no el sobre, así que la nota individual queda abierta a todos los profesionales del episodio y
nada lo señala. El escenario exacto está en `tickets/T-012a/revision.md` §M1; la bitácora de
T-012a (`docs/bitacora/T-012a.md`) lo deja abierto «antes de que T-012 firme la primera versión».

El ADR-057 §Consecuencias promete lo contrario: «Un `alcance` alterado por debajo […] el
verificador lo señala». **El propietario decidió el 24-09-2026 que el verificador lo detecte**,
con un motivo nuevo, `sobre_no_coincide_con_fila`. Con este ticket la consecuencia del ADR-057 pasa
a ser cierta y el ADR no se corrige.

El mismo agujero existe hoy para las otras columnas que el firmante copia del sobre
(`lib/huella/firmar.ts:51-61`): `cuerpo`, `anotaciones_reservadas`, `autor_id`, `motivo_cambio`,
`esquema_version` y `creada_en`. Cambiar la columna `cuerpo` —el texto clínico que lea cualquier
consulta que no vuelva a parsear el sobre— tampoco lo ve el verificador. Este ticket coteja las
siete.

El diseño completo está en `tickets/T-012b/diseno.md`. **Léelo antes de tocar nada.**

# Tareas

- [ ] **Migración nueva** `supabase/migrations/<sello>_verificador_coteja_sobre_y_fila.sql` con
      `create or replace function public.verificar_cadena_huellas(p_paciente_id uuid default null)`,
      **misma firma y mismo tipo de retorno** que hoy, y una rama `union all` más que devuelve
      `'sobre_no_coincide_con_fila'` cuando alguna de las siete columnas no coincide con su clave
      del sobre, con la semántica exacta de las comprobaciones 6.2–6.7 y 6.10 del disparador
      (predicado literal en el diseño §1.1).
- [ ] En la misma migración: `comment on function` al día (seis motivos) y el `revoke all … from
      public, anon, authenticated, service_role` repetido.
- [ ] **Banco (`scripts/rls/14-cadena-huellas.sql`)**: sección F nueva (paciente PCOT, nota NCOT)
      con el escenario de M1, una negativa por columna cotejada y sus gemelas positivas; la sección
      D.1 se adapta a las dos filas que ahora produce la manipulación del cuerpo del sobre.
- [ ] **`scripts/verificar-huellas.mjs`**: orden determinista y una línea más por cadena cuando esa
      cadena tiene más de una anomalía (diseño §1.3). `--json` no cambia de forma.
- [ ] Una frase en `docs/architecture.md` (párrafo «Implementación (T-005)») y otra en la fila del
      módulo 14 de `scripts/rls/README.md`.

# Criterios de aceptacion

1. `npx supabase db reset` aplica todas las migraciones, la nueva incluida, sin errores.
2. **La prueba negativa del escenario de fallo muerde.** Con la sección F escrita, la D.1 todavía
   sin adaptar y **sin** la migración nueva (tras `db reset`), `npm run test:rls` sale con código
   distinto de cero y la primera aserción fallida es la de F.1:
   `ASERCIÓN FALLIDA: F.1 · alcance cambiado por debajo …` (el verificador de T-005 devuelve cero
   filas). Se pega esa salida en la evidencia.
3. Con la migración aplicada, `npm run test:rls` pasa con exit 0, incluidas todas las aserciones de
   la sección F y la D.1 adaptada.
4. **F.1 (el escenario de M1)**: con los cerrojos levantados, `update … set alcance = 'conjunta'`
   sobre una versión sellada `individual` hace que `verificar_cadena_huellas(PCOT)` devuelva
   **exactamente una fila**, de esa versión, con `motivo = 'sobre_no_coincide_con_fila'`, y la
   misma aserción comprueba que la huella de la fila sigue cuadrando con sus bytes (no la señala
   `huella_no_coincide`). Restaurada, cero filas.
5. **Una negativa por columna cotejada** (F.2–F.9): `autor_id`, `cuerpo` (no equivalente),
   `anotaciones_reservadas` en los dos sentidos (NULL → `''` y cadena → NULL), `motivo_cambio` en
   los dos sentidos (NULL → cadena y cadena → otra cadena), `esquema_version` (3 → 2) y `creada_en`
   (+1 ms). Cada una: exactamente una fila, esa versión, motivo `sobre_no_coincide_con_fila`;
   restaurada, cero.
6. **Sin falsos positivos**: (a) la gemela positiva de F (dos versiones honestas con
   `anotaciones_reservadas` y `motivo_cambio` no nulos) da cero filas; (b) la misma, con la sesión
   en `Pacific/Kiritimati`, da cero filas; (c) al final de F, `verificar_cadena_huellas()` no
   devuelve ninguna fila de ningún paciente salvo PDEMO (la fila deliberadamente falsa de §C);
   (d) reescribir la columna `cuerpo` de forma jsonb-equivalente sigue sin señalarse (D.2, 8.1).
7. Tras `npx supabase db reset` + `npm run seed`, `npm run verificar:huellas` imprime
   `verificar:huellas — cadena íntegra: cero anomalías.` (exit 0) y `--json` imprime `[]`.
8. **Manual, contra la base sembrada** (guion en el diseño §3): tras el `update` de `alcance` con
   los cerrojos levantados, `npm run verificar:huellas` sale con exit 1 y nombra paciente, versión,
   nota, fecha y `sobre_no_coincide_con_fila`; `--json` devuelve un array de un elemento con ese
   `motivo`; `--paciente <uuid>` lo mismo; con una segunda manipulación en la misma cadena aparece
   la línea «y N anomalía(s) más en esta cadena». Restaurado, íntegra.
9. `anon`, `authenticated` y `service_role` siguen sin `EXECUTE` sobre
   `public.verificar_cadena_huellas(uuid)` (aserción en F con `has_function_privilege`).
10. `npm run tipos` no cambia `lib/supabase/tipos-bd.ts` (`git diff --exit-code` sobre ese fichero):
    la firma de la función es la misma.
11. `npm test`, `npm run lint`, `npm run lint:migraciones` y `npm run build` limpios;
    `node ~/.claude/pipeline/territorio.mjs T-012b` en verde.

# Fuera de alcance

- Cambiar la forma del sobre (`esquema_version`), `fn_sellar_version_nota()` o `lib/huella/**`.
- Sellar `nota_id` o la cabecera `notas_clinicas` (pregunta abierta al propietario: diseño §8).
- Reescritura completa de la cadena (recalcular huellas en adelante) y anclaje externo.
- Cualquier pieza de T-012 y el enganche nocturno de T-009.
