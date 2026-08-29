-- =========================================================================
-- Revisión con Opus de T-002 · El corte por baja tenía dos puertas abiertas
-- =========================================================================
--
-- ADR-032: cuando un profesional causa baja, **el acceso se corta entero**. T-002 lo cerró
-- en las ocho tablas clínicas —vía `historia_desbloqueada()`— y en `alertas_documentacion`,
-- que está fuera del candado y por eso lleva su propio `rol_actual() is not null`.
--
-- La revisión encuentra que **la misma regla no se aplicó a otras dos tablas**, y que las
-- dos guardan datos de paciente:
--
--   · `auditoria`        — `estado_anterior` y `estado_posterior` traen el nombre del
--                          paciente de cada fila que ese profesional creó o modificó.
--   · `accesos_historia` — `paciente_id`: a qué historias entró y cuándo.
--
-- Reproducido antes de escribir esto: un profesional puesto en `baja` veía **cero
-- pacientes** —el corte funciona donde se aplicó— y a la vez **su fila de auditoría con el
-- nombre del paciente dentro**, y **su registro de accesos delatando a qué historia entró**.
--
-- Y **T-004 agrandó la primera puerta sin querer**: al colgar la auditoría de las
-- veinticinco tablas, lo que antes era el rastro de una tabla pasó a ser el de todas.
--
-- El patrón es el que el propio T-002 dejó escrito y no terminó de aplicar: **una rama
-- `<columna> = auth.uid()` no mira el estado de nadie.** Si la política no pasa por el
-- candado, necesita su propio `rol_actual() is not null`, porque `rol_actual()` devuelve
-- nulo para todo perfil que no esté `activo`.


-- 1 · La auditoría propia deja de leerse estando de baja.
drop policy if exists auditoria_lectura_propia on public.auditoria;
create policy auditoria_lectura_propia on public.auditoria
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and actor_id = (select auth.uid())
  );


-- 2 · El registro de accesos, igual. La rama del administrador ya exigía un rol concreto,
--     así que el `is not null` de delante no le cambia nada: lo que cierra es la otra.
drop policy if exists accesos_historia_lectura on public.accesos_historia;
create policy accesos_historia_lectura on public.accesos_historia
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      perfil_id = (select auth.uid())
      or (select public.rol_actual()) = 'administrador'::public.rol_usuario
    )
  );


-- `accesos_historia_vistas` NO se toca, y no es un olvido: su política de lectura exige que
-- la fila padre de `accesos_historia` sea visible, así que hereda el corte del punto 2.
-- Queda comprobado en el guion.
--
-- `preferencias_usuario` TAMPOCO se toca, y también es deliberado: guarda idioma y densidad
-- de lista, ni un dato de paciente. Cortarla obligaría a que la pantalla que explica «tu
-- cuenta está suspendida» se dibujara sin las preferencias de quien la lee, que es
-- empeorar la experiencia sin cerrar ninguna fuga.
--
-- `perfiles_lectura_propia` no puede llevar esta comprobación: una política sobre
-- `perfiles` que invoque `rol_actual()` —que lee `perfiles`— es recursión. Es la regla
-- permanente que T-002 ya dejó escrita, y por eso existe la vista `directorio_perfiles`.
