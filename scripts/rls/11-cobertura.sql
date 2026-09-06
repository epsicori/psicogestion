-- T-003 · Comprobador de cobertura. No analiza si la aserción es profunda —eso lo juzga
-- la revisión humana—, pero sí que TODA política de `pg_policies` tiene una entrada aquí
-- declarada, y a la inversa: si una entrada declarada ya no aparece en `pg_policies`
-- (una política comentada en la migración desaparece del catálogo), también falla, con
-- el nombre. Es justo el criterio «comentar una política hace fallar el banco».
--
-- Cómo se amplía: cuando T-002 (o cualquier ticket futuro) añade una política, se añade
-- su nombre aquí Y una aserción que la ejerza en el módulo que le corresponda. Si falta lo
-- primero, este módulo lo dice por su nombre; si falta lo segundo, nadie más lo dice —esa
-- mitad sigue dependiendo de la revisión.

\echo ''
\echo '=== 11-cobertura ==='

do $$
declare
  v_declaradas text[] := array[
    'accesos_historia_alta', 'accesos_historia_lectura',
    'accesos_historia_vistas_alta', 'accesos_historia_vistas_lectura',
    'alertas_documentacion_alta', 'alertas_documentacion_lectura', 'alertas_documentacion_modificacion',
    'auditoria_lectura_propia',
    -- T-010 · dominio Agenda. El tecnico administrativo NO tiene politica de select
    -- sobre citas a proposito: lee por la vista citas_agenda (choque 4, invariante 3).
    'citas_alta', 'citas_lectura', 'citas_modificacion',
    'disponibilidad_alta', 'disponibilidad_lectura', 'disponibilidad_modificacion',
    'series_cita_alta', 'series_cita_lectura', 'series_cita_modificacion',
    'tipos_terapia_alta', 'tipos_terapia_lectura', 'tipos_terapia_modificacion',
    'centros_alta_administrador', 'centros_lectura', 'centros_modificacion_administrador',
    'consentimiento_firmantes_alta', 'consentimiento_firmantes_lectura', 'consentimiento_firmantes_modificacion',
    'consentimientos_alta', 'consentimientos_lectura', 'consentimientos_modificacion',
    'diagnosticos_alta', 'diagnosticos_lectura', 'diagnosticos_modificacion',
    'episodio_participantes_alta', 'episodio_participantes_lectura', 'episodio_participantes_modificacion',
    'episodios_alta', 'episodios_lectura', 'episodios_modificacion',
    'evaluacion_archivos_alta', 'evaluacion_archivos_lectura',
    'evaluaciones_alta', 'evaluaciones_lectura', 'evaluaciones_modificacion',
    'informes_alta', 'informes_lectura', 'informes_modificacion',
    'notas_clinicas_alta', 'notas_clinicas_lectura', 'notas_clinicas_modificacion',
    'notas_clinicas_versiones_alta', 'notas_clinicas_versiones_lectura',
    'notificaciones_lectura_propia', 'notificaciones_marcar_leida_propia',
    'organizacion_lectura', 'organizacion_modificacion_administrador',
    'pacientes_alta_administrador', 'pacientes_alta_profesional',
    'pacientes_lectura_administrador', 'pacientes_lectura_profesional_asignado',
    'pacientes_lectura_tecnico_de_su_centro',
    'pacientes_modificacion_administrador', 'pacientes_modificacion_profesional_asignado',
    'pacientes_identificacion_alta', 'pacientes_identificacion_lectura', 'pacientes_identificacion_modificacion',
    'perfiles_lectura_propia',
    'perfiles_centros_alta_administrador', 'perfiles_centros_cierre_administrador', 'perfiles_centros_lectura',
    'politicas_retencion_alta_administrador', 'politicas_retencion_lectura', 'politicas_retencion_modificacion_administrador',
    'preferencias_usuario_alta_propia', 'preferencias_usuario_lectura_propia', 'preferencias_usuario_modificacion_propia',
    'representantes_paciente_alta', 'representantes_paciente_lectura', 'representantes_paciente_modificacion',
    'tablas_solo_adicion_lectura',
    'valoraciones_riesgo_alta', 'valoraciones_riesgo_lectura'
  ];
  v_catalogo text[];
  v_sin_declarar text[];
  v_sin_politica text[];
begin
  select coalesce(array_agg(policyname order by policyname), array[]::text[])
    into v_catalogo
  from pg_policies
  where schemaname = 'public';

  select coalesce(array_agg(p order by p), array[]::text[]) into v_sin_declarar
  from unnest(v_catalogo) p
  where p <> all(v_declaradas);

  select coalesce(array_agg(p order by p), array[]::text[]) into v_sin_politica
  from unnest(v_declaradas) p
  where p <> all(v_catalogo);

  if array_length(v_sin_declarar, 1) > 0 then
    raise exception 'ASERCIÓN FALLIDA: pg_policies tiene políticas SIN cobertura declarada en 11-cobertura.sql: %', v_sin_declarar;
  end if;

  if array_length(v_sin_politica, 1) > 0 then
    raise exception 'ASERCIÓN FALLIDA: 11-cobertura.sql declara políticas que YA NO ESTÁN en pg_policies (¿comentadas o borradas?): %', v_sin_politica;
  end if;

  raise notice '11-cobertura: % políticas en pg_policies, todas declaradas y ninguna declaración huérfana', array_length(v_catalogo, 1);
end $$;

\echo '11-cobertura: completa.'
