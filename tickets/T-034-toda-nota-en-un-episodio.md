---
id: T-034
titulo: Toda nota clínica cuelga de un episodio asistencial
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-012b]
bloquea: [T-012c, T-012]
estado: hecho
completado: 2026-10-01
territorio:
  - supabase/migrations/*_nota_siempre_en_episodio.sql
  - lib/supabase/tipos-bd.ts
  - supabase/seed-completo.sql
  - scripts/rls/00-ayudantes.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/04-baja.sql
  - scripts/rls/14-cadena-huellas.sql
  - scripts/rls/19-nota-en-episodio.sql
  - scripts/rls/README.md
  - scripts/t005-concurrencia.sql
  - docs/architecture.md
---

# Contexto

Es el código de los puntos 1-3 del **ADR-071**. Hoy `notas_clinicas.episodio_id` es nulable
(`20260822094547_esquema_base_organizacion_paciente_historia.sql:621`). El propietario decidió el
29-09-2026 que no hay notas sueltas: toda nota pertenece a un episodio asistencial. Hay dos
motivos:

- El sobre de la era 4 (T-012c) sella `episodio_id` y no debe sellar un `null`.
- La retención de la historia arranca al **cerrar el episodio** (`docs/architecture.md`
  §Retención). Una nota sin episodio no tiene reloj.

`notas_clinicas` solo tiene filas en bases locales sembradas, no en ninguna real. Por eso se hace
ahora, antes de T-012c y de la primera firma de verdad (T-012).

Referencias: ADR-030 (lo conjunto cuelga del episodio), ADR-031 (duplicados vinculados, no
fusionados), ADR-067, ADR-071.

# Decisiones que toma el diseño

- **D1 · Dónde vive la regla «abrir o elegir».** Una función SQL, por ejemplo
  `episodio_para_nota(p_paciente_id uuid, p_episodio_id uuid default null)`, que:
  - con `p_episodio_id` lo valida;
  - sin él, devuelve el único episodio abierto en el que participa el llamante;
  - si no hay ninguno, abre uno individual;
  - si hay varios, lanza un error que la pantalla traduce a «elige episodio».

  El diseño decide la firma, `security definer` o `invoker`, el errcode y cómo se audita la
  apertura. La alternativa es un disparador `before insert` en `notas_clinicas`. En ese caso el
  diseño explica cómo se entera el editor de que tiene que preguntar.
- **D2 · Suplencia: cerrada por el propietario (29-09-2026).** Un profesional que suple a un
  compañero **abre un episodio propio**, vinculado al mismo paciente. Nunca escribe en el episodio
  del compañero ni se añade como participante por esta vía. Lo que decide el diseño es qué cuenta
  como «participa» en la búsqueda de episodio abierto: si `es_profesional_del_episodio()` tal cual,
  o también el `profesional_id` del episodio. En cualquier caso, un episodio abierto de otro
  profesional no se reutiliza.
- **D3 · Centro: cerrada por el propietario (29-09-2026).** El episodio abierto automáticamente
  toma el centro de la cita de la nota. Si la nota no tiene cita, toma el centro activo de la
  sesión. El diseño verifica de dónde se lee el «centro activo» en servidor. Si no hay forma
  fiable de leerlo en SQL, el centro llega como parámetro, validado contra los centros del
  profesional.
- **D4 · Coherencia paciente-episodio.** La nota y su episodio tienen que ser del mismo paciente
  (o del paciente participante, en conjuntas, ADR-030). Si hoy no lo impide nada, lo impone la
  base de datos, no la aplicación.

- **D5 · Coprofesional (ADR-072, cerrada por el propietario el 29-09-2026).** Cada nota puede
  indicar **un** coprofesional: quién más estuvo en la sesión. Es opcional y va en la cabecera de
  `notas_clinicas`, que se congela al firmar (se añade a `congelar_cabecera_sellada`). La base de
  datos impone que sea un profesional con `profesional_id` real, distinto del autor y con alta en
  el centro del episodio. **No da acceso a nada**: ninguna política de RLS lo lee. El diseño
  decide el nombre de la columna, la clave foránea y el errcode de cada negativa.
- **D6 · Episodio cerrado (ADR-072, cerrada por el propietario el 29-09-2026).** Una nota nueva
  no puede colgar de un episodio con `cerrado_en` no nulo, y lo impide la base de datos (el
  disparador de coherencia de D4), no solo `episodio_para_nota()`.

# Tareas

- [ ] **Diseño** (`tickets/T-034/diseno.md`, arquitecto) con D1-D4 cerradas.
- [ ] **Migración** `supabase/migrations/<sello>_nota_siempre_en_episodio.sql`:
  - Guarda: aborta con mensaje propio si hay alguna fila de `notas_clinicas` con
    `episodio_id is null`. Los datos los decide una persona, nunca un `update` silencioso.
  - `alter column episodio_id set not null`.
  - La función (o disparador) de D1, con su `revoke` y `grant` explícitos.
  - La coherencia paciente-episodio de D4.
  - `comment on` al día.
- [ ] **Siembra y banco**: cada nota que hoy se crea sin episodio pasa a crearse con uno.
  Afecta a `seed-completo.sql`, `01-fijacion.sql`, `04-baja.sql`, `14-cadena-huellas.sql` y
  `t005-concurrencia.sql`. Si un escenario del banco depende de una nota sin episodio, se escala;
  no se borra el escenario.
- [ ] **Módulo de RLS nuevo** `scripts/rls/19-nota-en-episodio.sql` y su fila en el README.
- [ ] `docs/architecture.md`: la regla, junto a la de la nota conjunta.
- [ ] `lib/supabase/tipos-bd.ts` regenerado (`episodio_id: string`, no `string | null`).

# Criterios de aceptación

1. `npx supabase db reset` aplica todas las migraciones y `npm run seed` siembra sin errores.
2. **La columna es obligatoria**: insertar una nota con `episodio_id` null falla con `23502`.
3. **Guarda**: reaplicar la migración dentro de `begin; … rollback;` sobre una base con una nota sin
   episodio aborta con su mensaje propio.
4. **Sin episodio abierto**: un profesional sin episodio abierto con el paciente obtiene uno
   **individual** nuevo, a su nombre y abierto hoy. Queda en `auditoria` si el diseño lo decide así
   en D1.
5. **Uno abierto**: se reutiliza y no se crea ninguno.
6. **Varios abiertos**: sin elección explícita, falla con el errcode y el fragmento de mensaje que
   fije el diseño. Con elección explícita, funciona.
7. **Episodio ajeno**: elegir un episodio de otro paciente, o uno en el que el llamante no
   participa, falla. Cada negativa tiene su gemela positiva.
8. **Técnico administrativo**: no puede abrir episodios por esta vía.
9. `npm run test:rls` en verde, con el módulo 19 incluido. `npm run verificar:huellas` dice
   `cadena íntegra: cero anomalías.`
10. `npm run tipos` deja `episodio_id` no nulable y el coprofesional nulable en `notas_clinicas`. `npm run lint`,
    `npm run lint:migraciones`, `npm run build` y `node ~/.claude/pipeline/territorio.mjs T-034`
    en verde.
11. **Coprofesional**: una nota con coprofesional válido se guarda, y un coprofesional sin otra vía de lectura **no** la lee
    (negativa de lectura en el módulo 19). Coprofesional igual al autor, inexistente o sin alta en
    el centro del episodio falla. Cambiarlo tras la primera versión falla como los demás campos
    congelados. Cada negativa tiene su gemela positiva.
12. **Episodio cerrado**: un `insert` directo en `notas_clinicas` sobre un episodio cerrado falla en
    base de datos, con el errcode que fije el diseño; sobre uno abierto, pasa.

# Fuera de alcance

- El selector de episodio en el editor: lo pinta T-012 con la función de D1.
- Cerrar episodios y el reloj de retención.
- El sobre de la era 4: es T-012c.
