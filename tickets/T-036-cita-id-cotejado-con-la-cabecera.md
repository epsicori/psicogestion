---
id: T-036
titulo: El cita_id del sobre se coteja con la cabecera de la nota
modelo: opus
riesgo: alto
fase: 2
prioridad: media
depende_de: [T-012c]
estado: pendiente
territorio:
  - supabase/migrations/*_cita_id_cotejado.sql
  - scripts/rls/14-cadena-huellas.sql
  - scripts/rls/README.md
  - docs/architecture.md
---

# Contexto

Este ticket es el código del punto 4 del ADR-073 (P7 del diseño de T-012c, hecho H27). En la
era 4, el disparador de versiones coteja con la cabecera de `notas_clinicas` las claves del sobre
que deciden quién lee: `nota_id`, `paciente_id`, `episodio_id`, `autor_id`, `fecha_sesion` y
`coprofesional_id`. `cita_id` va sellado en el sobre, pero no se compara con `notas_clinicas.cita_id`.

Una versión puede llevar en su sobre una cita distinta de la que marca su cabecera, y ni el
disparador ni `verificar:huellas` lo notan.

**No cambia la forma del sobre ni abre una era 5.**

## Tareas

- [ ] Diseño corto (`tickets/T-036/diseno.md`, arquitecto). Parte del disparador y del
  verificador que deje T-012c, verificados contra el código. Tiene que decir:
  - la comprobación nueva (6.17 o la siguiente libre) y su errcode;
  - cómo se normalizan las mayúsculas de `cita_id` (el sobre no la pasa a minúsculas);
  - la línea del verificador.
- [ ] Migración hacia delante que re-emite las dos funciones. Se toma el cuerpo con
  `pg_get_functiondef`; no se reescribe a mano (lección N1 de T-012b).
- [ ] Banco 14:
  - una negativa en el disparador, con su gemela;
  - una fila manipulada como `postgres` que el verificador detecta, con su gemela limpia.

## Criterios de aceptación

1. `npx supabase db reset`, `npm run seed` y `npm run test:rls` salen con exit 0.
2. Un `insert` de versión con un `cita_id` en el sobre distinto del de la cabecera falla con el
   errcode del diseño. La gemela con el mismo `cita_id` entra.
3. Una versión cuya cabecera tiene la cita cambiada como `postgres` (con los disparadores
   levantados) aparece en `npm run verificar:huellas` como anomalía. Sin el cambio, sale «cadena
   íntegra».
4. `lib/huella/vectores-congelados.json` sin diff: ni la era ni el sobre cambian.
5. `npm run lint:migraciones`, `npm test`, `npm run build` limpios, y `territorio.mjs T-036` en
   verde.
