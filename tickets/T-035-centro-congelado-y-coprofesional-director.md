---
id: T-035
titulo: Centro del episodio congelado con notas, y el director sanitario como coprofesional
modelo: opus
riesgo: alto
fase: 2
prioridad: alta
depende_de: [T-034]
estado: pendiente
territorio:
  - supabase/migrations/*_centro_congelado_y_coprofesional.sql
  - scripts/rls/19-nota-en-episodio.sql
  - scripts/rls/README.md
  - lib/supabase/tipos-bd.ts
  - docs/architecture.md
  - lib/notas/coprofesional.ts        # ampliado por el propietario el 02-10-2026 (diseño, P1)
  - lib/notas/coprofesional.test.ts
---

# Contexto

Este ticket es el código de los puntos 1 y 2 del ADR-073, que cierra los hallazgos SQL-H3 y
SQL-H4 de la revisión de T-034 (`tickets/T-034/revision-sql.md`). Toca la migración
`20260929120000_nota_siempre_en_episodio.sql`, que no se edita: se re-emiten las funciones en una
migración nueva y hacia delante.

- **SQL-H3.** `fn_congelar_episodio_con_notas` congela `paciente_id` y `profesional_id`, pero no
  `centro_id`. Con eso un coprofesional se queda sin alta en el centro de su episodio.
- **SQL-H4.** El paso 7 de `fn_exigir_episodio_coherente_en_nota` exige que el coprofesional tenga
  el rol `profesional_sanitario`. Pasa a aceptar también `administrador`, que es el director
  sanitario del ADR-065.

## Tareas

- [ ] Diseño corto (`tickets/T-035/diseno.md`, arquitecto). Tiene que decir:
  - qué disparador congela `centro_id` y con qué errcode;
  - qué mensaje da;
  - si el `update of` cambia;
  - cómo se expresa «quien puede ser autor» para que el director administrativo del ADR-065
    quede fuera cuando exista.
- [ ] Migración hacia delante con `create or replace`. Conserva el cuerpo, `security definer`,
  `search_path = ''` y los `revoke`.
- [ ] Banco 19 con pruebas nuevas, cada negativa con su gemela:
  - cambiar `centro_id` en un episodio con notas falla;
  - cambiarlo en un episodio sin notas pasa;
  - un administrador con alta vigente entra como coprofesional;
  - un técnico administrativo sigue fuera;
  - un administrador sin alta en el centro sigue fuera.
- [ ] Una frase en `docs/architecture.md`, junto a la viñeta del coprofesional.

## Criterios de aceptación

1. `npx supabase db reset` y `npm run seed` terminan sin errores.
2. `npm run test:rls` sale con exit 0, con las pruebas nuevas en el módulo 19. Cada negativa nueva
   se pone roja si se quita su guarda (el verificador lo demuestra con una mutación).
3. Coterapia simétrica. Con el administrador ADM y PRO1 en un mismo centro:
   - la nota de PRO1 con ADM como coprofesional entra;
   - la nota de ADM con PRO1 como coprofesional entra.
4. `update episodios_asistenciales set centro_id = …` sobre un episodio con notas falla, también
   como `postgres`. Sobre uno sin notas pasa.
5. Ninguna política RLS cambia: `git diff` sin `create policy` ni `alter policy`.
6. `npm run tipos` no deja diff, o deja solo el esperado. `npm run lint:migraciones`, `npm test`,
   `npm run build` y `npm run verificar:huellas` limpios, y `territorio.mjs T-035` en verde.

## Fuera de alcance

- Reabrir un episodio cerrado (SQL-H2 de T-034), que irá al ticket que cierre episodios.
- El director administrativo del ADR-065.
- El editor de notas (T-012).
